require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');

const MERCHANT_KEY = process.env.NINEPAY_MERCHANT_KEY;
const SECRET_KEY = process.env.NINEPAY_SECRET_KEY;
// The Sandbox Portal Domain for Collection API usually differs from Disbursement API or uses the same base.
// In the Postman script, it's just END_POINT. We'll use the same sand-payment.9pay.vn
const END_POINT = process.env.NINEPAY_BASE_URL.replace(/\/+$/, '');

function buildHttpQuery(params) {
  if (!params || Object.keys(params).length === 0) return '';
  return Object.keys(params).sort().map(key => {
    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
  }).join('&').replace(/%20/g, '+');
}

async function createTopupLink(amountVnd) {
  const path = '/api/payments/create-bank-transfer';
  const time = Math.round(Date.now() / 1000).toString();
  const invoiceNo = 'TOPUP_' + time;
  
  const params = {
    "merchantKey": MERCHANT_KEY,
    "time": time,
    "invoice_no": invoiceNo,
    "lang": "vi",
    "client_ip": "127.0.0.1",
    "amount": String(amountVnd),
    "currency": "VND",
    "method": "COLLECTION",
    "description": "Nap tien vao Sandbox 9Pay",
    "return_url": "http://localhost:5173",
    "expires_time": "15"
  };

  const httpQuery = buildHttpQuery(params);
  const message = "POST\n" + END_POINT + path + "\n" + time + "\n" + httpQuery;
  
  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(message, 'utf8')
    .digest('base64');

  const authHeader = `Signature Algorithm=HS256,Credential=${MERCHANT_KEY},SignedHeaders=,Signature=${signature}`;

  try {
    console.log(`⏳ Đang tạo yêu cầu nạp ${amountVnd.toLocaleString()} VND vào Sandbox...`);
    const response = await axios.post(END_POINT + path, new URLSearchParams(params).toString(), {
      headers: {
        'Authorization': authHeader,
        'Date': time,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    console.log('\n✅ TẠO GIAO DỊCH THÀNH CÔNG!');
    console.log('🔗 Hãy click vào link sau để thanh toán (giả lập):');
    if (response.data && response.data.redirect_url) {
        console.log('👉', response.data.redirect_url);
    } else {
        console.log(response.data);
    }
    console.log('\n(Sau khi thanh toán thành công ở link trên, số dư Merchant của bạn sẽ tăng lên)');
  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    if (error.response) console.error(error.response.data);
  }
}

// Nạp thử 50,000,000 VND
createTopupLink(50000000);
