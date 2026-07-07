# 🎨 Đề xuất thiết kế UI/UX: UCTalent Disbursement Gateway
> **Dự án:** UCTalent Disbursement Gateway — B2B Payroll Infrastructure
> **Aesthetic:** Dark Premium, Glassmorphism, Neon Cyan & Deep Indigo accents.

Để mô tả trực quan và hỗ trợ bạn trong việc phát triển sản phẩm cũng như pitching tại hackathon, tôi đã thiết kế và kết xuất **2 giao diện UI/UX độ phân giải cao (High-Fidelity UI Mockups)** mô phỏng chính xác các tính năng nghiệp vụ.

Dưới đây là chi tiết các đề xuất thiết kế giao diện cho Portal của Doanh nghiệp nước ngoài và Dashboard của Lập trình viên nội địa:

---

## 🎠 Giao diện Trực quan (UI Mockups)

### 📱 1. Portal Doanh nghiệp (Enterprise Client Dashboard)
![Enterprise Client Portal Dashboard](/Users/admin/.gemini/antigravity/brain/02271ee7-7715-42ab-a751-ee2f1fb07376/uctalent_client_dashboard_1780309612708.png)

### 💻 2. Dashboard Lập trình viên (Talent/Developer Dashboard)
![Talent/Developer Dashboard Mockup](/Users/admin/.gemini/antigravity/brain/02271ee7-7715-42ab-a751-ee2f1fb07376/uctalent_talent_dashboard_1780309631446.png)

---

## 🖥️ 1. Phân tích Chi tiết Giao diện Portal Doanh nghiệp (Client Dashboard)

Giao diện này dành cho các doanh nghiệp toàn cầu (offshore clients) quản lý việc ký quỹ và giải phóng thanh toán lương cho các remote developer.

### Các thành phần UI chính:
*   **Thẻ thống kê Escrow (Total USDC in Escrow):** Hiển thị số lượng USDC đang được khóa an toàn trong Soroban Smart Contract ($14,500.00 USDC). Thiết kế dạng Glassmorphism nền tối với chữ số lớn màu trắng nổi bật, tạo cảm giác chuyên nghiệp và an toàn.
*   **Active Developer Milestones Tracking:** Bảng theo dõi tiến độ công việc theo từng Milestone. Có các nhãn trạng thái sinh động như `Completed` (xanh ngọc), `In Progress` (vàng hổ phách), và `Upcoming` (xanh dương). Mỗi milestone hiển thị rõ ràng ngày hết hạn (deadline) và thanh tiến trình tương ứng.
*   **Dual-Rail Bridge Flow Widget:** Mô hình trực quan hóa đường ray kép. Minh họa dòng chảy dòng tiền từ **USDC** ở offshore qua **Stellar Network/Bridge (Lớp Soroban)** đến **VND Local Bank Payout** ở onshore, giúp Client dễ dàng hình dung cơ chế hoạt động passthrough không giữ fiat của nền tảng.
*   **Thanh Wallet Status Widget:** Nằm ở góc trên cùng bên phải, hiển thị trạng thái đã kết nối ví on-chain (`Connected [0x7a...3FB]`) cùng ảnh đại diện người dùng và nút bật thông báo, thể hiện tính ứng dụng Web3 tức thì.
*   **Bảng đối soát lương gần đây (Recent Payroll Disbursements):** Liệt kê chi tiết tên Talent, tên dự án/milestone, số tiền USDC, số tiền quy đổi VND tương ứng, trạng thái chuyển tiền (`Paid` hoặc `Pending`), và ngày thực hiện.

---

## 💻 2. Phân tích Chi tiết Giao diện Lập trình viên (Talent/Developer Dashboard)

Giao diện tối giản và tập trung giúp lập trình viên nội địa quản lý dòng thu nhập, liên kết ngân hàng và thiết lập cơ chế rút tiền mong muốn.

### Các thành phần UI chính:
*   **Widget Liên kết Ngân hàng (Vietnamese Bank Connection):**
    *   Hiển thị logo trực quan của ngân hàng đối tác nội địa (Vietcombank) cùng nhãn trạng thái `Connected` màu xanh sáng.
    *   Hiển thị số tiền giao dịch VND gần nhất đổ về tài khoản.
*   **Thanh trượt Tỷ lệ nhận tiền (Payout Preferences):**
    *   Một thanh kéo (Slider) trực quan cho phép Talent tùy chọn tỷ lệ phân phối dòng tiền.
    *   Ví dụ thiết lập: **70% VND** chuyển khoản tự động qua NAPAS về Vietcombank và **30% USDC** giữ lại trong Stellar Wallet cá nhân để đầu tư hoặc tích trữ stablecoin.
*   **On-Chain Reputation Score (Điểm uy tín nghề nghiệp):**
    *   Hiển thị dưới dạng đồng hồ đo vòng cung (Circular Gauge) với điểm số uy tín nghề nghiệp xuất sắc **98/100**.
    *   Đây là chỉ số uy tín on-chain được tích lũy tự động dựa trên số milestone hoàn thành đúng hẹn, làm minh chứng năng lực nghề nghiệp toàn cầu (verifiable work history).
*   **4-ID Audit Trail (Cột truy vết kiểm toán 4-ID):**
    *   Sơ đồ timeline trực quan thể hiện chuỗi liên kết 4 ID thời gian thực của giao dịch vừa thực hiện:
        1.  `Stellar Tx`: Giao dịch Soroban on-chain (mã hash đầy đủ).
        2.  `Stellar Memo`: Mã memo giao dịch độc nhất được giải mã.
        3.  `Napas ID`: Mã clearing Napas từ cổng fiat nội địa.
        4.  `Bank Ref ID`: Mã tham chiếu chuyển khoản cuối cùng từ ngân hàng Vietcombank.

---

## 🎨 3. Quy chuẩn UX & Trải nghiệm Người dùng Đề xuất (UX Guidelines)

1.  **Micro-Animations:** Khi Client di chuột vào nút "Release", nút sẽ phát sáng nhẹ màu neon cyan. Khi thanh toán thành công, timeline của 4-ID Audit Trail sẽ sáng dần lên theo hiệu ứng thác nước (waterfall effect) từ trên xuống dưới trong 10 giây để Talent cảm nhận được tốc độ xử lý tức thì.
2.  **Thông báo đa kênh (Instant Notifications):** Khi Mock NAPAS hoàn thành clearing, lập trình viên sẽ nhận được 3 thông báo đồng thời:
    *   Tiếng "ting ting" và SMS biến động số dư thực tế từ ngân hàng VCB.
    *   Thông báo Webapp chuyển trạng thái giao dịch sang `Paid` màu xanh lá.
    *   Thông báo email chứa mã đối soát thuế TNCN (PIT) tự động tạo lập.
3.  **Tối ưu hóa thao tác thiết lập ban đầu (Frictionless Onboarding):** Talent chỉ cần thực hiện KYC và nhập số tài khoản ngân hàng một lần duy nhất qua quy trình SEP-12. Toàn bộ các lần nhận lương sau đó đều tự động hóa hoàn toàn theo cấu hình Payout Preferences mà không cần đăng nhập lại ví hay ký bất kỳ giao dịch Web3 phức tạp nào.
