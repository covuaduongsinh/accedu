# Đối chiếu FAO ↔ kế hoạch AccEdu (gap analysis)

> Đầu vào: [01-cay-menu.md](01-cay-menu.md) (600 chức năng), [02-chung-tu.md](02-chung-tu.md), [03-danh-muc.md](03-danh-muc.md), [04-bao-cao.md](04-bao-cao.md).
> Kết luận được đưa ngược vào [kế hoạch tổng thể](../../plans/2026-10-23-ke-hoach-tong-the-accedu.md) (mục "Điều chỉnh sau P0").

## 1. Ánh xạ phân hệ

| FAO | Số chức năng | AccEdu | Ghi chú |
|---|---|---|---|
| Hệ thống | 43 | P1 + P2 | Thêm: đơn vị cơ sở, quyển chứng từ, khóa số liệu (theo ngày và theo loại chứng từ), giới hạn IP, nhật ký người dùng/hệ thống, đổi mã–gộp mã, chữ ký người ký báo cáo |
| Tổng hợp | 113 | P2 + P7 + P8 | Có cả **hình thức Chứng từ ghi sổ** bên cạnh Nhật ký chung; bút toán phân bổ định kỳ/tự động, kết chuyển tự động, chênh lệch tỷ giá; quản trị phí; mẫu báo cáo do người dùng khai báo |
| Tiền | 55 | P3 | Thêm: **kết nối ngân hàng** (giao dịch, sao kê, mã Citad), tạo phiếu thu/chi từ hóa đơn, tỷ giá ghi sổ bình quân tháng/di động, **khế ước vay** + tính lãi |
| Bán hàng | 121 | P4 | Thêm: **đơn hàng bán**, hóa đơn điều chỉnh/giảm giá/trả lại, **HĐĐT đầy đủ vòng đời** (phát hành, thay thế, điều chỉnh, hủy, kiểm tra trạng thái), hợp đồng, bảng giá, đối chiếu/xác nhận công nợ |
| Mua hàng | 101 | P4 | Thêm: đơn hàng mua, nhập khẩu, chi phí mua hàng, **quản lý hóa đơn đầu vào** (nhận qua email, đối chiếu sổ thuế, **cảnh báo DN rủi ro thuế**) |
| Tồn kho | 71 | P5 | Thêm: giá **NTXT (FIFO)**, bình quân tháng + di động theo ngày, **kiểm kê** (11 chức năng), xuất kho tự động theo định mức, phiếu xuất kho kiêm vận chuyển điện tử |
| Dự án | 14 | P7 (thay "Giá thành") | Gói của Dương Sinh **không có Giá thành sản xuất**; Dự án/vụ việc dùng cho lớp học, khóa học, sự kiện/giải đấu |
| Tài sản | 44 | P6 | Thêm: nguồn vốn, sản lượng (khấu hao theo sản lượng), tạm dừng/thôi khấu hao, biên bản giao nhận/thanh lý/đánh giá lại |
| Công cụ | 34 | P6 | Thêm: khai báo hỏng, hệ số phân bổ theo bộ phận |
| Trợ giúp | 4 | P10 | Hướng dẫn + video; AccEdu thêm trợ lý AI (Claude) trong app |

## 2. Quy ước nghiệp vụ cần giữ (để kế toán chuyển từ FAO sang không bỡ ngỡ)

1. Chứng từ có **ngày lập** và **ngày hạch toán** riêng; **quyển chứng từ** quyết định đánh số.
2. **Trạng thái**: 0 Lập chứng từ → 1 Chuyển KTTH → 2 Chuyển sổ cái (chỉ trạng thái 2 mới lên sổ).
3. Mọi số tiền lưu song song **nguyên tệ** và **quy đổi VND**; tỷ giá giao dịch và tỷ giá ghi sổ tách bạch.
4. Phiếu thu/chi/báo có/báo nợ có **loại phiếu** (thu/chi theo hóa đơn, thu/chi khác, …) và dòng chi tiết có thể **trỏ thẳng tới hóa đơn** để trừ công nợ.
5. Phiếu chi/báo nợ có tab **Thuế** (hóa đơn đầu vào) và **Khấu trừ thuế**; hóa đơn mua có tab **Chi phí** (phân bổ chi phí mua vào giá vốn).
6. Đối tượng phân tích trên từng dòng: khách hàng, vụ việc, bộ phận, phí, hợp đồng, khế ước.
7. Báo cáo luôn có: từ ngày–đến ngày, đơn vị cơ sở, mẫu (chuẩn/ngoại tệ), người lập, ngày ký; xuất In/Excel.
8. Thanh công cụ thống nhất: Mới, Sửa, Xóa, Chép, Tìm, Xem, In, Truy vấn, **Nhập từ Excel + tải tệp mẫu**, Khóa cột, Làm mới; phím tắt Ctrl+Insert / Ctrl+E.

## 3. Điểm AccEdu làm tốt hơn FAO

| FAO | AccEdu |
|---|---|
| Một phiên/người dùng, đăng nhập lại đá phiên cũ | Nhiều thiết bị cùng lúc, đồng bộ realtime |
| Chỉ web (UI WebForms 2010s) | Web + desktop (Tauri) + mobile native (Expo) |
| Form dựng từ metadata tải mỗi lần | Schema TypeScript dùng chung, kiểm tra kiểu lúc build |
| Trợ lý AI chỉ hướng dẫn sử dụng | AI đọc hóa đơn → chứng từ nháp, gợi ý định khoản, hỏi đáp số liệu |
| Không có nghiệp vụ giáo dục | Học phí, lớp (vụ việc), cấp độ Tốt→Vua, lương HLV, VietQR |

## 4. Ưu tiên MVP sau khảo sát (để Dương Sinh bỏ được FAO sớm nhất)

1. **P2:** Hệ thống (đơn vị cơ sở, quyển chứng từ, khóa sổ), danh mục tài khoản 455 tk (import từ FAO), phiếu kế toán, NKC, sổ cái, CĐPS.
2. **P3:** Phiếu thu/chi, báo có/nợ (kèm phân bổ hóa đơn), sổ quỹ, sổ tiền gửi.
3. **P4:** Hóa đơn bán hàng/dịch vụ, mua hàng/dịch vụ, công nợ, bảng kê thuế, tờ khai GTGT.
4. **P6–P8:** TSCĐ/CCDC, BCTC năm.
5. Sau đó: kho đầy đủ, HĐĐT, ngân hàng, khế ước, đơn hàng, kiểm kê.
