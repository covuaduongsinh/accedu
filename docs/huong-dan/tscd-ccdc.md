# Hướng dẫn TSCĐ và công cụ dụng cụ — khai báo một lần, cuối tháng bấm một nút

Tài liệu dành cho Thầy và kế toán Dương Sinh. Áp dụng từ đợt P6.

Giữa tháng 10, CLB mua máy chiếu tương tác cho phòng học 1, giá 36 triệu đồng, đưa vào dùng từ ngày 15. Trước đây, mỗi cuối tháng cô kế toán Lan phải tự tính khấu hao trên Excel rồi lập phiếu kế toán trên FAO. Tháng đầu chỉ dùng 17 trên 31 ngày, nên cô còn phải bấm máy tính ra con số 548.387 đ.

Giờ cô chỉ khai báo máy chiếu một lần trong AccEdu. Ngay trên form, AccEdu báo trước:

*"Tháng đầu 10/2026: 548.387 (17 ngày) · mỗi tháng ≈ 1.000.000 · hết khấu hao tháng 10/2029 (37 lần tính)"*

Ngày 31/10, cô vào **Tính khấu hao TSCĐ** và bấm **Lập phiếu khấu hao**. AccEdu lập phiếu kế toán Nợ 6422 / Có 2141 cho cả máy chiếu lẫn bộ bàn cờ điện tử mua từ năm ngoái. Sổ TSCĐ báo *khớp* với sổ cái TK 2111 / 2141.

## 1. TSCĐ hay CCDC?

| | Tài sản cố định (TSCĐ) | Công cụ dụng cụ (CCDC) |
|---|---|---|
| Điều kiện | Nguyên giá từ 30 triệu đồng, dùng trên 1 năm | Giá trị nhỏ hơn, hoặc dùng ngắn |
| Ví dụ ở CLB | Máy chiếu tương tác, bộ bàn cờ điện tử DGT, máy tính, phần mềm quản lý | Đồng hồ cờ, bàn cờ treo tường, bộ quân cờ thi đấu, bàn ghế phòng học |
| Mục trong AccEdu | *Tài sản › Tài sản cố định* | *Công cụ › Công cụ dụng cụ* |
| Tài khoản | Nguyên giá 211x, hao mòn 214x | Giá trị chờ phân bổ 242 |
| Tính hằng tháng | Khấu hao theo **số ngày sử dụng** trong tháng đầu (TT45/2013) | Phân bổ **tròn tháng** |

**Cách chia:** cả hai đều chia đều theo đường thẳng. Mỗi tháng lấy giá trị còn lại chia cho số tháng còn lại, nên số tiền các tháng gần như bằng nhau. Tháng cuối lấy hết phần còn lại, tổng cộng luôn khớp đúng nguyên giá.

## 2. Khai báo

Bấm **Mới** rồi điền:

- **Mã, tên, loại / nhóm, bộ phận sử dụng, số lượng, đvt.**
- **Ngày ghi tăng** và **ngày bắt đầu tính khấu hao** (CCDC: **ngày bắt đầu phân bổ**).
- **Nguyên giá** (CCDC: **giá trị**) và **số tháng khấu hao / phân bổ**.
- **Tài khoản:** AccEdu chọn sẵn theo chế độ kế toán của đơn vị.

  | | TT133 | TT99 |
  |---|---|---|
  | TSCĐ: nguyên giá / hao mòn / chi phí | 2111 / 2141 / 6422 | 2112 / 2141 / 6424 |
  | Phần mềm, TSCĐ vô hình | 2113 / 2143 | 213x / 2143 |
  | CCDC: chờ phân bổ / chi phí | 242 / 6422 | 242 / 6423 |

**Ghi tăng ngay trên thẻ.** Ô **Lập phiếu ghi tăng** được chọn sẵn. Thầy / Cô chọn **TK đối ứng**: 331 mua chịu (chọn nhà cung cấp), 1111 trả tiền mặt hoặc 1121 chuyển khoản. AccEdu lập phiếu kế toán Nợ 211x (hoặc 242) / Có TK đối ứng, ngày ghi tăng, ghi sổ luôn.

**Khi nào bỏ chọn ghi tăng:**
- **Tài sản mua có hóa đơn GTGT:** lập hóa đơn mua hàng như thường (Nợ 211x, thuế 1332 / Có 331), rồi khai báo thẻ và bỏ chọn ghi tăng.
- **CCDC lấy từ kho:** lập phiếu xuất kho Nợ 242 / Có 153, rồi khai báo thẻ và bỏ chọn ghi tăng. AccEdu không cho ghi tăng bằng Có 153, để sổ kho luôn khớp sổ cái.

**Tài sản dùng từ trước ngày bắt đầu nhập liệu.** Khi ngày bắt đầu tính trước ngày bắt đầu nhập liệu, form hiện thêm hai ô:
- **hao mòn lũy kế** (CCDC: **đã phân bổ**) tại ngày bắt đầu nhập liệu;
- **số tháng đã khấu hao** tại ngày đó.

Nguyên giá và hao mòn của các tài sản này đã nằm trong số dư đầu kỳ TK 211 / 214 / 242, nên AccEdu không lập phiếu ghi tăng.

**Nhập cả danh sách từ Excel.** Bấm **Nhập Excel** ngay trên sổ, hoặc vào *Hệ thống › Chuyển dữ liệu từ FAO*, bước *Danh sách TSCĐ / CCDC*.
- Lấy tệp từ FAO: *Tài sản › Báo cáo kiểm kê TSCĐ › Danh mục TSCĐ* (hoặc *Công cụ › … › Danh mục CCDC*) → **Kết xuất Excel**.
- AccEdu tự nhận các cột *Nguyên giá, Số kỳ khấu hao, Hao mòn lũy kế, Số kỳ đã khấu hao, Tk tài sản…*.
- Có một dòng lỗi thì không dòng nào được nhập. Sửa tệp rồi nhập lại.

## 3. Cuối tháng: tính khấu hao, phân bổ

Vào *Tài sản › Tính khấu hao TSCĐ* (hoặc *Công cụ › Phân bổ CCDC*):

1. Chọn **tháng**, bấm **Xem trước**. Mỗi tài sản hiện số tháng này, lũy kế, còn lại và số tháng còn. Tài sản bắt đầu giữa tháng ghi rõ *17 ngày*.
2. Bấm **Lập phiếu khấu hao** (CCDC: **Lập phiếu phân bổ**). AccEdu lập **một phiếu kế toán ngày cuối tháng**, mỗi tài sản một dòng:
   - TSCĐ: Nợ TK chi phí / Có 214x;
   - CCDC: Nợ TK chi phí / Có 242.
3. **Tính lại tháng** (ví dụ vừa khai báo thêm tài sản): bấm lại, AccEdu **thay phiếu cũ**.
4. **Tháng sau đã tính rồi:** phải xóa từ tháng gần nhất trở về trước. Nút **Xóa tháng này** nằm ở bảng *Các tháng đã khấu hao*.

**Lưu ý:**
- **Bỏ sót tháng trước** (ví dụ chưa tính tháng 9 mà đã tính tháng 10): AccEdu nhắc *"Tháng 09/2026 chưa tính khấu hao — nên tính tháng đó trước"*.
- **Kỳ đã khóa sổ:** không tính được.

## 4. Thay đổi trong quá trình dùng

**Sửa thẻ.**
- Tài sản đã tính khấu hao chỉ sửa được **tên, bộ phận, số tháng sử dụng, TK chi phí, tạm dừng**.
- **Đổi số tháng** (đánh giá lại thời gian sử dụng): phần còn lại tự chia lại cho số tháng còn lại, không hồi tố. Ví dụ bàn cờ điện tử 24 triệu, đã dùng 14 tháng, còn 10 triệu. Nâng số tháng từ 24 lên 30 thì 16 tháng còn lại mỗi tháng 625.000 đ.

**Tạm dừng:** đánh dấu *Tạm dừng khấu hao* khi tài sản đem đi sửa dài ngày hoặc cất kho. Các tháng tạm dừng không tính, thời gian khấu hao kéo dài tương ứng.

**Ghi giảm** (thanh lý, nhượng bán, hỏng, mất): chọn tài sản, bấm **Ghi giảm**, nhập ngày và lý do.
- **TSCĐ:** AccEdu lập phiếu kế toán ngày ghi giảm gồm:
  - khấu hao các ngày trong tháng đến trước ngày giảm (Nợ chi phí / Có 2141);
  - Nợ 2141 hao mòn lũy kế / Có 2111;
  - Nợ 811 (hoặc TK chọn) giá trị còn lại / Có 2111.
- **CCDC:** Nợ TK chi phí (hoặc TK chọn) / Có 242 phần chưa phân bổ.
- **Tiền thu thanh lý** (nếu có): lập phiếu thu / hóa đơn như thường (Có 711, 3331).
- **Ghi giảm trước khi tính khấu hao cuối tháng đó.** Tháng đã tính thì AccEdu nhắc xóa lần tính tháng đó trước.
- Ghi giảm nhầm: chọn tài sản (bật *Hiện TSCĐ đã ghi giảm*), bấm **Bỏ ghi giảm**. Phiếu ghi giảm bị xóa, tài sản trở lại đang dùng.

**Xóa thẻ:** chỉ khi chưa tính khấu hao và chưa ghi giảm. Phiếu ghi tăng do AccEdu lập bị xóa theo.

## 5. Sổ tài sản và đối chiếu

Trang *Tài sản cố định* / *Công cụ dụng cụ* là sổ tài sản tại **ngày chọn**:
- **Thẻ tổng:** nguyên giá, hao mòn lũy kế, giá trị còn lại, mức khấu hao tháng tới.
- **Đối chiếu sổ cái:**
  - TSCĐ: nguyên giá với TK 211x, hao mòn với TK 214x;
  - CCDC: giá trị chờ phân bổ với TK 242.
- **Chênh lệch** thường do:
  - số dư đầu kỳ chưa khớp danh sách tài sản;
  - hóa đơn mua tài sản chưa khai báo thẻ;
  - TK 242 còn khoản trả trước khác ngoài CCDC (thuê nhà trả trước…).
- **Thẻ TSCĐ / CCDC:** từng tháng đã tính, phần tháng, số tiền, lũy kế, còn lại, số phiếu. Bấm số phiếu để mở.
- **Trạng thái:**

  | Trạng thái | Ý nghĩa |
  |---|---|
  | **Đang dùng** | Đang khấu hao / phân bổ |
  | **Tạm dừng** | Không tính các tháng tạm dừng |
  | **Hết khấu hao** | Còn dùng nhưng giá trị đã về 0 (bảng kê *TSCĐ hết khấu hao còn sử dụng*) |
  | **Đã ghi giảm** | Đã thanh lý, nhượng bán, hỏng, mất |

Hỏi nhanh **Hỏi AccEdu**: *"TSCĐ nào sắp hết khấu hao?"*, *"Tháng này khấu hao bao nhiêu?"*, *"CCDC còn bao nhiêu chưa phân bổ?"*.
