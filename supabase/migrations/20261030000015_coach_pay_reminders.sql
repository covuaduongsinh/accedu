-- AccEdu — P9c-1: Lương HLV theo buổi dạy, email nhắc học phí (Vault + pg_cron).
--
-- Quy tắc:
--   HLV = đối tượng nhân viên + coach_profiles: nhân viên (Có 334) hoặc cộng tác viên (Có 331, khấu trừ 10% TNCN
--     khi tổng chi trả trong tháng từ 2.000.000 đ), đơn giá mỗi buổi; lớp có thể đặt đơn giá riêng (classes.coach_rate).
--   Buổi được trả lương = buổi học có điểm danh; người nhận = class_sessions.coach_partner_id (HLV điểm danh, không có thì
--     HLV phụ trách lớp; kế toán đổi được khi dạy thay).
--   Lập lương tháng: một phiếu kế toán (PK) Nợ 632 (vụ việc = lớp) / Có 334 hoặc 331; cộng tác viên: Nợ 331 / Có 3335.
--     Chạy thử, chạy lại thay phiếu cũ, tháng khóa sổ thì chặn.
--   Nhắc học phí qua email: Edge Function tuition-reminders (SMTP), cấu hình bí mật trong Supabase Vault (accedu_*);
--     pg_cron 8:00 giờ Việt Nam gọi function cho các đơn vị đã bật nhắc, đúng ngày nhắc.

-- ---------------------------------------------------------------------------
-- HLV: hồ sơ, đơn giá
-- ---------------------------------------------------------------------------
create table public.coach_profiles (
  partner_id uuid primary key references public.partners (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null default 'employee' check (kind in ('employee', 'contractor')),
  session_rate numeric(18, 2) check (session_rate >= 0),
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
comment on table public.coach_profiles is 'HLV: nhân viên (lương Có 334) / cộng tác viên (Có 331, khấu trừ TNCN 10%), đơn giá mỗi buổi, tài khoản đăng nhập';

alter table public.classes add column coach_rate numeric(18, 2) check (coach_rate >= 0);
comment on column public.classes.coach_rate is 'Đơn giá một buổi dạy của lớp (ghi đè đơn giá của HLV)';

alter table public.class_sessions add column coach_partner_id uuid references public.partners (id) on delete set null;
comment on column public.class_sessions.coach_partner_id is 'HLV nhận lương buổi này (dạy thay thì đổi)';
update public.class_sessions s set coach_partner_id = c.coach_partner_id
from public.classes c where c.job_id = s.class_id and s.coach_partner_id is null;

create table public.coach_pay (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  partner_id uuid not null references public.partners (id) on delete restrict,
  kind text not null check (kind in ('employee', 'contractor')),
  sessions integer not null,
  gross numeric(18, 2) not null,
  pit numeric(18, 2) not null default 0,
  voucher_id uuid not null references public.vouchers (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tenant_id, month, partner_id)
);
comment on table public.coach_pay is 'Lương HLV đã lập theo tháng (dòng của phiếu kế toán lương)';
create index coach_pay_voucher on public.coach_pay (voucher_id);

-- ---------------------------------------------------------------------------
-- Nhắc học phí qua email
-- ---------------------------------------------------------------------------
alter table public.tenants
  add column reminder_enabled boolean not null default false,
  add column reminder_days smallint[] not null default '{5,20}'
    check (cardinality(reminder_days) between 1 and 4 and 1 <= all (reminder_days) and 28 >= all (reminder_days)),
  add column reminder_reply_to text check (reminder_reply_to ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
comment on column public.tenants.reminder_days is 'Ngày trong tháng tự gửi email nhắc học phí (1–28), 8:00 giờ Việt Nam';

create table public.tuition_reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  student_id uuid references public.partners (id) on delete cascade,
  email text,
  amount numeric(18, 2),
  bill_ids uuid[],
  status text not null check (status in ('sent', 'failed', 'skipped')),
  error text,
  trigger text not null check (trigger in ('auto', 'manual', 'test')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.tuition_reminders is 'Nhật ký email nhắc học phí: gửi được / lỗi / bỏ qua (thiếu email)';
create index tuition_reminders_student on public.tuition_reminders (tenant_id, student_id, created_at desc);

create trigger coach_profiles_touch before update on public.coach_profiles for each row execute function app.touch_updated_at();
create trigger coach_profiles_audit after insert or update or delete on public.coach_profiles for each row execute function app.audit();

alter table public.coach_profiles enable row level security;
alter table public.coach_pay enable row level security;
alter table public.tuition_reminders enable row level security;
create policy coach_profiles_select on public.coach_profiles for select to authenticated using (app.is_member(tenant_id));
create policy coach_pay_select on public.coach_pay for select to authenticated using (app.is_member(tenant_id));
create policy tuition_reminders_select on public.tuition_reminders for select to authenticated using (app.is_member(tenant_id));
-- Ghi qua các hàm bên dưới; không mở ghi trực tiếp

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.coach_profiles, public.coach_pay, public.tuition_reminders;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Hồ sơ HLV: {kind, session_rate, user_id}
-- ---------------------------------------------------------------------------
create or replace function public.save_coach_profile(p_tenant uuid, p_partner uuid, p_row jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := coalesce(nullif(p_row ->> 'kind', ''), 'employee');
  v_rate numeric := nullif(p_row ->> 'session_rate', '')::numeric;
  v_user uuid := nullif(p_row ->> 'user_id', '')::uuid;
begin
  perform app.require(app.can_edit_catalog(p_tenant), 'Bạn không có quyền sửa danh mục HLV');
  if not exists (select 1 from public.partners where id = p_partner and tenant_id = p_tenant) then
    raise exception 'Không tìm thấy HLV' using errcode = 'P0001';
  end if;
  if v_kind not in ('employee', 'contractor') then raise exception 'Loại HLV không hợp lệ' using errcode = 'P0001'; end if;
  if v_rate < 0 then raise exception 'Đơn giá buổi không được âm' using errcode = 'P0001'; end if;
  if v_user is not null and not exists (select 1 from public.memberships where tenant_id = p_tenant and user_id = v_user) then
    raise exception 'Tài khoản đăng nhập không thuộc đơn vị' using errcode = 'P0001';
  end if;
  if v_user is not null and exists (
    select 1 from public.coach_profiles where tenant_id = p_tenant and user_id = v_user and partner_id <> p_partner
  ) then
    raise exception 'Tài khoản này đã gắn với HLV khác' using errcode = 'P0001';
  end if;

  update public.partners set is_employee = true where id = p_partner and not is_employee;
  insert into public.coach_profiles (partner_id, tenant_id, kind, session_rate, user_id)
  values (p_partner, p_tenant, v_kind, v_rate, v_user)
  on conflict (partner_id) do update set kind = excluded.kind, session_rate = excluded.session_rate, user_id = excluded.user_id;
  return p_partner;
end $$;

-- ---------------------------------------------------------------------------
-- Lớp học: thêm đơn giá buổi riêng của lớp (coach_rate)
-- ---------------------------------------------------------------------------
create or replace function public.save_class(p_tenant uuid, p_class jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_code text := upper(trim(coalesce(p_class ->> 'code', '')));
  v_name text := trim(coalesce(p_class ->> 'name', ''));
  v_billing text := coalesce(nullif(p_class ->> 'billing', ''), 'monthly');
  v_sessions integer := nullif(p_class ->> 'sessions_per_course', '')::integer;
  v_fee numeric := coalesce(nullif(p_class ->> 'fee', '')::numeric, 0);
  v_coach uuid := nullif(p_class ->> 'coach_partner_id', '')::uuid;
  v_coach_user uuid := nullif(p_class ->> 'coach_user_id', '')::uuid;
  v_rate numeric := nullif(p_class ->> 'coach_rate', '')::numeric;
begin
  perform app.require(app.can_edit_catalog(p_tenant), 'Bạn không có quyền sửa danh mục lớp học');
  if v_id is null and v_code = '' then raise exception 'Thiếu mã lớp' using errcode = 'P0001'; end if;
  if v_name = '' then raise exception 'Thiếu tên lớp' using errcode = 'P0001'; end if;
  if v_billing not in ('monthly', 'course') then raise exception 'Cách tính học phí không hợp lệ' using errcode = 'P0001'; end if;
  if v_billing = 'course' and coalesce(v_sessions, 0) <= 0 then
    raise exception 'Lớp tính theo khóa cần số buổi mỗi khóa' using errcode = 'P0001';
  end if;
  if v_fee < 0 then raise exception 'Học phí không được âm' using errcode = 'P0001'; end if;
  if v_rate < 0 then raise exception 'Đơn giá buổi dạy không được âm' using errcode = 'P0001'; end if;
  if not app.level_ok(nullif(p_class ->> 'level', '')) then raise exception 'Cấp không hợp lệ' using errcode = 'P0001'; end if;
  if v_coach is not null and not exists (select 1 from public.partners where id = v_coach and tenant_id = p_tenant) then
    raise exception 'HLV không thuộc đơn vị' using errcode = 'P0001';
  end if;
  if v_coach_user is not null and not exists (select 1 from public.memberships where tenant_id = p_tenant and user_id = v_coach_user) then
    raise exception 'Tài khoản HLV không thuộc đơn vị' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.jobs (tenant_id, code, name, kind, start_date, end_date, is_active)
    values (p_tenant, v_code, v_name, 'class', nullif(p_class ->> 'start_date', '')::date, nullif(p_class ->> 'end_date', '')::date,
            coalesce((p_class ->> 'is_active')::boolean, true))
    returning id into v_id;
  else
    update public.jobs set
      name = v_name, kind = 'class',
      start_date = nullif(p_class ->> 'start_date', '')::date,
      end_date = nullif(p_class ->> 'end_date', '')::date,
      is_active = coalesce((p_class ->> 'is_active')::boolean, is_active)
    where id = v_id and tenant_id = p_tenant;
    if not found then raise exception 'Không tìm thấy lớp' using errcode = 'P0001'; end if;
  end if;

  insert into public.classes (job_id, tenant_id, level, billing, fee, sessions_per_course, schedule, location, coach_partner_id,
                              coach_user_id, capacity, coach_rate)
  values (v_id, p_tenant, nullif(p_class ->> 'level', ''), v_billing, v_fee, case when v_billing = 'course' then v_sessions end,
          nullif(trim(p_class ->> 'schedule'), ''), nullif(trim(p_class ->> 'location'), ''), v_coach, v_coach_user,
          nullif(p_class ->> 'capacity', '')::integer, v_rate)
  on conflict (job_id) do update set
    level = excluded.level, billing = excluded.billing, fee = excluded.fee, sessions_per_course = excluded.sessions_per_course,
    schedule = excluded.schedule, location = excluded.location, coach_partner_id = excluded.coach_partner_id,
    coach_user_id = case when p_class ? 'coach_user_id' then excluded.coach_user_id else public.classes.coach_user_id end,
    capacity = excluded.capacity,
    coach_rate = case when p_class ? 'coach_rate' then excluded.coach_rate else public.classes.coach_rate end;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Điểm danh: gán HLV nhận lương cho buổi học (HLV điểm danh, không có thì HLV phụ trách lớp)
-- ---------------------------------------------------------------------------
create or replace function public.record_attendance(p_tenant uuid, p_class uuid, p_date date, p_rows jsonb, p_topic text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session uuid;
  v_bad text;
  v_saved integer := 0;
  v_removed integer := 0;
  x jsonb;
  v_status text;
  v_payee uuid;
begin
  perform app.require(app.can_attend(p_tenant, p_class), 'Bạn không phụ trách lớp này');
  if p_date is null then raise exception 'Chưa chọn ngày học' using errcode = 'P0001'; end if;
  if p_date > app.today_vn() then
    raise exception 'Chưa đến ngày học % — không điểm danh trước', to_char(p_date, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  if app.attendance_locked(p_tenant, p_date) then
    raise exception 'Số liệu đã khóa đến ngày % — không sửa điểm danh được', to_char(p_date, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Danh sách điểm danh không hợp lệ' using errcode = 'P0001'; end if;

  select string_agg(distinct coalesce(p.code, r.value ->> 'student_id'), ', ') into v_bad
  from jsonb_array_elements(p_rows) r
  left join public.partners p on p.id = nullif(r.value ->> 'student_id', '')::uuid and p.tenant_id = p_tenant
  where nullif(r.value ->> 'status', '') is not null and (
    nullif(r.value ->> 'status', '') not in ('present', 'absent', 'excused')
    or p.id is null
    or not exists (
      select 1 from public.enrollments e
      where e.class_id = p_class and e.student_id = p.id and e.start_date <= p_date and (e.end_date is null or e.end_date >= p_date)
    ));
  if v_bad is not null then
    raise exception 'Học viên % không học lớp này vào ngày % (hoặc trạng thái không hợp lệ)', v_bad, to_char(p_date, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;

  v_payee := coalesce(
    (select cp.partner_id from public.coach_profiles cp where cp.tenant_id = p_tenant and cp.user_id = (select auth.uid())),
    (select c.coach_partner_id from public.classes c where c.job_id = p_class));

  insert into public.class_sessions (tenant_id, class_id, held_on, topic, coach_user_id, coach_partner_id)
  values (p_tenant, p_class, p_date, nullif(trim(p_topic), ''), (select auth.uid()), v_payee)
  on conflict (class_id, held_on) do update
    set topic = coalesce(excluded.topic, public.class_sessions.topic), coach_user_id = excluded.coach_user_id,
        coach_partner_id = coalesce(public.class_sessions.coach_partner_id, excluded.coach_partner_id)
  returning id into v_session;

  for x in select r.value from jsonb_array_elements(p_rows) r loop
    v_status := nullif(x ->> 'status', '');
    if v_status is null then
      delete from public.attendance where session_id = v_session and student_id = (x ->> 'student_id')::uuid;
      if found then v_removed := v_removed + 1; end if;
    else
      insert into public.attendance (tenant_id, session_id, student_id, status, note)
      values (p_tenant, v_session, (x ->> 'student_id')::uuid, v_status, nullif(trim(x ->> 'note'), ''))
      on conflict (session_id, student_id) do update set status = excluded.status, note = excluded.note
      where public.attendance.status is distinct from excluded.status or public.attendance.note is distinct from excluded.note;
      v_saved := v_saved + 1;
    end if;
  end loop;

  if not exists (select 1 from public.attendance where session_id = v_session) then
    delete from public.class_sessions where id = v_session;
    v_session := null;
  end if;
  return jsonb_build_object('ok', true, 'session_id', v_session, 'saved', v_saved, 'removed', v_removed);
end $$;

-- Dạy thay: đổi HLV nhận lương của một buổi
create or replace function public.set_session_coach(p_tenant uuid, p_session uuid, p_partner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.class_sessions;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền đổi HLV của buổi học');
  select * into s from public.class_sessions where id = p_session and tenant_id = p_tenant;
  if not found then raise exception 'Không tìm thấy buổi học' using errcode = 'P0001'; end if;
  if app.attendance_locked(p_tenant, s.held_on) then
    raise exception 'Số liệu đã khóa đến ngày % — không đổi HLV được', to_char(s.held_on, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  if p_partner is not null and not exists (select 1 from public.partners where id = p_partner and tenant_id = p_tenant) then
    raise exception 'HLV không thuộc đơn vị' using errcode = 'P0001';
  end if;
  update public.class_sessions set coach_partner_id = p_partner where id = p_session;
end $$;

-- ---------------------------------------------------------------------------
-- Buổi dạy trong tháng theo HLV × lớp (dùng cho lập lương và xem trước)
-- ---------------------------------------------------------------------------
create or replace function app.coach_month_sessions(p_tenant uuid, p_month date)
returns table (partner_id uuid, class_id uuid, sessions integer, rate numeric, first_held date, last_held date)
language sql stable set search_path = '' as $$
  select s.coach_partner_id, s.class_id, count(*)::integer, coalesce(c.coach_rate, cp.session_rate), min(s.held_on), max(s.held_on)
  from public.class_sessions s
  join public.classes c on c.job_id = s.class_id
  left join public.coach_profiles cp on cp.partner_id = s.coach_partner_id
  where s.tenant_id = p_tenant
    and s.held_on between date_trunc('month', p_month)::date and (date_trunc('month', p_month) + interval '1 month - 1 day')::date
    and exists (select 1 from public.attendance a where a.session_id = s.id)
  group by s.coach_partner_id, s.class_id, coalesce(c.coach_rate, cp.session_rate)
$$;

-- TK chi tiết đầu tiên đang dùng trong danh sách (vd. 3341 ở TT99, 334 ở TT133)
create or replace function app.first_postable(p_tenant uuid, p_codes text[])
returns text language sql stable set search_path = '' as $$
  select a.code from public.accounts a
  join unnest(p_codes) with ordinality as c(code, ord) on c.code = a.code
  where a.tenant_id = p_tenant and a.is_active and a.is_postable
  order by c.ord limit 1
$$;

-- ---------------------------------------------------------------------------
-- Lập lương HLV tháng p_month: phiếu kế toán ngày cuối tháng
-- ---------------------------------------------------------------------------
create or replace function public.generate_coach_pay(
  p_tenant uuid, p_month date, p_post boolean default true, p_dry_run boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_label text := to_char(date_trunc('month', p_month), 'MM/YYYY');
  v_emp_acc text := app.first_postable(p_tenant, array['3341', '334']);
  v_missing text;
  v_unassigned jsonb;
  v_old record;
  r record;
  l record;
  v_lines jsonb := '[]'::jsonb;
  v_coaches jsonb := '[]'::jsonb;
  v_classes jsonb;
  v_replaced text[] := '{}';
  v_n integer := 0;
  v_pit numeric;
  v_gross_total numeric := 0;
  v_pit_total numeric := 0;
  v_id uuid;
  v_number text;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền lập lương HLV');
  if app.first_postable(p_tenant, array['632']) is null or v_emp_acc is null
     or app.first_postable(p_tenant, array['331']) is null or app.first_postable(p_tenant, array['3335']) is null then
    raise exception 'Cần TK 632, 334 (hoặc 3341), 331 và 3335 là tài khoản chi tiết đang dùng' using errcode = 'P0001';
  end if;
  perform app.assert_period_open(p_tenant, 'PK', v_end);

  select string_agg(distinct p.code || ' — ' || p.name, ', ') into v_missing
  from app.coach_month_sessions(p_tenant, v_start) ms join public.partners p on p.id = ms.partner_id
  where ms.rate is null;
  if v_missing is not null then
    raise exception 'Chưa có đơn giá buổi dạy của HLV: % (khai báo ở Lương HLV hoặc đơn giá riêng của lớp)', v_missing
      using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('session_id', s.id, 'class_code', j.code, 'held_on', s.held_on)
                            order by s.held_on, j.code), '[]'::jsonb)
  into v_unassigned
  from public.class_sessions s join public.jobs j on j.id = s.class_id
  where s.tenant_id = p_tenant and s.coach_partner_id is null and s.held_on between v_start and v_end
    and exists (select 1 from public.attendance a where a.session_id = s.id);

  begin
    -- Thay phiếu lương cũ của tháng
    for v_old in
      select distinct v.id, v.number, v.status
      from public.coach_pay cp join public.vouchers v on v.id = cp.voucher_id
      where cp.tenant_id = p_tenant and cp.month = v_start
    loop
      if v_old.status = 'posted' then perform public.unpost_voucher(v_old.id); end if;
      perform public.delete_voucher(v_old.id);
      v_replaced := v_replaced || v_old.number;
    end loop;

    for r in
      select ms.partner_id, p.code, p.name, coalesce(cp.kind, 'employee') as kind,
             sum(ms.sessions)::integer as sessions, sum(ms.sessions * ms.rate) as gross
      from app.coach_month_sessions(p_tenant, v_start) ms
      join public.partners p on p.id = ms.partner_id
      left join public.coach_profiles cp on cp.partner_id = ms.partner_id
      group by ms.partner_id, p.code, p.name, cp.kind
      order by p.code
    loop
      v_classes := '[]'::jsonb;
      for l in
        select ms.class_id, j.code as class_code, j.name as class_name, ms.sessions, ms.rate, ms.sessions * ms.rate as amount
        from app.coach_month_sessions(p_tenant, v_start) ms join public.jobs j on j.id = ms.class_id
        where ms.partner_id = r.partner_id
        order by j.code, ms.rate
      loop
        v_n := v_n + 1;
        v_lines := v_lines || jsonb_build_object('line_no', v_n, 'debit_account', '632',
          'credit_account', case when r.kind = 'contractor' then '331' else v_emp_acc end,
          'amount', l.amount, 'partner_id', r.partner_id, 'job_id', l.class_id,
          'description', left(format('Lương HLV %s lớp %s tháng %s: %s buổi × %s', r.name, l.class_code, v_label, l.sessions,
                                     app.fmt_amount(l.rate)), 480));
        v_classes := v_classes || jsonb_build_object('class_id', l.class_id, 'class_code', l.class_code, 'class_name', l.class_name,
          'sessions', l.sessions, 'rate', l.rate, 'amount', l.amount);
      end loop;
      v_pit := case when r.kind = 'contractor' and r.gross >= 2000000 then round(r.gross * 0.1, 0) else 0 end;
      if v_pit > 0 then
        v_n := v_n + 1;
        v_lines := v_lines || jsonb_build_object('line_no', v_n, 'debit_account', '331', 'credit_account', '3335',
          'amount', v_pit, 'partner_id', r.partner_id,
          'description', left(format('Khấu trừ thuế TNCN 10%% — %s tháng %s', r.name, v_label), 480));
      end if;
      v_gross_total := v_gross_total + r.gross;
      v_pit_total := v_pit_total + v_pit;
      v_coaches := v_coaches || jsonb_build_object('partner_id', r.partner_id, 'code', r.code, 'name', r.name, 'kind', r.kind,
        'sessions', r.sessions, 'gross', r.gross, 'pit', v_pit, 'net', r.gross - v_pit, 'classes', v_classes);
    end loop;

    if v_n > 0 then
      v_id := public.save_voucher(jsonb_build_object(
        'tenant_id', p_tenant,
        'voucher_type', 'PK',
        'posting_date', v_end,
        'issue_date', v_end,
        'description', format('Lương HLV tháng %s (theo buổi dạy)', v_label),
        'source', 'system',
        'lines', v_lines
      ), p_post);
      select v.number into v_number from public.vouchers v where v.id = v_id;
      insert into public.coach_pay (tenant_id, month, partner_id, kind, sessions, gross, pit, voucher_id)
      select p_tenant, v_start, (c ->> 'partner_id')::uuid, c ->> 'kind', (c ->> 'sessions')::integer,
             (c ->> 'gross')::numeric, (c ->> 'pit')::numeric, v_id
      from jsonb_array_elements(v_coaches) c;
    end if;

    if p_dry_run then
      raise exception 'hoàn tác' using errcode = 'P0099';
    end if;
  exception when sqlstate 'P0099' then
    -- Chạy thử: phiếu lương mới, việc thay phiếu cũ và bộ đếm số chứng từ đã được hoàn tác
    v_id := null;
    v_number := null;
  end;

  return jsonb_build_object(
    'ok', true, 'dry_run', p_dry_run, 'month', v_start,
    'gross', v_gross_total, 'pit', v_pit_total, 'net', v_gross_total - v_pit_total,
    'voucher_id', v_id, 'number', v_number, 'posted', p_post and not p_dry_run and v_id is not null,
    'replaced', to_jsonb(v_replaced), 'coaches', v_coaches, 'unassigned', v_unassigned);
end $$;

-- HLV xem số buổi mình dạy trong tháng (không có số tiền)
create or replace function public.my_coach_sessions(p_tenant uuid, p_month date)
returns table (class_id uuid, class_code text, class_name text, sessions integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_partner uuid;
begin
  perform app.require(app.is_member(p_tenant) or app.is_coach(p_tenant), 'Bạn không thuộc đơn vị này');
  select cp.partner_id into v_partner from public.coach_profiles cp where cp.tenant_id = p_tenant and cp.user_id = (select auth.uid());
  return query
    select s.class_id, j.code, j.name, count(*)::integer
    from public.class_sessions s join public.jobs j on j.id = s.class_id
    where s.tenant_id = p_tenant
      and s.held_on between date_trunc('month', p_month)::date and (date_trunc('month', p_month) + interval '1 month - 1 day')::date
      and (s.coach_partner_id = v_partner or (v_partner is null and s.coach_user_id = (select auth.uid())))
      and exists (select 1 from public.attendance a where a.session_id = s.id)
    group by s.class_id, j.code, j.name
    order by j.code;
end $$;

-- ---------------------------------------------------------------------------
-- Nhắc học phí: danh sách học viên còn nợ (cho Edge Function tuition-reminders)
-- ---------------------------------------------------------------------------
create or replace function app.is_service() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select auth.role()) = 'service_role', false)
$$;

create or replace function public.reminder_candidates(p_tenant uuid, p_student_ids uuid[] default null, p_as_of date default null)
returns table (student_id uuid, student_code text, student_name text, guardian_name text, email text, total numeric,
               bill_ids uuid[], items jsonb, last_auto_at timestamptz, last_sent_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_as_of date := coalesce(p_as_of, app.today_vn());
begin
  perform app.require(app.is_service() or app.can_post(p_tenant), 'Bạn không có quyền nhắc học phí');
  return query
    with open_bills as (
      select t.id as bill_id, e.student_id, j.name as class_name, c.billing, t.period_start, t.sessions, v.number,
             v.total_amount - coalesce((
               select sum(pl.amount) from public.voucher_lines pl join public.vouchers pv on pv.id = pl.voucher_id
               where pl.invoice_id = v.id and pv.status = 'posted'), 0) as remaining
      from public.tuition_bills t
      join public.vouchers v on v.id = t.invoice_id and v.status = 'posted' and v.posting_date <= v_as_of
      join public.enrollments e on e.id = t.enrollment_id
      join public.classes c on c.job_id = e.class_id
      join public.jobs j on j.id = c.job_id
      where t.tenant_id = p_tenant and (p_student_ids is null or e.student_id = any (p_student_ids))
    )
    select p.id, p.code, p.name, coalesce(sp.guardian_name, p.contact_name), nullif(trim(p.email), ''),
           sum(b.remaining), array_agg(b.bill_id order by b.period_start),
           jsonb_agg(jsonb_build_object('class_name', b.class_name, 'billing', b.billing, 'period_start', b.period_start,
                                        'sessions', b.sessions, 'invoice_number', b.number, 'remaining', b.remaining)
                     order by b.period_start, b.class_name),
           (select max(r.created_at) from public.tuition_reminders r
            where r.tenant_id = p_tenant and r.student_id = p.id and r.trigger = 'auto' and r.status = 'sent'),
           (select max(r.created_at) from public.tuition_reminders r
            where r.tenant_id = p_tenant and r.student_id = p.id and r.status = 'sent' and r.trigger <> 'test')
    from open_bills b
    join public.partners p on p.id = b.student_id
    left join public.student_profiles sp on sp.partner_id = p.id
    where b.remaining > 0
    group by p.id, p.code, p.name, sp.guardian_name, p.contact_name, p.email
    order by p.code;
end $$;

-- Ghi nhật ký gửi: [{student_id, email, amount, bill_ids, status, error}]
create or replace function public.log_tuition_reminders(p_tenant uuid, p_rows jsonb, p_trigger text default 'manual')
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  perform app.require(app.is_service() or app.can_post(p_tenant), 'Bạn không có quyền nhắc học phí');
  if p_trigger not in ('auto', 'manual', 'test') then raise exception 'Kiểu gửi không hợp lệ' using errcode = 'P0001'; end if;
  insert into public.tuition_reminders (tenant_id, student_id, email, amount, bill_ids, status, error, trigger, created_by)
  select p_tenant, nullif(x ->> 'student_id', '')::uuid, nullif(x ->> 'email', ''), nullif(x ->> 'amount', '')::numeric,
         (select array_agg(b::uuid) from jsonb_array_elements_text(coalesce(x -> 'bill_ids', '[]'::jsonb)) b),
         x ->> 'status', left(x ->> 'error', 500), p_trigger, (select auth.uid())
  from jsonb_array_elements(p_rows) x
  where (nullif(x ->> 'student_id', '') is null
         or exists (select 1 from public.partners p where p.id = (x ->> 'student_id')::uuid and p.tenant_id = p_tenant));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Đơn vị cần gửi nhắc tự động hôm nay (chỉ service role — gọi từ Edge Function chạy theo lịch)
create or replace function public.reminder_due_tenants(p_date date default null)
returns table (tenant_id uuid, name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require(app.is_service(), 'Chỉ dịch vụ hệ thống được gọi');
  return query
    select t.id, t.name from public.tenants t
    where t.reminder_enabled and extract(day from coalesce(p_date, app.today_vn()))::smallint = any (t.reminder_days)
    order by t.name;
end $$;

-- ---------------------------------------------------------------------------
-- Bí mật hệ thống trong Supabase Vault (accedu_*): chỉ service role đọc được (Edge Function)
-- ---------------------------------------------------------------------------
create or replace function public.system_secrets(p_names text[])
returns table (name text, value text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require(app.is_service(), 'Chỉ dịch vụ hệ thống được đọc cấu hình bí mật');
  if to_regclass('vault.decrypted_secrets') is null then
    return;
  end if;
  return query execute
    'select s.name::text, s.decrypted_secret::text from vault.decrypted_secrets s
     where s.name = any ($1) and s.name like ''accedu\_%'''
  using p_names;
end $$;

-- Ghi / cập nhật bí mật trong Vault (chỉ dùng khi triển khai — chạy bằng psql trên VPS, không cấp cho API)
create or replace function app.vault_set(p_name text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_name !~ '^accedu_[a-z0-9_]+$' then raise exception 'Tên bí mật không hợp lệ: %', p_name; end if;
  if to_regclass('vault.secrets') is null then raise exception 'Chưa có Supabase Vault'; end if;
  execute 'select id from vault.secrets where name = $1' into v_id using p_name;
  if v_id is null then
    execute 'select vault.create_secret($1, $2)' using p_value, p_name;
  else
    execute 'select vault.update_secret($1, $2)' using v_id, p_value;
  end if;
end $$;

-- Lịch nhắc học phí (pg_cron): gọi Edge Function với token trong Vault; thiếu cấu hình thì bỏ qua
create or replace function app.fire_tuition_reminders() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_token text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return;
  end if;
  execute 'select max(decrypted_secret) filter (where name = ''accedu_functions_url''),
                  max(decrypted_secret) filter (where name = ''accedu_cron_token'')
           from vault.decrypted_secrets where name in (''accedu_functions_url'', ''accedu_cron_token'')'
  into v_url, v_token;
  if v_url is null or v_token is null then
    return;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 60000)'
  using rtrim(v_url, '/') || '/functions/v1/tuition-reminders',
        jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', v_token),
        jsonb_build_object('trigger', 'auto');
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    begin
      create extension if not exists pg_net;
      create extension if not exists pg_cron;
      -- 01:00 UTC = 8:00 giờ Việt Nam
      execute $sql$select cron.schedule('accedu-tuition-reminders', '0 1 * * *', 'select app.fire_tuition_reminders()')$sql$;
    exception when others then
      raise notice 'Bỏ qua lịch nhắc học phí tự động (pg_cron/pg_net): %', sqlerrm;
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------
revoke execute on function public.save_coach_profile(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.save_class(uuid, jsonb, uuid) from public, anon;
revoke execute on function public.record_attendance(uuid, uuid, date, jsonb, text) from public, anon;
revoke execute on function public.set_session_coach(uuid, uuid, uuid) from public, anon;
revoke execute on function public.generate_coach_pay(uuid, date, boolean, boolean) from public, anon;
revoke execute on function public.my_coach_sessions(uuid, date) from public, anon;
revoke execute on function public.reminder_candidates(uuid, uuid[], date) from public, anon;
revoke execute on function public.log_tuition_reminders(uuid, jsonb, text) from public, anon;
revoke execute on function public.reminder_due_tenants(date) from public, anon, authenticated;
revoke execute on function public.system_secrets(text[]) from public, anon, authenticated;
revoke execute on function app.fire_tuition_reminders() from public, anon, authenticated;
revoke execute on function app.vault_set(text, text) from public, anon, authenticated, service_role;
grant execute on function app.coach_month_sessions(uuid, date), app.first_postable(uuid, text[]), app.is_service()
  to authenticated, service_role;
grant execute on function public.save_coach_profile(uuid, uuid, jsonb) to authenticated;
grant execute on function public.save_class(uuid, jsonb, uuid) to authenticated;
grant execute on function public.record_attendance(uuid, uuid, date, jsonb, text) to authenticated;
grant execute on function public.set_session_coach(uuid, uuid, uuid) to authenticated;
grant execute on function public.generate_coach_pay(uuid, date, boolean, boolean) to authenticated;
grant execute on function public.my_coach_sessions(uuid, date) to authenticated;
grant execute on function public.reminder_candidates(uuid, uuid[], date) to authenticated, service_role;
grant execute on function public.log_tuition_reminders(uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.reminder_due_tenants(date) to service_role;
grant execute on function public.system_secrets(text[]) to service_role;
