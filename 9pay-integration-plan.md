# Kế hoạch tích hợp 9Pay Payout (Chi hộ) thật

## 1. Trả lời câu hỏi về Testnet & 9Pay

**Nếu tôi đang chạy ở testnet, thì có dùng được 9Pay không, điều gì sẽ xảy ra?**

- **Hiện tại trong code (`sep31-anchor.js`):** Hệ thống đang chạy giả lập (mock). Hàm `trigger9PayClearing` chỉ delay 2 giây rồi tự gọi callback báo thành công. Không có kết nối mạng hay tiền thật nào được di chuyển.
- **Nếu bạn tích hợp API 9Pay thật:** 
  - **Dùng 9Pay Sandbox (Môi trường test của 9Pay):** Hoạt động bình thường. 9Pay Sandbox sẽ nhận request và trả về Webhook giả lập giao dịch thành công. Phù hợp để chạy với Stellar Testnet.
  - **Dùng 9Pay Production (Môi trường thật):** **TUYỆT ĐỐI KHÔNG NÊN!** USDC trên Stellar Testnet là tiền giả (không có giá trị), nhưng API 9Pay Production sẽ tự động trừ tiền VND thật trong tài khoản ví doanh nghiệp (Merchant) của bạn để chuyển vào ngân hàng của user. Nếu tích hợp production vào testnet, bạn sẽ **mất tiền thật** cho các giao dịch test.

---

## 2. Kế hoạch tích hợp thanh toán thật về Banking Việt Nam (Bỏ Mock)

Để loại bỏ mock và tích hợp 9Pay Payout API (Chi hộ), hệ thống cần thay đổi ở 2 vị trí chính: lúc gọi lệnh chi hộ và lúc nhận IPN/Webhook phản hồi kết quả từ 9Pay.

### Bước 1: Khai báo biến môi trường (.env)
Bổ sung các thông số do 9Pay cung cấp sau khi bạn ký hợp đồng hoặc tạo tài khoản sandbox:
```env
# 9Pay Integration
NINEPAY_API_URL=https://sandbox.9pay.vn/payout/api/v1 # Đổi thành URL thật khi lên Production
NINEPAY_MERCHANT_ID=your_merchant_id
NINEPAY_CHECKSUM_KEY=your_checksum_key_for_signing
```

### Bước 2: Cập nhật hàm `trigger9PayClearing`
Thay vì `setTimeout` tự gọi nội bộ, hàm này sẽ sử dụng axios (hoặc fetch) gọi sang API của 9Pay.

```javascript
const axios = require('axios');
const crypto = require('crypto');

async function trigger9PayClearing(internalTxId) {
  const tx = getTransactionById(internalTxId);
  if (!tx) return;

  console.log(`\n💳 [9Pay API] Dispatching Payout — Clearing ID: ${tx.clearingId}`);

  try {
    const payload = {
      merchantId: process.env.NINEPAY_MERCHANT_ID,
      refId: tx.clearingId,             // Mã tham chiếu (Clearing ID)
      amount: tx.amountVnd,
      bankCode: tx.bankCode,            // VCB, TCB, v.v.
      accountNumber: tx.bankAccount,
      accountName: tx.accountName,
      description: `Thanh toan UCTalent TX ${internalTxId}`,
      timestamp: Math.floor(Date.now() / 1000)
    };

    // 1. Tạo chữ ký (Signature) bảo mật (Tham khảo công thức cụ thể trong Document API 9Pay)
    // Giả sử 9Pay yêu cầu HMAC-SHA256 của các params
    const rawSignature = `accountName=${payload.accountName}&accountNumber=${payload.accountNumber}&amount=${payload.amount}&bankCode=${payload.bankCode}&description=${payload.description}&merchantId=${payload.merchantId}&refId=${payload.refId}&timestamp=${payload.timestamp}`;
    const signature = crypto.createHmac('sha256', process.env.NINEPAY_CHECKSUM_KEY)
                            .update(rawSignature)
                            .digest('hex');

    payload.signature = signature;

    // 2. Gửi request gọi API Payout
    const response = await axios.post(`${process.env.NINEPAY_API_URL}/payout`, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.status === 200 || response.data.status === 'processing') {
      console.log(`   ✅ 9Pay Accepted Request: ${tx.clearingId}`);
      // Ghi nhận on-chain rằng đã đẩy lệnh thành công cho gateway
      const recipient_hash = generateRecipientHash(tx.bankCode, tx.bankAccount, tx.accountName);
      emitOnChainEvent('PAYMENT_DISPATCHED', {
        napas_ref: tx.clearingId,
        amount_vnd: tx.amountVnd,
        bank_hash: recipient_hash,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.error(`   ❌ 9Pay API Error:`, response.data);
      // Xử lý hoàn tiền hoặc đánh dấu lỗi (failed)
    }
  } catch (error) {
    console.error(`   ❌ Failed to call 9Pay API:`, error.message);
  }
}
```

### Bước 3: Cập nhật Endpoint `/api/9pay/callback`
Endpoint này sẽ nhận dữ liệu thực từ IPN Webhook của hệ thống 9Pay khi tiền đã về tài khoản ngân hàng của user, thay vì nhận tín hiệu giả lập. Bạn phải xác thực chữ ký của 9Pay gửi đến để tránh giả mạo (rất quan trọng!).

```javascript
app.post('/api/9pay/callback', (req, res) => {
  const payload = req.body;
  
  // 1. Xác thực chữ ký từ 9Pay (Tránh ai đó cố tình gọi IPN giả mạo giao dịch thành công)
  const rawSignature = `amount=${payload.amount}&bankRefId=${payload.bankRefId}&refId=${payload.refId}&status=${payload.status}&timestamp=${payload.timestamp}`;
  const expectedSignature = crypto.createHmac('sha256', process.env.NINEPAY_CHECKSUM_KEY)
                                  .update(rawSignature)
                                  .digest('hex');

  if (payload.signature !== expectedSignature) {
    console.warn(`🚨 [9Pay Callback] INVALID SIGNATURE!`);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // 2. Cập nhật database
  // Lưu ý: 9Pay sẽ trả về refId chính là tx.clearingId mà mình gửi đi lúc nãy
  const stmt = db.prepare("SELECT data FROM transactions WHERE clearingId = ?"); // Cần add column/index cho clearingId trong sqlite
  const row = stmt.get(payload.refId);
  if (!row) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  const tx = JSON.parse(row.data);

  tx.status = payload.status === 'success' ? 'cleared' : 'failed';
  tx.bankRefId = payload.bankRefId; // Mã đối soát của ngân hàng thật do 9Pay trả về
  tx.clearedAt = new Date().toISOString();
  tx.updatedAt = tx.clearedAt;

  console.log(`\n🔔 [9Pay Callback] Settlement ${tx.status.toUpperCase()}`);
  
  // 3. (Giữ nguyên các logic emit SETTLEMENT_PROOF và update parent transaction)
  // ...
  
  saveTransaction(tx);
  
  // 4. Trả lời HTTP 200 báo cho 9Pay biết mình đã nhận webhook thành công, 9Pay không cần retry nữa.
  return res.status(200).json({ status: 200, message: 'success' });
});
```

### Các bước bạn cần thực hiện tiếp theo:
1. Đăng ký tài khoản Merchant với 9Pay, yêu cầu tài liệu API Chi hộ (Payout) và thông tin kết nối Sandbox.
2. So sánh và điều chỉnh chính xác tên tham số (`merchantId`, `refId`...) cũng như thuật toán băm tạo `signature` trong code mẫu bên trên với tài liệu mới nhất của 9Pay.
3. Test trên môi trường 9Pay Sandbox kết hợp với Stellar Testnet.
4. Khi chạy thực tế: Đổi thông tin kết nối sang môi trường 9Pay Production và dùng Stellar Mainnet.
