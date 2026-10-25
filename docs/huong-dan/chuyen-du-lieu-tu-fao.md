# Hướng dẫn chuyển dữ liệu từ FAO sang AccEdu

Tài liệu dành cho Thầy và kế toán Dương Sinh. Toàn bộ việc chuyển dữ liệu đi qua tệp Excel:
- **Bên FAO:** chỉ **xem và kết xuất Excel**, không sửa gì.
- **Bên AccEdu:** nhập tệp bằng nút **Nhập từ Excel**.

Mỗi lần nhập là **nguyên khối**: chỉ cần còn một dòng lỗi thì không dòng nào được ghi. Sửa tệp rồi nhập lại; nhập lại nhiều lần không sinh dữ liệu trùng.

Màn hình tổng hợp: **Hệ thống › Chuyển dữ liệu từ FAO (nhập Excel)**. Trang này cho biết bước nào đã xong và kiểm tra Bảng cân đối phát sinh ở bước cuối.

## 0. Chọn ngày bắt đầu nhập liệu (làm trước tiên)

Số dư đầu kỳ được tính **tại ngày bắt đầu nhập liệu** của đơn vị. Ngày này đổi ở **Hệ thống › Thông tin đơn vị**. Hiện đơn vị `duongsinh` đang để 01/01/2026.

| Cách | Làm thế nào | Khi nào nên dùng |
|---|---|---|
| **A. Chạy song song ngay** (khuyến nghị) | Đặt ngày bắt đầu là **01/11/2026**. Nhập số dư **cuối ngày 31/10/2026**, lấy từ Bảng cân đối phát sinh và Báo cáo số dư công nợ của FAO (kỳ 01/01–31/10/2026). | Muốn dùng AccEdu cho chứng từ từ tháng 11, còn FAO giữ làm sổ cũ. |
| **B. Giữ đầu năm** | Giữ 01/01/2026. Nhập số dư đầu năm 2026 từ màn hình Vào số dư đầu kỳ của FAO, sau đó nhập lại chứng từ tháng 1–10. | Muốn AccEdu có đủ sổ cả năm 2026 (nhiều việc hơn). |

Đổi ngày **trước** khi nhập số dư. Khi đã khóa sổ đến sau ngày bắt đầu thì không nhập lại số dư được nữa.

## 1. Danh mục tài khoản

- **FAO:** Tổng hợp › Danh mục tài khoản → **Kết xuất Excel**.
- **AccEdu:** Tổng hợp › Danh mục tài khoản → **Nhập từ Excel** → chọn tệp vừa xuất.

Cách AccEdu xử lý tệp:
- Không cần xóa các dòng tên báo cáo phía trên tệp, cũng không cần sửa tên cột. AccEdu tự tìm dòng tiêu đề và tự ghép các cột Tài khoản, Tên tài khoản, Tk mẹ, Mã nt, Tk theo dõi công nợ.
- Tài khoản đã có (theo TT99) được **cập nhật tên**. Tài khoản chi tiết riêng của Dương Sinh, như 11211, 11212 theo từng ngân hàng hay 51131 học phí lớp Tốt…, được **thêm mới**.
- Không tài khoản nào bị xóa.
- Thiếu cột Tk mẹ thì AccEdu tự tìm theo số hiệu (11211 → 1121).
- AccEdu từ chối thêm tài khoản con dưới một tài khoản **đã có số dư hoặc chứng từ**. Vì vậy hãy nhập danh mục tài khoản trước khi nhập số dư.

## 2. Danh mục đối tượng (khách hàng, nhà cung cấp, nhân viên, học viên)

- **FAO:** Bán hàng › Danh mục khách hàng → Kết xuất Excel. Làm tương tự với Mua hàng › Danh mục nhà cung cấp, nếu có.
- **AccEdu:**
  - Bán hàng › Danh mục khách hàng → **Nhập từ Excel**: đối tượng mới mặc định là khách hàng.
  - Mua hàng › Danh mục nhà cung cấp → **Nhập từ Excel**: đối tượng mới mặc định là nhà cung cấp.

Cách AccEdu xử lý tệp:
- Mã so khớp không phân biệt chữ hoa/thường. Đối tượng đã có thì chỉ cập nhật các cột có trong tệp; cột không có trong tệp giữ nguyên.
- Muốn phân loại trong cùng một tệp thì thêm cột **Loại** với giá trị KH, NCC, NV hoặc HV. Một đối tượng thuộc nhiều loại thì ghi ngăn bằng dấu phẩy, ví dụ `KH,NCC`.
- Mã số thuế sai định dạng hoặc email sai sẽ báo lỗi đúng dòng.

## 3. Số dư công nợ theo đối tượng

- **FAO:**
  - theo cách A: Báo cáo số dư công nợ (TK 131, 331, 141, 334…) tại ngày 31/10/2026;
  - theo cách B: Bán hàng/Mua hàng › Số dư đầu kỳ › Vào số dư công nợ đầu kỳ.
- **AccEdu:** Tổng hợp › Số dư đầu kỳ tài khoản & công nợ › tab **Số dư công nợ** → **Nhập từ Excel**.

Lưu ý:
- Cần có các cột Tài khoản, Mã đối tượng, Dư nợ, Dư có.
- Tài khoản phải là tài khoản **theo dõi công nợ**, và đối tượng phải có sẵn từ bước 2.
- Nhập lại sẽ thay **toàn bộ** số dư công nợ. Số dư tài khoản không bị ảnh hưởng.

## 4. Số dư các tài khoản

- **FAO:**
  - theo cách A: **Bảng cân đối phát sinh** kỳ 01/01–31/10/2026;
  - theo cách B: Tổng hợp › Số dư đầu kỳ › Vào số dư đầu kỳ các tài khoản.
- **AccEdu:** Tổng hợp › Số dư đầu kỳ tài khoản & công nợ › tab **Số dư tài khoản** → **Nhập từ Excel**.

Cách AccEdu xử lý tệp:
- Chọn thẳng tệp Bảng cân đối phát sinh được, kể cả khi tiêu đề gộp 2 dòng (Số dư đầu kỳ / Nợ – Có). Gặp trường hợp này, AccEdu hỏi lấy cột **Đầu kỳ** hay **Cuối kỳ**; với cách A, chọn **Cuối kỳ**.
- Một số dòng được **bỏ qua** tự động:
  - tài khoản tổng hợp (có tài khoản con);
  - dòng Tổng cộng;
  - dòng không có số dư;
  - tài khoản theo dõi công nợ, vì số dư của chúng đã nhập ở bước 3.
- Màn xem trước cho biết tổng Nợ – Có khi đã tính cả phần công nợ.

## 5. Kiểm tra

Mở **Hệ thống › Chuyển dữ liệu từ FAO**. Bước 5 phải hiện **Cân**, với tổng dư Nợ = tổng dư Có. Sau đó mở **Bảng cân đối phát sinh** tại ngày bắt đầu và đối chiếu từng tài khoản cấp 1 với FAO.

## Khi gặp lỗi

| Thông báo | Cách xử lý |
|---|---|
| Tệp .xls (Excel 97–2003) chưa đọc được | Mở tệp bằng Excel → *Lưu thành* `.xlsx`. Hoặc bôi đen vùng dữ liệu, sao chép và dán vào ô "Dán dữ liệu". |
| Chưa có tài khoản / đối tượng X | Nhập danh mục tài khoản hoặc danh mục đối tượng trước, rồi nhập lại số dư. |
| Tài khoản mẹ X đã có số liệu — không thêm tài khoản con được | Xóa số dư của tài khoản X (nhập lại số dư không có X), thêm tài khoản con, rồi nhập số dư vào tài khoản con. |
| Số liệu đã khóa đến ngày… | Mở khóa sổ ở Hệ thống › Kỳ kế toán & khóa sổ (cần quyền kế toán trưởng trở lên). |
| Tối đa 5.000 dòng mỗi lần nhập | Chia tệp thành nhiều phần. Danh mục nhập nhiều lần được vì nhập lại chỉ là cập nhật. |

## Nguyên tắc dữ liệu

- Tệp xuất từ FAO là số liệu thật của công ty: chỉ để trên máy của kế toán. Không gửi qua chat, không đưa lên kho mã nguồn.
- Tệp mẫu (nút **Tải tệp mẫu**) chỉ chứa dữ liệu giả để minh họa.
