# Báo Cáo Phân Tích Dòng Tiền & Đề Xuất Cải Thiện

**Ngày:** 08/07/2026  
**Phạm vi:** `uc-cross-border`, `uc-talent-backend`, `uc-frontend-nextjs-v1`  
**Mục tiêu:** Đảm bảo client deposit được, freelancer/scout/referrer nhận được tiền, dòng tiền chính xác, tracking đầy đủ.

---

## Mục Lục

1. [UI/Frontend & ATS: Các phần cần có](#1-uifrontend--ats-các-phần-cần-có)
2. [Đề Xuất Cải Thiện Toàn Diện](#2-đề-xuất-cải-thiện-toàn-diện)
3. [Báo Cáo Lỗi & Code Dư Thừa](#3-báo-cáo-lỗi--code-dư-thừa)
4. [Luồng Dòng Tiền Chi Tiết](#4-luồng-dòng-tiền-chi-tiết)

---

## 1. UI/Frontend & ATS: Các Phần Cần Có

### 1.1 Client Post Job & Deposit

| Màn hình | Mô tả | Trạng thái |
|----------|-------|:----------:|
| **Post Job Form** | Form tạo job, nhập số tiền referral/cọc, chọn loại `deposit`/`cash`/`headhunt` | ✅ Đã có |
| **Milestone Config** | Nếu `isFreelance`, UI cho phép nhập các milestone (amount, requirements) | ✅ Đã có |
| **Wallet Connect** | Kết nối MetaMask (COTI) hoặc Soroban wallet (Stellar) | ✅ Đã có |
| **Deposit Transaction** | Gọi smart contract `create_and_fund_milestone_escrow` hoặc `create_and_fund_referral_escrow` | ✅ Đã có |
| **Record Off-Chain** | Sau khi deposit xong, gọi `POST /api/v2/payment-distributions/escrow` để ghi nhận | ⚠️ Cần kiểm tra |
| **Update Tx Details** | Gọi `PATCH /api/v2/jobs/:id/update_transaction_details` để lưu txHash | ✅ Đã có |
| **Deposit Status Display** | Hiển thị trạng thái deposit trên UI (funded/pending/failed) | ❌ Chưa rõ |
| **Error Handling UI** | Khi deposit thất bại (insufficient balance, network error, v.v.), UI cần hiển thị rõ | ❌ Chưa rõ |

**Vấn đề cần kiểm tra:**
- Khi `POST /api/v2/jobs` tạo job với status `PENDING_TO_REVIEW`, sau đó client deposit qua blockchain → khi nào job chuyển sang `ACTIVE`? Cần verify flow này.
- Nếu client không deposit sau khi tạo job, job có bị treo ở `PENDING_TO_REVIEW` không?

### 1.2 Freelancer / Talent Nhận Tiền

| Màn hình | Mô tả | Trạng thái |
|----------|-------|:----------:|
| **Applied Jobs List** | Hiển thị các job đã apply, kèm trạng thái claim | ✅ Đã có (`AppliedJobsList`) |
| **Claim to Wallet** | Nút "Claim to Wallet" → gọi smart contract `release_milestone` / `claim_referral` | ✅ Đã có |
| **Withdraw to Bank** | Nút "Withdraw to Bank" → mở `WithdrawalModal` → SEP-31 → 9Pay → NAPAS | ✅ Đã có |
| **Bank Account Registration** | Màn hình đăng ký tài khoản ngân hàng (inquiry + register) | ✅ Đã có |
| **Withdrawal History** | Lịch sử rút tiền tại `/earnings/withdraw` | ✅ Đã có |
| **Milestone Tracking UI** | Hiển thị tiến độ milestone (pending → submitted → approved → released) | ⚠️ Frontend có, backend cần verify |
| **Payment Status Display** | Hiển thị trạng thái payment distribution (PENDING → CLAIMABLE → CLAIMED → CLEARING → PAID) | ⚠️ Cần kiểm tra |

### 1.3 Scout / Referrer Nhận Tiền

| Màn hình | Mô tả | Trạng thái |
|----------|-------|:----------:|
| **Job Referrals List** | Danh sách referral + reward status | ✅ Đã có (`ReferralItem`) |
| **Claim to Wallet (Scout)** | Nút "Claim to Wallet" cho referral reward | ✅ Đã có |
| **Withdraw to Bank (Scout)** | Nút "Withdraw to Bank" cho referral reward | ✅ Đã có |
| **Payout Breakdown** | Tooltip hiển thị referrer share vs platform fee | ✅ Đã có |
| **Earnings Dashboard** | Trang `/earnings` tổng quan thu nhập | ✅ Đã có |

**Vấn đề cần kiểm tra:**
- `payment_distributions` với `role = referrer` được tạo khi `close_job` với `closeType = "success"` và có referral → 80% referrer, 20% platform_fee. Điều này OK cho referral thường.
- Nhưng **scout/referrer từ on-chain `referral_settled` event thì KHÔNG có distribution** ở uctalent-backend. Cần tạo distribution khi nhận webhook callback.

### 1.4 Admin / ATS

| Màn hình | Mô tả | Trạng thái |
|----------|-------|:----------:|
| **Payment Management** | Admin xem và quản lý payment distributions | ❌ **TODO stub** (chưa implement) |
| **Payment Approval** | Admin approve/reject payment | ❌ **TODO stub** |
| **Tax Reporting** | Báo cáo thuế theo user, theo kỳ, tổng số tiền đã nhận | ❌ Chưa có |
| **Payment Audit Log** | Xem audit trail của từng payment (rate, tax, bank, status changes) | ⚠️ Có audit log ở uc-cross-border nhưng chưa có UI admin |
| **Reconciliation Dashboard** | Đối soát giữa smart contract, anchor platform, 9Pay, bank | ❌ Chưa có |

### 1.5 Tracking & Tax

**Cần có các tính năng sau:**

1. **Per-User Payment History API** — `GET /api/v2/disbursements` đã có, nhưng cần thêm filter theo thời gian, status
2. **Tax Report Generation** — Export danh sách tất cả payments đã `PAID`/`COMPLETED` theo user, theo tháng/quý/năm
3. **Tax Withholding Certificate** — Xác nhận đã khấu trừ 10% thuế (PIT-AFFILIATE-10%) cho từng giao dịch
4. **Total Earnings Aggregation** — Tổng thu nhập của user từ nền tảng (đã claim + đã disbursed)
5. **Payment Status Webhook** — Cho phép ATS/admin nhận real-time notification khi payment thay đổi trạng thái

---

## 2. Đề Xuất Cải Thiện Toàn Diện

### 2.1 🚨 Critical: Xử Lý `pending_clearing` Records

**Vấn đề:** `AnchorController.disburse()` tạo `Sep31TransactionEntity` với status `pending_clearing`, nhưng **không có component nào** đọc và xử lý các records này qua 9Pay.

**Giải pháp:** Tạo `PendingClearingProcessor` — worker service mới:

```typescript
// apps/worker/src/pending-clearing/pending-clearing-processor.service.ts
@Injectable()
export class PendingClearingProcessorService {
  @Interval(15000) // poll mỗi 15s
  async processPendingClearing() {
    const records = await this.sep31Repo.find({
      where: { status: 'pending_clearing' },
    });
    for (const record of records) {
      // 1. Lock record: pending_clearing → processing_lock
      // 2. Tìm BankProfileEntity theo receiverId
      // 3. Lấy FX rate (Oracle hoặc quote)
      // 4. Tính VND amount + 10% tax
      // 5. Gọi NinePayGateway.disburse()
      // 6. Update status: pending_external
      // 7. Notify uctalent-backend via webhook
    }
  }
}
```

### 2.2 🚨 Critical: Map Wallet Address → KYC ID

**Vấn đề:** `milestone_released` event chỉ trả về `freelancer` wallet address, không có KYC ID. AnchorController set `receiverId = 'SYSTEM'` → không tra được bank profile.

**Giải pháp:**
1. Tạo bảng `customer_wallet_mapping`: `wallet_address → customer_id`
2. API endpoint để user đăng ký wallet của họ: `POST /api/v2/customer/wallet-link`
3. Khi SorobanListener decode `milestone_released`, lookup wallet address → KYC ID
4. Nếu không tìm thấy → set status = `pending_customer_info_update` và gửi notification yêu cầu user liên kết wallet

**Tương tự cho Scout:** `referral_settled` có `scoutKycId` từ smart contract — OK. Nhưng cần verify là `scoutKycId` được mã hóa đúng cách (hiện tại đang dùng `Buffer.isBuffer` check).

### 2.3 🔸 Cao: Webhook từ uc-cross-border → uctalent-backend

**Vấn đề:** `EventConsumerService` gửi webhook đến `SEP31_WEBHOOK_URL` (default: `http://localhost:4000/api/anchor/disburse`). Đây là endpoint của chính uc-cross-border, không phải uctalent-backend.

**Cần sửa:**
1. `EventConsumerService` nên gửi webhook đến **uctalent-backend** (`UCTALENT_BACKEND_WEBHOOK_URL`)
2. uctalent-backend cần tạo `payment_distributions` records cho scout/referrer khi nhận webhook
3. uctalent-backend cần tạo `payment_distributions` cho talent từ milestone events

**Luồng mong muốn:**
```
Soroban event → EventConsumer → POST /api/v2/cross-border/webhook (uctalent-backend)
  → HandleCrossBorderWebhookUseCase
    → Tạo payment_distributions records với role = referrer/talent
    → Gọi AnchorController (uc-cross-border) để initiate disbursement
```

### 2.4 🔸 Cao: Chuyển ConfigService cho toàn bộ Services

**Vấn đề:** Nhiều services vẫn đọc `process.env` trực tiếp thay vì dùng `EnvService`/`ConfigService`.

**Cần sửa:** Inject `EnvService` vào tất cả services còn dùng `process.env`:
- `AnchorRpcService` (stellar)
- `NinePayGatewayService` (banking)
- `OracleService` (banking)
- `StellarService` (stellar)
- `Sep31TransactionService` (stellar)
- `EncryptionService` (core) — đặc biệt là singleton ngoài DI
- `DatabaseModule` — DB connection config

### 2.5 🔸 Trung bình: Bổ Sung SEP Endpoints

| Endpoint | Mô tả | Priority |
|----------|-------|:--------:|
| `GET /.well-known/stellar.toml` | SEP-1: Anchor metadata | Thấp |
| `GET /api/sep31/info` | SEP-31: Anchor capabilities (assets, fields, fees) | Trung bình |
| `GET /api/sep31/transactions/:id` | SEP-31: Transaction status polling | Trung bình |
| `POST /api/sep31/transactions` | SEP-31 chuẩn (thay vì custom `/sep31/initiate`) | Thấp (nếu chỉ dùng nội bộ) |

### 2.6 🔸 Trung bình: Service Layer cho Controllers

**Vấn đề:** 6 controllers inject repositories trực tiếp. NestJS convention là controller → service → repository.

**Giải pháp:** Tạo service layer cho các controllers có business logic phức tạp:
- `KycController` → `KycService` 
- `AnchorController` → `AnchorDisbursementService`
- `IpnController` → `IpnProcessingService`

### 2.7 🔸 Trung bình: Xử Lý SDP Webhook Splits

**Vấn đề:** `sdp-webhook.controller.ts` dùng `if/else if` → chỉ xử lý 1 split.

**Cần sửa:** Xử lý tất cả splits trong payload, không dùng `else if`:
```typescript
// Sai:
if (splits.talent) { ... } else if (splits.scout) { ... }

// Đúng:
for (const [party, split] of Object.entries(splits)) {
  if (split.amountUsdc > 0) {
    // process each split independently
  }
}
```

### 2.8 🔸 Thấp: Cải Thiện Khác

| Vấn đề | Giải pháp |
|--------|-----------|
| `RateController` dùng `@Controller()` không prefix | Thêm prefix: `@Controller('rate')` |
| `price = 1 / baseRate` có thể `Infinity` | Kiểm tra `baseRate === 0` |
| `KYCStatus` type duplicate trong controller | Import từ entity thay vì định nghĩa lại |
| E2E test mocks chết (`query`, `CustomerModel`, ...) | Xóa mock không dùng đến |
| `di-symbols.ts` dead code | Xóa file và barrel export |
| `stellar.service.ts` potentially orphaned | Kiểm tra và xóa nếu không dùng |
| Demo scripts dùng raw `pg.Pool` | Chuyển qua TypeORM hoặc document rõ |

---

## 3. Báo Cáo Lỗi & Code Dư Thừa

### 3.1 Bugs Đang Tồn Tại

| # | Bug | File | Line | Mức độ |
|---|-----|------|:----:|:------:|
| 1 | **`pending_clearing` records không được xử lý** | `anchor.controller.ts:82` + `disbursement-poller.service.ts:55` | 82,55 | **Critical** |
| 2 | **KYC ID null cho talent milestone** | `soroban-listener.service.ts:261` | 261 | **Critical** |
| 3 | **RateController division by zero** | `rate.controller.ts` (đọc process.env) | — | **Cao** |
| 4 | **SDP webhook chỉ xử lý 1 split** | `sdp-webhook.controller.ts` | ~57-63 | **Cao** |
| 5 | **No DTO validation: KycController** | `kyc.controller.ts:105` dùng `Record<string, any>` | 105 | **Trung bình** |
| 6 | **No DTO validation: AnchorController** | `anchor.controller.ts:28` dùng `payload: any` (nhưng đã có `DisburseDto`) | — | **Thấp** (đã fix) |
| 7 | **E2E test mocks không còn tồn tại** | `sep31-flow.e2e-spec.ts:30-56` | 30-56 | **Thấp** |

### 3.2 Dead Code / Cần Xóa

| # | File | Lý do | Hành động |
|---|------|-------|-----------|
| 1 | `packages/core/src/di-symbols.ts` | Exported nhưng không import ở đâu | Xóa file + barrel export |
| 2 | `packages/stellar/src/services/stellar.service.ts` | Có thể không dùng (verify) | Kiểm tra, xóa nếu orphaned |
| 3 | `apps/api/test/sep31-flow.e2e-spec.ts` mocks: `query`, `queryAll`, `auditLog`, `CustomerModel`, `BankProfileModel` | Các module này đã bị xóa | Xóa mock code |
| 4 | `packages/core/src/services/encryption.service.ts` static methods (`encrypt`, `decrypt`, `createBeneficiaryRefId`) | Backward-compatible wrapper, comment "Keep until Commit B" | Xóa sau khi xác nhận không ai dùng |

### 3.3 Code Cần Refactor

| # | File | Vấn đề |
|---|------|--------|
| 1 | Tất cả services dùng `process.env` | Cần inject `EnvService` |
| 2 | 6 controllers inject repository trực tiếp | Nên qua service layer |
| 3 | `CoreModule`, `StellarModule`, `BankingModule` là `@Global()` | Nên bỏ `@Global()` và import explicit |
| 4 | `HealthController` dùng `DataSource.query('SELECT 1')` | Nên dùng TypeORM repository |
| 5 | `RateController` dùng `@Controller()` không prefix | Thêm prefix cho đồng nhất |
| 6 | `KycController` re-define `KYCStatus` type | Import từ `@uc/core` |

### 3.4 Các File Đã Được Kiểm Tra & Xác Nhận ACTIVE

Tất cả các file sau **đang được dùng**, không phải dead code:
- `Sep31CoreService` — injected vào 3 controllers
- `CustomerService` — injected vào KycController
- `FirmQuoteService` — injected vào RateController
- `AuditLogService` — injected vào nhiều nơi
- Tất cả entities — registered trong TypeOrmModule

---

## 4. Luồng Dòng Tiền Chi Tiết

### 4.1 Sơ Đồ Tổng Thể

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        UC TALENT ECOSYSTEM                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │   FRONTEND       │    │   uctalent-backend │    │   uc-cross-border│   │
│  │  (Next.js)       │    │   (NestJS :3000)   │    │   (NestJS :8081) │   │
│  │                  │    │                   │    │                   │   │
│  │ Post Job ────────┼───►│ CreateJobUseCase  │    │                   │   │
│  │ Deposit TX ──────┼───►│ Smart Contract    │    │                   │   │
│  │ (blockchain)     │    │                   │    │                   │   │
│  │                  │    │ CloseJobUseCase ──┼───►│ Sep31Controller   │   │
│  │ Claim/Withdraw ──┼───►│ DisbursementUC    │    │  → AP → Poller    │   │
│  │                  │    │  → Sep31Adapter───┼───►│  → 9Pay → Bank    │   │
│  │                  │    │                   │    │                   │   │
│  │                  │    │◄─CrossBorderWb ───┼────│ EventConsumer     │   │
│  │                  │    │  HandleWebhookUC  │    │  → SorobanListener │   │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     BLOCKCHAIN (Stellar/COTI)                   │    │
│  │  Soroban Escrow Contracts → referral_settled / milestone_released│   │
│  │  Factory → child escrow contracts                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     BANKING / FIAT                              │    │
│  │  9Pay → NAPAS → Recipient Bank Account (VND)                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Luồng 1: Client Post Job + Deposit (WORKING với lưu ý)

```
Client mở Post Job Form
  → Nhập thông tin job + referral amount + milestones (nếu freelance)
  → POST /api/v2/jobs → job status = PENDING_TO_REVIEW
  → Kết nối wallet (MetaMask / Soroban)
  → Deposit USDC vào smart contract:
      • Soroban: create_and_fund_milestone_escrow hoặc create_and_fund_referral_escrow
      • COTI: createJobPublic/Private với _depositAmount
  → POST /api/v2/payment-distributions/escrow → ghi nhận deposit
  → PATCH /api/v2/jobs/:id/update_transaction_details → lưu txHash
```

**⚠️ Cần kiểm tra:** Job có tự động active sau deposit không? Nếu không, admin cần approve job.

### 4.3 Luồng 2: Freelancer Nhận Tiền (Qua Claim, WORKING)

```
Freelancer ứng tuyển → được hired → job closed (success)
  → CloseJobUseCase tạo payment_distributions:
      • role = candidate, 80%, status = PENDING
  → Sau 5 phút (Web3 job) → status = CLAIMABLE
Freelancer vào Applied Jobs List
  → Thấy nút "Withdraw to Bank"
  → Mở WithdrawalModal:
      • Chọn tài khoản ngân hàng
      • Xem firm quote (SEP-38 USDC → VND)
      • Confirm → POST /api/v2/disbursements
  → DisbursementUseCase:
      • markAsClearingAtomically: PENDING → CLEARING
      • Sep31Adapter → POST /api/sep31/initiate (uc-cross-border)
  → Sep31Controller:
      • Tạo Sep31Transaction: status = pending_sender
      • Gọi Anchor Platform /sep31/transactions
  → DisbursementPollerService (poll 10s):
      • Phát hiện pending_sender
      • Lock → pending_receiver
      • Tìm BankProfile → giải mã
      • Lấy FX rate → tính VND
      • Trừ 10% tax
      • Gọi NinePayGateway → 9Pay → NAPAS → Bank
  → IPN callback → update status = completed
  → Webhook → uctalent-backend → update distribution = PAID
```

### 4.4 Luồng 3: Scout/Referrer Nhận Tiền (BROKEN)

```
Smart contract emit referral_settled:
  [jobId, recipient, bounty, scoutShare, platformShare, scoutKycId]
  → SorobanListener: tạo BridgeEventQueue { status: pending }
  → EventConsumer: POST /api/anchor/disburse (HMAC)
  → AnchorController:
      • Tạo Sep31Transaction:
          - scout: status = pending_clearing ← 🚫 KHÔNG AI XỬ LÝ
          - platform: status = usdc_retained
  → Không có component nào đọc pending_clearing
  → Scout KHÔNG nhận được tiền
```

### 4.5 Luồng 4: Freelancer Nhận Tiền (Qua Milestone On-Chain, BROKEN)

```
Smart contract emit milestone_released:
  [gigId, milestoneIndex, amount, freelancer]
  → SorobanListener:
      • payload.splits = { talent: { amountUsdc, kycId: null } }
  → EventConsumer: POST /api/anchor/disburse
  → AnchorController:
      • kycId null → receiverId = 'SYSTEM'
      • status = pending_clearing ← 🚫 KHÔNG AI XỬ LÝ
      • KHÔNG có bank profile cho 'SYSTEM'
  → Freelancer KHÔNG nhận được tiền
```

### 4.6 Luồng Tiền Đầy Đủ (Trạng Thái Mong Muốn)

```
1. Client deposit USDC → Soroban Escrow Contract
2. Freelancer hoàn thành milestone:
   a. Client approve → on-chain milestone_released
   b. SorobanListener → map wallet → KYC ID
   c. pending_clearing → locked → 9Pay disbursement
3. Hoặc Freelancer claim từ frontend:
   a. POST /api/v2/disbursements
   b. SEP-31 → Anchor Platform → pending_sender
   c. DisbursementPoller → 9Pay → Bank
4. Scout nhận referral:
   a. referral_settled → map KYC ID
   b. pending_clearing → locked → 9Pay disbursement
   c. Hoặc claim từ frontend nếu có distribution
5. Platform fee: giữ lại USDC (usdc_retained)
6. Tax: 10% khấu trừ (PIT-AFFILIATE-10%)
7. Tất cả giao dịch đều có audit log
8. uctalent-backend nhận webhook → update distribution status
```

---

## Phụ Lục: File Inventory

Tất cả files trong `uc-cross-border` đã được kiểm tra. Chi tiết tại section 3.2 và 3.3 về những file cần xóa/sửa.

**Tổng kết:**
- **Total .ts files (non-test, non-demo, non-config):** ~45 files
- **ACTIVE:** ~42 files
- **DEAD CODE cần xóa:** 2 files (`di-symbols.ts`, có thể `stellar.service.ts`)
- **CẦN REFACTOR:** ~15 files (process.env → EnvService)
- **BUGS:** 4 critical, 2 high
