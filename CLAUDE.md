# AccEdu — quy ước dự án

Phần mềm kế toán đám mây của Công ty CP Cờ vua Dương Sinh (web + desktop + mobile, đồng bộ qua Supabase).
Kế hoạch tổng thể: `docs/plans/2026-10-23-ke-hoach-tong-the-accedu.md`.

## Quy ước bắt buộc

- **Mọi kế hoạch (plan) lưu trong `docs/plans/`**, đặt tên `YYYY-MM-DD-<chu-de>.md` hoặc `P<n>-<chu-de>.md`.
- Tài liệu, commit message mô tả nghiệp vụ, giao diện: **tiếng Việt** (kèm thuật ngữ tiếng Anh khi cần).
- Kết quả khảo sát FAO (Fast Accounting Online) lưu ở `docs/research/fao/` dưới dạng **đặc tả chức năng**:
  không chép mã, logo, văn bản của FAST; không commit số liệu, tên đối tượng thật, token, capture thô.
  Capture thô của REA để ở `research-raw/` (đã gitignore) hoặc scratchpad.
- Không bao giờ ghi mật khẩu/khóa vào file. Secret chỉ qua biến môi trường (`.env.local` đã gitignore).
- Nhận diện thương hiệu Dương Sinh: navy `#2B3990` + gold, font Roboto; token đặt tại `packages/ui-tokens`.

## Kiến trúc

- Monorepo pnpm + Turborepo. `apps/web` (Vite + React + TanStack), `apps/desktop` (Tauri 2 bọc `apps/web/dist`),
  `apps/mobile` (Expo). Code dùng chung ở `packages/*`.
- Backend Supabase: schema ở `supabase/migrations`, mọi bảng nghiệp vụ có `tenant_id` + RLS.
- Logic ghi sổ (`post_voucher`) và báo cáo là hàm SQL — client không tự tính sổ.
- Chế độ kế toán: TT99/2025 (thay TT200) và TT133/2016, chọn theo đơn vị.

## Lệnh thường dùng

```bash
pnpm install
pnpm check          # lint + typecheck + test toàn repo (turbo)
pnpm dev:web        # chạy web
pnpm db:test        # chạy test SQL trên Postgres local
```
