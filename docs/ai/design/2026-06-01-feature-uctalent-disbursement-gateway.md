---
phase: design
title: System Design & Architecture
description: Define the technical architecture, components, and data models
---
# Thiết kế hệ thống: UCTalent Disbursement Gateway

---

## 1. Architecture Overview (Tổng quan kiến trúc)

UCTalent hoạt động theo mô hình **Dual-Rail (Đường ray kép)**, tách biệt hoàn toàn phần xử lý trên blockchain (Offshore Rail) và phần xử lý thanh toán ngân hàng nội địa (Onshore Rail). Cầu nối giữa hai rail này là **Stellar SEP-31 Corridor** và **Soroban Smart Contract layer**.	

### Sơ đồ kiến trúc tổng thể

```mermaid
graph TD
    %% Actors & Clients
    Client[Enterprise Client] -->|1. Sign Tx via Freighter| SorobanContract[Soroban Milestone Escrow]
    Talent[Local Talent] -->|2. Setup Bank & KYC| Backend[UCTalent Backend]
    Scout[Talent Scout] -->|Auto-Split Payout| BankClearing[Mock NAPAS Bank Clearing]

    %% Blockchain Layer (Offshore)
    subgraph Offshore Rail (Stellar Blockchain)
        SorobanContract -->|USDC Locked| EscrowVault[Contract Escrow Vault]
        SorobanContract -->|3. Emit Event: release_milestone| EventBroker[Horizon / Mercury Stream]
    end

    %% Routing Layer (Bridge)
    subgraph Pass-Through Bridge
        Listener[SDP Event Listener] -->|Catch Event| EventBroker
        Listener -->|4. Authenticated Webhook| Backend
    end

    %% Fiat Layer (Onshore)
    subgraph Onshore Rail (VND Bank Network)
        Backend -->|5. Lookup KYC & Route| MockAnchor[Mock SEP-31/SEP-12 Anchor]
        MockAnchor -->|6. Trigger Instant VND Payout| BankClearing
        BankClearing -->|7. Fast VND Deposit < 10s| TalentBankAccount[Talent Bank Account]
        BankClearing -->|7. Commission Deposit < 10s| ScoutBankAccount[Scout Bank Account]
    end
```

### Các thành phần chính và trách nhiệm

1. **Soroban Escrow Contract:** Chịu trách nhiệm lưu trữ USDC ký quỹ một cách phi tập trung, thực thi logic chia tỷ lệ phần trăm thanh toán cho Developer và Scout theo thỏa thuận, quản lý thời gian tự động giải phóng (Timeout) và xử lý chữ ký Multisig khi xảy ra tranh chấp.
2. **Stellar SDP & Event Listener:** Lớp lắng nghe (listen) các sự kiện `Event` được phát ra từ Smart Contract trên chuỗi Stellar, giải mã thông tin (Memo, amounts, addresses) và chuyển tiếp webhook an toàn về Backend.
3. **UCTalent Backend:** Máy chủ trung tâm đóng vai trò định tuyến (payroll router). Quản lý hồ sơ người dùng, thông tin KYC liên kết với địa chỉ ví Stellar, đối soát mã giao dịch và đồng bộ dữ liệu trạng thái.
4. **Mock SEP-31 Anchor (Unchain Labs Sandbox):** Đại diện cho tổ chức tài chính trung gian, tiếp nhận chỉ thị thanh toán, thực hiện quy đổi tỷ giá (FX) từ USDC sang VND theo thời gian thực và gọi API chuyển khoản ngân hàng.
5. **Mock NAPAS Bank Clearing:** Cổng thanh toán nội địa (phỏng theo 9Pay) thực hiện chuyển tiền nhanh 24/7 trực tiếp vào tài khoản ngân hàng của Talent và Scout.

---

## 2. Data Models (Mô hình dữ liệu)

### Thực thể Core (Entities)

#### 1. User

Quản lý thông tin tài khoản của các Actors tham gia hệ thống.

```json
{
  "id": "uuid",
  "stellar_address": "G...",
  "role": "CLIENT | TALENT | SCOUT",
  "name": "string",
  "email": "string",
  "kyc_status": "PENDING | APPROVED | REJECTED",
  "kyc_reference_id": "string", // Liên kết với SEP-12 Anchor
  "bank_info": {
    "bank_code": "VCB",
    "account_number": "1012345678",
    "account_name": "NGUYEN VAN A"
  },
  "created_at": "timestamp"
}
```

#### 2. EscrowContract

Quản lý thông tin hợp đồng ký quỹ Milestone trên chuỗi.

```json
{
  "id": "uuid",
  "soroban_contract_id": "C...",
  "client_id": "uuid",
  "talent_id": "uuid",
  "scout_id": "uuid",
  "scout_rate": "float", // ví dụ 0.08 đại diện cho 8%
  "total_amount_usdc": "decimal",
  "status": "ACTIVE | DISPUTED | COMPLETED | REFUNDED",
  "created_at": "timestamp"
}
```

#### 3. Milestone

Chi tiết từng cột mốc giải ngân trong hợp đồng.

```json
{
  "id": "uuid",
  "contract_id": "uuid",
  "milestone_index": "integer",
  "percentage": "integer", // ví dụ 30 đại diện cho 30%
  "description": "string",
  "status": "LOCKED | PENDING | RELEASED | FAILED",
  "released_tx_hash": "string",  // ID 1: Soroban Tx Hash
  "stellar_memo": "string",      // ID 2: Unique Memo
  "napas_clearing_id": "string", // ID 3: Fiat Gateway Clearing ID
  "bank_ref_id": "string",       // ID 4: Bank Deposit Reference
  "released_at": "timestamp"
}
```

---

## 3. API Design (Thiết kế API)

### 1. External APIs (UCTalent Backend Services)

* **POST `/api/v1/talent/kyc`**

  * **Mô tả:** Talent nộp thông tin định danh và tài khoản ngân hàng nội địa để liên kết KYC một lần duy nhất (SEP-12).
  * **Request Payload:**
    ```json
    {
      "stellar_address": "GD...",
      "name": "Nguyen Van A",
      "national_id": "0123456789",
      "bank_code": "VCB",
      "account_number": "1012345678"
    }
    ```
  * **Response:**
    ```json
    {
      "status": "success",
      "kyc_reference_id": "kyc_ref_vcb_982312"
    }
    ```
* **POST `/api/v1/webhooks/stellar-sdp`**

  * **Mô tả:** Nhận webhook từ Stellar SDP khi phát hiện sự kiện `release_milestone` thành công trên chuỗi.
  * **Request Payload:**
    ```json
    {
      "tx_hash": "0x53ab...",
      "contract_id": "CC...",
      "milestone_idx": 1,
      "memo": "uctalent_disburse_918231",
      "amount_usdc": 1000.00
    }
    ```
  * **Response:**
    ```json
    {
      "status": "queued",
      "message": "Disbursement pipeline initiated"
    }
    ```

### 2. Mock Anchor & Payment Gateway APIs

* **POST `/api/v1/mock-anchor/disburse`**
  * **Mô tả:** Backend ra lệnh cho Mock Anchor thực hiện chuyển đổi tỷ giá và bắn lệnh chuyển tiền NAPAS.
  * **Request Payload:**
    ```json
    {
      "kyc_reference_id": "kyc_ref_vcb_982312",
      "amount_usdc": 1000.00,
      "memo": "uctalent_disburse_918231",
      "currency": "VND"
    }
    ```
  * **Response:**
    ```json
    {
      "clearing_id": "napas_clr_8823119",
      "exchange_rate": 25450,
      "fiat_amount_vnd": 25450000,
      "status": "SUCCESS"
    }
    ```

---

## 4. Soroban Smart Contract (Rust Contract Interface)

Hợp đồng Soroban chịu trách nhiệm giữ token USDC và xử lý logic Escrow. Lập trình viên viết bằng **Rust**.

### Interface mô tả:

```rust
pub trait MilestoneEscrowTrait {
    // Khởi tạo escrow contract
    fn initialize(
        env: Env,
        client: Address,
        developer: Address,
        scout: Address,
        scout_rate: u32,       // Quy định phần trăm hoa hồng (ví dụ: 800 cho 8%)
        milestones: Vec<u32>,  // Mảng tỷ lệ phần trăm (ví dụ: [30, 40, 30])
        token: Address,        // Địa chỉ ví USDC token contract
    );

    // Client nạp tiền USDC vào escrow contract
    fn deposit(env: Env, amount: i128);

    // Giải phóng một milestone cụ thể
    fn release_milestone(env: Env, milestone_idx: u32);

    // Tranh chấp cột mốc thanh toán
    fn raise_dispute(env: Env);

    // Giải quyết tranh chấp thông qua chữ ký trọng tài (2/3 multisig)
    fn resolve_dispute(env: Env, dev_share_pct: u32);

    // Tự động giải phóng khi quá hạn phản hồi (14 ngày)
    fn trigger_timeout(env: Env, milestone_idx: u32);
}
```

---

## 5. Design Decisions (Các quyết định thiết kế)

### 1. Tại sao sử dụng mô hình "Dual-Rail" kết hợp Webhook?

* **Lý do:** Smart Contract Soroban không thể gọi trực tiếp API thế giới thực (API Web của ngân hàng) do tính chất cô lập của Blockchain. Webhook thông qua Stellar SDP đóng vai trò làm Oracle trung gian an toàn, đảm bảo sự kiện on-chain kích hoạt giao dịch fiat tức thì.
* **Đánh đổi:** Cần thiết lập chữ ký bảo mật (signature verification) cực kỳ nghiêm ngặt trên webhook endpoint để tránh tin tặc giả mạo yêu cầu chuyển tiền VND từ Backend.

### 2. Trọng tài kinh tế tự nhiên (Scout làm Trọng tài)

* **Lý do:** Thay vì sử dụng một bên thứ ba đắt đỏ hoặc hệ thống AI phức tạp để giải quyết tranh chấp, UCTalent sử dụng chính **Talent Scout** (người giới thiệu) làm trọng tài. Scout có động lực kinh tế (nhận commission) để giải quyết tranh chấp công bằng và nhanh chóng nhất để dự án được tiếp tục giải ngân.

---

## 6. Non-Functional Requirements (Yêu cầu phi chức năng)

### 1. Security (An ninh bảo mật)

* **Webhook Authentication:** Tất cả webhook gửi từ SDP đến Backend phải được ký bằng một cặp Key dùng chung (`HMAC-SHA256`) và xác minh chữ ký trước khi xử lý.
* **Idempotency (Bảo vệ trùng lặp):** Hệ thống onshore (Backend và Mock Anchor) bắt buộc phải đối soát `memo_string` duy nhất của Stellar để đảm bảo không chuyển khoản 2 lần cho cùng 1 chỉ thị (Double Payout Protection).

### 2. Performance (Hiệu suất)

* **Concurrency:** Backend xử lý queues bất đồng bộ (Queue Worker) để hỗ trợ việc giải ngân hàng loạt (Batch Disbursement) cùng lúc cho nhiều nhân viên mà không làm treo hệ thống.
* **Transaction Gas:** Tối ưu hóa lưu trữ trạng thái của Soroban Contract để chi phí gas cho mỗi giao dịch thay đổi trạng thái thấp hơn mức đề ra (<0.01 XLM).
