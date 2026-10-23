# AccEdu — Kế toán đám mây Cờ vua Dương Sinh

AccEdu là phần mềm kế toán dùng chung một dữ liệu trên **web, desktop (Windows/macOS/Linux) và mobile (Android/iOS)**. Các nền tảng đồng bộ thời gian thực với nhau qua **AccEdu Platform** — nền tảng tự host (Postgres 17 + PostgREST + máy chủ auth/realtime riêng + Caddy) chạy trên VPS của Dương Sinh. Nghiệp vụ được thiết kế dựa trên khảo sát Fast Accounting Online (xem [`docs/research/fao`](docs/research/fao)) và hỗ trợ chế độ kế toán **TT99/2025** và **TT133/2016**.

- Kế hoạch tổng thể: [`docs/plans/2026-10-23-ke-hoach-tong-the-accedu.md`](docs/plans/2026-10-23-ke-hoach-tong-the-accedu.md)
- Quy ước dự án: [`CLAUDE.md`](CLAUDE.md)

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `apps/web` | Ứng dụng web chính: Vite + React 19 + TanStack Router/Query + Tailwind 4 + AG Grid |
| `apps/desktop` | Vỏ Tauri 2 bọc bản build web. Có hộp thoại lưu file gốc của hệ điều hành và bộ cài MSI/NSIS/DMG/AppImage |
| `apps/mobile` | Expo SDK 58 (React Native 0.88): tổng quan, thu/chi nhanh, cân đối phát sinh |
| `packages/core` | Nghiệp vụ dùng chung: làm tròn, đọc số thành chữ, VAT, ghi sổ, schema Zod, hệ thống tài khoản |
| `packages/api` | Client có kiểu (supabase-js trỏ vào AccEdu Platform), truy vấn/RPC, hook React Query, client realtime WebSocket |
| `packages/ui-tokens`, `packages/i18n` | Nhận diện thương hiệu Dương Sinh, bản dịch tiếng Việt/tiếng Anh |
| `apps/server` | AccEdu server (Node 24 + Hono): đăng nhập tương thích GoTrue, realtime WebSocket (LISTEN/NOTIFY), API quản trị, CLI `migrate` / `create-owner` / `reset-password` |
| `platform/` | Docker Compose của nền tảng: Postgres, PostgREST, server, Caddy (HTTPS tự động), sao lưu hằng ngày; script triển khai VPS |
| `supabase/` | Migration (RLS, engine ghi sổ, báo cáo), seed hệ thống tài khoản, test CSDL |
| `tools/fao-survey` | Kịch bản REA dùng để khảo sát FAO (chỉ đọc) |

## Chạy trên máy

Cần cài sẵn: Node ≥ 22.18 (khuyến nghị 24), pnpm 10, Docker, Rust (nếu build desktop).

```bash
pnpm install
cd platform && API_DOMAIN=:80 HTTP_PORT=8000 HTTPS_PORT=8443 \
  CORS_ORIGIN_REGEX='^http://localhost:5173$' ./scripts/bootstrap-env.sh   # sinh .env với secret ngẫu nhiên
docker compose --env-file .env -f docker-compose.yml -f compose.ci.yml up -d --build db migrate rest server caddy
set -a; . ./.env; set +a; cd ..
DATABASE_ADMIN_URL="postgres://postgres:$POSTGRES_PASSWORD@127.0.0.1:55432/accedu" OWNER_PASSWORD=TamThoi2026 \
  node apps/server/src/cli.ts create-owner --email ban@duongsinh.vn   # tài khoản đầu tiên (bắt đổi mật khẩu)
cp apps/web/.env.example apps/web/.env.local   # VITE_API_URL=http://localhost:8000
pnpm dev:web                            # mở http://localhost:5173
pnpm dev:desktop                        # cửa sổ desktop (Tauri)
pnpm dev:mobile                         # quét QR bằng Expo Go
```

## Kiểm thử

```bash
pnpm check        # oxlint + typecheck + unit test (core, api)
pnpm db:test      # Postgres 16 local: migration, RLS, ghi sổ, khóa sổ, phân quyền, realtime NOTIFY
pnpm --filter @accedu/server test    # auth (refresh xoay vòng, chống dò mật khẩu), realtime, tạo tài khoản
E2E_DATABASE_ADMIN_URL=postgres://postgres:…@127.0.0.1:55432/accedu \
  pnpm --filter @accedu/web test:e2e  # Playwright trên AccEdu Platform local (gồm đồng bộ 2 thiết bị)
```

## Triển khai

- **Nền tảng (VPS):** workflow [*Platform deploy (VPS)*](.github/workflows/platform-deploy.yml) chạy khi `platform/`, `apps/server/` hoặc migration thay đổi. Cần secret `VPS_SSH_KEY`, `ACCEDU_OWNER_EMAIL`, `ACCEDU_OWNER_PASSWORD`. Workflow kiểm tra máy chủ (chỉ đọc, dừng nếu cổng 80/443 bị dịch vụ khác chiếm), chép mã nguồn, sinh secret ngay trên VPS (`/opt/accedu/.env`), build và chạy Docker Compose, rồi smoke test qua HTTPS. API mặc định: `https://api.217-15-160-118.sslip.io`.
- **Web:** Vercel, cấu hình trong [`apps/web/vercel.json`](apps/web/vercel.json); đặt `VITE_API_URL`.
- **Desktop:** chạy workflow *Desktop release*. Bộ cài Windows/macOS/Linux nằm trong mục Artifacts.
- **Mobile:** chạy workflow *Mobile build (EAS)*; cần secret `EXPO_TOKEN`.
- **Đổi tên miền API:** đặt biến `ACCEDU_API_DOMAIN` (Actions variables), cập nhật `VITE_API_URL` trên Vercel và `connect-src` trong `apps/desktop/src-tauri/tauri.conf.json`.
