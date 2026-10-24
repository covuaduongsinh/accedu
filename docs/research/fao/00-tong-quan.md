# FAO — Tổng quan kỹ thuật & giao diện

> Khảo sát 23/10/2026 bằng REA `rea-agents@6.7.0` (`capture-browser-scenario`), tài khoản ADMIN của Dương Sinh, **chỉ đọc**.
> Kế hoạch & nguyên tắc: [`docs/plans/P0-khao-sat-fao.md`](../../plans/P0-khao-sat-fao.md).

## 1. Công nghệ phía FAO (quan sát được)

| Hạng mục | Quan sát |
|---|---|
| Máy chủ | Microsoft-IIS/10.0, ASP.NET WebForms (`__VIEWSTATE`, `WebResource.axd`, `ScriptResource.axd`) |
| Client | ASP.NET AJAX (`Sys.*`, `$create`, PageMethods), AjaxControlToolkit (NoBot, Resizable), jQuery 2.1.1, dhtmlxLayout, navgoco |
| Khung nghiệp vụ | "FastBusiness" — mỗi màn hình là một trang `.aspx` mỏng; **toàn bộ cấu trúc form/lưới do server trả về dạng metadata JSON** (`ViewPage.Fields`) rồi client tự dựng |
| Đa doanh nghiệp | Mỗi khách hàng một đường dẫn: `https://e6.faonline.vn/{TENANT}/` (Dương Sinh: `DUONGSINH`), trong đó có "Công ty" (`DUONGSINH_App`) và "Đơn vị cơ sở" (`CTY`) |
| AI | Iframe trợ lý `faoai.fast.com.vn` nhúng ở mọi trang (chatbot hướng dẫn) |
| Phiên | **Một người dùng — một phiên**: đăng nhập lần 2 báo "Tài khoản của bạn đang được đăng nhập… Bạn có muốn đóng không?" (Có/Không) |

## 2. Luồng đăng nhập

1. `Login.aspx` → `GetEntityData` (danh sách công ty) → nhập Tên → `GetUnitData(u)` (danh sách đơn vị cơ sở của user).
2. Nhập mật khẩu → `Refresh` → `Challenge` (chống bot, AjaxControlToolkit NoBot) → `Login(user, password, data, unit, language, value, force, storage, layoutIndex)`.
3. Kết quả `"Duplicate"` → hỏi đóng phiên cũ (tham số `force`). Thành công → `Default.aspx` → `Main/Main.aspx`.
4. Đăng xuất: `MenuExtenderService.asmx/Logout`.

## 3. Bố cục giao diện

- **Thanh trên:** "Người sử dụng: …", mã đơn vị cơ sở, *Trang chính*, *Đổi mật khẩu*, *Thoát*, ô **Tìm kiếm chức năng**.
- **Menu ngang 10 phân hệ:** Hệ thống, Tổng hợp, Tiền, Bán hàng, Mua hàng, Tồn kho, Dự án, Tài sản, Công cụ, Trợ giúp → mega-menu nhiều cột, mỗi mục là link `trang.aspx?id=<mã chức năng>` (ví dụ `cactpt1.aspx?id=06.10.03`). Cây đầy đủ: [01-cay-menu.md](01-cay-menu.md) — **600 chức năng**.
- **Màn hình chứng từ / danh mục** (cùng một khuôn):
  - Tiêu đề + phụ đề ("Cập nhật phiếu thu: thêm, sửa, xóa...").
  - Thanh công cụ: **Mới (Ctrl+Insert), Sửa (Ctrl+E), Xóa, Chép dữ liệu, Tìm, Xem, In, Truy vấn..., Lấy dữ liệu từ tệp..., Tải tệp mẫu..., Khóa cột, Làm mới**.
  - Lưới danh sách phân trang (mặc định 10 dòng/trang, có dòng tổng).
  - Form nhập: phần đầu (header) + **các tab** (Chi tiết, Thuế, Thanh toán, Khấu trừ thuế, Chứng từ gốc…) + phần chân (tổng tiền) — chi tiết ở [02-chung-tu.md](02-chung-tu.md).
- **Báo cáo:** mở hộp **Điều kiện lọc** (tab Thông tin chung / Khác / In: từ ngày–đến ngày, đơn vị, mẫu báo cáo, người lập, ngày ký, lề in…) → [04-bao-cao.md](04-bao-cao.md).

## 4. Mô hình dữ liệu suy ra (đặt tên trường kiểu Fast)

- Khóa chứng từ `stt_rec`, dòng `line_nbr`; `ma_dvcs` (đơn vị cơ sở), `ngay_ct` (ngày hạch toán), `ngay_lct` (ngày lập), `so_ct`, `ma_nk` (quyển chứng từ), `ma_nt`/`ty_gia` (ngoại tệ), `status` (0 Lập chứng từ / 1 Chuyển KTTH / 2 Chuyển sổ cái).
- Giá trị song song **nguyên tệ và quy đổi**: `tien_nt` ↔ `tien`, `t_tien_nt` ↔ `t_tien`.
- Đối tượng hạch toán trên dòng: `ma_kh` (khách/NCC), `ma_vv` (vụ việc), `ma_bp` (bộ phận), `ma_phi` (phí), hợp đồng, khế ước.
- Theo dõi thanh toán theo hóa đơn: `so_hd`, `tien_hd_nt`, `da_tt_nt`, `cl_nt` (còn phải thanh toán) — phiếu thu/chi phân bổ trực tiếp vào hóa đơn.
- Controller theo nhóm chứng từ: CR (thu tiền mặt), CP (chi tiền mặt), CB (báo có), CD (báo nợ), GL (phiếu kế toán), SV/AR (bán hàng), PV/AP (mua hàng), IR/IS/IT (nhập/xuất/điều chuyển kho), FA (TSCĐ), TS (CCDC); mỗi nhóm có `*Tran` (danh sách), `*Detail` (dòng chi tiết), `*Tax` (thuế), `*Charge` (chi phí), `*Deductible` (khấu trừ thuế), `*View`.

## 5. Cấu hình của Dương Sinh (chỉ cấu trúc)

- Hệ thống tài khoản: **455 tài khoản**, chi tiết tới cấp 5 (ví dụ 111 → 1112 → 11121 theo ngoại tệ), có USD/EUR.
- BCTC theo mẫu năm / giữa niên độ / bán niên (chuẩn TT200 → TT99/2025); tờ khai GTGT chọn được theo TT28/156/119/26/80/89.
- Gói đang dùng **không có phân hệ Giá thành sản xuất**, có **Dự án (công trình, vụ việc)** — phù hợp dùng vụ việc cho lớp học/khóa học.

## 6. Hệ quả cho AccEdu

1. Kiến trúc **metadata-driven** của FAO (form/lưới mô tả bằng dữ liệu) là điểm mạnh nên học: AccEdu sẽ có `packages/core` định nghĩa schema form/lưới bằng TypeScript + Zod, dùng chung cho web/desktop/mobile.
2. Giữ các khái niệm nghiệp vụ quen thuộc với kế toán dùng FAO: quyển chứng từ, ngày lập ≠ ngày hạch toán, trạng thái chuyển sổ cái, nguyên tệ/quy đổi, phân bổ thanh toán theo hóa đơn, đơn vị cơ sở.
3. Cải thiện so với FAO: cho phép nhiều phiên/nhiều thiết bị đồng thời (đồng bộ realtime), giao diện hiện đại + phím tắt, app mobile native, API mở.
