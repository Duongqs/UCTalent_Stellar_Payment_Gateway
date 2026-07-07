---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Kế hoạch phát triển: UCTalent Disbursement Gateway
> **Thời gian Hackathon:** 4 tuần (16 tháng 6 – 16 tháng 7, 2026)
> **Mục tiêu:** Hoàn thiện sản phẩm MVP chạy trên Stellar Testnet tích ## 1. Milestones (Các mốc quan trọng)

*   - [x] **Milestone 1 (Cuối Tuần 1):** Deploy thành công Soroban Smart Contract cho Escrow lên Stellar Testnet và viết unit test phủ >90% logic.
*   - [x] **Milestone 2 (Cuối Tuần 2):** Hoàn thiện UCTalent Backend cùng hệ thống lắng nghe sự kiện Horizon, kết nối Webhook an toàn.
*   - [x] **Milestone 3 (Cuối Tuần 3):** Hoàn thiện Mock Anchor (SEP-31/12) và Mock NAPAS Gateway, hoàn thành kiểm thử tích hợp Dual-Rail từ đầu đến cuối.
*   - [x] **Milestone 4 (Cuối Tuần 4):** Xây dựng xong Web UI Dashboard cao cấp, kết nối Freighter Wallet, quay video demo 5 phút và nộp sản phẩm.

---

## 2. Task Breakdown (Chi tiết công việc)

### Phase 1: Smart Contract Foundation (Tuần 1)
*   - [x] **Task 1.1: Khởi tạo và thiết kế Soroban Contract**
    *   *Chi tiết:* Thiết lập môi trường Rust/Soroban, tạo file `lib.rs`, định nghĩa struct `Milestone`, `EscrowState` và interface hợp đồng.
    *   *Ước lượng:* 2 ngày.
*   - [x] **Task 1.2: Cài đặt logic nạp rút & Tự động chia hoa hồng (Scout Commission)**
    *   *Chi tiết:* Viết logic `deposit`, `release_milestone`, tính toán tỷ lệ chia tách hoa hồng on-chain atomically cho Developer và Scout.
    *   *Ước lượng:* 2 ngày.
*   - [x] **Task 1.3: Cài đặt Timeout & Dispute Resolution**
    *   *Chi tiết:* Cài đặt cơ chế tự động giải phóng 14 ngày, logic 2/3 multisig cho trường hợp xảy ra tranh chấp hợp đồng.
    *   *Ước lượng:* 2 ngày.
*   - [x] **Task 1.4: Unit Testing & Deployment lên Testnet**
    *   *Chi tiết:* Viết test suites toàn diện trong `test.rs` giả lập các edge cases, biên dịch WASM và deploy lên Stellar Testnet.
    *   *Ước lượng:* 1 ngày.

### Phase 2: Event Bridge & Backend Service (Tuần 2)
*   - [x] **Task 2.1: Khởi tạo UCTalent Backend**
    *   *Chi tiết:* Thiết lập Backend NestJS/Node.js, cấu hình database SQLite/Postgres để quản lý User, Escrows và Milestones.
    *   *Ước lượng:* 2 ngày.
*   - [x] **Task 2.2: Xây dựng Event Listener lắng nghe Horizon**
    *   *Chi tiết:* Tích hợp thư viện Stellar SDK, viết service kết nối Horizon streaming API lắng nghe các events phát ra từ địa chỉ Soroban Escrow Contract.
    *   *Ước lượng:* 2 ngày.
*   - [x] **Task 2.3: Pipeline xử lý Webhook an toàn**
    *   *Chi tiết:* Cài đặt mã hóa HMAC-SHA256 xác minh signature webhook, thiết lập cơ chế Idempotency chống xử lý lặp lại giao dịch.
    *   *Ước lượng:* 3 ngày.

### Phase 3: Onshore Rails & Clearing Integration (Tuần 3)
*   - [x] **Task 3.1: Phát triển Mock SEP-12 & SEP-31 Anchor Service**
    *   *Chi tiết:* Viết API đăng ký KYC một lần cho Talent (`kyc_reference_id`), API truy vấn tỷ giá hối đoái USDC/VND thời gian thực.
    *   *Ước lượng:* 2 ngày.
*   - [x] **Task 3.2: Xây dựng Mock NAPAS Clearing Gateway**
    *   *Chi tiết:* Phát triển mock API mô phỏng hệ thống Napas 24/7 (9Pay), có callback trả về clearing trạng thái thành công/thất bại sau 5 giây để giả lập môi trường thực tế.
    *   *Ước lượng:* 2 ngày.
*   - [x] **Task 3.3: Tích hợp và thử nghiệm tích hợp Dual-Rail**
    *   *Chi tiết:* Chạy thử toàn bộ luồng từ khi gọi Soroban release event trên chuỗi Testnet đến khi tiền VND đổ về tài khoản ngân hàng giả lập, xử lý tình huống Napas bị lỗi (EDGE-01).
    *   *Ước lượng:* 3 ngày.

### Phase 4: Frontend Premium Web App & Submission (Tuần 4)
*   - [x] **Task 4.1: Xây dựng UI Premium Dashboard**
    *   *Chi tiết:* Thiết kế và lập trình giao diện Web responsive, sử dụng gam màu dark mode cực chất, kết hợp Outfit font chữ hiện đại, hiển thị bảng tiến độ milestone rõ ràng.
    *   *Ước lượng:* 3 ngày.
*   - [x] **Task 4.2: Tích hợp Ví Freighter & Stellar DEX (Path Payment)**
    *   *Chi tiết:* Cho phép Client kết nối ví Freighter để ký transaction nạp tiền trực tiếp bằng USDC hoặc XLM (kết hợp Path Payment).
    *   *Ước lượng:* 2 ngày.
*   - [x] **Task 4.3: Xây dựng 4-ID Audit Trail & Reputation Widget**
    *   *Chi tiết:* Phát triển công cụ tra cứu giao dịch tức thì hiển thị sự liên kết 4 mã ID đồng nhất. Hiển thị điểm uy tín on-chain của Talent.
    *   *Ước lượng:* 1 ngày.
*   - [ ] **Task 4.4: Chuẩn bị nội dung nộp bài (Presentation & Demo Video)**
    *   *Chi tiết:* Ghi hình video demo sản phẩm thực tế dài 5 phút theo kịch bản có sẵn, viết README chuẩn, nộp dự án lên nền tảng Rise In.
    *   *Ước lượng:* 1 ngày.

---

## 3. Dependencies (Mối quan hệ phụ thuộc)

*   **Blocker chính:** Backend Event Listener (Task 2.2) phụ thuộc vào việc cấu trúc Soroban Contract và deploy Testnet (Phase 1) hoàn thành để lấy địa chỉ hợp đồng & cấu trúc event data.
*   **External Blockers:** SDK Soroban Client tương tác cần ổn định trên môi trường Node.js.
*   **UI Blockers:** Frontend Dashboard (Task 4.1) cần kết nối API Backend (Phase 2 & 3) để hiển thị dữ liệu thực tế.

---

## 4. Risks & Mitigation (Rủi ro & Biện pháp khắc phục)

| Rủi ro kỹ thuật | Mức độ | Biện pháp khắc phục |
| :--- | :--- | :--- |
| **Lỗi mạng Stellar Testnet:** Testnet Stellar đôi khi reset hoặc nghẽn làm gián đoạn việc demo. | Cao | Thiết lập local sandbox Horizon/Soroban để chạy thử và chuẩn bị sẵn video demo ghi hình trước trong môi trường ổn định. |
| **Độ trễ Webhook xử lý:** Xử lý webhook NAPAS bị nghẽn làm giảm trải nghiệm dưới 10 giây. | Trung bình | Sử dụng Redis Queue để xử lý bất đồng bộ các luồng công việc của Anchor và NAPAS. |
| **Slippage DEX quá lớn:** Khi Client dùng XLM nạp vào Escrow, tỷ giá XLM/USDC trượt giá lớn làm giao dịch thất bại. | Thấp | Thiết lập mức trượt giá tối đa (slippage tolerance) 1% trên Path Payment để bảo vệ dòng tiền Client. |

---

## 5. Resources Needed (Tài nguyên cần thiết)

*   **Môi trường chạy thử:** Stellar Testnet, Horizon Public Node.
*   **Công cụ lập trình:** Rust, Cargo, Soroban CLI, Freighter Wallet, Node.js (Express/NestJS), React/Vite.
*   **API & SDK:** `@stellar/stellar-sdk` cho kết nối Horizon, `@stellar/freighter-api` cho ký ví điện tử.
