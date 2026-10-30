# Hướng dẫn sao kê ngân hàng — tự khớp học phí chuyển khoản, đối chiếu TK 112

Tài liệu dành cho Thầy và kế toán Dương Sinh. Áp dụng từ đợt P3b.

Sáng thứ Hai đầu tháng, cô kế toán Lan mở internet banking, thấy 37 khoản tiền vào cuối tuần — phần lớn là phụ huynh quét mã VietQR trên thông báo học phí. Trước đây cô phải đọc từng dòng nội dung, tra học viên, rồi lập phiếu thu cho từng em. Giờ cô tải tệp sao kê về, kéo vào AccEdu: 34 dòng hiện gợi ý *"Học phí HV102 Học viên Khang · DV0003 — đủ tiền"*, cô bấm **Xác nhận 34 gợi ý chắc chắn** một lần là xong. Ba dòng còn lại — một khoản phí ngân hàng, một khoản lãi, một khoản không rõ nội dung — cô xử lý tay trong hai phút. Cuối tháng, thẻ đối chiếu báo chênh lệch **0 đ** giữa sổ TK 112 và sao kê.

## 1. Vì sao AccEdu nhận ra được học phí

Mỗi thông báo học phí (in, gửi email, mã VietQR) đều ghi sẵn **nội dung chuyển khoản** dạng:

`HP <mã học viên> <số hóa đơn>` — ví dụ `HP HV102 DV0003`

Ngân hàng thường thêm chữ phía trước / sau (`MBVCB.123.HP HV102 DV0003.CT tu ...`) hoặc bỏ dấu cách (`HPHV102`) — AccEdu vẫn đọc được. **Dặn phụ huynh giữ nguyên nội dung** khi chuyển khoản (quét mã VietQR là nội dung tự điền).

## 2. Nhập sao kê

1. Trên internet banking, tải **sao kê tài khoản** dạng **Excel (.xlsx)** hoặc **CSV** cho khoảng ngày cần đối chiếu. Tệp .xls đời cũ: mở bằng Excel rồi *Lưu thành .xlsx*.
2. AccEdu: **Tiền › Sao kê ngân hàng & đối chiếu**, chọn **Tài khoản ngân hàng** (TK 112 chi tiết, ví dụ 1121 hoặc 11211) và **Tháng**.
3. Bấm **Nhập sao kê**, chọn tệp. AccEdu tự tìm dòng tiêu đề (dù phía trên có tên ngân hàng, số tài khoản…) và các cột *Ngày giao dịch, Số tham chiếu, Nội dung, Ghi nợ / Ghi có (hoặc Số tiền), Số dư* — hỗ trợ cả tiêu đề tiếng Việt lẫn tiếng Anh của các ngân hàng phổ biến.
4. Xem lại phần tóm tắt (số giao dịch, kỳ, tổng tiền vào / ra, số dư cuối), bấm **Nhập N giao dịch**.

Nhập lại cùng tệp, hoặc hai tệp có ngày chồng nhau, **không tạo dòng trùng**. Nhập nhầm tệp: mở *Các lần nhập sao kê* ở cuối trang và bấm thùng rác — dòng sao kê bị xóa, chứng từ đã lập vẫn giữ.

## 3. Khớp từng dòng

Mỗi dòng có một trạng thái:

| Trạng thái | Ý nghĩa |
|---|---|
| **Gợi ý** (vàng) | AccEdu đã nhận ra và chắc chắn: học phí trả **đủ** phiếu, hóa đơn trả **đủ**, hoặc trùng một BC / BN đã lập trước |
| **Cần xem** (xanh) | Nhận ra nhưng **trả thiếu** (trừ một phần hóa đơn) hoặc **trả thừa** (phần thừa ghi nhận trước cho học viên) |
| **Chưa khớp** (đỏ) | Không nhận ra: phí, lãi, khoản lạ… |
| **Đã khớp** (xanh lá) | Đã có chứng từ — bấm số chứng từ để mở |
| **Bỏ qua** (xám) | Kế toán đánh dấu không cần ghi sổ |

**Thứ tự AccEdu dò gợi ý:**
1. **Chứng từ đã lập:** BC (tiền vào) / BN (tiền ra) đã ghi sổ trên đúng TK, cùng số tiền, ngày lệch không quá 3 ngày → chỉ gắn, không lập thêm.
2. **Học phí:** nội dung có `HP <mã HV> [số HĐ]`. Có số hóa đơn thì trừ đúng hóa đơn đó; chỉ có mã học viên thì trừ dần các phiếu còn nợ, cũ trước.
3. **Hóa đơn bán hàng / dịch vụ:** nội dung có số hóa đơn còn nợ (ví dụ `HD0002`).

**Thao tác:**
- **Xác nhận N gợi ý chắc chắn** (trên cùng): xác nhận cả loạt dòng *Gợi ý*.
- **Xác nhận** (từng dòng): dùng cả cho dòng *Cần xem* sau khi Thầy / Cô đã kiểm tra.
  - Học phí, hóa đơn: AccEdu lập **Giấy báo có** Nợ TK ngân hàng / Có 131, trừ đúng hóa đơn, ngày = ngày giao dịch, chứng từ gốc ghi số tham chiếu, ghi sổ ngay.
- **Lập chứng từ:** cho dòng chưa khớp — chọn TK đối ứng, AccEdu lập BC (tiền vào) / BN (tiền ra) và ghi sổ.
  - Phí ngân hàng: AccEdu chọn sẵn **6422** (TT133) / **6427** (TT99).
  - Lãi tiền gửi: chọn sẵn **515**.
  - Khách hàng / nhà cung cấp trả, chi không theo hóa đơn: chọn 131 / 331 và **Đối tượng**.
- **Gắn:** chọn một chứng từ đã ghi sổ cùng số tiền (lập trước khi có sao kê).
- **Bỏ qua** / **Khôi phục**, **Bỏ khớp** (chỉ gỡ liên kết, không xóa chứng từ).

Kỳ đã **khóa sổ** thì AccEdu không lập chứng từ và báo lỗi riêng dòng đó; các dòng khác vẫn chạy.

## 4. Đối chiếu cuối tháng

Thẻ phía trên lưới cho biết, đến cuối tháng đang xem (hoặc hôm nay):

- **Số dư sổ** TK ngân hàng — số trên sổ cái AccEdu.
- **Số dư sao kê** — số dư của giao dịch cuối cùng trên sao kê đã nhập.
- **Chênh lệch** — lý tưởng là **0**. Khác 0 thường do:
  - dòng sao kê *chưa khớp* hoặc *bỏ qua* (ngân hàng đã có, sổ chưa ghi);
  - **chứng từ chưa có trên sao kê** (mục bấm mở được dưới thẻ): BC / BN đã ghi sổ nhưng ngân hàng chưa ghi nhận, hoặc ghi nhầm TK / nhầm số tiền.
- **Dòng sao kê chưa khớp** — còn bao nhiêu dòng cần xử lý.

Có thể hỏi **Hỏi AccEdu**: *"Sao kê tháng này còn khoản nào chưa khớp?"* — AI đọc bảng đối chiếu và liệt kê các dòng kèm gợi ý.

## 5. Mẹo

- Nhập sao kê **hằng tuần** để học phí cập nhật kịp thời, email nhắc học phí không gửi nhầm cho phụ huynh đã đóng.
- Mỗi TK ngân hàng một TK chi tiết (1121 Vietcombank, 1122… hoặc 11211, 11212); nhập sao kê đúng TK đã chọn.
- Phụ huynh chuyển thiếu / thừa: xác nhận dòng *Cần xem*.
  - Phần thiếu: hóa đơn vẫn hiện còn nợ ở *Học phí*.
  - Phần thừa: ghi Có 131 của học viên (tiền nhận trước). Khoản này hiện trong sổ công nợ và tuổi nợ, ở cột *chưa gắn hóa đơn*.
