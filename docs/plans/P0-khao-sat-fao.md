# P0 — Khảo sát Fast Accounting Online (FAO) bằng REA

Mục tiêu: có **đặc tả chức năng** của FAO (bản Dương Sinh đang dùng) để làm backlog cho AccEdu:
cây menu, danh sách màn hình, trường/cột/nút, danh sách báo cáo + tham số, luồng nghiệp vụ, kho API.

## Nguyên tắc

1. Chỉ dùng tài khoản của chính Dương Sinh (`e6.faonline.vn/DUONGSINH`), **chỉ đọc**: mở menu, danh sách,
   xem form, mở báo cáo. Không bấm Lưu / Xóa / Ghi sổ / Hủy ghi / Khóa sổ / Gửi hóa đơn.
2. Mật khẩu chỉ truyền qua biến môi trường lúc chạy (`FAO_USER`, `FAO_PASSWORD`), REA tự che trong output.
3. Capture thô (DOM, network body có thể chứa token phiên, dữ liệu kế toán thật) → `research-raw/` (gitignore).
4. Chỉ commit tài liệu đã lọc: không số tiền, không tên khách hàng/NCC/nhân viên, không MST, không token.
5. Clean-room: mô tả hành vi bằng lời của mình; không chép mã JS/CSS, hình ảnh, văn bản trợ giúp của FAST.

## Công cụ (REA `rea-agents@6.7.0`)

| Bước | Lệnh | Đầu ra |
|---|---|---|
| Đăng nhập + chụp màn hình | `capture-browser-scenario` (launch Chromium `/opt/pw-browsers`, `locale vi-VN`, `timezone Asia/Ho_Chi_Minh`, secret từ env) | DOM, accessibility, screenshot, network |
| Kho API | `inspect-analysis-view` view `api-surface`, `environment-manifest` | endpoint, tham số, kiểu body |
| Logic client | `export-web-scripts` → `analyze-javascript-application` → `trace-application-feature` | module, route, nơi gọi API |
| Đối chiếu về sau | `compare-web-captures` FAO ↔ AccEdu | khác biệt màn hình/luồng |

Bổ sung khi cần: Playwright trực tiếp (cùng Chromium) để duyệt cây menu nhanh — vẫn tuân thủ nguyên tắc chỉ đọc.

## Đầu ra (`docs/research/fao/`)

- `00-tong-quan.md` — công nghệ FAO, cấu trúc URL, cách đăng nhập/chọn đơn vị/năm tài chính, bố cục giao diện.
- `01-cay-menu.md` — toàn bộ menu theo phân hệ.
- `02-<phan-he>.md` — mỗi phân hệ: danh mục, chứng từ (trường header, cột chi tiết, tab thuế), báo cáo (tham số, cột).
- `90-api-surface.md` — nhóm endpoint đã template hóa (không token).
- `99-gap-analysis.md` — đối chiếu với kế hoạch AccEdu, việc cần bổ sung vào backlog.

## Tiêu chí xong

- Cây menu đầy đủ cho 10 phân hệ; mỗi loại chứng từ chính có danh sách trường; mỗi nhóm báo cáo có tham số.
- Gap analysis cập nhật vào kế hoạch tổng thể.
