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
| HLV (mã nhân viên) | Đối tượng có loại NV — dùng để tính lương HLV sau này |
| HLV điểm danh (tài khoản) | Tài khoản đăng nhập của HLV (xem mục 8) — người này điểm danh được lớp |

Chọn một lớp để xem bảng **Học viên lớp…** bên dưới, gồm các nút:
- **Ghi danh**: chọn học viên, ngày vào lớp; học phí riêng để trống thì theo mức của lớp;
- **Bảo lưu**: không lập học phí tháng tiếp theo;
- **Học tiếp**: học viên học lại;
- **Kết thúc**: ghi ngày kết thúc;
- **Gia hạn khóa** (lớp theo khóa): xem mục 10.

Lớp theo khóa có thêm cột **Số buổi**: "Còn 5 buổi", "Hết khóa", "Vượt 1 buổi".

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

> Học phí thu trước chưa phải doanh thu của tháng thu tiền. Cuối tháng, số dư 3387 được **phân bổ sang 5113** theo tháng (lớp tháng) hoặc theo buổi đã học (lớp khóa) — xem mục 11.

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

## 8. Tài khoản HLV

Thầy Hùng dạy lớp Tốt K15. Cô Lan muốn thầy tự điểm danh trên điện thoại nhưng không xem được sổ sách của CLB.

1. Quản trị vào *Hệ thống › Người dùng*, nhập email và họ tên thầy Hùng, chọn vai trò **Huấn luyện viên**, bấm **Tạo / thêm**. AccEdu cấp mật khẩu tạm; thầy đổi mật khẩu ở lần đăng nhập đầu.
2. Vào *Đào tạo › Lớp học*, chọn lớp Tốt K15 › **Sửa**, ô **HLV điểm danh (tài khoản)** chọn thầy Hùng › **Lưu**.

Tài khoản HLV:
- chỉ thấy menu *Đào tạo › Điểm danh*, và chỉ các lớp mình được giao;
- thấy tên, mã, SĐT phụ huynh và số buổi còn lại của học viên;
- **không** xem được chứng từ, sổ sách, công nợ, học phí, và không lập được chứng từ nào.

Kế toán, kế toán trưởng, quản trị cũng điểm danh được mọi lớp (khi HLV nhờ hoặc nhập bù).

## 9. Điểm danh

**Trên điện thoại** (cách thầy Hùng dùng hằng ngày): đăng nhập ứng dụng AccEdu › chọn đơn vị › **Lớp của tôi** › chạm vào lớp.
- Màn hình mở sẵn buổi **hôm nay**; nút ‹ › để lùi ngày (không điểm danh trước ngày học).
- Mỗi học viên ba nút **Có mặt / Vắng / Có phép**; **✓ Có mặt tất cả** để đánh nhanh rồi sửa vài em vắng.
- Ghi nội dung buổi học (ví dụ "Khai cuộc Ý") rồi bấm **Lưu điểm danh**. Mạng chập chờn thì ứng dụng tự thử lại.

**Trên web**: *Đào tạo › Điểm danh*, chọn lớp, ngày, đánh dấu rồi **Lưu điểm danh**. Bên dưới là **bảng điểm danh tháng**: mỗi học viên một dòng, mỗi buổi một cột (✓ có mặt, ✗ vắng, P có phép). Bấm vào ngày ở tiêu đề cột để mở lại buổi đó mà sửa.

Quy tắc trừ buổi:

| Trạng thái | Trừ buổi | Ghi chú |
|---|---|---|
| Có mặt | Có | |
| Vắng (không phép) | Có | Phụ huynh không báo, buổi vẫn tính |
| Có phép | Không | Được học bù |

Bấm lại vào trạng thái đang chọn để bỏ đánh dấu; bỏ hết thì buổi học được xóa. Tháng đã **khóa sổ** thì không sửa điểm danh được nữa.

## 10. Số buổi còn lại, gia hạn khóa

Lớp Mã K3 tính **theo khóa 12 buổi**, học phí 2.400.000 đ. Bé Bảo đã học 10 buổi và vắng có phép 1 buổi, nên **còn 2 buổi**:
- trên màn hình điểm danh của HLV, bên cạnh tên bé hiện "Còn 2 buổi" màu đỏ;
- bảng điểm danh tháng (web) hiện khung **Sắp hết khóa** (còn ≤ 2 buổi);
- *Lớp học › Học viên lớp…* hiện cột Số buổi.

Học vượt khóa (chưa gia hạn mà vẫn đi học) thì hiện "Vượt 1 buổi". Khi phụ huynh đăng ký khóa tiếp theo:
1. *Đào tạo › Lớp học* › chọn lớp › chọn học viên › **Gia hạn khóa**. Khóa cũ chuyển *Kết thúc*, AccEdu tạo ghi danh khóa mới cùng mức học phí. Buổi học vượt (nếu có) được tính vào khóa mới.
2. *Đào tạo › Học phí* › **Lập học phí**: AccEdu lập hóa đơn khóa mới (Nợ 131 / Có 3387) như mục 4.

## 11. Phân bổ doanh thu học phí cuối tháng

Học phí thu trước nằm ở TK 3387. Cuối mỗi tháng, cô Lan vào *Đào tạo › Phân bổ doanh thu học phí*:
1. Chọn **Tháng** (mặc định tháng trước), bấm **Xem trước**: mỗi học viên × lớp một dòng — học phí, đã phân bổ, phân bổ tháng này, còn chờ phân bổ.
2. Bấm **Lập phiếu phân bổ**: AccEdu lập và ghi sổ **một phiếu kế toán (PK)** ngày cuối tháng:

| Nợ | Có | Số tiền |
|---|---|---|
| 3387 — Doanh thu chưa thực hiện | 5113 — Doanh thu cung cấp dịch vụ | phần học phí của tháng |

Mỗi dòng mang mã học viên và mã lớp (vụ việc), nên báo cáo theo lớp thấy đúng doanh thu từng tháng.

Cách tính:
- **Lớp theo tháng:** ghi nhận trọn học phí của tháng đó (hóa đơn học phí lập muộn được ghi nhận ở lần phân bổ kế tiếp).
- **Lớp theo khóa:** học phí × số buổi đã học lũy kế ÷ số buổi của khóa, trừ phần đã phân bổ các tháng trước. Ví dụ khóa 1.000.000 đ / 3 buổi: tháng 9 học 2 buổi → 666.667 đ; tháng 10 học buổi cuối → 333.333 đ. Buổi cuối nhận phần dư làm tròn, nên đủ khóa thì 3387 của học viên về đúng 0.
- Chỉ phân bổ hóa đơn học phí **đã ghi sổ**; không bao giờ vượt học phí.

**Lập lại:** điểm danh tháng đó được sửa sau khi đã phân bổ thì bấm **Xem trước** rồi **Lập lại phiếu phân bổ** — AccEdu thay phiếu cũ, không nhân đôi. Nếu các tháng sau cũng đã phân bổ, AccEdu nhắc lập lại cả các tháng đó. Tháng đã khóa sổ thì không lập lại được.

**Đối chiếu:** phần *Học phí chờ phân bổ* bên dưới liệt kê số dư 3387 theo từng học viên, so với **số dư sổ cái TK 3387**. "Khớp sổ cái" là đúng; nếu chênh lệch thì là các khoản 3387 khác ngoài học phí.

> Hóa đơn học phí đã được phân bổ doanh thu thì không bỏ ghi sổ / xóa được. Cần sửa thì xóa phiếu phân bổ tháng đó trước (*Tổng hợp › Phiếu kế toán*), sửa hóa đơn, rồi lập lại phân bổ.

## 12. Lương HLV theo buổi dạy

Cuối tháng, cô Lan tính lương cho thầy Hùng (nhân viên, 150.000 đ/buổi) và cô Mai (cộng tác viên, 200.000 đ/buổi). Số buổi lấy từ điểm danh, cô không phải đếm tay.

**Khai báo HLV (làm một lần).** Vào *Đào tạo › Lương HLV*, bấm **Khai báo HLV**:
- **Mã nhân viên:** đối tượng trong danh mục. Chưa có thì thêm ở *Bán hàng › Khách hàng › Mới*, tích **Nhân viên**.
- **Loại:**
  - *Nhân viên*: lương ghi Có 334 (TT99: 3341).
  - *Cộng tác viên*: lương ghi Có 331; tổng tháng từ **2.000.000 đ** thì khấu trừ **10% thuế TNCN** (Có 3335).
- **Đơn giá mỗi buổi.** Lớp có đơn giá riêng thì khai ở *Lớp học › Sửa › Đơn giá buổi dạy của lớp*; đơn giá của lớp được ưu tiên.
- **Tài khoản điểm danh:** tài khoản đăng nhập của HLV (mục 8). Buổi do tài khoản này điểm danh được tính lương cho HLV đó.

**Buổi được tính lương** là buổi có điểm danh. Lương của buổi được tính cho HLV đã điểm danh; nếu kế toán điểm danh thay thì tính cho HLV phụ trách lớp.

Khi có người **dạy thay**: vào *Điểm danh*, chọn lớp và ngày, đổi ô **HLV dạy**.

**Lập lương tháng:**
1. Chọn **Tháng**, bấm **Xem trước**. Mỗi HLV một dòng: số buổi × đơn giá theo từng lớp, tổng lương, thuế TNCN, thực nhận.
2. Nếu còn buổi **chưa có HLV nhận lương**, AccEdu liệt kê để gán trước.
3. Bấm **Lập phiếu lương**. AccEdu lập và ghi sổ một phiếu kế toán ngày cuối tháng:

| Nợ | Có | Ghi chú |
|---|---|---|
| 632 (vụ việc = lớp) | 334 / 3341 | HLV nhân viên |
| 632 (vụ việc = lớp) | 331 | HLV cộng tác viên |
| 331 | 3335 | Khấu trừ 10% TNCN (cộng tác viên ≥ 2.000.000 đ) |

Ví dụ cô Mai dạy 13 buổi = 2.700.000 đ: khấu trừ 270.000 đ, thực nhận 2.430.000 đ.

- Vì Nợ 632 mang mã lớp, báo cáo theo vụ việc cho thấy doanh thu học phí (5113) trừ lương HLV (632) của từng lớp.
- Điểm danh sửa sau đó thì bấm **Lập lại phiếu lương**: phiếu cũ được thay, không nhân đôi. Tháng đã khóa sổ thì không lập lại được.
- Trả lương bằng *Phiếu chi* / *Giấy báo nợ* như bình thường (Nợ 334 hoặc 331, đối tượng là HLV).
- HLV xem được **số buổi mình dạy trong tháng** trên điện thoại, không xem số tiền.

## 13. Email nhắc học phí

AccEdu gửi email **Thông báo học phí** cho phụ huynh còn nợ. Mỗi email gồm:
- các khoản còn phải đóng, tổng tiền;
- tài khoản nhận và **mã VietQR đúng số tiền**, kèm nội dung chuyển khoản.

Phụ huynh mở thư trên điện thoại là quét chuyển khoản được ngay.

**Chuẩn bị:**
1. **Email phụ huynh:** *Đào tạo › Học viên › Sửa › Email phụ huynh*, hoặc cột *Email phụ huynh* khi nhập từ Excel.
2. **Hộp thư gửi (làm một lần):** Thầy thêm vào GitHub (*Settings › Environments › SUPABASE_URL › Secrets*) các secret sau, rồi chạy lại workflow **Supabase deploy (VPS)**:
   - `ACCEDU_SMTP_HOST`, `ACCEDU_SMTP_PORT`, `ACCEDU_SMTP_USER`, `ACCEDU_SMTP_PASSWORD`, `ACCEDU_SMTP_FROM`.
   - Với Gmail: host `smtp.gmail.com`, cổng `465`, tài khoản là địa chỉ Gmail.
   - Mật khẩu là **mật khẩu ứng dụng** 16 ký tự: Tài khoản Google › Bảo mật › Xác minh 2 bước › Mật khẩu ứng dụng.
   - Mật khẩu chỉ nằm trong GitHub và kho bí mật (Vault) trên máy chủ, không ghi vào file nào.
3. **Cài đặt nhắc:** *Hệ thống › Thông tin đơn vị › Nhắc học phí qua email*:
   - **Ngày nhắc trong tháng** (mặc định 5 và 20);
   - **Email nhận phản hồi:** phụ huynh bấm Trả lời sẽ gửi về đây;
   - **Gửi thử** tới email của mình để xem mẫu thư.

**Gửi tay.** Vào *Đào tạo › Học phí*, tích chọn các học viên, bấm **Gửi email nhắc**:
- AccEdu cho xem trước ai có email, ai *thiếu email* (bỏ qua);
- bấm **Gửi N email**;
- kết quả từng phụ huynh hiện ngay, nhật ký ở cuối trang (*Email nhắc học phí gần đây*).

**Gửi tự động.** Tích **Tự động gửi** ở thẻ cài đặt.
- 8:00 sáng các ngày nhắc, AccEdu gửi cho mọi phụ huynh còn nợ học phí đã ghi sổ.
- Mỗi học viên nhận tối đa một email tự động mỗi ngày.

## Sắp có (đợt P9c-2)

- Hỏi đáp số liệu học viên, học phí, điểm danh bằng AI (hướng dẫn riêng `hoi-dap-ai.md`).
