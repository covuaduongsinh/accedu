# Hướng dẫn cuối kỳ — việc cuối tháng, kết chuyển lãi lỗ, chuyển lợi nhuận năm trước

Tài liệu dành cho Thầy và kế toán Dương Sinh. Áp dụng từ đợt P7a.

Sáng mùng 3 tháng 11, cô kế toán Lan mở **Tổng hợp › Cuối kỳ** và chọn tháng 10. Trang hiện 9 việc cuối tháng, mỗi việc tự đánh dấu *Đã xong*, *Cần làm* hay *Không áp dụng*:
- **Đã xong:** phân bổ doanh thu học phí, lương HLV, khấu hao TSCĐ.
- **Cần làm:**
  - còn 2 hóa đơn mua nhập từ XML chưa ghi sổ;
  - tồn kho chênh 800.000 đ so với sổ cái TK 156.

Cô bấm **Mở** từng việc, xử lý xong rồi quay lại bấm **Xem trước** ở phần kết chuyển. AccEdu tính:
- doanh thu thuần 49,2 triệu đồng;
- chi phí 28,5 triệu đồng;
- **lãi 20,7 triệu đồng**.

Cô bấm **Kết chuyển & ghi sổ**, rồi sang *Hệ thống › Kỳ kế toán & khóa sổ* khóa sổ đến 31/10. Tháng 10 khép lại. Từ P8a, Bảng cân đối kế toán và Báo cáo kết quả kinh doanh sẽ lấy đúng số này.

## 1. Việc cuối tháng

| # | Việc | AccEdu kiểm tra |
|---|---|---|
| 1 | Ghi sổ các chứng từ trong tháng | Còn chứng từ nháp / chờ duyệt không, kể theo loại (PT, HDM…) |
| 2 | Phân bổ doanh thu học phí (3387 → 5113) | Đã phân bổ tháng chưa; còn phiếu học phí chờ phân bổ không |
| 3 | Lương HLV theo buổi dạy | Đã lập lương tháng chưa; có buổi dạy có HLV không |
| 4 | Khấu hao TSCĐ | Đã tính tháng chưa; có TSCĐ đang khấu hao không |
| 5 | Phân bổ CCDC | Đã tính tháng chưa; có CCDC đang phân bổ không |
| 6 | Tồn kho khớp sổ cái | Giá trị tồn kho theo thẻ kho bằng số dư TK hàng tồn kho chưa |
| 7 | Khớp sao kê ngân hàng | Mọi dòng sao kê trong tháng đã khớp / bỏ qua chưa |
| 8 | Kết chuyển xác định kết quả (911) | Đã kết chuyển chưa; số liệu có thay đổi sau khi kết chuyển không |
| 9 | Khóa sổ | Đã khóa sổ đến cuối tháng chưa |

Bấm **Mở** để sang đúng màn hình xử lý. **Nên làm theo thứ tự 1 → 9.** Kết chuyển 911 làm sau cùng (trước khóa sổ), vì mọi bút toán phân bổ, khấu hao, lương đều làm thay đổi doanh thu, chi phí.

## 2. Kết chuyển xác định kết quả kinh doanh

Bấm **Xem trước**. AccEdu liệt kê mọi TK doanh thu, chi phí (đầu 5–8) còn số dư tại cuối tháng và cách kết chuyển:

| TK | Ví dụ | Kết chuyển |
|---|---|---|
| Doanh thu, thu nhập (dư Có) | 5111 bán sách, 5113 học phí, 515 lãi tiền gửi, 711 thu nhập khác | Nợ TK / Có 911 |
| Giảm trừ doanh thu (dư Nợ) | 5211, 5212, 5213 (TT99) | Nợ 911 / Có TK |
| Chi phí (dư Nợ) | 632 giá vốn, lương HLV; 635; 642x (TT133) hoặc 641x / 642x (TT99); 811; 821 | Nợ 911 / Có TK |
| Lãi / lỗ | Số dư 911 còn lại | Lãi: Nợ 911 / Có 4212. Lỗ: Nợ 4212 / Có 911 |

Bấm **Kết chuyển & ghi sổ**. AccEdu lập **một phiếu kế toán ngày cuối tháng**, ghi sổ luôn. Sau đó, trên bảng cân đối phát sinh, các TK đầu 5–9 không còn số dư và lãi lỗ nằm ở 4212.

**Lưu ý:**
- **Sửa chứng từ sau khi đã kết chuyển** (thêm khoản chi phí muộn…): việc 8 chuyển sang *Cần làm — Số liệu thay đổi sau khi kết chuyển*. Bấm **Kết chuyển lại**, AccEdu thay phiếu cũ.
- **Đã kết chuyển tháng sau:** muốn kết chuyển lại tháng trước thì xóa từ tháng gần nhất (*Lịch sử kết chuyển › Xóa*).
- **Bỏ qua một tháng** (ví dụ chưa kết chuyển tháng 9): kết chuyển tháng 10 sẽ gồm cả số liệu tháng 9, và AccEdu cảnh báo.
- **TK 911 có hạch toán tay:** số đó được tính luôn vào lãi lỗ, có cảnh báo.
- **TK giá thành sản xuất** (611, 621, 622, 623, 627, 631) không kết chuyển vào 911. Dương Sinh không dùng các TK này.
- **Kỳ đã khóa sổ:** không kết chuyển được.

## 3. Đầu năm: chuyển lợi nhuận năm trước (4212 → 4211)

Sau khi kết chuyển 911 tháng cuối năm (tháng 12), vào tháng bất kỳ của năm mới:
1. Ở phần **Đầu năm tài chính**, bấm **Xem số dư 4212**.
2. Bấm **Chuyển sang 4211**. AccEdu lập phiếu kế toán ngày đầu năm:
   - lãi năm trước: Nợ 4212 / Có 4211;
   - lỗ năm trước: ngược lại.

**Trường hợp đặc biệt:**
- **Đơn vị bắt đầu dùng AccEdu từ đầu năm**, số dư đầu kỳ 4212 là lợi nhuận năm trước chưa chuyển: làm bước này ngay từ tháng 1.
- **Bắt đầu giữa năm:** chuyển vào đầu năm tài chính sau. AccEdu sẽ báo nếu chọn sai năm.

## 4. Số chứng từ năm mới

Từ đợt này, số chứng từ **đánh lại từ 0001 mỗi năm** theo quyển chứng từ, như FAO. PK0001 năm 2026 và PK0001 năm 2027 là hai chứng từ khác nhau; tìm chứng từ thì xem kèm ngày. Trong cùng một năm, số vẫn không được trùng.

## 5. Hỏi AccEdu

Có thể hỏi:
- *"Tháng này còn việc gì trước khi khóa sổ?"*
- *"Tháng 10 lãi bao nhiêu?"*

AI đọc danh sách việc cuối tháng và kết quả kết chuyển của tháng đó.
