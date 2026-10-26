# Hướng dẫn học viên, lớp học và học phí

Ví dụ xuyên suốt: đầu tháng 11, cô Lan (kế toán CLB Dương Sinh) mở lớp **Tốt K15 — chiều chủ nhật**, học phí 600.000 đ/tháng. Cô có danh sách 20 học viên trong Excel. Phụ huynh muốn chuyển khoản nhanh bằng cách quét mã QR.

## 1. Chuẩn bị (làm một lần)

**Tài khoản nhận học phí.** Vào *Hệ thống › Thông tin đơn vị*, thẻ **Tài khoản nhận học phí (VietQR)**:
- chọn ngân hàng (hoặc *Ngân hàng khác* rồi nhập mã BIN 6 số);
- nhập số tài khoản và tên chủ tài khoản, bấm **Lưu**;
- nên dùng ứng dụng ngân hàng quét mã thử hiện bên phải trước khi gửi thông báo cho phụ huynh.

Chỉ chủ sở hữu và quản trị được sửa thẻ này.

## 2. Lớp học

*Đào tạo › Lớp học › Mới*:

| Trường | Ghi chú |
|---|---|
| Mã lớp, Tên lớp | Ví dụ `TOT-K15`, "Lớp Tốt K15 — chiều chủ nhật". Mỗi lớp cũng là một **vụ việc**, nên doanh thu và chi phí của lớp xem được ở báo cáo theo vụ việc |
| Cấp | Tốt, Mã, Tượng, Xe, Hậu, Vua |
| Học phí tính | **Theo tháng**: mỗi tháng một khoản. **Theo khóa (N buổi)**: một khoản cho cả khóa, phải nhập số buổi mỗi khóa |
| Học phí | Mức chung của lớp; học viên được giảm thì đặt *học phí riêng* khi ghi danh |
| HLV | Mã nhân viên (đối tượng có loại NV) |

Chọn một lớp để xem bảng **Học viên lớp…** bên dưới, gồm các nút:
- **Ghi danh**: chọn học viên, ngày vào lớp; học phí riêng để trống thì theo mức của lớp;
- **Bảo lưu**: không lập học phí tháng tiếp theo;
- **Học tiếp**: học viên học lại;
- **Kết thúc**: ghi ngày kết thúc.

## 3. Học viên

*Đào tạo › Học viên*: mỗi học viên có mã, họ tên, ngày sinh, phụ huynh, SĐT phụ huynh, trường, cấp hiện tại. Học viên cũng là **đối tượng công nợ** (TK 131), nên xem được ở sổ công nợ và tuổi nợ như khách hàng.

**Nhập cả lớp từ Excel:** bấm **Nhập từ Excel**, tải tệp mẫu hoặc dán từ bảng tính.
- Cột bắt buộc: *Mã học viên*, *Họ tên*.
- Cột tùy chọn: *Ngày sinh*, *Phụ huynh*, *SĐT phụ huynh*, *Trường*, *Cấp*, *Địa chỉ*, *Mã lớp*, *Ngày vào lớp*.
- Có *Mã lớp* thì AccEdu ghi danh học viên vào lớp đó luôn. *Ngày vào lớp* để trống thì lấy ngày hôm nay.
- Học viên đã có (trùng mã) được cập nhật, không tạo trùng.

## 4. Lập học phí

*Đào tạo › Học phí*: chọn **Tháng** (và **Lớp** nếu chỉ lập cho một lớp), bấm **Lập học phí**.

- AccEdu hiện danh sách xem trước: mỗi học viên đang học một khoản; khoản đã lập trước đó ghi *Đã lập* và được bỏ qua, nên bấm lại cũng không trùng.
  - **Lớp theo tháng:** một khoản cho mỗi tháng, gồm những học viên đang học trong tháng đó.
  - **Lớp theo khóa:** một khoản cho cả khóa, lập một lần khi học viên vào lớp.
- Bấm **Lập N phiếu học phí**. Chọn *Ghi sổ luôn* để ghi sổ ngay; bỏ chọn thì lưu nháp để xem lại.

Mỗi khoản là một **hóa đơn dịch vụ** (số DVxxxx):

| Nợ | Có | Số tiền |
|---|---|---|
| 131 — Phải thu học viên | **3387 — Doanh thu chưa thực hiện** | học phí |

Thuế suất *Không chịu thuế*. Hóa đơn mang mã lớp (vụ việc).

> Học phí thu trước chưa phải doanh thu của tháng thu tiền. Số dư 3387 sẽ được **phân bổ dần sang 5113** theo tháng / theo buổi đã học. Phần phân bổ có ở đợt P9b, cùng với điểm danh của HLV.

## 5. Thu học phí

Trên lưới học phí, tích chọn các học viên đã nộp tiền rồi bấm:
- **Thu tiền mặt**: tạo và ghi sổ **phiếu thu** (Nợ 1111 / Có 131);
- **Thu chuyển khoản**: tạo và ghi sổ **giấy báo có** (Nợ 1121 / Có 131).

Mỗi học viên được lập một phiếu, trừ đúng vào các hóa đơn học phí của học viên đó. Cột **Còn nợ** và trạng thái *Đã đóng / Chưa đóng* tự cập nhật. Học phí còn nháp thì AccEdu ghi sổ hóa đơn trước rồi mới thu.

Phiếu thu học phí cũng có thể lập tay ở *Tiền › Phiếu thu*, chọn hóa đơn học phí ở cột "Trừ hóa đơn".

## 6. Thông báo học phí có mã VietQR

1. Tích chọn các học viên còn nợ, bấm **Thông báo học phí**.
2. Mỗi học viên một trang gồm: tên đơn vị, các khoản còn phải đóng, tổng tiền, tài khoản nhận và **mã VietQR**.
3. Phụ huynh quét mã bằng ứng dụng ngân hàng: **số tiền** và **nội dung** (ví dụ `HP HV102 DV0003`) đã điền sẵn. Khi đối chiếu sao kê, nhìn nội dung là biết của học viên nào, hóa đơn nào.
4. Bấm **In** để in, hoặc chụp màn hình gửi phụ huynh qua Zalo.

Mã QR được tạo ngay trên máy, không qua dịch vụ bên ngoài.

## 7. Trên điện thoại

Ứng dụng AccEdu, màn hình tổng quan › **Học phí ›**:
- xem theo tháng: tổng còn phải thu, ai chưa đóng;
- chạm vào một học viên để mở **mã VietQR** đúng số tiền, phụ huynh quét ngay tại lớp.

## Sắp có (đợt P9b)

- Vai trò **HLV**: điểm danh trên điện thoại (có mặt / vắng / vắng có phép), không xem được số liệu kế toán.
- Số buổi còn lại của học viên lớp theo khóa; báo học viên sắp hết khóa.
- **Phân bổ doanh thu** cuối tháng: Nợ 3387 / Có 5113 theo tháng (lớp tháng) hoặc theo buổi đã học (lớp khóa).
