---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Yêu cầu dự án: UCTalent Disbursement Gateway
> **Dự án Hackathon:** APAC Stellar Hackathon 2026
> **Mô hình:** Programmable Payroll Router (Dual-Rail Model)

---

## 1. Problem Statement (Phát biểu bài toán)
**UCTalent Disbursement Gateway** giải quyết các vấn đề cốt lõi trong thanh toán B2B xuyên biên giới cho các công ty công nghệ toàn cầu khi thuê nhân tài (Tech Talent) tại Việt Nam và Đông Nam Á:

*   **Friction & Delay:** Việc chuyển tiền quốc tế truyền thống mất từ 2-5 ngày làm việc thông qua hệ thống ngân hàng đại lý phức tạp, với chi phí giao dịch cao và tỷ giá chuyển đổi bất lợi.
*   **Thiếu sự tin cậy (Lack of Trust):** Giữa doanh nghiệp nước ngoài (Client) và lập trình viên địa phương (Developer) thường thiếu cơ chế đảm bảo an toàn thanh toán trung gian. Lập trình viên sợ không nhận được tiền sau khi làm xong, còn doanh nghiệp sợ lập trình viên không bàn giao code đúng hạn.
*   **Compliance & Accounting:** Việc giải trình thuế, kê khai thu nhập cá nhân (PIT) và đối soát kế toán cho các giao dịch Stablecoin/Crypto sang tiền mặt (VND) cực kỳ phức tạp và thiếu cơ chế truy vết (traceability) rõ ràng theo quy định pháp lý (Nghị định 52/2024 và Quyết định 222/2025).
*   **Thủ tục KYC phức tạp:** Mỗi lần chuyển tiền, ngân hàng hoặc cổng thanh toán thường yêu cầu khai báo thông tin người nhận và mục đích chuyển tiền, gây phiền hà cho cả hai bên.

---

## 2. Goals & Objectives (Mục tiêu dự án)

### Mục tiêu chính (Primary Goals)
*   **Dual-Rail pass-through routing:** Xây dựng hệ thống định tuyến thanh toán không lưu trữ fiat (non-custodial payroll router). Nhận USDC ở offshore (Stellar) và phân phối VND vào tài khoản ngân hàng của lập trình viên onshore (NAPAS) trong **dưới 10 giây**.
*   **Trustless Escrow:** Phát triển Smart Contract trên Stellar Soroban để quản lý Escrow theo cơ chế đa cột mốc (multi-milestone) và tự động phân chia hoa hồng cho người giới thiệu (Scout Commission Split) trên chuỗi.
*   **Full Traceability:** Kết nối chuỗi truy vết 4-ID đồng nhất tỷ lệ 1-1: `Soroban Tx Hash` ↔ `Stellar Memo` ↔ `NAPAS Clearing ID` ↔ `Bank Ref ID`, cho phép đối soát và kiểm toán tức thì.
*   **Tự động hóa tích hợp:** Cho phép giải phóng thanh toán tự động dựa trên các sự kiện thực tế như PR Merged trên GitHub thông qua Oracle.

### Mục tiêu phụ (Secondary Goals)
*   **Chọn lựa phương thức rút tiền (Withdrawal Preference):** Cho phép Talent tự cấu hình tỷ lệ nhận VND về tài khoản ngân hàng và USDC về ví Stellar cá nhân (Ví dụ: 70% VND, 30% USDC).
*   **Hệ thống Reputation On-chain:** Phát triển cơ chế tích lũy điểm uy tín nghề nghiệp dựa trên lịch sử hoàn thành dự án thực tế được ghi nhận minh bạch trên blockchain Stellar.

### Phi phạm vi (Non-Goals)
*   Hệ thống không đóng vai trò sàn giao dịch (Exchange) hay ví giữ hộ tiền fiat (Custodial Bank).
*   Không xử lý việc thanh toán trực tiếp qua ngân hàng mà chỉ gửi chỉ thị thanh toán qua API của đối tác trung gian được cấp phép (Mock Sandbox Anchor/NAPAS).

---

## 3. User Stories & Use Cases (Kịch bản sử dụng & Câu chuyện người dùng)

### Câu chuyện người dùng (User Stories)
1.  **As an Enterprise Client (Singapore/US):** Tôi muốn ký quỹ USDC một lần duy nhất cho toàn bộ dự án và giải phóng thanh toán theo từng cột mốc đã thống nhất, để bảo vệ dòng tiền và đảm bảo lập trình viên hoàn thành công việc trước khi nhận tiền.
2.  **As a Local Tech Talent (Việt Nam):** Tôi muốn làm việc cho các dự án quốc tế nhưng nhận lương bằng VND trực tiếp vào tài khoản ngân hàng nội địa của mình (như Vietcombank) trong vài giây mà không cần biết cách sử dụng ví blockchain, đồng thời có thể dễ dàng xuất dữ liệu đối soát thuế thu nhập cá nhân.
3.  **As a Talent Scout (Affiliate):** Tôi muốn giới thiệu các lập trình viên giỏi cho doanh nghiệp và tự động nhận được hoa hồng chia sẻ trực tiếp trên chuỗi ngay khi dự án được nghiệm thu, không cần phải chờ đợi đối soát thủ công từ phía nền tảng.
4.  **As an Auditor/Compliance Officer:** Tôi muốn truy vết mọi giao dịch thanh toán lương từ ví của doanh nghiệp nước ngoài đến số tài khoản ngân hàng nội địa để đảm bảo tuân thủ quy định pháp luật về phòng chống rửa tiền và thuế.

### Các tình huống biên (Edge Cases)

#### EDGE-01: Giao dịch Napas bị từ chối (NAPAS Transfer Rejected)
*   **Kịch bản:** Tài khoản ngân hàng của Talent bị sai hoặc bị khóa, Mock Cổng thanh toán (9Pay/Baokim) trả về callback thất bại (`FAILED`).
*   **Giải pháp:** USDC vẫn được giữ an toàn trong Soroban Escrow. Trạng thái cột mốc chuyển thành `PaymentFailed`. Hệ thống gửi thông báo cho Talent cập nhật lại thông tin ngân hàng để tiến hành Retry. Doanh nghiệp không bị mất tiền hay bị tính thêm phí.

#### EDGE-02: Doanh nghiệp biến mất (Client Disappearance)
*   **Kịch bản:** Doanh nghiệp sau khi nhận sản phẩm của lập trình viên thì biến mất không ấn nút Release và cũng không mở tranh chấp.
*   **Giải pháp:** Áp dụng cơ chế **Timeout Auto-Release** trong 14 ngày. Nếu sau 14 ngày kể từ khi lập trình viên nộp sản phẩm mà doanh nghiệp không phản hồi hay tranh chấp, Smart Contract Soroban sẽ tự động giải phóng 100% số tiền trong Escrow cho Developer và Scout.

#### EDGE-03: Tranh chấp hợp đồng (Dispute Resolution)
*   **Kịch bản:** Doanh nghiệp từ chối giải phóng vì cho rằng sản phẩm không đạt yêu cầu, còn Talent khẳng định đã hoàn thành.
*   **Giải pháp:**
    *   Tự động giải phóng ngay 50% số tiền cho Developer như một khoản thanh toán thiện chí (Good faith payment).
    *   50% còn lại sẽ được đưa vào cơ chế Multisig 3 bên: Client Key, Scout Key và Platform Key. Cần ít nhất 2 trên 3 chữ ký để giải quyết tranh chấp. Scout đóng vai trò trọng tài trung gian có động lực kinh tế để xử lý công bằng.

#### EDGE-04: Doanh nghiệp muốn thanh toán bằng XLM hoặc token khác
*   **Kịch bản:** Doanh nghiệp chỉ có XLM trong ví nhưng hợp đồng yêu cầu thanh toán bằng USDC.
*   **Giải pháp:** Sử dụng tính năng **Stellar Path Payment Strict Receive**. Giao dịch sẽ chuyển đổi XLM sang USDC thông qua Stellar DEX và nạp vào Escrow trong đúng 1 giao dịch nguyên tử (atomic transaction). Nếu tỷ giá trượt vượt ngưỡng thiết lập, giao dịch sẽ tự động hoàn trả toàn bộ.

---

## 4. Success Criteria (Tiêu chí thành công)

### Tiêu chí nghiệm thu (Acceptance Criteria)
*   [ ] Thiết kế và deploy thành công Soroban Smart Contract cho Escrow, hỗ trợ nạp USDC, chia hoa hồng tự động, timeout và xử lý tranh chấp bằng multisig.
*   [ ] Cấu hình Stellar SDP (Stellar Disbursement Platform) và SEP-31 để bắt sự kiện on-chain và định tuyến Webhook về Backend UCTalent.
*   [ ] Triển khai Mock API Cổng thanh toán nội địa mô phỏng NAPAS (thời gian chuyển tiền giả lập dưới 10 giây).
*   [ ] Xây dựng giao diện Web Dashboard hoàn chỉnh hiển thị thông tin rõ ràng cho Client (deposit, release), Talent (KYC bank info, payout preference), và Scout (commission tracking).
*   [ ] Cơ chế truy vết 4-ID hoạt động thông suốt và cho phép tra cứu dễ dàng trên dashboard.

### Chỉ số hiệu năng (Performance Benchmarks)
*   **Tốc độ xử lý:** Thời gian từ lúc Client ấn "Release" trên Blockchain đến khi Talent nhận được VND giả lập vào tài khoản ngân hàng nội địa phải **dưới 10 giây**.
*   **Chi phí giao dịch:** Chi phí gas on-chain phải tối ưu hóa, đảm bảo **dưới 0.01 XLM** cho mỗi tương tác với Soroban Contract.
*   **Traceability:** Mức độ chính xác đối soát thông tin giao dịch đạt **100%**.

---

## 5. Constraints & Assumptions (Ràng buộc & Giả định)

### Ràng buộc kỹ thuật (Technical Constraints)
*   Hệ thống Smart Contract bắt buộc phải chạy trên blockchain Stellar sử dụng công nghệ **Soroban (Rust)**.
*   Tương tác phía Client yêu cầu tích hợp ví **Freighter** hoặc các ví Stellar tương thích SEP.
*   Kết nối Dual-Rail yêu cầu cơ chế lắng nghe sự kiện trên chuỗi real-time (Stellar Horizon event stream hoặc Mercury).

### Giả định (Assumptions)
*   Môi trường thử nghiệm chạy hoàn toàn trên Stellar Testnet.
*   Sử dụng Mock Anchor sandbox của Unchain Labs để đại diện cho dòng tiền fiat VND thực tế.

---

## 6. Questions & Open Items (Câu hỏi & Vấn đề mở)
1.  **Pháp lý Sandbox:** Quy trình đăng ký VIFC-DN Sandbox thực tế cần chuẩn bị các giấy tờ cụ thể nào về mặt bảo mật thông tin và phòng chống rửa tiền (AML)?
2.  **Exchange Rate Oracle:** Làm thế nào để cập nhật tỷ giá USDC/VND theo thời gian thực một cách phi tập trung (Decentralized Oracle) hay sử dụng tỷ giá cung cấp từ chính Anchor SEP-31?
3.  **Hỗ trợ đa quốc gia:** Kế hoạch mở rộng sang Philippines (InstaPay) và Thái Lan (PromptPay) cần những chỉnh sửa gì ở cấu trúc routing webhook hiện tại?
