-- AccEdu — P9a: Học viên, lớp học, ghi danh, học phí thu trước (Có 3387), thu học phí, tài khoản nhận VietQR.
--
-- Quy tắc:
--   Học viên = đối tượng (partners.is_student) + hồ sơ student_profiles → dùng chung công nợ 131, phiếu thu, tuổi nợ.
--   Lớp = vụ việc (jobs.kind = 'class') + classes → mọi bút toán học phí mang job_id của lớp.
--   Lớp tính học phí theo tháng (monthly) hoặc theo khóa N buổi (course).
--   Lập học phí sinh hóa đơn dịch vụ (HDV): Nợ 131 / Có 3387 (doanh thu chưa thực hiện), thuế KCT;
--     mỗi ghi danh × kỳ chỉ một phiếu (tuition_bills). Phân bổ 3387 → 5113 làm ở P9b.
--   Thu học phí: phiếu thu (tiền mặt) / giấy báo có (chuyển khoản) trừ đúng hóa đơn học phí.

-- ---------------------------------------------------------------------------
-- Tài khoản nhận học phí (VietQR)
-- ---------------------------------------------------------------------------
alter table public.tenants
  add column bank_bin text check (bank_bin ~ '^[0-9]{6}$'),
  add column bank_account_no text check (bank_account_no ~ '^[0-9A-Za-z]{1,19}$'),
  add column bank_account_name text;
comment on column public.tenants.bank_bin is 'Mã ngân hàng (BIN NAPAS, 6 số) của tài khoản nhận học phí — dùng sinh mã VietQR';

-- ---------------------------------------------------------------------------
-- Bảng
-- ---------------------------------------------------------------------------
create table public.student_profiles (
  partner_id uuid primary key references public.partners (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  birth_date date,
  gender text check (gender in ('M', 'F')),
  guardian_name text,
  guardian_phone text,
  school text,
  level text check (level in ('tot', 'ma', 'tuong', 'xe', 'hau', 'vua')),
  joined_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.student_profiles is 'Hồ sơ học viên (đối tượng partners.is_student): ngày sinh, phụ huynh, trường, cấp Tốt → Vua';

create table public.classes (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  level text check (level in ('tot', 'ma', 'tuong', 'xe', 'hau', 'vua')),
  billing text not null default 'monthly' check (billing in ('monthly', 'course')),
  fee numeric(18, 2) not null default 0 check (fee >= 0),
  sessions_per_course integer check (sessions_per_course > 0),
  schedule text,
  location text,
  coach_partner_id uuid references public.partners (id) on delete set null,
  capacity integer check (capacity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (billing <> 'course' or sessions_per_course is not null)
);
comment on table public.classes is 'Lớp học = vụ việc kind class: cấp, cách tính học phí (theo tháng / theo khóa N buổi), lịch, HLV';

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  class_id uuid not null references public.classes (job_id) on delete restrict,
  student_id uuid not null references public.partners (id) on delete restrict,
  start_date date not null,
  end_date date,
  status text not null default 'active' check (status in ('active', 'paused', 'finished', 'dropped')),
  fee numeric(18, 2) check (fee >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, student_id, start_date),
  check (end_date is null or end_date >= start_date)
);
comment on column public.enrollments.fee is 'Học phí riêng của học viên (giảm, miễn); trống = theo lớp';
create index enrollments_student on public.enrollments (student_id);

create table public.tuition_bills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete restrict,
  period_start date not null,
  period_end date,
  sessions integer,
  amount numeric(18, 2) not null,
  invoice_id uuid not null references public.vouchers (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (enrollment_id, period_start)
);
comment on table public.tuition_bills is 'Học phí đã lập: mỗi ghi danh × kỳ (tháng / khóa) một hóa đơn dịch vụ Nợ 131 / Có 3387';
create index tuition_bills_invoice on public.tuition_bills (invoice_id);

create trigger student_profiles_touch before update on public.student_profiles for each row execute function app.touch_updated_at();
create trigger classes_touch before update on public.classes for each row execute function app.touch_updated_at();
create trigger enrollments_touch before update on public.enrollments for each row execute function app.touch_updated_at();
create trigger student_profiles_audit after insert or update or delete on public.student_profiles for each row execute function app.audit();
create trigger classes_audit after insert or update or delete on public.classes for each row execute function app.audit();
create trigger enrollments_audit after insert or update or delete on public.enrollments for each row execute function app.audit();

alter table public.student_profiles enable row level security;
alter table public.classes enable row level security;
alter table public.enrollments enable row level security;
alter table public.tuition_bills enable row level security;
create policy student_profiles_select on public.student_profiles for select to authenticated using (app.is_member(tenant_id));
create policy classes_select on public.classes for select to authenticated using (app.is_member(tenant_id));
create policy enrollments_select on public.enrollments for select to authenticated using (app.is_member(tenant_id));
create policy tuition_bills_select on public.tuition_bills for select to authenticated using (app.is_member(tenant_id));
-- Ghi qua các hàm save_* / generate_tuition (kiểm tra nghiệp vụ); không mở ghi trực tiếp

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.student_profiles, public.classes, public.enrollments, public.tuition_bills;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Tiện ích
-- ---------------------------------------------------------------------------
create or replace function app.level_ok(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p is null or p in ('tot', 'ma', 'tuong', 'xe', 'hau', 'vua')
$$;

-- ---------------------------------------------------------------------------
-- Học viên: đối tượng + hồ sơ (một giao dịch)
-- p_student: {code, name, phone, email, address, birth_date, gender, guardian_name, guardian_phone, school, level,
--             joined_on, note, is_active}
-- ---------------------------------------------------------------------------
create or replace function public.save_student(p_tenant uuid, p_student jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_code text := upper(trim(coalesce(p_student ->> 'code', '')));
  v_name text := trim(coalesce(p_student ->> 'name', ''));
  v_level text := nullif(trim(p_student ->> 'level'), '');
begin
  perform app.require(app.can_edit_catalog(p_tenant), 'Bạn không có quyền sửa danh mục học viên');
  if v_id is null and v_code = '' then raise exception 'Thiếu mã học viên' using errcode = 'P0001'; end if;
  if length(v_code) > 16 then raise exception 'Mã học viên tối đa 16 ký tự' using errcode = 'P0001'; end if;
  if v_name = '' then raise exception 'Thiếu họ tên học viên' using errcode = 'P0001'; end if;
  if not app.level_ok(v_level) then raise exception 'Cấp không hợp lệ: %', v_level using errcode = 'P0001'; end if;

  if v_id is null then
    insert into public.partners (tenant_id, code, name, phone, email, address, note, is_customer, is_student, contact_name)
    values (p_tenant, v_code, v_name, nullif(trim(p_student ->> 'phone'), ''), nullif(trim(p_student ->> 'email'), ''),
            nullif(trim(p_student ->> 'address'), ''), nullif(trim(p_student ->> 'note'), ''), true, true,
            nullif(trim(p_student ->> 'guardian_name'), ''))
    returning id into v_id;
  else
    update public.partners set
      name = v_name,
      phone = nullif(trim(p_student ->> 'phone'), ''),
      email = nullif(trim(p_student ->> 'email'), ''),
      address = nullif(trim(p_student ->> 'address'), ''),
      note = nullif(trim(p_student ->> 'note'), ''),
      contact_name = nullif(trim(p_student ->> 'guardian_name'), ''),
      is_student = true,
      is_active = coalesce((p_student ->> 'is_active')::boolean, is_active)
    where id = v_id and tenant_id = p_tenant;
    if not found then raise exception 'Không tìm thấy học viên' using errcode = 'P0001'; end if;
  end if;

  insert into public.student_profiles (partner_id, tenant_id, birth_date, gender, guardian_name, guardian_phone, school, level, joined_on)
  values (v_id, p_tenant, nullif(p_student ->> 'birth_date', '')::date, nullif(p_student ->> 'gender', ''),
          nullif(trim(p_student ->> 'guardian_name'), ''), nullif(trim(p_student ->> 'guardian_phone'), ''),
          nullif(trim(p_student ->> 'school'), ''), v_level, coalesce(nullif(p_student ->> 'joined_on', '')::date, current_date))
  on conflict (partner_id) do update set
    birth_date = excluded.birth_date, gender = excluded.gender, guardian_name = excluded.guardian_name,
    guardian_phone = excluded.guardian_phone, school = excluded.school, level = excluded.level,
    joined_on = coalesce(nullif(p_student ->> 'joined_on', '')::date, public.student_profiles.joined_on);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Lớp học: vụ việc kind class + thông tin lớp
-- p_class: {code, name, level, billing, fee, sessions_per_course, schedule, location, coach_partner_id, capacity,
--           start_date, end_date, is_active}
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

  insert into public.classes (job_id, tenant_id, level, billing, fee, sessions_per_course, schedule, location, coach_partner_id, capacity)
  values (v_id, p_tenant, nullif(p_class ->> 'level', ''), v_billing, v_fee, case when v_billing = 'course' then v_sessions end,
          nullif(trim(p_class ->> 'schedule'), ''), nullif(trim(p_class ->> 'location'), ''), v_coach,
          nullif(p_class ->> 'capacity', '')::integer)
  on conflict (job_id) do update set
    level = excluded.level, billing = excluded.billing, fee = excluded.fee, sessions_per_course = excluded.sessions_per_course,
    schedule = excluded.schedule, location = excluded.location, coach_partner_id = excluded.coach_partner_id,
    capacity = excluded.capacity;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Ghi danh: {class_id, student_id, start_date, end_date, status, fee, note}
-- ---------------------------------------------------------------------------
create or replace function public.save_enrollment(p_tenant uuid, p_row jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_class uuid := nullif(p_row ->> 'class_id', '')::uuid;
  v_student uuid := nullif(p_row ->> 'student_id', '')::uuid;
  v_status text := coalesce(nullif(p_row ->> 'status', ''), 'active');
  v_old public.enrollments;
begin
  perform app.require(app.can_edit_catalog(p_tenant), 'Bạn không có quyền ghi danh học viên');
  if v_id is not null then
    select * into v_old from public.enrollments where id = v_id and tenant_id = p_tenant;
    if not found then raise exception 'Không tìm thấy ghi danh' using errcode = 'P0001'; end if;
    v_class := coalesce(v_class, v_old.class_id);
    v_student := coalesce(v_student, v_old.student_id);
    if (v_class <> v_old.class_id or v_student <> v_old.student_id)
       and exists (select 1 from public.tuition_bills where enrollment_id = v_id) then
      raise exception 'Ghi danh đã lập học phí — không đổi được lớp / học viên' using errcode = 'P0001';
    end if;
  end if;
  if not exists (select 1 from public.classes where job_id = v_class and tenant_id = p_tenant) then
    raise exception 'Chưa chọn lớp' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.partners where id = v_student and tenant_id = p_tenant and is_student) then
    raise exception 'Chưa chọn học viên' using errcode = 'P0001';
  end if;
  if v_status not in ('active', 'paused', 'finished', 'dropped') then
    raise exception 'Trạng thái không hợp lệ' using errcode = 'P0001';
  end if;
  if v_status in ('active', 'paused') and exists (
    select 1 from public.enrollments e
    where e.class_id = v_class and e.student_id = v_student and e.status in ('active', 'paused') and e.id is distinct from v_id
  ) then
    raise exception 'Học viên đang học lớp này' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.enrollments (tenant_id, class_id, student_id, start_date, end_date, status, fee, note)
    values (p_tenant, v_class, v_student, coalesce(nullif(p_row ->> 'start_date', '')::date, current_date),
            nullif(p_row ->> 'end_date', '')::date, v_status, nullif(p_row ->> 'fee', '')::numeric, nullif(trim(p_row ->> 'note'), ''))
    returning id into v_id;
  else
    update public.enrollments set
      class_id = v_class, student_id = v_student,
      start_date = coalesce(nullif(p_row ->> 'start_date', '')::date, start_date),
      end_date = case when p_row ? 'end_date' then nullif(p_row ->> 'end_date', '')::date else end_date end,
      status = v_status,
      fee = case when p_row ? 'fee' then nullif(p_row ->> 'fee', '')::numeric else fee end,
      note = case when p_row ? 'note' then nullif(trim(p_row ->> 'note'), '') else note end
    where id = v_id;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Nhập học viên từ Excel (nguyên khối): mỗi dòng {row, code, name, birth_date, guardian_name, guardian_phone, phone,
--   school, level, address, class_code, start_date}. Có mã lớp thì ghi danh luôn (nếu chưa đang học lớp đó).
-- ---------------------------------------------------------------------------
create or replace function public.import_students(p_tenant uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  x jsonb;
  i integer := 0;
  v_row integer;
  v_errors jsonb := '[]'::jsonb;
  v_codes text[] := '{}';
  v_code text;
  v_class uuid;
  v_id uuid;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_enrolled integer := 0;
begin
  perform app.require(app.can_edit_catalog(p_tenant), 'Bạn không có quyền sửa danh mục học viên');
  perform app.import_check_rows(p_rows);

  for x in select e.value from jsonb_array_elements(p_rows) as e loop
    i := i + 1;
    v_row := coalesce((x ->> 'row')::integer, i);
    v_code := upper(trim(coalesce(x ->> 'code', '')));
    if v_code = '' then
      v_errors := v_errors || jsonb_build_object('row', v_row, 'message', 'Thiếu mã học viên');
    elsif length(v_code) > 16 then
      v_errors := v_errors || jsonb_build_object('row', v_row, 'message', 'Mã học viên tối đa 16 ký tự');
    elsif v_code = any (v_codes) then
      v_errors := v_errors || jsonb_build_object('row', v_row, 'message', format('Trùng mã %s trong tệp', v_code));
    elsif coalesce(trim(x ->> 'name'), '') = '' then
      v_errors := v_errors || jsonb_build_object('row', v_row, 'message', 'Thiếu họ tên học viên');
    elsif not app.level_ok(nullif(trim(x ->> 'level'), '')) then
      v_errors := v_errors || jsonb_build_object('row', v_row, 'message', 'Cấp phải là tot, ma, tuong, xe, hau hoặc vua');
    elsif nullif(x ->> 'birth_date', '') !~ '^\d{4}-\d{2}-\d{2}$' or nullif(x ->> 'start_date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      v_errors := v_errors || jsonb_build_object('row', v_row, 'message', 'Ngày không hợp lệ');
    elsif nullif(trim(x ->> 'class_code'), '') is not null and not exists (
      select 1 from public.classes c join public.jobs j on j.id = c.job_id
      where c.tenant_id = p_tenant and upper(j.code) = upper(trim(x ->> 'class_code'))
    ) then
      v_errors := v_errors || jsonb_build_object('row', v_row, 'message', format('Chưa có lớp %s', trim(x ->> 'class_code')));
    elsif exists (select 1 from public.partners p where p.tenant_id = p_tenant and upper(p.code) = v_code and not p.is_student) then
      v_errors := v_errors || jsonb_build_object('row', v_row, 'message', format('Mã %s đã dùng cho đối tượng không phải học viên', v_code));
    end if;
    v_codes := v_codes || v_code;
  end loop;
  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', app.import_errors(v_errors));
  end if;

  i := 0;
  for x in select e.value from jsonb_array_elements(p_rows) as e loop
    i := i + 1;
    v_code := upper(trim(x ->> 'code'));
    select id into v_id from public.partners where tenant_id = p_tenant and upper(code) = v_code;
    if v_id is null then v_inserted := v_inserted + 1; else v_updated := v_updated + 1; end if;
    v_id := public.save_student(p_tenant, x || jsonb_build_object('code', v_code,
      'phone', coalesce(nullif(trim(x ->> 'phone'), ''), nullif(trim(x ->> 'guardian_phone'), ''))), v_id);
    v_class := null;
    if nullif(trim(x ->> 'class_code'), '') is not null then
      select c.job_id into v_class from public.classes c join public.jobs j on j.id = c.job_id
      where c.tenant_id = p_tenant and upper(j.code) = upper(trim(x ->> 'class_code'));
      if not exists (
        select 1 from public.enrollments e where e.class_id = v_class and e.student_id = v_id and e.status in ('active', 'paused')
      ) then
        perform public.save_enrollment(p_tenant, jsonb_build_object('class_id', v_class, 'student_id', v_id,
          'start_date', coalesce(nullif(x ->> 'start_date', ''), current_date::text)));
        v_enrolled := v_enrolled + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'inserted', v_inserted, 'updated', v_updated, 'enrolled', v_enrolled);
end $$;

-- ---------------------------------------------------------------------------
-- Lập học phí kỳ p_month:
--   lớp theo tháng: mỗi ghi danh đang học trong tháng → học phí tháng (kỳ = tháng);
--   lớp theo khóa: ghi danh chưa có học phí nào, bắt đầu học trước hết tháng → học phí khóa (kỳ = từ ngày vào lớp).
-- Hóa đơn dịch vụ (HDV) Nợ 131 / Có 3387, thuế KCT, vụ việc = lớp. Không lập trùng ghi danh × kỳ.
-- p_dry_run: chạy thử (không ghi gì); p_post: ghi sổ luôn. Nguyên khối như các hàm import_*.
-- ---------------------------------------------------------------------------
create or replace function public.generate_tuition(
  p_tenant uuid, p_month date, p_class uuid default null, p_date date default null,
  p_post boolean default false, p_dry_run boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_date date := coalesce(p_date, current_date);
  r record;
  v_id uuid;
  v_number text;
  v_items jsonb := '[]'::jsonb;
  v_new integer := 0;
  v_exists integer := 0;
  v_msg text;
  v_error text;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền lập học phí');
  if not exists (select 1 from public.accounts a where a.tenant_id = p_tenant and a.code = '3387' and a.is_active and a.is_postable) then
    raise exception 'Chưa có TK 3387 (doanh thu chưa thực hiện) hoặc TK 3387 có tài khoản con' using errcode = 'P0001';
  end if;

  begin
    for r in
      select e.id as enrollment_id, e.student_id, c.job_id as class_id, j.code as class_code, j.name as class_name,
             p.code as student_code, p.name as student_name, c.billing,
             case when c.billing = 'monthly' then v_start else e.start_date end as period_start,
             case when c.billing = 'monthly' then v_end else e.end_date end as period_end,
             case when c.billing = 'course' then c.sessions_per_course end as sessions,
             coalesce(e.fee, c.fee) as amount,
             exists (
               select 1 from public.tuition_bills b
               where b.enrollment_id = e.id and (c.billing = 'course' or b.period_start = v_start)
             ) as billed
      from public.enrollments e
      join public.classes c on c.job_id = e.class_id
      join public.jobs j on j.id = c.job_id
      join public.partners p on p.id = e.student_id
      where e.tenant_id = p_tenant and e.status = 'active'
        and (p_class is null or c.job_id = p_class)
        and e.start_date <= v_end
        and (c.billing = 'course' or e.end_date is null or e.end_date >= v_start)
        and coalesce(e.fee, c.fee) > 0
      order by j.code, p.code
    loop
      if r.billed then
        v_exists := v_exists + 1;
        v_items := v_items || jsonb_build_object('enrollment_id', r.enrollment_id, 'class_code', r.class_code, 'class_name', r.class_name,
          'student_code', r.student_code, 'student_name', r.student_name, 'period_start', r.period_start, 'amount', r.amount,
          'status', 'exists');
        continue;
      end if;
      v_msg := case when r.billing = 'monthly'
                    then format('Học phí lớp %s tháng %s', r.class_name, to_char(v_start, 'MM/YYYY'))
                    else format('Học phí lớp %s — khóa %s buổi từ %s', r.class_name, r.sessions, to_char(r.period_start, 'DD/MM/YYYY')) end;
      v_id := public.save_voucher(jsonb_build_object(
        'tenant_id', p_tenant,
        'voucher_type', 'HDV',
        'posting_date', v_date,
        'issue_date', v_date,
        'partner_id', r.student_id,
        'description', left(v_msg, 480),
        'source', 'system',
        'lines', jsonb_build_array(jsonb_build_object(
          'line_no', 1,
          'credit_account', '3387',
          'amount', r.amount,
          'quantity', 1,
          'unit_price', r.amount,
          'uom', case when r.billing = 'monthly' then 'Tháng' else 'Khóa' end,
          'description', left(v_msg, 480),
          'job_id', r.class_id,
          'vat_code', 'KCT',
          'vat_amount', 0
        ))
      ), p_post);
      insert into public.tuition_bills (tenant_id, enrollment_id, period_start, period_end, sessions, amount, invoice_id)
      values (p_tenant, r.enrollment_id, r.period_start, r.period_end, r.sessions, r.amount, v_id);
      select v.number into v_number from public.vouchers v where v.id = v_id;
      v_new := v_new + 1;
      v_items := v_items || jsonb_build_object('enrollment_id', r.enrollment_id, 'class_code', r.class_code, 'class_name', r.class_name,
        'student_code', r.student_code, 'student_name', r.student_name, 'period_start', r.period_start, 'amount', r.amount,
        'status', 'new', 'voucher_id', v_id, 'number', v_number);
    end loop;
    if p_dry_run then
      raise exception 'hoàn tác' using errcode = 'P0099';
    end if;
  exception when sqlstate 'P0099' then
    -- Chạy thử: mọi hóa đơn, phiếu học phí, bộ đếm số chứng từ đã được hoàn tác
    select coalesce(jsonb_agg(it - 'voucher_id' - 'number'), '[]'::jsonb) into v_items from jsonb_array_elements(v_items) as it;
  end;

  if not p_dry_run then
    select coalesce(jsonb_agg(case when it ->> 'status' = 'new' then jsonb_set(it, '{status}', '"created"') else it end), '[]'::jsonb)
    into v_items from jsonb_array_elements(v_items) as it;
  end if;
  return jsonb_build_object('ok', true, 'dry_run', p_dry_run, 'new', v_new, 'created', case when p_dry_run then 0 else v_new end,
                            'existing', v_exists, 'total', (select coalesce(sum((it ->> 'amount')::numeric), 0)
                                                            from jsonb_array_elements(v_items) it where it ->> 'status' <> 'exists'),
                            'items', v_items);
end $$;

-- ---------------------------------------------------------------------------
-- Thu học phí: mỗi học viên một phiếu thu (tiền mặt) / giấy báo có (chuyển khoản), trừ đúng hóa đơn học phí còn nợ.
-- Hóa đơn học phí còn nháp thì ghi sổ trước.
-- ---------------------------------------------------------------------------
create or replace function public.pay_tuition(p_tenant uuid, p_bills uuid[], p_method text default 'cash', p_date date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_date date := coalesce(p_date, current_date);
  v_type text := case p_method when 'bank' then 'BC' else 'PT' end;
  r_student record;
  r_inv record;
  v_lines jsonb;
  v_id uuid;
  v_result jsonb := '[]'::jsonb;
  v_total numeric := 0;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền thu học phí');
  if p_method not in ('cash', 'bank') then raise exception 'Hình thức thu không hợp lệ' using errcode = 'P0001'; end if;
  if coalesce(cardinality(p_bills), 0) = 0 then raise exception 'Chưa chọn học phí cần thu' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(p_bills) x where not exists (
    select 1 from public.tuition_bills tb where tb.id = x and tb.tenant_id = p_tenant)) then
    raise exception 'Học phí không thuộc đơn vị' using errcode = 'P0001';
  end if;

  -- Hóa đơn học phí còn nháp: ghi sổ trước khi thu
  for r_inv in
    select distinct v.id from public.tuition_bills t join public.vouchers v on v.id = t.invoice_id
    where t.id = any (p_bills) and v.status = 'draft'
  loop
    perform public.post_voucher(r_inv.id);
  end loop;

  for r_student in
    select e.student_id, p.name as student_name
    from public.tuition_bills t join public.enrollments e on e.id = t.enrollment_id join public.partners p on p.id = e.student_id
    where t.id = any (p_bills)
    group by e.student_id, p.name order by p.name
  loop
    select jsonb_agg(jsonb_build_object('credit_account', '131', 'amount', x.remaining, 'invoice_id', x.invoice_id,
                                        'description', x.description) order by x.number),
           sum(x.remaining)
    into v_lines, v_total
    from (
      select v.id as invoice_id, v.number, v.description,
             v.total_amount - coalesce((
               select sum(pl.amount) from public.voucher_lines pl join public.vouchers pv on pv.id = pl.voucher_id
               where pl.invoice_id = v.id and pv.status = 'posted'), 0) as remaining
      from public.tuition_bills t
      join public.enrollments e on e.id = t.enrollment_id
      join public.vouchers v on v.id = t.invoice_id
      where t.id = any (p_bills) and e.student_id = r_student.student_id and v.status = 'posted'
    ) x
    where x.remaining > 0;
    continue when v_lines is null;
    v_id := public.save_voucher(jsonb_build_object(
      'tenant_id', p_tenant,
      'voucher_type', v_type,
      'posting_date', v_date,
      'issue_date', v_date,
      'partner_id', r_student.student_id,
      'contact_name', r_student.student_name,
      'description', left('Thu học phí ' || r_student.student_name, 480),
      'source', 'system',
      'lines', v_lines
    ), true);
    v_result := v_result || jsonb_build_object('voucher_id', v_id, 'number', (select number from public.vouchers where id = v_id),
                                               'student_name', r_student.student_name, 'amount', v_total);
  end loop;
  return jsonb_build_object('ok', true, 'vouchers', v_result,
                            'total', (select coalesce(sum((r ->> 'amount')::numeric), 0) from jsonb_array_elements(v_result) r));
end $$;

-- ---------------------------------------------------------------------------
-- Tình hình học phí: mỗi phiếu học phí một dòng — đã lập, đã thu (phiếu đã ghi sổ đến ngày), còn nợ
-- ---------------------------------------------------------------------------
create or replace function public.rpt_tuition_status(p_tenant uuid, p_as_of date default null, p_class uuid default null,
                                                     p_month date default null)
returns table (bill_id uuid, enrollment_id uuid, class_id uuid, class_code text, class_name text, billing text,
               student_id uuid, student_code text, student_name text, guardian_name text, guardian_phone text,
               period_start date, period_end date, sessions integer, amount numeric, invoice_id uuid, invoice_number text,
               invoice_status text, invoice_date date, due_date date, paid numeric, remaining numeric)
language sql stable security invoker set search_path = '' as $$
  select t.id, t.enrollment_id, c.job_id, j.code, j.name, c.billing,
         p.id, p.code, p.name, sp.guardian_name, coalesce(sp.guardian_phone, p.phone),
         t.period_start, t.period_end, t.sessions, t.amount, v.id, v.number, v.status, v.posting_date, v.due_date,
         pd.paid, v.total_amount - pd.paid
  from public.tuition_bills t
  join public.enrollments e on e.id = t.enrollment_id
  join public.classes c on c.job_id = e.class_id
  join public.jobs j on j.id = c.job_id
  join public.partners p on p.id = e.student_id
  left join public.student_profiles sp on sp.partner_id = p.id
  join public.vouchers v on v.id = t.invoice_id
  cross join lateral (
    select coalesce(sum(pl.amount), 0)::numeric(18, 2) as paid
    from public.voucher_lines pl join public.vouchers pv on pv.id = pl.voucher_id
    where pl.invoice_id = v.id and pv.status = 'posted' and (p_as_of is null or pv.posting_date <= p_as_of)
  ) pd
  where t.tenant_id = p_tenant and v.status <> 'cancelled'
    and (p_class is null or c.job_id = p_class)
    and (p_month is null or t.period_start between date_trunc('month', p_month)::date
                                             and (date_trunc('month', p_month) + interval '1 month - 1 day')::date)
  order by j.code, p.code, t.period_start
$$;

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------
revoke execute on function app.level_ok(text) from public, anon, authenticated;
revoke execute on function public.save_student(uuid, jsonb, uuid) from public, anon;
revoke execute on function public.save_class(uuid, jsonb, uuid) from public, anon;
revoke execute on function public.save_enrollment(uuid, jsonb, uuid) from public, anon;
revoke execute on function public.import_students(uuid, jsonb) from public, anon;
revoke execute on function public.generate_tuition(uuid, date, uuid, date, boolean, boolean) from public, anon;
revoke execute on function public.pay_tuition(uuid, uuid[], text, date) from public, anon;
revoke execute on function public.rpt_tuition_status(uuid, date, uuid, date) from public, anon;
grant execute on function public.save_student(uuid, jsonb, uuid) to authenticated;
grant execute on function public.save_class(uuid, jsonb, uuid) to authenticated;
grant execute on function public.save_enrollment(uuid, jsonb, uuid) to authenticated;
grant execute on function public.import_students(uuid, jsonb) to authenticated;
grant execute on function public.generate_tuition(uuid, date, uuid, date, boolean, boolean) to authenticated;
grant execute on function public.pay_tuition(uuid, uuid[], text, date) to authenticated;
grant execute on function public.rpt_tuition_status(uuid, date, uuid, date) to authenticated;
