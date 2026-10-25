# Hướng dẫn lập hóa đơn và theo dõi công nợ

Tài liệu dành cho Thầy và kế toán Dương Sinh. Áp dụng từ đợt P4a (25/10/2026).

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

## Sắp có (đợt P4b, P4c)

- Phiếu thu/chi chọn trừ vào từng hóa đơn; báo cáo tuổi nợ (quá hạn 1–30, 31–60, 61–90, >90 ngày).
- Bảng kê hóa đơn bán ra / mua vào.
- Kéo thả tệp XML hóa đơn điện tử đầu vào để tự tạo hóa đơn mua.
