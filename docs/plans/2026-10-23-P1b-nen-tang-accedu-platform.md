# Kế hoạch: AccEdu Platform tự xây (thay Supabase cloud), triển khai lên VPS Contabo, web trên Vercel

## Context

Thầy đã duyệt đưa AccEdu lên dùng thật. Khi kiểm tra tài khoản Supabase thì gặp vướng mắc:
- Tổ chức đang ở gói Free, đã dùng hết 2 suất dự án đang chạy (`erpchess-dev`, `duongsinh-chess`).
- Không dùng chung được với 2 dự án này vì trùng tên bảng `profiles`/`memberships`.

Thầy chọn **tự xây nền tảng thay Supabase**:
- Máy chủ: VPS Contabo `217.15.160.118`, đăng nhập SSH bằng `root`, khóa riêng nằm trên máy Thầy (`C:\Users\duongsinh\.ssh`).
- Web vẫn đặt trên **Vercel**.
- Tài khoản do quản trị tạo, tắt tự đăng ký.

Từ container này **không SSH được** tới VPS (cổng 22 bị chặn; 80/443 kết nối được). Vì vậy việc triển khai chạy bằng **GitHub Actions**, dùng khóa SSH Thầy lưu trong GitHub Secrets. Khóa không bao giờ đi qua khung chat.

Mục tiêu:
- Giữ nguyên 100% logic nghiệp vụ đã có: migration SQL, RLS, `post_voucher`, báo cáo, 25 test CSDL.
- Thay đúng 3 phần đang dựa vào Supabase cloud: **đăng nhập**, **API dữ liệu**, **realtime**.

## Kiến trúc AccEdu Platform

Toàn bộ chạy trên VPS bằng Docker Compose, thư mục `platform/`:

| Dịch vụ | Công nghệ | Vai trò |
|---|---|---|
| `db` | `postgres:17-alpine` | Chỉ nằm trong mạng nội bộ Docker, không mở cổng ra ngoài. Có volume lưu dữ liệu, cấu hình tối ưu cho 4–8 GB RAM |
| `rest` | `postgrest/postgrest:v16.5` | Sinh API REST/RPC tự động từ schema `public`. Kiểm JWT (HS256) rồi chuyển sang role `authenticated` nên RLS áp dụng y như hiện tại |
| `server` | `apps/server` (Node 24 + Hono 4) | **Auth** tương thích supabase-js, **Realtime** qua WebSocket, API quản trị nền tảng, CLI migrate/tạo user |
| `caddy` | `caddy:2` | Tự cấp HTTPS (Let's Encrypt, dự phòng ZeroSSL). Định tuyến `/rest/v1`, `/auth/v1`, `/realtime/v1`, `/platform/v1`. CORS cho tên miền Vercel, header bảo mật |
| `backup` | `postgres:17-alpine` + cron | `pg_dump` hằng ngày, giữ 14 bản trong `/opt/accedu/backups` |

**Tên miền API.** Tạm dùng `api.217-15-160-118.sslip.io` (tự trỏ về IP, không cần cấu hình DNS). Sau này đổi sang `api.covuaduongsinh.vn` chỉ bằng một biến môi trường.

**Client hầu như không đổi.**
- Vẫn dùng `@supabase/supabase-js` cho REST và Auth, vì server cài đúng các endpoint GoTrue cần dùng: `POST /auth/v1/token?grant_type=password|refresh_token`, `GET/PUT /auth/v1/user`, `POST /auth/v1/logout`, còn `POST /auth/v1/signup` thì trả 403.
- Khóa anon công khai là một hằng số. Caddy bỏ header `Authorization: Bearer <anon>` trước khi chuyển tới PostgREST, nên request không có phiên đăng nhập chạy dưới role `anon`.
- Chỉ thay realtime: `useRealtimeSync` dùng client WebSocket mới `packages/api/src/realtime.ts` thay cho `db.channel()`.
- Nhờ vậy AccEdu vẫn có thể quay lại Supabase cloud bất cứ lúc nào.

## Các bước thực thi

### 1. CSDL nền tảng

- **`platform/db/00-platform.sql`** là bản production của `supabase/tests/stubs/supabase.sql`:
  - Các role `anon`, `authenticated`, `service_role`, `authenticator` (LOGIN, mật khẩu lấy từ env) và `accedu_server`.
  - Schema `auth` gồm:
    - `users`: email, `encrypted_password` (argon2id), `raw_user_meta_data`, `must_change_password`, `banned_until`, `last_sign_in_at`.
    - `refresh_tokens`: `token_hash`, `family_id`, `revoked`, `expires_at`.
    - Các hàm `auth.uid()/jwt()/role()` đọc `request.jwt.claims` mà PostgREST đặt sẵn.
- **`local-pg.sh`** và test CSDL chuyển sang nạp file này thay cho stub, để test và production dùng cùng một nguồn.
- **Migration mới `supabase/migrations/20261023000006_realtime_notify.sql`:**
  - Trigger `app.notify_change()` gọi `pg_notify('accedu_changes', {tenant, table, op, id})` trên `vouchers`, `accounts`, `partners`, `items`, `jobs`, `opening_balances`, `period_locks`, `memberships`.
  - Thông báo chỉ chứa id, không chứa dữ liệu. Client tự tải lại qua REST nên RLS vẫn bảo vệ.
  - Hàm `platform_create_user(...)` (security definer): chỉ người có `app.can_manage(tenant)` mới tạo được tài khoản kèm membership.

### 2. `apps/server` (Hono + Node 24)

Thư viện: `jose` 6, `@node-rs/argon2` 2, `pg` 8, `ws` 8, `zod` 4, `pino`.

- **`src/auth/`:**
  - Đăng nhập bằng mật khẩu, hash argon2id, chống dò mật khẩu (10 lần / 15 phút theo IP+email).
  - Access JWT HS256 có hạn 1 giờ (`sub`, `role: authenticated`, `aud`, `email`, `user_metadata`, `session_id`).
  - Refresh token xoay vòng; phát hiện dùng lại token cũ thì thu hồi cả "family".
  - Đổi mật khẩu; cờ `must_change_password`. Response đúng định dạng session/user của GoTrue.
- **`src/realtime/`:**
  - Một kết nối `LISTEN accedu_changes` dùng chung.
  - Client WebSocket gửi `{type:"auth", token}` rồi `{type:"subscribe", tenant}`. Server xác thực JWT và kiểm tra membership trước khi phát.
  - Có heartbeat; tự xác thực lại khi token được làm mới.
- **`src/platform/`:**
  - `POST /platform/v1/users`: quản trị đơn vị tạo tài khoản với mật khẩu tạm và vai trò.
  - `/healthz`.
- **`src/cli.ts`:**
  - `migrate`: áp `00-platform.sql`, toàn bộ `supabase/migrations/*.sql` và `seed.sql`. Theo dõi bằng bảng `platform.schema_migrations` có checksum.
  - `create-owner --email --tenant-slug --tenant-name --regime`: mật khẩu lấy từ biến môi trường; tài khoản phải đổi mật khẩu ở lần đăng nhập đầu.
  - `reset-password`.
- **`Dockerfile`** (đa tầng, image nhỏ). Image được đẩy lên `ghcr.io/covuaduongsinh/accedu-server`.

### 3. Client (`packages/api`, `apps/web`, `apps/mobile`, `apps/desktop`)

- `createAccEduClient` nhận `url` của nền tảng. Biến môi trường đổi thành `VITE_API_URL` và `EXPO_PUBLIC_API_URL`; tên `*_SUPABASE_URL` cũ vẫn được chấp nhận.
- `realtime.ts`: tự kết nối lại với backoff, gửi lại token khi sự kiện `TOKEN_REFRESHED` xảy ra. `useRealtimeSync` giữ nguyên API của hook.
- **Web:**
  - Bỏ nút "Đăng ký".
  - Thêm màn hình bắt buộc **đổi mật khẩu lần đầu** (khi `must_change_password`).
  - Trang Người dùng có thêm "Tạo tài khoản" (email, họ tên, mật khẩu tạm, vai trò).
- **Desktop:** cập nhật CSP trong `tauri.conf.json` cho tên miền API (`https`/`wss`).

### 4. Hạ tầng và triển khai

- **`platform/docker-compose.yml`, `platform/Caddyfile`, `platform/.env.example`:**
  - Secret (`JWT_SECRET`, mật khẩu DB) được **sinh ngay trên VPS** bằng `openssl rand` khi chạy lần đầu, lưu ở `/opt/accedu/.env` với quyền 600.
  - Secret không bao giờ rời khỏi máy chủ.
- **Workflow `.github/workflows/platform-deploy.yml`.** Chạy khi push lên `claude/**` hoặc `main` có thay đổi ở `platform/**`, `apps/server/**`, `supabase/migrations/**`; hoặc chạy tay. Gồm các job:
  1. `build`: build image server, push lên GHCR.
  2. `inspect` (chỉ đọc): SSH vào VPS, in ra hệ điều hành, RAM, đĩa, Docker, các cổng đang dùng (`ss -ltnp`), container đang chạy. **Nếu cổng 80/443 đang bị dịch vụ khác chiếm thì dừng và báo lại**, không ghi đè.
  3. `deploy`:
     - Cài Docker nếu chưa có; cấu hình UFW chỉ mở 22/80/443.
     - Chép `platform/` vào `/opt/accedu`, chạy `docker compose pull && up -d`.
     - Chạy `migrate`; tạo chủ sở hữu và đơn vị `duongsinh` lần đầu (idempotent).
     - Kiểm tra `/healthz` qua HTTPS.
  4. `smoke`: đứng từ máy chạy GitHub, gọi `https://api…/healthz`, đăng nhập bằng tài khoản owner, đọc `my_tenants`.
- **CI hiện có (`ci.yml`):** job `web-e2e` chuyển từ `supabase start` sang `docker compose -f platform/docker-compose.yml -f platform/compose.ci.yml up`. E2E tạo owner bằng CLI trước khi chạy (thay cho bước đăng ký).
- **Vercel:**
  - Dùng Vercel MCP: `create_git_project` (repo `covuaduongsinh/accedu`, `rootDirectory: apps/web`, team `team_KNLlEqXbST4ECeYfupd9uxKk`).
  - Đặt env `VITE_API_URL` và `VITE_API_ANON_KEY`.
  - `create_deployment` từ nhánh `claude/beautiful-pascal-y8xgxa` với `target: production`, vì nhánh `main` hiện chỉ có LICENSE.
  - Thêm tên miền `*.vercel.app` vào danh sách CORS của Caddy.

## Việc Thầy cần làm (một lần)

1. **Thêm 3 Secrets** trong GitHub → repo `accedu` → Settings → Secrets and variables → Actions:
   - `VPS_SSH_KEY`: toàn bộ nội dung file khóa riêng trong `C:\Users\duongsinh\.ssh\` (ví dụ `id_ed25519` hoặc `id_rsa`, mở bằng Notepad).
   - `ACCEDU_OWNER_EMAIL`: `duongsinhchess@gmail.com`.
   - `ACCEDU_OWNER_PASSWORD`: mật khẩu tạm, hệ thống sẽ bắt đổi ở lần đăng nhập đầu.
   - (`VPS_HOST=217.15.160.118` và `VPS_USER=root` để ở mục *Variables*, không phải secret.)
2. Báo lại nếu VPS đang chạy dịch vụ web khác. Job `inspect` cũng sẽ tự phát hiện.
3. Nên tạo snapshot VPS trên bảng điều khiển Contabo trước lần triển khai đầu.

## Cách kiểm chứng

- **Trong container (Docker có sẵn):**
  - `docker compose up` toàn bộ nền tảng.
  - `pnpm --filter @accedu/server test`: đăng nhập, xoay vòng refresh token và phát hiện dùng lại, chống dò mật khẩu, tắt đăng ký, đổi mật khẩu bắt buộc, phân quyền tạo user, realtime chỉ gửi tới thành viên đúng đơn vị.
  - `pnpm db:test`: 25 test hiện có phải vẫn đạt khi dùng `00-platform.sql`.
  - E2E Playwright chạy trên nền tảng tự xây, gồm cả kịch bản đồng bộ 2 thiết bị.
- **GitHub Actions:** CI đạt; `platform-deploy` đạt cả 4 job; `smoke` đăng nhập thật được qua HTTPS.
- **Vercel:** bản production truy cập được. Kiểm tra bằng log deploy và `get_deployment`, sau đó mở web thử đăng nhập bằng owner, lập một phiếu thu, xem cân đối phát sinh.

## Rủi ro và cách xử lý

- **Let's Encrypt giới hạn số chứng chỉ cấp cho `sslip.io`:** Caddy tự chuyển sang ZeroSSL. Về lâu dài nên dùng tên miền riêng.
- **Tự viết phần Auth:** chỉ làm phạm vi tối thiểu (mật khẩu + refresh); dùng thư viện chuẩn (argon2id, jose); có test phát hiện dùng lại token; PostgreSQL không mở cổng ra Internet.
- **Đăng nhập SSH bằng `root`:** giai đoạn sau nên tạo user `deploy` và tắt đăng nhập bằng mật khẩu.

## Kết quả thực hiện (23/10/2026)

| Hạng mục | Trạng thái | Kiểm chứng |
|---|---|---|
| CSDL nền tảng (`platform/db/00-platform.sql`, migration 6) | Xong | `pnpm db:test` 30/30 |
| `apps/server` (auth GoTrue, realtime, API quản trị, CLI) | Xong | `pnpm --filter @accedu/server test` 15/15 |
| Client (realtime WebSocket, đổi mật khẩu lần đầu, tạo tài khoản, bỏ đăng ký) | Xong | `@accedu/api` 8/8 (gồm 6 test realtime: nối lại, đồng bộ bù, xác thực lại) |
| Docker Compose + Caddy + sao lưu | Xong | Chạy toàn bộ trong Docker từ CSDL trống: migrate → E2E 6/6, sao lưu tạo file `.sql.gz` |
| CI | Xong | Job `web-e2e` dựng nền tảng bằng Docker Compose (build image server) thay cho `supabase start` |
| Workflow triển khai VPS | Xong, chờ secret | Bỏ qua kèm cảnh báo khi chưa có `VPS_SSH_KEY` |

**Điều chỉnh so với kế hoạch:**
- Image server được **build ngay trên VPS** từ mã nguồn (gói bằng `git archive`, chép qua `scp`), không đẩy lên GHCR. Lý do: bớt một chỗ phải cấp quyền (package registry), mã nguồn công khai trên repo nên không có gì cần giấu, build có cache nên lần sau chỉ mất vài giây.
- Bốn job `build/inspect/deploy/smoke` gộp thành 2 job: `test` (CSDL + server) → `deploy` (kiểm tra chỉ đọc → triển khai → smoke test). Bước kiểm tra vẫn dừng toàn bộ nếu cổng 80/443 bị dịch vụ khác chiếm.
- UFW: không tự bật. Nếu UFW đang bật thì chỉ mở thêm 80/443.
- `workflow_dispatch` chỉ dùng được khi workflow có trên nhánh mặc định (`main`). Trước khi merge, chạy lại workflow bằng nút *Re-run* sau khi thêm secret.
