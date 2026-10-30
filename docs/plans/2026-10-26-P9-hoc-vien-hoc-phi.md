# Kế hoạch P9 — Học viên, lớp học, học phí (3387), điểm danh, phân bổ doanh thu

## Context

P5 Kho hàng đã lên production (PR #8 → `main` `884e84f`; CI, `supabase-deploy`, Vercel đều xanh). Thầy chọn làm tiếp **P9 — phần riêng của Dương Sinh**.

Hiện AccEdu chỉ có:
- học viên là đối tượng có cờ `partners.is_student`;
- lớp là vụ việc (`jobs.kind = 'class'`);
- học phí lập tay bằng hóa đơn dịch vụ (HDV), ghi thẳng doanh thu 5113.

Chưa có danh sách lớp / ghi danh, chưa lập học phí hàng loạt, chưa biết học viên còn bao nhiêu buổi, và doanh thu đang dồn vào tháng thu tiền.

**Thầy đã chốt:**
- học phí thu trước ghi **Có 3387**, cuối tháng phân bổ sang 5113;
- mỗi lớp chọn cách tính **theo khóa (N buổi)** hoặc **theo tháng**;
- **HLV điểm danh trên điện thoại**.

Có sẵn để dùng lại:
- hóa đơn HDV và phiếu thu trừ hóa đơn (P4b: `invoice_id`, `open_invoices`, `rpt_aging`);
- màn hình công nợ phải thu trên mobile;
- nhập Excel (P2.5), loại chứng từ PK;
- TK 3387 / 5113 có ở cả TT99 và TT133.

**Chia 3 đợt**, mỗi đợt một PR, CI xanh thì hỏi Thầy "merge":
- **P9a:** học viên, lớp, ghi danh, lập học phí hàng loạt (Nợ 131 / Có 3387), thu học phí, thông báo học phí có VietQR, tình hình đóng học phí.
- **P9b:** vai trò HLV, điểm danh trên mobile, số buổi còn lại, phân bổ doanh thu 3387 → 5113 cuối tháng.
- **P9c (lập chi tiết sau):** lương HLV theo buổi dạy, nhắc học phí, AI hỏi đáp.

**Quy trình:**
- tách nhánh `claude/beautiful-pascal-y8xgxa` từ `origin/main` (`884e84f`);
- lưu kế hoạch vào `docs/plans/2026-10-26-P9-hoc-vien-hoc-phi.md`.

---

## Đợt P9a — chi tiết

### Quy tắc nghiệp vụ

- **Học viên** là đối tượng (`partners`, `is_student = true`), nên dùng chung được công nợ 131, phiếu thu và tuổi nợ. Hồ sơ thêm lưu ở `student_profiles`: ngày sinh, phụ huynh, SĐT phụ huynh, trường, cấp hiện tại (Tốt → Vua), ngày vào CLB.
- **Lớp** là một vụ việc kind `class`, để mọi bút toán học phí mang `job_id` của lớp; thông tin riêng lưu ở `classes`:
  - cấp (tot/ma/tuong/xe/hau/vua);
  - cách tính (`course` | `monthly`);
  - học phí;
  - số buổi mỗi khóa (với lớp theo khóa);
  - lịch học, địa điểm, HLV phụ trách.
- **Ghi danh** (`enrollments`): học viên vào lớp từ ngày nào, có thể giảm học phí riêng, trạng thái đang học / bảo lưu / kết thúc.
- **Lập học phí** (*Đào tạo › Học phí*):
  - Lớp theo tháng: chọn tháng → mỗi ghi danh còn hiệu lực trong tháng, chưa có phiếu học phí tháng đó, sinh một HDV.
  - Lớp theo khóa: sinh một HDV cho khóa khi ghi danh, hoặc khi gia hạn khóa mới.
  - HDV ghi Nợ 131 / **Có 3387**; `job_id` = lớp, đối tượng = học viên, thuế suất KCT; diễn giải "Học phí lớp … tháng MM/YYYY".
  - Có bước chạy thử (xem trước) và lập nguyên khối như các hàm `import_*`. Không lập trùng: mỗi ghi danh × kỳ chỉ một phiếu.
- **Thu học phí:**
  - Dùng lại phiếu thu / giấy báo có trừ vào hóa đơn (P4b).
  - Thêm nút **Thu** trên dòng học phí: tạo và ghi sổ PT (tiền mặt) hoặc BC (chuyển khoản) trừ đúng hóa đơn đó.
- **Thông báo học phí có VietQR:**
  - In / tải ảnh gửi phụ huynh, gồm số tiền, nội dung chuyển khoản "HP <mã HV> <số HĐ>" và mã VietQR.
  - Mã sinh tại máy theo chuẩn EMVCo / NAPAS, không gọi dịch vụ ngoài.
  - Tài khoản nhận lấy từ thông tin đơn vị: thêm ngân hàng (mã BIN), số tài khoản, tên chủ tài khoản.
- **Tình hình học phí:** theo lớp / học viên — đã lập, đã thu, còn nợ, quá hạn (dựa trên `open_invoices`).

### CSDL — `supabase/migrations/20261028000013_education.sql`

- **Bảng mới (có RLS theo `tenant_id`, touch, audit, realtime):**
  - `student_profiles (partner_id pk)`;
  - `classes (job_id pk)`;
  - `enrollments`;
  - `tuition_bills (enrollment_id, period_start, period_end, sessions, amount, invoice_id, unique (enrollment_id, period_start))`.
- **Bảng có sẵn:** `tenants` thêm `bank_bin`, `bank_account_no`, `bank_account_name`. Nếu đã có cột tương đương thì dùng lại.
- **Hàm:**
  - `save_class(p_tenant, p_class jsonb)`: tạo / cập nhật `jobs` kind class cùng `classes`;
  - `save_student`;
  - `import_students` (nhập Excel, nguyên khối);
  - `enroll(…)`;
  - `generate_tuition(p_tenant, p_period date, p_class uuid default null, p_dry_run, p_post)`: gọi `save_voucher` / `post_voucher`, trả danh sách để xem trước;
  - `pay_tuition(p_tenant, p_bills uuid[], p_method 'cash'|'bank', p_date)`;
  - `rpt_tuition_status(p_tenant, p_as_of, p_class default null)` (`security invoker`).
- **Quyền:**
  - lập / thu học phí: `can_post`;
  - danh mục: `can_edit_catalog`;
  - thu quyền `public` / `anon`.

### Core, API

- **Core:**
  - `packages/core/src/education/`: cấp học Tốt → Vua, `tuitionPeriods(enrollment, billing, month)`, kỳ học phí;
  - `vietqr.ts`: payload EMVCo + CRC16-CCITT, có test theo ví dụ chuẩn NAPAS;
  - schema `studentSchema`, `classSchema`, `enrollmentSchema`;
  - mẫu nhập Excel `students`.
- **API:**
  - kiểu, hàm và hook tương ứng;
  - `SYNC_TABLES` thêm các bảng mới.

### Web, mobile

- **Web:**
  - `education/students`: lưới, form hồ sơ, nhập Excel, mở tình hình học phí của học viên;
  - `education/classes`: lưới lớp và form; tab Học viên của lớp để ghi danh, kết thúc, bảo lưu;
  - `education/tuition`: chọn tháng / lớp → **Lập học phí** (xem trước rồi lập), danh sách học phí với trạng thái, nút Thu, **Thông báo học phí (VietQR)**, xuất Excel;
  - Thông tin đơn vị thêm tài khoản nhận học phí;
  - `modules.ts`: các mục `education/*` chuyển sang `ready`.
- **Mobile:** màn hình Học phí theo lớp — ai chưa đóng; xem mã VietQR để phụ huynh quét tại lớp. Dùng `react-native-qrcode-svg`; nếu bundle Expo không hỗ trợ thì dùng SVG tự vẽ từ ma trận QR của core.

### Kiểm thử P9a

- **CSDL `supabase/tests/education.test.ts`:**
  - lớp theo tháng: lập học phí tháng 11 cho 3 học viên → 3 HDV Nợ 131 / Có 3387, có `job_id`; chạy lại không trùng;
  - lớp theo khóa: ghi danh → học phí khóa; giảm học phí riêng;
  - `pay_tuition` → PT / BC trừ hóa đơn, công nợ về 0;
  - `rpt_tuition_status` khớp công nợ 131;
  - phân quyền.
- **Core:** VietQR (CRC, độ dài, ký tự tiếng Việt bị bỏ dấu), kỳ học phí.
- **E2E:**
  1. tạo lớp Tốt K12 (theo tháng, 600.000);
  2. nhập 2 học viên từ Excel và ghi danh;
  3. lập học phí tháng → 2 hóa đơn 600.000;
  4. thu tiền một học viên;
  5. tình hình học phí còn 1 học viên nợ;
  6. thông báo học phí có mã QR;
  7. chụp ảnh màn hình.

---

## Đợt P9b — chi tiết

- **Vai trò HLV (`coach`):**
  - thêm vào ràng buộc vai trò và Edge Function `admin-users`;
  - `app.is_member` **không tính HLV**, nên HLV không đọc được số liệu kế toán;
  - hàm mới `app.is_coach_of(class)`;
  - HLV chỉ thấy lớp mình phụ trách, danh sách học viên của lớp (qua RPC `coach_roster`), và được ghi điểm danh;
  - `my_tenants` / `tenants` cho HLV thấy tên đơn vị.
- **Điểm danh:**
  - bảng `class_sessions (class_id, held_on, topic, coach_user_id)` và `attendance (session_id, student_id, status present|absent|excused)`;
  - RPC `record_attendance(p_class, p_date, p_rows, p_topic)`.
  - Có mặt và vắng không phép đều trừ buổi; vắng có phép thì không trừ (được học bù).
- **Số buổi còn lại** (lớp theo khóa) = số buổi đã đóng − số buổi đã trừ; báo học viên sắp hết khóa (còn ≤ 2 buổi).
- **Phân bổ doanh thu** `allocate_tuition_revenue(p_tenant, p_month)`, *Đào tạo › Phân bổ doanh thu học phí*:
  - tạo một **PK** mỗi tháng, Nợ 3387 / Có 5113, chi tiết theo học viên × lớp;
  - lớp theo tháng: ghi nhận trọn học phí của tháng đó;
  - lớp theo khóa: học phí ÷ số buổi × số buổi đã trừ trong tháng; buổi cuối nhận phần dư làm tròn;
  - không phân bổ vượt số dư 3387 của từng phiếu học phí;
  - chạy lại thì thay PK cũ của tháng; kỳ đã khóa thì chặn.
  - Báo cáo đối chiếu: số dư 3387 theo học viên khớp sổ cái.
- **Mobile cho HLV:**
  - đăng nhập → *Lớp của tôi* → buổi hôm nay → danh sách học viên có ô có mặt / vắng / có phép;
  - lưu được khi mạng chập chờn (cache TanStack đã có).
- **Web:** trang Điểm danh (xem / sửa theo lớp, tháng), trang Phân bổ doanh thu.
- **Kiểm thử:**
  - CSDL: phân quyền HLV — không đọc được `vouchers` / `gl_entries`; phân bổ theo khóa và theo tháng; chạy lại thay PK; số dư 3387 về 0 khi học hết khóa.
  - E2E: tạo tài khoản HLV, HLV điểm danh, kế toán phân bổ tháng.

---

## Chung cho mỗi đợt

- Commit theo lớp: CSDL → Core / API → Web / Mobile → E2E / tài liệu.
- Trước khi push, chạy:
  - `pnpm check`;
  - `pnpm db:test`;
  - E2E trên Supabase local: `nohup dockerd`, `docker start` các container + edge runtime, `npx supabase db reset`, đặt biến `E2E_*`, `npx playwright test`.
- Đưa lên: PR mới → theo dõi, đặt lịch kiểm tra dự phòng → CI 4/4 + `supabase-deploy` xanh → **hỏi Thầy "merge"** → kiểm tra `main`, deploy, Vercel.
- **Tài liệu:**
  - `docs/huong-dan/hoc-vien-hoc-phi.md`: khai báo lớp, ghi danh, lập và thu học phí, VietQR, điểm danh, phân bổ;
  - ghi kết quả vào kế hoạch P9 và file tiến độ.
- **Tương thích:** chỉ thêm bảng, cột, hàm. Hóa đơn HDV cũ ghi 5113 giữ nguyên. Đổi `app.is_member` (P9b) chỉ ảnh hưởng vai trò mới `coach`.

---

## Kết quả đợt P9a (26/10/2026)

| Hạng mục | Trạng thái | Kiểm chứng |
|---|---|---|
| Migration 0013: học viên, lớp, ghi danh, lập học phí (Có 3387), thu học phí, tài khoản VietQR | Xong | Test CSDL `education.test.ts` (10 test); 87 test cũ giữ xanh |
| Core: cấp Tốt → Vua, VietQR (EMVCo + CRC-16), ma trận QR (`qrcode-generator` 2.0.4), mẫu nhập học viên | Xong | `education.test.ts` (7 test) |
| Web: Học viên, Lớp học & ghi danh, Học phí (lập / thu / thông báo VietQR), tài khoản nhận học phí | Xong | E2E 13/13 trên Supabase local |
| Mobile: màn hình Học phí, mã VietQR cho phụ huynh quét | Xong | Typecheck, bundle Expo trong CI |

**Test CSDL `education.test.ts` kiểm:**
- lớp theo tháng / theo khóa;
- nhập học viên từ Excel: lỗi theo dòng, ghi danh luôn;
- học phí riêng; chặn ghi danh trùng;
- chạy thử không ghi gì;
- lập học phí: HDV Nợ 131 / Có 3387 mang mã lớp; chạy lại không trùng;
- tháng sau: học viên đã kết thúc không lập, lớp khóa không lập lại;
- thu tiền mặt / chuyển khoản mỗi học viên một phiếu; học phí nháp được ghi sổ trước khi thu;
- số dư 3387 và 131 khớp;
- phân quyền;
- BIN ngân hàng hợp lệ.

**E2E:**
1. khai báo tài khoản nhận học phí;
2. tạo lớp TOT-K15 (600.000 / tháng);
3. dán 2 học viên từ Excel, ghi danh luôn;
4. lập học phí tháng: 2 phiếu, tổng 1.200.000, ghi sổ;
5. thu tiền mặt HV101 → PT;
6. thông báo học phí HV102 có VietQR, nội dung `HP HV102 DV…`;
7. tổng hợp công nợ HV102 còn 600.000.

**Khác kế hoạch:**
- Ghi danh, lớp, học viên chỉ ghi qua hàm (`save_*`), không mở ghi trực tiếp bảng.
- Lớp theo khóa lập học phí một lần cho mỗi ghi danh; gia hạn khóa mới bằng một ghi danh mới (tự động gia hạn sẽ làm ở P9b cùng số buổi còn lại).

Tổng số test: core 128, api 3, CSDL 97, E2E 13.

---

## Kết quả đợt P9b (26/10/2026)

| Hạng mục | Trạng thái | Kiểm chứng |
|---|---|---|
| Migration 0014: vai trò HLV, điểm danh, số buổi còn lại, gia hạn khóa, phân bổ doanh thu 3387 → 5113 | Xong | Test CSDL `attendance.test.ts` (6 test); 97 test cũ giữ xanh |
| Core: trạng thái điểm danh, `recognizeCourse` (chia học phí theo buổi, buổi cuối nhận phần dư), nhãn số buổi | Xong | `education.test.ts` (+2 test) |
| Web: vai trò HLV (chỉ thấy Điểm danh), Điểm danh (buổi + bảng tháng), Phân bổ doanh thu học phí, Lớp học (HLV điểm danh, số buổi, gia hạn khóa) | Xong | E2E 14/14 trên Supabase local |
| Mobile: HLV đăng nhập vào thẳng *Lớp của tôi* → điểm danh buổi hôm nay | Xong | Typecheck, bundle Expo trong CI |
| Edge Function `admin-users` nhận vai trò `coach` | Xong | E2E tạo tài khoản HLV |

**Test CSDL `attendance.test.ts` kiểm:**
- HLV thấy đơn vị (`my_tenants`) và lớp mình phụ trách; không đọc được `vouchers`, `voucher_lines`, `gl_entries`, `partners`, `accounts`, `tuition_bills`, `enrollments`, `classes`, `student_profiles`, `rpt_tuition_status`; không lập chứng từ, không xem danh sách người dùng; HLV khác không thấy lớp;
- điểm danh: ghi / sửa một buổi, HLV đọc được buổi học lớp mình; chặn ngày tương lai, học viên ngoài lớp, lớp không phụ trách, người chỉ xem; bỏ hết điểm danh thì xóa buổi;
- lớp khóa 3 buổi: vắng có phép không trừ; học vượt → *Vượt 1 buổi*; gia hạn khóa (ngày bắt đầu = buổi vượt đầu tiên) → khóa cũ còn 0, khóa mới đã học 1; lập học phí khóa mới;
- phân bổ: chạy thử không ghi; tháng 1: lớp tháng 2 × 600.000 + lớp khóa 666.667 (2/3 buổi); chạy lại thay phiếu, không nhân đôi; tháng 2: khóa cũ nhận nốt 333.333, khóa mới 333.333 (1/3 buổi); số dư 3387 = 666.667 khớp `rpt_deferred_tuition`;
- hóa đơn học phí đã phân bổ không bỏ ghi sổ được; tháng khóa sổ chặn phân bổ và sửa điểm danh; ma trận điểm danh tháng cho HLV.

**E2E** (nối tiếp kịch bản học phí P9a):
1. quản trị tạo tài khoản HLV, gán HLV điểm danh cho lớp TOT-K15;
2. HLV đăng nhập lần đầu, đổi mật khẩu → vào thẳng Điểm danh, menu chỉ có Đào tạo;
3. HLV điểm danh HV101 có mặt, HV102 có phép → bảng tháng ✓ / P; mở sổ cái bị chuyển về Điểm danh;
4. kế toán xem trước và lập phiếu phân bổ tháng: PK 1.200.000 vào 5113; học phí chờ phân bổ 0, khớp sổ cái 3387.

**Khác kế hoạch:**
- Không lưu `enrollment_id` trên dòng điểm danh: buổi đã trừ được gán lần lượt vào các khóa theo thứ tự vào lớp khi tính (`app.course_sessions`), nên sửa ngày ghi danh hay gia hạn sớm không làm lệch số buổi.
- Thêm `tuition_recognitions` (phân bổ theo phiếu học phí × tháng) để lập lại tháng không nhân đôi và đối chiếu 3387 theo học viên.
- Ngày "hôm nay" khi điểm danh tính theo giờ Việt Nam (`app.today_vn()`), máy chủ chạy UTC.

Tổng số test: core 130, api 3, CSDL 103, E2E 14.
