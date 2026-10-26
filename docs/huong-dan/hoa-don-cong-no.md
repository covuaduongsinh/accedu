# Hướng dẫn lập hóa đơn và theo dõi công nợ

Tài liệu dành cho Thầy và kế toán Dương Sinh. Áp dụng từ đợt P4a (25/10/2026); mục 4–5 từ đợt P4b; mục 6 từ đợt P4c.

## 1. Khai báo danh mục hàng hóa, dịch vụ (làm một lần)

Vào **Tồn kho › Danh mục hàng hóa, dịch vụ**. Có thể bấm **Nhập từ Excel** (tải tệp mẫu, hoặc dùng tệp kết xuất từ FAO), hoặc thêm từng mã:

| Ví dụ | Loại | Đvt | Thuế suất | TK doanh thu |
|---|---|---|---|---|
| Sách cờ vua nhập môn | Sách | Cuốn | 5% | 5111 |
| Bàn cờ gỗ tiêu chuẩn | Hàng hóa | Bộ | 10% | 5111 |
| Học phí lớp Tốt (tháng) | Dịch vụ | Tháng | Không chịu thuế | 5113 |

Khi lập hóa đơn, gõ mã hàng là AccEdu tự điền tên, đơn vị tính, giá, tài khoản và thuế suất.

## 2. Lập hóa đơn

| Nghiệp vụ | Menu | Định khoản khi ghi sổ |
|---|---|---|
| Thu học phí, lệ phí giải đấu (theo hóa đơn) | Bán hàng › Hóa đơn dịch vụ | Nợ 131 / Có 5113 (học phí không chịu thuế) |
| Bán sách, bàn cờ, đồ dùng | Bán hàng › Hóa đơn bán hàng | Nợ 131 / Có 5111; Nợ 131 / Có 33311 (thuế) |
| Mua sách, bàn cờ về bán | Mua hàng › Hóa đơn mua hàng | Nợ 1561 (TT133: 156) / Có 331; Nợ 1331 / Có 331 (thuế) |
| Thuê mặt bằng, điện nước, dịch vụ | Mua hàng › Hóa đơn mua dịch vụ | Nợ 6427 (TT133: 6422) / Có 331; Nợ 1331 / Có 331 (thuế) |

Lưu ý khi lập:
- **Mỗi dòng:** Số lượng × Đơn giá − Chiết khấu = Thành tiền. Thuế tự tính theo thuế suất.
- **Hóa đơn mua:**
  - sửa được ô *Tiền thuế* cho khớp đúng hóa đơn của nhà cung cấp (chênh do làm tròn);
  - có thuế đầu vào thì phải nhập *Số hóa đơn*;
  - cùng nhà cung cấp, cùng ký hiệu và số thì AccEdu chặn, không cho nhập trùng.
- **Hạn thanh toán:** để trống thì AccEdu lấy ngày hóa đơn cộng số ngày nợ khai ở danh mục đối tượng.
- **Lớp / vụ việc:** chọn cột này nếu muốn theo dõi doanh thu, chi phí riêng cho từng lớp hay từng giải đấu.
- **Ghi sổ:**
  - bấm **Lưu** để lưu nháp, **Lưu & ghi sổ** để ghi luôn;
  - hóa đơn đã ghi sổ chỉ xem được, muốn sửa thì bấm **Bỏ ghi sổ** trước.

## 3. Xem công nợ

- **Bán hàng › Tổng hợp công nợ phải thu:**
  - từng học viên / khách hàng: dư đầu kỳ, phát sinh, dư cuối kỳ;
  - nhấp đúp một dòng để mở sổ chi tiết.
- **Bán hàng › Sổ chi tiết công nợ khách hàng:** từng hóa đơn, phiếu thu, kèm số dư lũy kế.
- **Mua hàng › Tổng hợp công nợ phải trả** và **Sổ chi tiết công nợ nhà cung cấp:** tương tự, cho nhà cung cấp.
- Mọi báo cáo đều có nút **Xuất Excel**.

## 4. Thu / chi tiền theo hóa đơn

Ví dụ: phụ huynh học viên HV002 chuyển 3.252.000 đ, trả học phí tháng 10 (3.000.000) và tiền sách (252.000).

1. Mở **Tiền › Phiếu thu tiền mặt** (hoặc *Giấy báo có* nếu tiền vào tài khoản ngân hàng), bấm **Mới**, nhập **Mã khách** `HV002`.
2. Bấm **Thu theo hóa đơn**. AccEdu hiện các hóa đơn đã ghi sổ còn nợ của học viên: ngày, số, hạn thanh toán, số ngày quá hạn, số còn nợ.
3. Nhập **Số tiền thu** rồi bấm **Phân bổ tự động**: tiền được trừ vào hóa đơn đến hạn sớm nhất trước. Có thể sửa tay ô *Số trừ* của từng hóa đơn.
4. Bấm **Đưa vào phiếu**: mỗi hóa đơn thành một dòng *Có 131*, cột **Trừ hóa đơn** ghi rõ hóa đơn nào. Nếu tiền thu nhiều hơn số còn nợ, phần thừa thành một dòng riêng không gắn hóa đơn (tiền trả trước).
5. **Lưu & ghi sổ.**

Trả tiền nhà cung cấp làm tương tự ở **Phiếu chi** / **Giấy báo nợ**, nút **Chi theo hóa đơn** (dòng *Nợ 331*).

Lưu ý:
- Có thể chọn hóa đơn ngay trên từng dòng ở cột **Trừ hóa đơn** (chỉ hiện khi tài khoản của dòng theo dõi công nợ và đã có mã khách).
- Chỉ phiếu **đã ghi sổ** mới được tính là đã thu. AccEdu không cho:
  - thu vượt số còn nợ của một hóa đơn;
  - trừ vào hóa đơn chưa ghi sổ, hóa đơn của khách khác, hoặc ghi sai tài khoản công nợ;
  - bỏ ghi sổ / xóa hóa đơn đã có phiếu thu — muốn sửa hóa đơn thì bỏ ghi sổ phiếu thu trước.
- Mở lại một hóa đơn đã ghi sổ sẽ thấy mục **Tình hình thanh toán**: đã thu bao nhiêu, còn phải thu bao nhiêu, bằng những phiếu nào.

## 5. Tuổi nợ và bảng kê hóa đơn

- **Bán hàng › Tuổi nợ phải thu** (và **Mua hàng › Tuổi nợ phải trả**):
  - chọn *Tính đến ngày*; mỗi học viên / khách hàng một dòng, chia số còn nợ theo hạn thanh toán: *Chưa đến hạn*, *1–30*, *31–60*, *61–90*, *Trên 90 ngày*;
  - cột **Không theo hóa đơn**: số dư đầu kỳ chuyển từ FAO, tiền trả trước, phiếu thu không chọn hóa đơn (số âm = khách đã trả trước);
  - cột **Tổng còn nợ** khớp với *Tổng hợp công nợ*; nhấp đúp để mở sổ chi tiết.
- **Tổng hợp › Bảng kê hóa đơn bán ra / mua vào:**
  - chứng từ có thuế GTGT đã ghi sổ trong kỳ, nhóm theo thuế suất: không chịu thuế → 0% → 5% → 8% → 10%, có dòng tổng từng nhóm;
  - dùng để đối chiếu trước khi lập tờ khai thuế GTGT; nhấp đúp một dòng để mở chứng từ.
- **Trên điện thoại:** trang Tổng quan › **Công nợ phải thu ›** — danh sách học viên còn nợ, phần quá hạn tô đỏ, kéo xuống để làm mới.

Mọi báo cáo đều có nút **Xuất Excel**.

## 6. Nhập hóa đơn đầu vào từ tệp XML

Người bán gửi hóa đơn điện tử qua email thường kèm tệp **.xml** (hoặc một tệp **.zip** chứa .xml và .pdf). Tệp XML là dữ liệu gốc của hóa đơn theo TT78/2021, nên AccEdu đọc được chính xác từng dòng hàng và tiền thuế, không cần gõ lại.

1. Vào **Mua hàng › Hóa đơn đầu vào (XML)**. Kéo thả một hay nhiều tệp `.xml` / `.zip` vào khung, hoặc bấm để chọn tệp.
2. AccEdu hiện bảng xem trước, mỗi hóa đơn một dòng: nhà cung cấp và MST, ký hiệu, số, ngày, tiền hàng, thuế, tổng. Bấm mũi tên ở đầu dòng để xem từng mặt hàng.
3. Kiểm tra cột **Trạng thái**:
   - **Mới**: sẽ tạo hóa đơn mua. Nhãn **NCC mới** nghĩa là nhà cung cấp chưa có trong danh mục, AccEdu sẽ tự tạo, lấy mã bằng MST;
   - **Đã có MHxxxx**: hóa đơn này đã nhập rồi, sẽ bỏ qua;
   - **Lỗi**: không tạo được, ví dụ hóa đơn ngoại tệ, thuế suất khác, hóa đơn điều chỉnh giảm. Các trường hợp này nhập tay;
   - **cảnh báo** (vàng) vẫn tạo được nhưng nên xem lại: MST người mua khác MST đơn vị, hóa đơn không có mã của cơ quan thuế, tổng tiền không khớp, hóa đơn thay thế/điều chỉnh.
4. Chọn **Loại** cho từng hóa đơn. AccEdu đã gợi ý sẵn:
   - **Mua hàng**: sách, bàn cờ về bán, ghi Nợ TK 1561 (TT133: 156);
   - **Mua dịch vụ**: thuê sân, điện nước, cước phí, ghi Nợ TK 6427 (TT133: 6422).

   Có thể sửa **TK Nợ** và **Ngày hạch toán** (mặc định là ngày hóa đơn).
5. Cột **Mã hàng** cho biết bao nhiêu dòng đã gắn được mã hàng (ví dụ 1/2). AccEdu so **mã hàng của người bán** trên XML với mã hàng trong danh mục trước, không khớp thì so **tên hàng**.
   - Tên được so chính xác, bỏ khoảng trắng thừa, không phân biệt chữ hoa, chữ thường. Chỉ nhận khi khớp đúng một mặt hàng.
   - Dòng khớp được thì có mã hàng, TK kho và kho mặc định của mặt hàng, nên khi ghi sổ tự nhập kho.
   - Dòng chưa khớp thì mở hóa đơn nháp để chọn mã hàng. Muốn lần sau tự khớp, đặt tên mặt hàng trong danh mục trùng với tên trên hóa đơn của nhà cung cấp.
6. Bấm **Tạo N hóa đơn mua (nháp)**. Hóa đơn được tạo ở trạng thái *Lập chứng từ*. Vào **Mua hàng › Hóa đơn mua hàng** (hoặc *Hóa đơn mua dịch vụ*) để mở xem lại, rồi **Ghi sổ**.

Lưu ý:
- Tiền thuế từng dòng được chỉnh cho khớp đúng tổng tiền thuế trên hóa đơn của người bán.
- Chiết khấu thương mại được trừ vào dòng hàng cùng thuế suất.
- Lô hóa đơn được tạo trọn gói: chỉ cần một hóa đơn lỗi là chưa tạo hóa đơn nào. Sửa hoặc bỏ hóa đơn lỗi rồi bấm lại.
- Tệp chỉ được đọc trên máy của Thầy. AccEdu lưu dữ liệu hóa đơn, không lưu tệp gốc, nên Thầy cần giữ tệp XML/PDF theo quy định lưu trữ chứng từ.
- Chưa làm (để đợt P8): kiểm tra chữ ký số, tra cứu hóa đơn trên cổng của cơ quan thuế, cảnh báo doanh nghiệp rủi ro thuế.
