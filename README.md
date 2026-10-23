# AccEdu — Kế toán đám mây Cờ vua Dương Sinh

AccEdu là phần mềm kế toán dùng chung một dữ liệu trên **web, desktop (Windows/macOS/Linux) và mobile (Android/iOS)**. Các nền tảng đồng bộ thời gian thực với nhau qua Supabase. Nghiệp vụ được thiết kế dựa trên khảo sát Fast Accounting Online (xem [`docs/research/fao`](docs/research/fao)) và hỗ trợ chế độ kế toán **TT99/2025** và **TT133/2016**.

- Kế hoạch tổng thể: [`docs/plans/2026-10-23-ke-hoach-tong-the-accedu.md`](docs/plans/2026-10-23-ke-hoach-tong-the-accedu.md)
- Quy ước dự án: [`CLAUDE.md`](CLAUDE.md)

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `apps/web` | Ứng dụng web chính: Vite + React 19 + TanStack Router/Query + Tailwind 4 + AG Grid |
| `apps/desktop` | Vỏ Tauri 2 bọc bản build web. Có hộp thoại lưu file gốc của hệ điều hành và bộ cài MSI/NSIS/DMG/AppImage |
| `apps/mobile` | Expo SDK 58 (React Native 0.88): tổng quan, thu/chi nhanh, cân đối phát sinh |
| `packages/core` | Nghiệp vụ dùng chung: làm tròn, đọc số thành chữ, VAT, ghi sổ, schema Zod, hệ thống tài khoản |
| `packages/api` | Client Supabase có kiểu, các truy vấn/RPC, hook React Query và đồng bộ realtime |
| `packages/ui-tokens`, `packages/i18n` | Nhận diện thương hiệu Dương Sinh, bản dịch tiếng Việt/tiếng Anh |
| `supabase/` | Migration (RLS, engine ghi sổ, báo cáo), seed hệ thống tài khoản, test CSDL |
| `tools/fao-survey` | Kịch bản REA dùng để khảo sát FAO (chỉ đọc) |

## Chạy trên máy

Cần cài sẵn: Node ≥ 22.12, pnpm 10, Docker (để chạy Supabase local), Rust (nếu build desktop).

```bash
pnpm install
npx supabase start                      # Postgres + Auth + Realtime local, tự áp migration và seed
cp apps/web/.env.example apps/web/.env.local   # điền VITE_SUPABASE_ANON_KEY lấy từ `npx supabase status`
pnpm dev:web                            # mở http://localhost:5173
pnpm dev:desktop                        # cửa sổ desktop (Tauri)
pnpm dev:mobile                         # quét QR bằng Expo Go
```

## Kiểm thử

```bash
pnpm check        # oxlint + typecheck + unit test (core, api)
pnpm db:test      # Postgres 16 local: migration, RLS, ghi sổ, khóa sổ, phân quyền
pnpm --filter @accedu/web test:e2e   # Playwright trên Supabase local (cần `supabase start`)
```

## Triển khai

- **Web:** Vercel, cấu hình trong [`apps/web/vercel.json`](apps/web/vercel.json); đặt `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`.
- **Desktop:** chạy workflow *Desktop release*. Bộ cài Windows/macOS/Linux nằm trong mục Artifacts.
- **Mobile:** chạy workflow *Mobile build (EAS)*; cần secret `EXPO_TOKEN`.
- **CSDL:** chạy `supabase link` rồi `supabase db push` để đưa migration lên dự án Supabase.
