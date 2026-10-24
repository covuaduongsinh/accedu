# Kế hoạch P1c: Chuyển AccEdu sang Supabase tự host **riêng** cho AccEdu

> Duyệt ngày 24/10/2026. Thay thế kế hoạch P1b ([2026-10-23-P1b-nen-tang-accedu-platform.md](2026-10-23-P1b-nen-tang-accedu-platform.md)).

## Context

`https://supabase.dsc.edu.vn` đã có dự án khác dùng. Thầy sẽ dựng **một Supabase mới chỉ dành cho AccEdu**.

Supabase tự host đã có sẵn Auth, REST, Realtime, Edge Functions và Studio. Vì vậy bộ **AccEdu Platform** tự viết ở P1b (`apps/server`, `platform/`, workflow `platform-deploy`) không còn cần thiết. Thầy đã đồng ý **gỡ** bộ này; nó vẫn còn trong lịch sử git.

Do dùng riêng một instance, kiến trúc **quay lại đúng thiết kế Supabase gốc** đã chạy ổn ở P2 (CI xanh với `supabase start`):
- Giữ schema `public`; không phải đổi tên 246 chỗ.
- Được dùng trigger trên `auth.users`.
- Tắt đăng ký tự do ngay ở GoTrue.

Phần còn giữ lại từ P1b gồm: bỏ nút đăng ký, bắt đổi mật khẩu tạm ở lần đầu, quản trị tạo tài khoản ngay trong app, chính sách mật khẩu dùng chung, và kịch bản E2E tạo tài khoản.

**Tên miền:** `https://supabaseaccedu.dsc.edu.vn`. Tên này chỉ gồm chữ thường, xin chứng chỉ HTTPS bình thường. Tên miền chỉ nằm ở biến `SUPABASE_URL`, nên sau này đổi được dễ dàng.

## Kiến trúc

| Thành phần | Nơi chạy | Ghi chú |
|---|---|---|
| CSDL | Postgres của Supabase AccEdu, schema `public` | Migration 0001–0005 giữ nguyên (RLS, `post_voucher`, báo cáo, profiles trigger) |
| Đăng nhập | GoTrue (`DISABLE_SIGNUP=true`) | Tài khoản do quản trị tạo; cờ `user_metadata.must_change_password` bắt đổi mật khẩu tạm |
| Đồng bộ | Supabase Realtime `postgres_changes` | Bản ở P2 (commit `240f6a5`), thêm bước làm mới toàn bộ sau khi nối lại |
| Tạo tài khoản | Edge Function `admin-users` | service_role chỉ nằm trong container functions trên VPS |
| Web | Vercel | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` |
| Desktop / Mobile | Tauri / Expo | Trỏ cùng URL |
| Triển khai DB + Function | GitHub Actions → SSH → `docker exec <db> psql` | Mật khẩu DB và service_role không rời VPS |

## Việc Thầy cần làm (một lần)

1. **Dựng Supabase mới** tại `supabaseaccedu.dsc.edu.vn`. Trong `.env` của stack này đặt:
   - `DISABLE_SIGNUP=true`;
   - `SITE_URL` là URL web trên Vercel (gửi sau).
   - Gợi ý tiết kiệm RAM khi chạy 2 stack trên cùng VPS: tắt `analytics`/`vector`/`imgproxy` nếu không dùng.
   - Nếu dựng bằng file compose gốc của Supabase: phải đổi `container_name` và các cổng (Kong, pooler…) để không trùng stack cũ. Coolify hoặc Dokploy thì tự lo phần này.
2. **Snapshot VPS** trước lần triển khai đầu.
3. **Gửi anon key** của stack mới (khóa công khai, dán vào chat được). **Không** gửi `SERVICE_ROLE_KEY`, `POSTGRES_PASSWORD`, `JWT_SECRET`.
4. **GitHub → Settings → Secrets and variables → Actions:**
   - **Secrets:**
     - `VPS_SSH_KEY`;
     - `ACCEDU_OWNER_EMAIL` = `duongsinhchess@gmail.com`;
     - `ACCEDU_OWNER_PASSWORD`: mật khẩu tạm, ≥ 8 ký tự, có cả chữ và số.
   - **Variables:**
     - `VPS_HOST` (mặc định `217.15.160.118`), `VPS_USER` = `root`;
     - `SUPABASE_URL`, `SUPABASE_ANON_KEY`;
     - `SUPABASE_COMPOSE_DIR`: thư mục docker compose của stack AccEdu trên VPS. Nếu Thầy chưa biết, lần chạy kiểm tra đầu tiên sẽ in ra để Thầy chọn.
5. (Tùy chọn) Cloud environment → **Edit → Network access** → thêm tên miền mới vào *Allowed domains*, để tôi kiểm tra trực tiếp từ phiên này.

## Các bước thực thi

### 1. Gỡ AccEdu Platform

- **Xóa:**
  - `apps/server/`
  - `platform/` (gồm `db/00-platform.sql`)
  - `.dockerignore`
  - `.github/workflows/platform-deploy.yml`
  - `packages/api/src/realtime.ts` và test của nó
- **Khôi phục stub test** `supabase/tests/stubs/supabase.sql` từ commit `240f6a5`. Stub mô phỏng `auth.users`, `auth.uid()` và các role. Cho `supabase/scripts/local-pg.sh` nạp lại stub này.
- **Cập nhật tài liệu:** README, `CLAUDE.md`, P1b ghi "đã thay thế bởi P1c".

### 2. CSDL

- Migration 0001–0005: **giữ nguyên**.
- Viết lại migration 6 thành `20261023000006_owner_bootstrap.sql`:
  - bỏ `pg_notify`, `platform.create_user` và các grant cho `accedu_server`;
  - thêm `app.bootstrap_owner(p_user_id uuid, p_slug, p_name, p_regime, p_start)`:
    - chỉ `postgres`/`service_role` gọi được;
    - tạo đơn vị cùng membership owner;
    - chạy lại nhiều lần không sinh trùng.
- Test CSDL: `platform.test.ts` thay bằng `bootstrap.test.ts`, kiểm tra chạy lại không sinh trùng và `authenticated` không gọi được hàm.

### 3. Edge Function `supabase/functions/admin-users/index.ts`

- **Xác thực người gọi** bằng JWT (`auth.getUser`). Kiểm tra vai trò owner/admin trong đơn vị qua `list_members`, gọi bằng quyền của chính người gọi.
- **Tạo tài khoản** bằng client service_role:
  - `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, must_change_password: true } })`;
  - trigger `on_auth_user_created` ở migration 5 tự tạo `profiles`.
  - Email đã tồn tại thì chỉ gán vai trò, không đổi mật khẩu.
- **Gán vai trò** bằng `set_member`, gọi bằng quyền người gọi để dùng lại phân quyền có sẵn.
- **Kết quả trả về:** `{ user_id, created }`.

### 4. Client

- **`packages/api`:**
  - `createAccEduClient`: bỏ WeakMap/`platformFetch`.
  - `useRealtimeSync`: quay lại `db.channel(...).on("postgres_changes", …)`. Giữ ánh xạ invalidate hiện có (thêm `memberships`, `tenants`). Kênh `SUBSCRIBED` lại sau lỗi thì làm mới toàn bộ đơn vị.
  - `api.createUser` gọi `db.functions.invoke("admin-users")`.
  - `api.changePassword` gọi `auth.updateUser({ password, data: { must_change_password: false } })`.
- **Biến môi trường:**
  - web: `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`;
  - mobile: `EXPO_PUBLIC_SUPABASE_*`;
  - anon key bắt buộc, bỏ hằng `accedu-public-anon`.
- **Web và mobile:** cổng đổi mật khẩu đọc `user_metadata.must_change_password`. LoginPage, ChangePasswordPage và form tạo tài khoản ở UsersPage giữ nguyên.
- **Desktop:** `tauri.conf.json` đặt `connect-src https://supabaseaccedu.dsc.edu.vn wss://supabaseaccedu.dsc.edu.vn http://127.0.0.1:54321 ws://127.0.0.1:54321`.

### 5. CI và môi trường local

- **`supabase/config.toml`:** `enable_signup = false`, bật `[edge_runtime]`.
- **`ci.yml`:**
  - `check`: bỏ test server.
  - `web-e2e`: quay lại `supabase start` (giữ edge-runtime).
  - E2E `beforeAll`: tạo owner qua admin API local (service key lấy từ `supabase status -o env`) với `must_change_password: true`, rồi chạy `psql "$DB_URL" -c "select app.bootstrap_owner(...)"`.
  - 6 kịch bản hiện có chạy như cũ, gồm: tạo tài khoản qua Edge Function, đồng bộ 2 thiết bị.
- **Workflow mobile và desktop release:** dùng `vars.SUPABASE_URL` / `vars.SUPABASE_ANON_KEY`.

### 6. Workflow `.github/workflows/supabase-deploy.yml` (SSH)

- **Kích hoạt:**
  - push có thay đổi `supabase/migrations/**`, `supabase/seed.sql`, `supabase/functions/**`;
  - hoặc chạy tay;
  - chưa có `VPS_SSH_KEY` thì bỏ qua kèm cảnh báo.
- **Tái dùng** phần cấu hình SSH đã có trong `platform-deploy.yml`: bỏ `\r`, kiểm tra passphrase, keyscan.
- **Job `test`:** `pnpm db:test`.
- **Job `deploy`:**
  1. **Kiểm tra (chỉ đọc)** — `supabase/deploy/inspect.sh`:
     - liệt kê mọi stack Supabase trên VPS (container và thư mục compose qua label `com.docker.compose.project.working_dir`);
     - xác định container db/functions/kong của `SUPABASE_COMPOSE_DIR`.
     - **Chốt an toàn:** dừng lại nếu `public` của DB đích đã có bảng không thuộc AccEdu, hoặc nếu `SUPABASE_COMPOSE_DIR` trỏ nhầm sang stack `supabase.dsc.edu.vn` cũ.
  2. **Migration** — `supabase/deploy/migrate.sh`:
     - chạy `docker exec -i <db> psql -U postgres -v ON_ERROR_STOP=1`;
     - mỗi file một transaction;
     - ghi vết vào `supabase_migrations.schema_migrations`, chính là bảng của Supabase CLI, để sau này dùng được `supabase migration list`;
     - tiếp theo nạp `seed.sql`, rồi `notify pgrst, 'reload schema'`.
  3. **Edge Function:** chép `supabase/functions/admin-users` vào `<compose_dir>/volumes/functions/`. Chỉ khi checksum đổi mới `docker compose restart functions`.
  4. **Chủ sở hữu:**
     - gọi admin API ngay trên VPS: `http://localhost:<kong_port>/auth/v1/admin/users`, dùng `SERVICE_ROLE_KEY` đọc từ `.env` trên VPS. Tạo user nếu chưa có, kèm `must_change_password: true`;
     - sau đó `select app.bootstrap_owner(<id>, 'duongsinh', 'Công ty CP Cờ vua Dương Sinh', 'TT99', '2026-01-01')`;
     - file tạm chứa mật khẩu bị xóa ngay sau khi dùng.
  5. **Smoke test từ runner:**
     - `GET $SUPABASE_URL/rest/v1/currencies` + anon key → có `VND`;
     - `GET /auth/v1/settings` → `disable_signup: true`;
     - `POST /functions/v1/admin-users` không kèm token → 401.

### 7. Vercel (team `team_KNLlEqXbST4ECeYfupd9uxKk`)

1. `create_git_project` với `repo covuaduongsinh/accedu`, `projectName accedu`, `rootDirectory apps/web`, `deploy: false`.
2. `create_project_env`: đặt `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` cho production, preview và development.
3. `create_deployment` từ nhánh `claude/beautiful-pascal-y8xgxa`, `target: production`, `projectSettings {framework: vite, rootDirectory: apps/web, nodeVersion: 24.x}`.
4. Theo dõi bằng `get_deployment` và log build. Xong thì gửi Thầy URL để đặt `SITE_URL`.

## Kiểm chứng

- **Local / CI:**
  - `pnpm check`;
  - `pnpm db:test`;
  - E2E 6/6 trên `supabase start`: đăng nhập lần đầu bắt đổi mật khẩu → tạo đơn vị → phiếu thu → CĐPS → đồng bộ 2 thiết bị → admin tạo tài khoản kế toán qua Edge Function → kế toán đổi mật khẩu tạm → số dư, khóa sổ.
- **GitHub Actions:** CI 4/4. `supabase-deploy` đạt cả kiểm tra, migration, function, owner và smoke test.
- **Vercel:** deploy `READY`. Playwright mở production: thấy trang đăng nhập, không có nút đăng ký, không lỗi CSP/CORS.
- **Thầy:** đăng nhập `duongsinhchess@gmail.com` → đổi mật khẩu → vào `/DUONGSINH` → tạo tài khoản kế toán → lập 1 phiếu thu.

## Rủi ro

- **Triển khai nhầm vào Supabase của dự án khác** (cùng VPS): migration chỉ chạy trên `SUPABASE_COMPOSE_DIR` đã khai báo, và chốt an toàn dừng lại nếu DB đích có bảng lạ.
- **Hai stack Supabase trên một VPS:** tốn RAM và dễ trùng tên container hoặc cổng. Bước kiểm tra sẽ in RAM, các container và cổng để Thầy quyết định.
- **Phiên này bị chặn mạng tới các tên miền `dsc.edu.vn`:** kiểm chứng qua GitHub Actions và Vercel cho đến khi Thầy mở mạng.

## Kết quả thực hiện (24/10/2026, phần code)

| Hạng mục | Trạng thái | Kiểm chứng |
|---|---|---|
| Gỡ AccEdu Platform (`apps/server`, `platform/`, workflow cũ) | Xong | Stub test khôi phục; `pnpm db:test` 29/29 |
| Migration 6 `app.bootstrap_owner` | Xong | Test: chạy lại không trùng, `authenticated` không gọi được, `tenants` trong publication realtime |
| Edge Function `admin-users` | Xong | Không token → 401; E2E tạo tài khoản kế toán qua function |
| Client quay về Supabase Realtime + cờ `must_change_password` | Xong | E2E 6/6 trên `supabase start` (gồm đồng bộ 2 thiết bị) |
| Script triển khai `supabase/deploy/*.sh` | Xong | Chạy thử trên Supabase local từ CSDL trống: chốt an toàn (anon key sai → dừng; CSDL có bảng lạ → dừng), áp 6 migration + seed, chép function, tạo chủ sở hữu qua admin API; chạy lại không đổi gì; E2E 6/6 trên CSDL do script dựng |
| Workflow `supabase-deploy.yml` | Xong, chờ secret | Bỏ qua kèm cảnh báo khi chưa có `VPS_SSH_KEY` |

**Lưu ý cấu hình Supabase AccEdu trên VPS** (rút ra khi chạy thử):
- `DISABLE_SIGNUP=true` (tắt đăng ký tự do) nhưng **giữ `ENABLE_EMAIL_SIGNUP=true`**: biến này là công tắc của cả phương thức đăng nhập email; tắt thì không ai đăng nhập được.
- Container `functions` cần ra Internet (tải `npm:@supabase/supabase-js` lần đầu).
