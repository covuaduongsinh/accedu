# Kế hoạch P9c — Lương HLV theo buổi dạy, email nhắc học phí, AI hỏi đáp số liệu

## Context

P9b đã lên production (PR #10 → `main` `4bd6d6e`; CI, `supabase-deploy`, Vercel đều xanh). AccEdu đã có:
- điểm danh của HLV (`class_sessions`, `attendance`);
- học phí thu trước 3387 và phân bổ doanh thu cuối tháng.

Còn ba việc Thầy chọn làm ở P9c (30/10/2026):

| Việc | Thầy chốt |
|---|---|
| Lương HLV theo buổi dạy | **Chọn theo từng HLV**: nhân viên (Nợ 632 / Có 334) hoặc cộng tác viên (Nợ 632 / Có 331, khấu trừ 10% thuế TNCN khi một lần chi trả từ 2.000.000 đ) |
| Nhắc học phí | **Email tự động** |
| AI hỏi đáp số liệu | **Làm luôn trong P9c** |

Chia hai PR để dễ kiểm tra:
- **P9c-1:** lương HLV, email nhắc học phí.
- **P9c-2:** AI hỏi đáp.

Mỗi PR có CI xanh thì hỏi Thầy "merge".

**Việc Thầy cần làm (một lần).** Thêm các secret vào GitHub: *Settings › Environments › SUPABASE_URL › Secrets*. Không gửi qua chat, không ghi vào file.

| Secret | Dùng cho |
|---|---|
| `ACCEDU_SMTP_HOST`, `ACCEDU_SMTP_PORT`, `ACCEDU_SMTP_USER`, `ACCEDU_SMTP_PASSWORD`, `ACCEDU_SMTP_FROM` | Hộp thư gửi email nhắc học phí. Ví dụ Gmail: `smtp.gmail.com`, cổng `465`, mật khẩu ứng dụng 16 ký tự |
| `ANTHROPIC_API_KEY` | AI hỏi đáp (P9c-2) |

Workflow `supabase-deploy` đưa các giá trị này vào **Supabase Vault** trên VPS. Edge Function đọc từ Vault bằng service role; giá trị không nằm trong mã nguồn, file hay log. Chưa có secret thì chức năng tương ứng báo "chưa cấu hình", phần còn lại vẫn chạy.

---

## P9c-1 — Lương HLV, email nhắc học phí

### Quy tắc nghiệp vụ

**HLV.** Mỗi HLV là một đối tượng nhân viên (`partners.is_employee`), có hồ sơ `coach_profiles`:
- loại: `employee` (nhân viên) hoặc `contractor` (cộng tác viên);
- đơn giá mỗi buổi;
- tài khoản đăng nhập (nếu có).

**Đơn giá một buổi** = đơn giá riêng của lớp (`classes.coach_rate`), nếu không có thì lấy đơn giá của HLV.

**Buổi được trả lương** = buổi học có điểm danh (ít nhất một học viên). Người nhận lương là `class_sessions.coach_partner_id`:
- khi HLV điểm danh: gán HLV có tài khoản đó;
- nếu không xác định được: gán HLV phụ trách lớp;
- kế toán sửa được khi có người dạy thay.

**Lập lương tháng** (`generate_coach_pay`) tạo **một PK mỗi tháng**:

| Nợ | Có | Ghi chú |
|---|---|---|
| 632 (vụ việc = lớp) | 334 → TK chi tiết đầu tiên (3341 ở TT99, 334 ở TT133) | HLV nhân viên |
| 632 (vụ việc = lớp) | 331 | HLV cộng tác viên |
| 331 | 3335 | Cộng tác viên có tổng tháng ≥ 2.000.000 đ: khấu trừ 10% TNCN |

- Mỗi dòng mang đối tượng là HLV.
- Có chạy thử. Chạy lại thì thay phiếu cũ của tháng. Tháng đã khóa sổ thì chặn.
- HLV thiếu đơn giá thì báo lỗi kèm danh sách. Buổi chưa có người nhận thì liệt kê để kế toán gán.

**Trả tiền** bằng phiếu chi hoặc giấy báo nợ thông thường (Nợ 334/331, đối tượng HLV).

**Thu nhập của HLV:** HLV xem được số buổi mình dạy trong tháng trên điện thoại, **không** xem số tiền.

**Email nhắc học phí:**
- Email phụ huynh lưu ở `partners.email` của học viên. Có trên form học viên và cột "Email phụ huynh" khi nhập Excel.
- Cài đặt theo đơn vị ở *Thông tin đơn vị*:
  - bật/tắt nhắc tự động;
  - ngày nhắc trong tháng (mặc định 5 và 20);
  - email trả lời (reply-to).
- Nội dung email mang nhận diện Dương Sinh (navy #2B3990 + gold):
  - các khoản còn nợ, tổng tiền;
  - tài khoản nhận;
  - **mã VietQR** gắn trong thư (ảnh đính kèm CID, tạo trên máy chủ, không qua dịch vụ ngoài);
  - nội dung chuyển khoản `HP <mã HV> <số HĐ>`.
- **Gửi tự động:** pg_cron chạy 8:00 giờ Việt Nam mỗi ngày, gọi Edge Function `tuition-reminders`. Function chỉ gửi cho đơn vị đã bật nhắc và hôm nay trùng ngày nhắc.
- **Gửi tay:** ở *Học phí*, chọn học viên rồi bấm **Gửi email nhắc** (có xem trước).
- **Nhật ký** `tuition_reminders` ghi: ai, khi nào, email, số tiền, kết quả. Mỗi học viên nhận tối đa một email tự động mỗi ngày. Học viên không có email thì ghi *bỏ qua*.

### CSDL — `supabase/migrations/20261030000015_coach_pay_reminders.sql`

**Bảng mới:**
- `coach_profiles(partner_id pk, tenant_id, kind, session_rate, user_id)`;
- `coach_pay(id, tenant_id, month, partner_id, sessions, gross, pit, net, voucher_id on delete cascade, unique(month, partner_id))`;
- `tuition_reminders`.

**Cột mới:**
- `classes.coach_rate`;
- `class_sessions.coach_partner_id`;
- `tenants.reminder_enabled`, `reminder_days smallint[]`, `reminder_reply_to`.

**Hàm:**
- `save_coach_profile`;
- `set_session_coach`;
- `generate_coach_pay(p_tenant, p_month, p_post, p_dry_run)`;
- `rpt_coach_sessions(p_tenant, p_month)` (security invoker);
- `my_coach_sessions(p_tenant, p_month)`: HLV xem số buổi của mình;
- `reminder_candidates(p_tenant, p_student_ids, p_as_of)`: chỉ `can_post` hoặc `service_role`;
- `log_tuition_reminder` (`service_role`);
- `reminder_due_tenants(p_date)` (`service_role`);
- `system_secrets(p_names text[])`: chỉ `service_role`, đọc `vault.decrypted_secrets` với tên bắt đầu `accedu_`.

**Sửa:**
- `record_attendance` gán `coach_partner_id`;
- `save_class` nhận `coach_rate`;
- `import_students` nhận `email`.

**Lịch chạy:**
- Có pg_cron và pg_net (image Supabase có sẵn) thì `cron.schedule('accedu-tuition-reminders', '0 1 * * *', …)` gọi `app.fire_tuition_reminders()`. Hàm này đọc URL và token cron trong Vault rồi gọi `net.http_post`. Thiếu secret thì bỏ qua.
- Không có extension (CSDL test local) thì bỏ qua lịch, migration không lỗi.

### Triển khai

- `supabase-deploy.yml` truyền thêm các secret SMTP và `ANTHROPIC_API_KEY` qua `ssh` stdin vào file tạm `secrets.env` (`umask 077`, xóa ngay sau khi dùng). Không in giá trị, chỉ in có/không.
- `deploy.sh` ghi vào Vault: `accedu_smtp_*`, `accedu_anthropic_api_key`, `accedu_functions_url` (= `SUPABASE_URL`), `accedu_cron_token` (tự sinh nếu chưa có).
- Edge Function `tuition-reminders` (Deno):
  - nhận JWT người dùng (gửi tay, kiểm tra `can_post`), hoặc header `x-cron-token` (chạy tự động);
  - gửi qua SMTP bằng `npm:nodemailer`;
  - mã QR bằng `npm:qrcode-generator` (GIF đính kèm CID).
- Phần soạn thư và payload VietQR nằm ở `supabase/functions/_shared/`, viết TypeScript thuần nên test được bằng vitest. Payload VietQR trùng với `packages/core/src/money/vietqr.ts`; có test so khớp hai bản.

### Core, API, web, mobile

**Core:**
- `coachPayLine` (khấu trừ 10% khi ≥ 2.000.000);
- `reminderDays` (kiểm tra ngày 1–28);
- `studentSchema.email`;
- mẫu nhập học viên có cột Email phụ huynh.

**API:** kiểu dữ liệu, hàm gọi và hook cho các RPC mới; `sendTuitionReminders` gọi Edge Function. `SYNC_TABLES` thêm `coach_profiles`, `tuition_reminders`.

**Web:**
- *Đào tạo › Lương HLV* (mới):
  - danh sách HLV (loại, đơn giá, tài khoản đăng nhập);
  - chọn tháng → xem trước (HLV × lớp: số buổi, đơn giá, thành tiền, TNCN, thực nhận) → **Lập phiếu lương**;
  - danh sách buổi chưa có người nhận.
- *Lớp học*: thêm ô đơn giá buổi riêng của lớp.
- *Điểm danh*: kế toán chọn **HLV dạy** cho buổi (dạy thay).
- *Học phí*: nút **Gửi email nhắc** (xem trước danh sách: có email / thiếu email) và nhật ký gửi.
- *Thông tin đơn vị*: thẻ **Nhắc học phí qua email** (bật, ngày nhắc, reply-to, **Gửi thử** tới email của mình).
- *Học viên*: ô Email phụ huynh.

**Mobile:** *Lớp của tôi* hiện "Tháng này: N buổi".

### Kiểm thử P9c-1

**CSDL `supabase/tests/coach-pay.test.ts`:**
- nhân viên 3 buổi × 150.000 → Nợ 632 / Có 3341 đúng 450.000, mang vụ việc lớp;
- cộng tác viên 16 buổi × 200.000 = 3.200.000 → khấu trừ 320.000 vào 3335;
- cộng tác viên dưới 2.000.000 → không khấu trừ;
- đơn giá lớp ghi đè đơn giá HLV; dạy thay → lương về người dạy thay;
- chạy lại thay phiếu; khóa sổ thì chặn; HLV thiếu đơn giá thì báo lỗi;
- phân quyền: HLV chỉ thấy số buổi của mình, không đọc `coach_pay`;
- học phí: `reminder_candidates` đúng học viên còn nợ, có hoặc thiếu email; `reminder_due_tenants` theo ngày; `system_secrets` chặn `authenticated`.

**Unit:**
- soạn email (HTML có tổng tiền, nội dung chuyển khoản, CID QR);
- payload VietQR hai bản trùng nhau;
- `coachPayLine`.

**E2E:**
- khai báo HLV cộng tác viên → điểm danh → lập lương tháng → PK có dòng TNCN;
- *Gửi email nhắc*: Supabase local có Mailpit / Inbucket → kiểm tra thư đến hộp thư local qua API của nó.

---

## P9c-2 — AI hỏi đáp số liệu

### Cách làm

**Edge Function `ai-ask`** (Deno, `npm:@anthropic-ai/sdk`):
- **Model** `claude-opus-5-5`, thinking adaptive (mặc định của model), `output_config.effort` = `medium`.
- **Dự phòng khi bị từ chối:** `fallbacks: "default"` với beta `server-side-fallback-2026-07-01`.
- **Vòng lặp tool use** tự viết, tối đa 8 lượt gọi tool, `tool_choice: auto`.
- **Tool chỉ đọc.** Mỗi tool gọi RPC bằng **client của chính người hỏi** (JWT, nên RLS và quyền giữ nguyên). Các nhóm tool:
  - cân đối phát sinh, sổ cái tài khoản, công nợ đối tượng, tuổi nợ;
  - tình hình học phí, học phí chờ phân bổ, số buổi còn lại, điểm danh tháng, lương HLV;
  - lãi gộp, nhập – xuất – tồn;
  - danh sách học viên và lớp.
- Kết quả tool được cắt gọn (tối đa 200 dòng, chỉ giữ các cột cần thiết).
- **HLV** chỉ có tool điểm danh và lớp của mình.
- **System prompt** tiếng Việt cố định:
  - trả lời ngắn, có số liệu định dạng VN, nêu nguồn báo cáo;
  - không bịa số, không sửa dữ liệu.
- **Prompt caching:** `cache_control` trên system prompt và tool cuối; ngày hôm nay đưa vào tin nhắn người dùng, không đưa vào system.
- **Giới hạn chi phí:**
  - `max_tokens` 16000;
  - hạn mức câu hỏi mỗi ngày theo đơn vị (mặc định 100, quản trị đổi được);
  - bảng `ai_usage` ghi số token vào/ra, cache, chi phí ước tính. Người hỏi xem được lịch sử của mình, quản trị xem được toàn bộ.
- Khóa `accedu_anthropic_api_key` đọc từ Vault. Chưa có khóa thì trả "Chưa cấu hình AI".

**Web:** nút **Hỏi AccEdu** trên thanh đầu trang mở khung chat bên phải.
- Có câu hỏi gợi ý: "Tháng này còn bao nhiêu học viên chưa đóng học phí?", "Doanh thu học phí tháng 10 theo lớp?", "Lớp nào sắp hết khóa?".
- Hiển thị: câu trả lời, các báo cáo đã dùng, số câu còn lại hôm nay.

**Mobile:** màn hình **Hỏi AccEdu** dùng chung API.

### Kiểm thử P9c-2

- **Unit (vitest, client giả):**
  - vòng lặp gọi tool rồi trả lời;
  - dừng ở 8 lượt;
  - xử lý `refusal`;
  - tool trả lỗi thì gửi `is_error`;
  - quyền HLV chỉ thấy bộ tool hẹp;
  - cắt gọn kết quả.
- **CSDL:** `ai_usage` hạn mức theo ngày; RLS.
- **E2E:** chưa cấu hình khóa → khung chat báo "Chưa cấu hình AI". Không gọi API thật trong CI.

---

## Chung

- Nhánh `claude/beautiful-pascal-y8xgxa` khởi động lại từ `origin/main` (`4bd6d6e`).
- Commit theo lớp: CSDL → Core / API → Web / Mobile → E2E / tài liệu.
- Trước khi push chạy: `pnpm check`, `pnpm db:test`, E2E trên Supabase local.
- **Tài liệu:**
  - `docs/huong-dan/hoc-vien-hoc-phi.md` thêm Lương HLV, Email nhắc học phí;
  - `docs/huong-dan/hoi-dap-ai.md` (mới);
  - ghi kết quả vào kế hoạch này và file tiến độ.
- **Tương thích:** chỉ thêm bảng, cột, hàm. Migration không lỗi khi thiếu pg_cron, pg_net hoặc Vault.

---

## Kết quả đợt P9c-1 (30/10/2026)

| Hạng mục | Trạng thái | Kiểm chứng |
|---|---|---|
| Migration 0015: hồ sơ HLV, lương tháng (PK 632 / 334 \| 331, TNCN 3335), nhắc học phí, Vault, pg_cron | Xong | `coach-pay.test.ts` (8 test); 103 test cũ giữ xanh. Trên Supabase local: tạo được lịch `accedu-tuition-reminders`, đọc Vault bằng service role |
| Edge Function `tuition-reminders` (SMTP, VietQR đính kèm, lịch / gửi tay / thư thử) | Xong | Gửi thật tới Mailpit local; `functions-shared.test.ts` (2 test); sai token cron → 401 |
| Triển khai: secret SMTP / AI → Vault (`app.vault_set`), token cron tự sinh, smoke test | Xong | shellcheck; thử `vault_set` với ký tự đặc biệt |
| Core / API: email phụ huynh (form + Excel), `contractorPit`, `parseReminderDays`, hook | Xong | Core 132 test |
| Web: Lương HLV, Gửi email nhắc, cài đặt nhắc, đơn giá lớp, HLV dạy thay; mobile số buổi dạy | Xong | E2E 15/15 |

**Khác kế hoạch:**
- Không cần `rpt_coach_sessions`: chạy thử `generate_coach_pay` đã trả đủ bảng xem trước.
- Tên hàm nhật ký là `log_tuition_reminders` (ghi nhiều dòng một lần).
- Ảnh QR là GIF tạo bằng `qrcode-generator` (cùng thư viện với web), đính kèm CID.

Tổng số test: core 132, api 3, CSDL 113 (+8 lương HLV và nhắc học phí, +2 Edge Function dùng chung), E2E 15.
