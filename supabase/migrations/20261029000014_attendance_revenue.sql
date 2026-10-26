-- AccEdu — P9b: Vai trò HLV, điểm danh, số buổi còn lại (lớp theo khóa), phân bổ doanh thu học phí 3387 → 5113.
--
-- Quy tắc:
--   Vai trò coach (HLV): chỉ thấy lớp mình phụ trách (classes.coach_user_id), danh sách học viên, điểm danh.
--     app.is_member / app.member_role không tính HLV → mọi bảng, hàm kế toán hiện có tự loại HLV.
--   Điểm danh: mỗi lớp mỗi ngày một buổi (class_sessions), mỗi học viên một trạng thái (attendance):
--     có mặt / vắng không phép → trừ buổi; vắng có phép → không trừ (học bù).
--   Lớp theo khóa: buổi đã trừ gán lần lượt vào các khóa (ghi danh) theo thứ tự vào lớp; còn lại = số buổi khóa − đã trừ.
--     Gia hạn khóa = kết thúc ghi danh cũ + ghi danh mới cùng học phí (generate_tuition lập học phí khóa mới).
--   Phân bổ doanh thu tháng: một phiếu kế toán (PK) Nợ 3387 / Có 5113, mỗi dòng một phiếu học phí (học viên × lớp):
--     lớp theo tháng: trọn học phí của tháng; lớp theo khóa: học phí × buổi đã trừ lũy kế / số buổi − phần đã phân bổ
--     (đủ buổi thì nhận nốt phần dư làm tròn); không vượt học phí. Chạy lại tháng: thay phiếu cũ. Tháng khóa sổ: chặn.

-- ---------------------------------------------------------------------------
-- Vai trò HLV
-- ---------------------------------------------------------------------------
alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships add constraint memberships_role_check
  check (role in ('owner', 'admin', 'chief_accountant', 'accountant', 'cashier', 'viewer', 'coach'));

-- HLV không phải "thành viên kế toán": không đọc được chứng từ, sổ sách, danh mục
create or replace function app.is_member(p_tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant and m.user_id = (select auth.uid()) and m.role <> 'coach'
  )
$$;

create or replace function app.member_role(p_tenant uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
  where m.tenant_id = p_tenant and m.user_id = (select auth.uid()) and m.role <> 'coach'
$$;

create or replace function app.is_coach(p_tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant and m.user_id = (select auth.uid()) and m.role = 'coach'
  )
$$;

-- HLV vẫn thấy tên đơn vị (my_tenants)
drop policy tenants_select on public.tenants;
create policy tenants_select on public.tenants for select to authenticated
  using (app.is_member(id) or app.is_coach(id));

create or replace function public.set_member(p_tenant uuid, p_email text, p_role text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_current text;
begin
  perform app.require(app.can_manage(p_tenant), 'Chỉ quản trị được phân quyền người dùng');
  if p_role not in ('admin', 'chief_accountant', 'accountant', 'cashier', 'viewer', 'coach') then
    raise exception 'Vai trò không hợp lệ: %', p_role;
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Email % chưa đăng ký tài khoản AccEdu', p_email using errcode = 'P0002';
  end if;
  select role into v_current from public.memberships where tenant_id = p_tenant and user_id = v_user;
  if v_current = 'owner' then
    raise exception 'Không thể đổi vai trò của chủ sở hữu' using errcode = '42501';
  end if;
  insert into public.memberships (tenant_id, user_id, role) values (p_tenant, v_user, p_role)
  on conflict (tenant_id, user_id) do update set role = excluded.role;
  return v_user;
end $$;

-- ---------------------------------------------------------------------------
-- HLV phụ trách lớp (tài khoản đăng nhập); coach_partner_id (nhân viên) giữ cho tính lương sau này
-- ---------------------------------------------------------------------------
alter table public.classes add column coach_user_id uuid references auth.users (id) on delete set null;
comment on column public.classes.coach_user_id is 'Tài khoản HLV điểm danh lớp (thành viên đơn vị, thường vai trò coach)';
create index classes_coach_user on public.classes (coach_user_id) where coach_user_id is not null;

create or replace function app.is_coach_of(p_tenant uuid, p_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.classes c
    join public.memberships m on m.tenant_id = c.tenant_id and m.user_id = c.coach_user_id
    where c.job_id = p_class and c.tenant_id = p_tenant and c.coach_user_id = (select auth.uid())
  )
$$;

-- Ghi điểm danh: HLV của lớp, hoặc người sửa được danh mục (quản trị, kế toán)
create or replace function app.can_attend(p_tenant uuid, p_class uuid)
returns boolean language sql stable set search_path = '' as $$
  select app.can_edit_catalog(p_tenant) or app.is_coach_of(p_tenant, p_class)
$$;

-- ---------------------------------------------------------------------------
-- Bảng
-- ---------------------------------------------------------------------------
create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  class_id uuid not null references public.classes (job_id) on delete cascade,
  held_on date not null,
  topic text,
  coach_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, held_on)
);
comment on table public.class_sessions is 'Buổi học: mỗi lớp mỗi ngày một buổi, ai điểm danh, nội dung';

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  student_id uuid not null references public.partners (id) on delete restrict,
  status text not null check (status in ('present', 'absent', 'excused')),
  note text,
  updated_at timestamptz not null default now(),
  unique (session_id, student_id)
);
comment on table public.attendance is 'Điểm danh: có mặt / vắng không phép (trừ buổi) / vắng có phép (không trừ, học bù)';
create index attendance_student on public.attendance (student_id);

create table public.tuition_recognitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  bill_id uuid not null references public.tuition_bills (id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  sessions integer,
  amount numeric(18, 2) not null check (amount > 0),
  voucher_id uuid not null references public.vouchers (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (bill_id, month)
);
comment on table public.tuition_recognitions is 'Học phí đã phân bổ vào doanh thu 5113 theo tháng (dòng của phiếu kế toán phân bổ)';
create index tuition_recognitions_voucher on public.tuition_recognitions (voucher_id);

create trigger class_sessions_touch before update on public.class_sessions for each row execute function app.touch_updated_at();
create trigger attendance_touch before update on public.attendance for each row execute function app.touch_updated_at();
create trigger class_sessions_audit after insert or update or delete on public.class_sessions for each row execute function app.audit();
create trigger attendance_audit after insert or update or delete on public.attendance for each row execute function app.audit();

alter table public.class_sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.tuition_recognitions enable row level security;
create policy class_sessions_select on public.class_sessions for select to authenticated
  using (app.is_member(tenant_id) or app.is_coach_of(tenant_id, class_id));
create policy attendance_select on public.attendance for select to authenticated
  using (app.is_member(tenant_id) or exists (
    select 1 from public.class_sessions s where s.id = attendance.session_id and app.is_coach_of(s.tenant_id, s.class_id)
  ));
create policy tuition_recognitions_select on public.tuition_recognitions for select to authenticated
  using (app.is_member(tenant_id));
-- Ghi qua record_attendance / allocate_tuition_revenue; không mở ghi trực tiếp

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.class_sessions, public.attendance, public.tuition_recognitions;
  end if;
end $$;

-- Hóa đơn học phí đã phân bổ doanh thu: không bỏ ghi sổ / xóa được (số dư 3387 sẽ âm)
create or replace function app.guard_tuition_invoice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_refs text;
begin
  if tg_op = 'UPDATE' and not (old.status = 'posted' and new.status <> 'posted') then
    return new;
  end if;
  -- Xóa cả đơn vị: bỏ qua
  if not exists (select 1 from public.tenants where id = old.tenant_id) then
    return old;
  end if;
  select string_agg(distinct pv.number, ', ') into v_refs
  from public.tuition_bills b
  join public.tuition_recognitions r on r.bill_id = b.id
  join public.vouchers pv on pv.id = r.voucher_id
  where b.invoice_id = old.id;
  if v_refs is not null then
    raise exception 'Hóa đơn học phí % đã phân bổ doanh thu ở phiếu % — xóa phiếu phân bổ đó trước', old.number, v_refs
      using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger vouchers_tuition_guard before update of status or delete on public.vouchers
  for each row when (old.voucher_type = 'HDV') execute function app.guard_tuition_invoice();

-- ---------------------------------------------------------------------------
-- Lớp học: thêm HLV phụ trách (coach_user_id)
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
begin
  perform app.require(app.can_edit_catalog(p_tenant), 'Bạn không có quyền sửa danh mục lớp học');
  if v_id is null and v_code = '' then raise exception 'Thiếu mã lớp' using errcode = 'P0001'; end if;
  if v_name = '' then raise exception 'Thiếu tên lớp' using errcode = 'P0001'; end if;
  if v_billing not in ('monthly', 'course') then raise exception 'Cách tính học phí không hợp lệ' using errcode = 'P0001'; end if;
  if v_billing = 'course' and coalesce(v_sessions, 0) <= 0 then
    raise exception 'Lớp tính theo khóa cần số buổi mỗi khóa' using errcode = 'P0001';
  end if;
  if v_fee < 0 then raise exception 'Học phí không được âm' using errcode = 'P0001'; end if;
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
                              coach_user_id, capacity)
  values (v_id, p_tenant, nullif(p_class ->> 'level', ''), v_billing, v_fee, case when v_billing = 'course' then v_sessions end,
          nullif(trim(p_class ->> 'schedule'), ''), nullif(trim(p_class ->> 'location'), ''), v_coach, v_coach_user,
          nullif(p_class ->> 'capacity', '')::integer)
  on conflict (job_id) do update set
    level = excluded.level, billing = excluded.billing, fee = excluded.fee, sessions_per_course = excluded.sessions_per_course,
    schedule = excluded.schedule, location = excluded.location, coach_partner_id = excluded.coach_partner_id,
    coach_user_id = case when p_class ? 'coach_user_id' then excluded.coach_user_id else public.classes.coach_user_id end,
    capacity = excluded.capacity;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Lớp theo khóa: các khóa (ghi danh) và buổi đã trừ gán vào từng khóa
-- ---------------------------------------------------------------------------
-- Khóa của học viên: số buổi theo phiếu học phí (thiếu thì theo lớp); bỏ ghi danh đã thôi học mà chưa lập học phí
create or replace function app.course_enrollments(p_tenant uuid, p_class uuid default null)
returns table (enrollment_id uuid, class_id uuid, student_id uuid, start_date date, status text, sessions integer,
               bill_id uuid, bill_amount numeric)
language sql stable set search_path = '' as $$
  select e.id, e.class_id, e.student_id, e.start_date, e.status, coalesce(b.sessions, c.sessions_per_course), b.id, b.amount
  from public.enrollments e
  join public.classes c on c.job_id = e.class_id and c.billing = 'course'
  left join lateral (
    select tb.id, tb.sessions, tb.amount from public.tuition_bills tb where tb.enrollment_id = e.id order by tb.period_start limit 1
  ) b on true
  where e.tenant_id = p_tenant and (p_class is null or e.class_id = p_class)
    and (e.status <> 'dropped' or b.id is not null)
$$;

-- Buổi đã trừ (có mặt / vắng không phép) đánh số theo ngày, gán lần lượt vào các khóa theo thứ tự vào lớp;
-- quá số buổi của khóa cuối → overflow (học vượt, cần gia hạn)
create or replace function app.course_sessions(p_tenant uuid, p_class uuid default null)
returns table (enrollment_id uuid, class_id uuid, student_id uuid, session_id uuid, held_on date, seq integer, overflow boolean)
language sql stable set search_path = '' as $$
  with ce as (
    select x.*,
           sum(x.sessions) over w - x.sessions as from_seq,
           sum(x.sessions) over w as to_seq,
           row_number() over (partition by x.class_id, x.student_id order by x.start_date desc, x.enrollment_id desc) = 1 as is_last
    from app.course_enrollments(p_tenant, p_class) x
    window w as (partition by x.class_id, x.student_id order by x.start_date, x.enrollment_id rows unbounded preceding)
  ), used as (
    select s.class_id, a.student_id, s.id as session_id, s.held_on,
           row_number() over (partition by s.class_id, a.student_id order by s.held_on, s.id)::integer as seq
    from public.attendance a
    join public.class_sessions s on s.id = a.session_id
    where s.tenant_id = p_tenant and a.status in ('present', 'absent') and (p_class is null or s.class_id = p_class)
  )
  select ce.enrollment_id, u.class_id, u.student_id, u.session_id, u.held_on, u.seq, u.seq > ce.to_seq
  from used u
  join ce on ce.class_id = u.class_id and ce.student_id = u.student_id
         and ((u.seq > ce.from_seq and u.seq <= ce.to_seq) or (ce.is_last and u.seq > ce.to_seq))
$$;

-- Số buổi còn lại của từng học viên trong một lớp theo khóa (tổng các khóa − đã trừ)
create or replace function app.course_remaining(p_tenant uuid, p_class uuid)
returns table (student_id uuid, sessions integer, used integer, remaining integer)
language sql stable set search_path = '' as $$
  with tot as (
    select ce.student_id, sum(ce.sessions)::integer as sessions from app.course_enrollments(p_tenant, p_class) ce group by ce.student_id
  ), u as (
    select a.student_id, count(*)::integer as used
    from public.attendance a join public.class_sessions s on s.id = a.session_id
    where s.tenant_id = p_tenant and s.class_id = p_class and a.status in ('present', 'absent')
    group by a.student_id
  )
  select t.student_id, t.sessions, coalesce(u.used, 0), t.sessions - coalesce(u.used, 0)
  from tot t left join u on u.student_id = t.student_id
$$;

-- Ngày đã khóa sổ (khóa chung hoặc khóa phiếu kế toán) → không sửa điểm danh (đã dùng để phân bổ doanh thu)
create or replace function app.attendance_locked(p_tenant uuid, p_date date)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_date <= (select max(locked_until) from public.period_locks
                             where tenant_id = p_tenant and voucher_type in ('*', 'PK')), false)
$$;

-- ---------------------------------------------------------------------------
-- Lớp của tôi: HLV thấy lớp mình phụ trách; thành viên kế toán thấy mọi lớp đang mở (is_mine = lớp mình dạy)
-- ---------------------------------------------------------------------------
create or replace function public.my_classes(p_tenant uuid)
returns table (class_id uuid, code text, name text, level text, billing text, sessions_per_course integer,
               schedule text, location text, students integer, last_held_on date, is_mine boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require(app.is_member(p_tenant) or app.is_coach(p_tenant), 'Bạn không thuộc đơn vị này');
  return query
    select c.job_id, j.code, j.name, c.level, c.billing, c.sessions_per_course, c.schedule, c.location,
           (select count(*)::integer from public.enrollments e where e.class_id = c.job_id and e.status = 'active'),
           (select max(s.held_on) from public.class_sessions s where s.class_id = c.job_id),
           coalesce(c.coach_user_id = (select auth.uid()), false)
    from public.classes c
    join public.jobs j on j.id = c.job_id
    where c.tenant_id = p_tenant and j.is_active
      and (app.is_member(p_tenant) or app.is_coach_of(p_tenant, c.job_id))
    order by coalesce(c.coach_user_id = (select auth.uid()), false) desc, j.code;
end $$;

-- ---------------------------------------------------------------------------
-- Danh sách học viên của lớp tại một ngày (để điểm danh) — không có số tiền
-- ---------------------------------------------------------------------------
create or replace function public.class_roster(p_tenant uuid, p_class uuid, p_date date default null)
returns table (student_id uuid, student_code text, student_name text, guardian_name text, guardian_phone text,
               enrollment_status text, status text, note text, sessions integer, used integer, remaining integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_date date := coalesce(p_date, current_date);
begin
  perform app.require(app.can_attend(p_tenant, p_class) or app.is_member(p_tenant), 'Bạn không phụ trách lớp này');
  return query
    with st as (
      select distinct on (e.student_id) e.student_id, e.status
      from public.enrollments e
      where e.class_id = p_class and e.tenant_id = p_tenant and e.status = 'active'
        and e.start_date <= v_date and (e.end_date is null or e.end_date >= v_date)
      order by e.student_id, e.start_date desc
    ), today as (
      select a.student_id, a.status, a.note
      from public.attendance a join public.class_sessions s on s.id = a.session_id
      where s.class_id = p_class and s.held_on = v_date
    ), ids as (
      select st.student_id from st union select today.student_id from today
    )
    select p.id, p.code, p.name, sp.guardian_name, sp.guardian_phone,
           coalesce(st.status, (select e.status from public.enrollments e where e.class_id = p_class and e.student_id = p.id
                                order by e.start_date desc limit 1)),
           t.status, t.note, cr.sessions, cr.used, cr.remaining
    from ids
    join public.partners p on p.id = ids.student_id
    left join public.student_profiles sp on sp.partner_id = p.id
    left join st on st.student_id = p.id
    left join today t on t.student_id = p.id
    left join app.course_remaining(p_tenant, p_class) cr on cr.student_id = p.id
    order by p.code;
end $$;

-- ---------------------------------------------------------------------------
-- Ghi điểm danh một buổi (upsert). p_rows: [{student_id, status: present|absent|excused|null, note}]
-- status null / rỗng = bỏ điểm danh học viên đó; buổi không còn ai thì xóa buổi.
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
begin
  perform app.require(app.can_attend(p_tenant, p_class), 'Bạn không phụ trách lớp này');
  if p_date is null then raise exception 'Chưa chọn ngày học' using errcode = 'P0001'; end if;
  if p_date > current_date then
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

  insert into public.class_sessions (tenant_id, class_id, held_on, topic, coach_user_id)
  values (p_tenant, p_class, p_date, nullif(trim(p_topic), ''), (select auth.uid()))
  on conflict (class_id, held_on) do update
    set topic = coalesce(excluded.topic, public.class_sessions.topic), coach_user_id = excluded.coach_user_id
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

-- ---------------------------------------------------------------------------
-- Gia hạn khóa: kết thúc ghi danh cũ, ghi danh mới cùng học phí. Ngày bắt đầu khóa mới mặc định:
-- buổi học vượt đầu tiên (nếu đã học quá khóa), không thì hôm nay.
-- ---------------------------------------------------------------------------
create or replace function public.renew_course(p_tenant uuid, p_enrollment uuid, p_start date default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  e public.enrollments;
  c public.classes;
  v_start date;
begin
  perform app.require(app.can_edit_catalog(p_tenant), 'Bạn không có quyền ghi danh học viên');
  select * into e from public.enrollments where id = p_enrollment and tenant_id = p_tenant;
  if not found then raise exception 'Không tìm thấy ghi danh' using errcode = 'P0001'; end if;
  select * into c from public.classes where job_id = e.class_id;
  if c.billing <> 'course' then raise exception 'Chỉ lớp tính theo khóa mới gia hạn khóa' using errcode = 'P0001'; end if;
  if e.status not in ('active', 'paused') then raise exception 'Ghi danh đã kết thúc' using errcode = 'P0001'; end if;

  v_start := coalesce(p_start,
    (select min(cs.held_on) from app.course_sessions(p_tenant, e.class_id) cs where cs.enrollment_id = e.id and cs.overflow),
    current_date);
  if v_start <= e.start_date then
    raise exception 'Ngày bắt đầu khóa mới phải sau ngày vào lớp %', to_char(e.start_date, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;

  perform public.save_enrollment(p_tenant, jsonb_build_object('status', 'finished', 'end_date', v_start - 1), e.id);
  return public.save_enrollment(p_tenant, jsonb_build_object(
    'class_id', e.class_id, 'student_id', e.student_id, 'start_date', v_start, 'fee', e.fee, 'note', 'Gia hạn khóa'));
end $$;

-- ---------------------------------------------------------------------------
-- Phân bổ doanh thu học phí tháng p_month: phiếu kế toán Nợ 3387 / Có 5113 (ngày cuối tháng)
-- ---------------------------------------------------------------------------
create or replace function public.allocate_tuition_revenue(
  p_tenant uuid, p_month date, p_post boolean default true, p_dry_run boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_label text := to_char(date_trunc('month', p_month), 'MM/YYYY');
  r record;
  v_old record;
  v_amount numeric;
  v_target numeric;
  v_desc text;
  v_lines jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_replaced text[] := '{}';
  v_total numeric := 0;
  v_n integer := 0;
  v_id uuid;
  v_number text;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền phân bổ doanh thu');
  if not exists (select 1 from public.accounts a where a.tenant_id = p_tenant and a.code = '3387' and a.is_active and a.is_postable)
     or not exists (select 1 from public.accounts a where a.tenant_id = p_tenant and a.code = '5113' and a.is_active and a.is_postable) then
    raise exception 'Cần TK 3387 và 5113 là tài khoản chi tiết đang dùng' using errcode = 'P0001';
  end if;
  perform app.assert_period_open(p_tenant, 'PK', v_end);

  begin
    -- Thay phiếu phân bổ cũ của tháng
    for v_old in
      select distinct v.id, v.number, v.status
      from public.tuition_recognitions tr join public.vouchers v on v.id = tr.voucher_id
      where tr.tenant_id = p_tenant and tr.month = v_start
    loop
      if v_old.status = 'posted' then perform public.unpost_voucher(v_old.id); end if;
      perform public.delete_voucher(v_old.id);
      v_replaced := v_replaced || v_old.number;
    end loop;

    for r in
      with bills as (
        select b.id as bill_id, b.amount, b.sessions, b.period_start, e.id as enrollment_id, e.class_id, e.student_id, c.billing,
               j.code as class_code, j.name as class_name, p.code as student_code, p.name as student_name, inv.number as invoice_number,
               coalesce((select sum(tr.amount) from public.tuition_recognitions tr join public.vouchers pv on pv.id = tr.voucher_id
                         where tr.bill_id = b.id and pv.status = 'posted'), 0) as recognized,
               coalesce((select sum(tr.amount) from public.tuition_recognitions tr join public.vouchers pv on pv.id = tr.voucher_id
                         where tr.bill_id = b.id and pv.status = 'posted' and tr.month < v_start), 0) as recognized_before
        from public.tuition_bills b
        join public.vouchers inv on inv.id = b.invoice_id and inv.status = 'posted' and inv.posting_date <= v_end
        join public.enrollments e on e.id = b.enrollment_id
        join public.classes c on c.job_id = e.class_id
        join public.jobs j on j.id = c.job_id
        join public.partners p on p.id = e.student_id
        where b.tenant_id = p_tenant
      ), usage as (
        select cs.enrollment_id,
               count(*) filter (where not cs.overflow and cs.held_on <= v_end)::integer as used_through,
               count(*) filter (where not cs.overflow and cs.held_on < v_start)::integer as used_before
        from app.course_sessions(p_tenant, null) cs
        group by cs.enrollment_id
      )
      select bl.*, coalesce(u.used_through, 0) as used_through, coalesce(u.used_before, 0) as used_before
      from bills bl left join usage u on u.enrollment_id = bl.enrollment_id
      where bl.recognized < bl.amount
      order by bl.class_code, bl.student_code, bl.period_start
    loop
      if r.billing = 'monthly' then
        continue when r.period_start > v_end;
        v_amount := r.amount - r.recognized;
        v_desc := format('Doanh thu học phí lớp %s tháng %s — %s', r.class_name, to_char(r.period_start, 'MM/YYYY'), r.student_code);
      else
        continue when coalesce(r.sessions, 0) <= 0;
        v_target := case when r.used_through >= r.sessions then r.amount else round(r.amount * r.used_through / r.sessions, 0) end;
        v_amount := greatest(0, least(r.amount - r.recognized, v_target - r.recognized_before));
        v_desc := format('Doanh thu học phí lớp %s — %s/%s buổi — %s', r.class_name, r.used_through, r.sessions, r.student_code);
      end if;
      continue when v_amount <= 0;
      v_n := v_n + 1;
      v_total := v_total + v_amount;
      v_lines := v_lines || jsonb_build_object('line_no', v_n, 'debit_account', '3387', 'credit_account', '5113', 'amount', v_amount,
        'partner_id', r.student_id, 'job_id', r.class_id, 'description', left(v_desc, 480));
      v_items := v_items || jsonb_build_object('bill_id', r.bill_id, 'class_id', r.class_id, 'class_code', r.class_code,
        'class_name', r.class_name, 'student_id', r.student_id, 'student_code', r.student_code, 'student_name', r.student_name,
        'billing', r.billing, 'period_start', r.period_start, 'invoice_number', r.invoice_number, 'bill_amount', r.amount,
        'recognized_before', r.recognized, 'amount', v_amount, 'remaining', r.amount - r.recognized - v_amount,
        'sessions', r.sessions,
        'used_in_month', case when r.billing = 'course' then r.used_through - r.used_before end,
        'used_through', case when r.billing = 'course' then r.used_through end);
    end loop;

    if v_n > 0 then
      v_id := public.save_voucher(jsonb_build_object(
        'tenant_id', p_tenant,
        'voucher_type', 'PK',
        'posting_date', v_end,
        'issue_date', v_end,
        'description', format('Phân bổ doanh thu học phí tháng %s (3387 → 5113)', v_label),
        'source', 'system',
        'lines', v_lines
      ), p_post);
      select v.number into v_number from public.vouchers v where v.id = v_id;
      insert into public.tuition_recognitions (tenant_id, bill_id, month, sessions, amount, voucher_id)
      select p_tenant, (it ->> 'bill_id')::uuid, v_start, (it ->> 'used_in_month')::integer, (it ->> 'amount')::numeric, v_id
      from jsonb_array_elements(v_items) it;
    end if;

    if p_dry_run then
      raise exception 'hoàn tác' using errcode = 'P0099';
    end if;
  exception when sqlstate 'P0099' then
    -- Chạy thử: phiếu phân bổ mới, việc thay phiếu cũ và bộ đếm số chứng từ đã được hoàn tác
    v_id := null;
    v_number := null;
  end;

  return jsonb_build_object(
    'ok', true, 'dry_run', p_dry_run, 'month', v_start, 'count', v_n, 'total', v_total,
    'voucher_id', v_id, 'number', v_number, 'posted', p_post and not p_dry_run and v_id is not null,
    'replaced', to_jsonb(v_replaced),
    'later_months', (select count(distinct tr.month)::integer from public.tuition_recognitions tr
                     where tr.tenant_id = p_tenant and tr.month > v_start),
    'items', v_items);
end $$;

-- ---------------------------------------------------------------------------
-- Báo cáo
-- ---------------------------------------------------------------------------
-- Số buổi của từng khóa (lớp theo khóa): đã đóng, đã học, vắng có phép, còn lại
create or replace function public.rpt_course_balance(p_tenant uuid, p_class uuid default null)
returns table (enrollment_id uuid, class_id uuid, class_code text, class_name text, student_id uuid, student_code text,
               student_name text, guardian_phone text, start_date date, end_date date, status text, sessions integer,
               used integer, excused integer, remaining integer, billed boolean, invoice_number text, last_held_on date)
language sql stable security invoker set search_path = '' as $$
  with ce as (
    select * from app.course_enrollments(p_tenant, p_class)
  ), u as (
    select cs.enrollment_id, count(*)::integer as used, max(cs.held_on) as last_held_on
    from app.course_sessions(p_tenant, p_class) cs group by cs.enrollment_id
  )
  select ce.enrollment_id, ce.class_id, j.code, j.name, ce.student_id, p.code, p.name, sp.guardian_phone,
         e.start_date, e.end_date, e.status, ce.sessions, coalesce(u.used, 0),
         (select count(*)::integer from public.attendance a join public.class_sessions s on s.id = a.session_id
          where s.class_id = ce.class_id and a.student_id = ce.student_id and a.status = 'excused'
            and s.held_on >= e.start_date and (e.end_date is null or s.held_on <= e.end_date)),
         ce.sessions - coalesce(u.used, 0), ce.bill_id is not null, inv.number, u.last_held_on
  from ce
  join public.enrollments e on e.id = ce.enrollment_id
  join public.jobs j on j.id = ce.class_id
  join public.partners p on p.id = ce.student_id
  left join public.student_profiles sp on sp.partner_id = ce.student_id
  left join u on u.enrollment_id = ce.enrollment_id
  left join public.tuition_bills b on b.id = ce.bill_id
  left join public.vouchers inv on inv.id = b.invoice_id
  order by j.code, p.code, e.start_date
$$;

-- Ma trận điểm danh tháng: học viên × buổi (học viên không có buổi nào → một dòng session_id null)
create or replace function public.rpt_attendance(p_tenant uuid, p_class uuid, p_month date)
returns table (student_id uuid, student_code text, student_name text, enrollment_status text, remaining integer,
               session_id uuid, held_on date, topic text, status text, note text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  perform app.require(app.is_member(p_tenant) or app.is_coach_of(p_tenant, p_class), 'Bạn không phụ trách lớp này');
  return query
    with ses as (
      select s.id, s.held_on, s.topic from public.class_sessions s
      where s.class_id = p_class and s.tenant_id = p_tenant and s.held_on between v_start and v_end
    ), st as (
      select e.student_id, (array_agg(e.status order by e.start_date desc))[1] as status
      from public.enrollments e
      where e.class_id = p_class and e.tenant_id = p_tenant and e.status <> 'dropped'
        and e.start_date <= v_end and (e.end_date is null or e.end_date >= v_start)
      group by e.student_id
      union
      select a.student_id, null from public.attendance a join ses on ses.id = a.session_id
    ), st1 as (
      select st.student_id, max(st.status) as status from st group by st.student_id
    )
    select p.id, p.code, p.name, st1.status, cr.remaining, ses.id, ses.held_on, ses.topic, a.status, a.note
    from st1
    join public.partners p on p.id = st1.student_id
    left join app.course_remaining(p_tenant, p_class) cr on cr.student_id = p.id
    left join ses on true
    left join public.attendance a on a.session_id = ses.id and a.student_id = p.id
    order by p.code, ses.held_on;
end $$;

-- Học phí chờ phân bổ (số dư 3387 theo phiếu học phí) đến ngày p_as_of — đối chiếu sổ cái TK 3387
create or replace function public.rpt_deferred_tuition(p_tenant uuid, p_as_of date default null)
returns table (bill_id uuid, class_id uuid, class_code text, class_name text, student_id uuid, student_code text,
               student_name text, billing text, period_start date, sessions integer, invoice_number text,
               amount numeric, recognized numeric, balance numeric)
language sql stable security invoker set search_path = '' as $$
  select b.id, c.job_id, j.code, j.name, p.id, p.code, p.name, c.billing, b.period_start, b.sessions, inv.number,
         b.amount, coalesce(r.amount, 0)::numeric(18, 2), (b.amount - coalesce(r.amount, 0))::numeric(18, 2)
  from public.tuition_bills b
  join public.vouchers inv on inv.id = b.invoice_id and inv.status = 'posted'
    and (p_as_of is null or inv.posting_date <= p_as_of)
  join public.enrollments e on e.id = b.enrollment_id
  join public.classes c on c.job_id = e.class_id
  join public.jobs j on j.id = c.job_id
  join public.partners p on p.id = e.student_id
  left join lateral (
    select sum(tr.amount) as amount
    from public.tuition_recognitions tr join public.vouchers pv on pv.id = tr.voucher_id
    where tr.bill_id = b.id and pv.status = 'posted' and (p_as_of is null or pv.posting_date <= p_as_of)
  ) r on true
  where b.tenant_id = p_tenant
  order by j.code, p.code, b.period_start
$$;

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------
revoke execute on function app.guard_tuition_invoice() from public, anon, authenticated;
revoke execute on function public.save_class(uuid, jsonb, uuid) from public, anon;
revoke execute on function public.my_classes(uuid) from public, anon;
revoke execute on function public.class_roster(uuid, uuid, date) from public, anon;
revoke execute on function public.record_attendance(uuid, uuid, date, jsonb, text) from public, anon;
revoke execute on function public.renew_course(uuid, uuid, date) from public, anon;
revoke execute on function public.allocate_tuition_revenue(uuid, date, boolean, boolean) from public, anon;
revoke execute on function public.rpt_course_balance(uuid, uuid) from public, anon;
revoke execute on function public.rpt_attendance(uuid, uuid, date) from public, anon;
revoke execute on function public.rpt_deferred_tuition(uuid, date) from public, anon;
grant execute on function app.is_coach(uuid), app.is_coach_of(uuid, uuid), app.can_attend(uuid, uuid),
  app.course_enrollments(uuid, uuid), app.course_sessions(uuid, uuid), app.course_remaining(uuid, uuid),
  app.attendance_locked(uuid, date) to authenticated, service_role;
grant execute on function public.save_class(uuid, jsonb, uuid) to authenticated;
grant execute on function public.my_classes(uuid) to authenticated;
grant execute on function public.class_roster(uuid, uuid, date) to authenticated;
grant execute on function public.record_attendance(uuid, uuid, date, jsonb, text) to authenticated;
grant execute on function public.renew_course(uuid, uuid, date) to authenticated;
grant execute on function public.allocate_tuition_revenue(uuid, date, boolean, boolean) to authenticated;
grant execute on function public.rpt_course_balance(uuid, uuid) to authenticated;
grant execute on function public.rpt_attendance(uuid, uuid, date) to authenticated;
grant execute on function public.rpt_deferred_tuition(uuid, date) to authenticated;
