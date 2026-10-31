-- AccEdu — P6: Tài sản cố định (TSCĐ) và công cụ dụng cụ (CCDC)
--   Thẻ tài sản (assets), khấu hao / phân bổ hằng tháng (asset_depreciations), ghi giảm (asset_disposals).
--   Khấu hao đường thẳng: phần còn lại chia đều cho số tháng còn lại; TSCĐ tính theo số ngày sử dụng trong tháng
--   (TT45/2013), CCDC phân bổ tròn tháng. Mỗi tháng mỗi loại một phiếu kế toán (PK) ngày cuối tháng.
--   Hao mòn lũy kế = số đầu kỳ + các dòng khấu hao có phiếu đã ghi sổ (xóa phiếu → dòng mất theo).

-- ---------------------------------------------------------------------------
-- Bảng
-- ---------------------------------------------------------------------------
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('fixed', 'tool')),
  code text not null check (length(code) between 1 and 32),
  name text not null check (length(name) between 1 and 256),
  category text,
  department text,
  quantity numeric(18, 3) not null default 1 check (quantity > 0),
  uom text,
  acquired_on date not null,
  start_on date not null,
  cost numeric(18, 2) not null check (cost > 0),
  months integer not null check (months between 1 and 600),
  opening_accumulated numeric(18, 2) not null default 0 check (opening_accumulated >= 0),
  opening_months numeric(9, 4) not null default 0 check (opening_months >= 0),
  asset_account text not null,
  accum_account text,
  expense_account text not null,
  suspended boolean not null default false,
  increase_voucher_id uuid references public.vouchers (id) on delete set null,
  note text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, kind, code),
  check (opening_accumulated <= cost),
  check (opening_months <= months),
  check (start_on >= acquired_on),
  check ((kind = 'fixed') = (accum_account is not null))
);
comment on table public.assets is 'Thẻ TSCĐ (kind = fixed) và CCDC (kind = tool). Số đầu kỳ: tài sản đưa vào dùng trước ngày bắt đầu nhập liệu.';
comment on column public.assets.start_on is 'Ngày bắt đầu tính khấu hao / phân bổ';
comment on column public.assets.cost is 'Nguyên giá TSCĐ / giá trị CCDC cần phân bổ';
comment on column public.assets.months is 'Số tháng khấu hao / phân bổ';
comment on column public.assets.accum_account is 'TK hao mòn (214x) — chỉ TSCĐ; CCDC phân bổ thẳng từ TK tài sản (242)';
comment on column public.assets.suspended is 'Tạm dừng khấu hao / phân bổ: các tháng tạm dừng không tính, thời gian khấu hao kéo dài tương ứng';

create table public.asset_depreciations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  months_used numeric(9, 4) not null check (months_used > 0 and months_used <= 1),
  amount numeric(18, 2) not null check (amount > 0),
  source text not null default 'run' check (source in ('run', 'disposal')),
  voucher_id uuid not null references public.vouchers (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (asset_id, month)
);
comment on table public.asset_depreciations is 'Khấu hao TSCĐ / phân bổ CCDC theo tháng (dòng của phiếu kế toán). months_used: phần tháng đã tính (0–1).';
create index asset_depreciations_voucher on public.asset_depreciations (voucher_id);
create index asset_depreciations_month on public.asset_depreciations (tenant_id, month);

create table public.asset_disposals (
  asset_id uuid primary key references public.assets (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  disposed_on date not null,
  reason text,
  voucher_id uuid references public.vouchers (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
comment on table public.asset_disposals is 'Ghi giảm tài sản (thanh lý, nhượng bán, hỏng, mất). Xóa phiếu ghi giảm → tài sản trở lại đang dùng.';
create index asset_disposals_voucher on public.asset_disposals (voucher_id);

create trigger assets_touch before update on public.assets for each row execute function app.touch_updated_at();
create trigger assets_audit after insert or update or delete on public.assets for each row execute function app.audit();

alter table public.assets enable row level security;
alter table public.asset_depreciations enable row level security;
alter table public.asset_disposals enable row level security;
create policy assets_select on public.assets for select to authenticated using (app.is_member(tenant_id));
create policy asset_depreciations_select on public.asset_depreciations for select to authenticated using (app.is_member(tenant_id));
create policy asset_disposals_select on public.asset_disposals for select to authenticated using (app.is_member(tenant_id));
-- Ghi qua save_asset / run_asset_depreciation / dispose_asset; không mở ghi trực tiếp

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.assets, public.asset_depreciations, public.asset_disposals;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Công thức (giống packages/core/src/accounting/assets.ts)
-- ---------------------------------------------------------------------------
-- Số ngày được tính trong tháng p_month (ngày đầu tháng): từ max(ngày bắt đầu, đầu tháng) đến hết tháng,
-- hoặc đến trước ngày ghi giảm p_until (ngày ghi giảm không tính)
create or replace function app.asset_days(p_start date, p_month date, p_until date default null)
returns integer language sql immutable as $$
  select greatest(0, least(coalesce(p_until, m_end + 1), m_end + 1) - greatest(p_start, p_month))
  from (select (p_month + interval '1 month - 1 day')::date as m_end) d
$$;

-- Phần tháng được tính (0–1): TSCĐ theo ngày; CCDC tròn tháng (đã bắt đầu thì tính cả tháng).
-- Số tiền tính theo phần tháng chính xác (17/31); asset_depreciations.months_used lưu làm tròn 4 chữ số.
create or replace function app.asset_month_fraction(p_kind text, p_start date, p_month date, p_until date default null)
returns numeric language sql immutable as $$
  select case
    when p_kind = 'tool' then case when p_start <= (p_month + interval '1 month - 1 day')::date then 1::numeric else 0::numeric end
    else app.asset_days(p_start, p_month, p_until)::numeric
         / extract(day from (p_month + interval '1 month - 1 day'))::numeric
  end
$$;

-- Số khấu hao của tháng: tháng cuối (còn ≤ phần tháng) lấy hết phần còn lại, còn lại chia đều theo số tháng còn lại
create or replace function app.asset_charge(p_cost numeric, p_months numeric, p_accumulated numeric, p_used numeric, p_fraction numeric)
returns numeric language sql immutable as $$
  select case
    when p_cost - p_accumulated <= 0 or p_fraction <= 0 then 0::numeric
    when p_months - p_used <= p_fraction then p_cost - p_accumulated
    else least(p_cost - p_accumulated, round((p_cost - p_accumulated) * p_fraction / (p_months - p_used), 0))
  end
$$;

-- Hao mòn lũy kế / số tháng đã tính trước tháng p_before (chỉ dòng có phiếu đã ghi sổ)
create or replace function app.asset_state(p_asset uuid, p_before date)
returns table (accumulated numeric, months_used numeric)
language sql stable security definer set search_path = '' as $$
  select a.opening_accumulated + coalesce(sum(d.amount), 0), a.opening_months + coalesce(sum(d.months_used), 0)
  from public.assets a
  left join public.asset_depreciations d on d.asset_id = a.id and d.month < p_before
    and exists (select 1 from public.vouchers v where v.id = d.voucher_id and v.status = 'posted')
  where a.id = p_asset
  group by a.id
$$;

-- TK mặc định theo chế độ kế toán
create or replace function app.asset_default_accounts(p_tenant uuid, p_kind text, p_asset_account text default null)
returns table (asset_account text, accum_account text, expense_account text)
language sql stable security definer set search_path = '' as $$
  select x.asset_account,
         case when p_kind = 'tool' then null
              when t.regime = 'TT133' then case x.asset_account when '2113' then '2143' when '2112' then '2142' else '2141' end
              else case when x.asset_account like '213%' then '2143' when x.asset_account like '212%' then '2142' else '2141' end
         end,
         case when t.regime = 'TT133' then '6422' when p_kind = 'tool' then '6423' else '6424' end
  from public.tenants t
  cross join lateral (
    select coalesce(p_asset_account, case when p_kind = 'tool' then '242' when t.regime = 'TT133' then '2111' else '2112' end) as asset_account
  ) x
  where t.id = p_tenant
$$;

create or replace function app.asset_account_ok(p_tenant uuid, p_code text, p_pattern text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.accounts a
    where a.tenant_id = p_tenant and a.code = p_code and a.is_active and a.is_postable and a.code ~ p_pattern
  )
$$;

-- ---------------------------------------------------------------------------
-- Khai báo thẻ tài sản
-- p_asset: {kind, code, name, category?, department?, quantity?, uom?, acquired_on?, start_on, cost, months,
--           opening_accumulated?, opening_months?, asset_account?, accum_account?, expense_account?, suspended?, note?,
--           increase?: {credit_account, partner_id?}}
-- increase: lập phiếu kế toán ghi tăng (Nợ TK tài sản / Có credit_account) đã ghi sổ, ngày ghi tăng.
-- ---------------------------------------------------------------------------
create or replace function public.save_asset(p_tenant uuid, p_asset jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_old public.assets;
  v_kind text;
  v_label text;
  v_code text := upper(trim(coalesce(p_asset ->> 'code', '')));
  v_name text := trim(coalesce(p_asset ->> 'name', ''));
  v_start date := nullif(p_asset ->> 'start_on', '')::date;
  v_acq date := nullif(p_asset ->> 'acquired_on', '')::date;
  v_cost numeric := round(coalesce(nullif(p_asset ->> 'cost', '')::numeric, 0), 0);
  v_months integer := nullif(p_asset ->> 'months', '')::integer;
  v_open_acc numeric := round(coalesce(nullif(p_asset ->> 'opening_accumulated', '')::numeric, 0), 0);
  v_open_m numeric := round(coalesce(nullif(p_asset ->> 'opening_months', '')::numeric, 0), 4);
  v_qty numeric := coalesce(nullif(p_asset ->> 'quantity', '')::numeric, 1);
  v_asset_acc text := nullif(trim(p_asset ->> 'asset_account'), '');
  v_accum text := nullif(trim(p_asset ->> 'accum_account'), '');
  v_expense text := nullif(trim(p_asset ->> 'expense_account'), '');
  v_def record;
  v_tenant_start date;
  v_has_dep boolean := false;
  v_used numeric;
  v_inc jsonb := case when jsonb_typeof(p_asset -> 'increase') = 'object' then p_asset -> 'increase' end;
  v_credit text;
  v_partner uuid;
  v_regen boolean := false;
  v_inc_old record;
  v_id uuid;
  v_voucher uuid;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền khai báo tài sản');
  select start_date into v_tenant_start from public.tenants where id = p_tenant;

  if p_id is not null then
    select * into v_old from public.assets where id = p_id and tenant_id = p_tenant for update;
    if not found then raise exception 'Không tìm thấy tài sản' using errcode = 'P0001'; end if;
    if exists (select 1 from public.asset_disposals x where x.asset_id = p_id) then
      raise exception 'Tài sản % đã ghi giảm — khôi phục trước khi sửa', v_old.code using errcode = 'P0001';
    end if;
    v_kind := v_old.kind;
    v_has_dep := exists (select 1 from public.asset_depreciations d where d.asset_id = p_id);
  else
    v_kind := coalesce(nullif(p_asset ->> 'kind', ''), 'fixed');
  end if;
  if v_kind not in ('fixed', 'tool') then
    raise exception 'Loại tài sản không hợp lệ: %', v_kind using errcode = 'P0001';
  end if;
  v_label := case v_kind when 'fixed' then 'TSCĐ' else 'CCDC' end;
  v_acq := coalesce(v_acq, v_start);

  select * into v_def from app.asset_default_accounts(p_tenant, v_kind, v_asset_acc);
  v_asset_acc := v_def.asset_account;
  v_accum := case when v_kind = 'tool' then null else coalesce(v_accum, v_def.accum_account) end;
  v_expense := coalesce(v_expense, v_def.expense_account);

  if v_code = '' then raise exception 'Chưa nhập mã %', v_label using errcode = 'P0001'; end if;
  if length(v_code) > 32 then raise exception 'Mã % tối đa 32 ký tự', v_label using errcode = 'P0001'; end if;
  if v_name = '' then raise exception 'Chưa nhập tên %', v_label using errcode = 'P0001'; end if;
  if v_start is null then
    raise exception 'Chưa nhập ngày bắt đầu %', case v_kind when 'fixed' then 'tính khấu hao' else 'phân bổ' end using errcode = 'P0001';
  end if;
  if v_acq > v_start then
    raise exception 'Ngày bắt đầu % không được trước ngày ghi tăng', case v_kind when 'fixed' then 'tính khấu hao' else 'phân bổ' end
      using errcode = 'P0001';
  end if;
  if v_cost <= 0 then
    raise exception '% phải lớn hơn 0', case v_kind when 'fixed' then 'Nguyên giá' else 'Giá trị CCDC' end using errcode = 'P0001';
  end if;
  if v_months is null or v_months not between 1 and 600 then
    raise exception 'Số tháng % từ 1 đến 600', case v_kind when 'fixed' then 'khấu hao' else 'phân bổ' end using errcode = 'P0001';
  end if;
  if v_qty <= 0 then raise exception 'Số lượng phải lớn hơn 0' using errcode = 'P0001'; end if;
  if v_open_acc < 0 or v_open_m < 0 then raise exception 'Số đầu kỳ không được âm' using errcode = 'P0001'; end if;
  if v_open_acc > v_cost then
    raise exception '% đầu kỳ vượt %', case v_kind when 'fixed' then 'Hao mòn lũy kế' else 'Giá trị đã phân bổ' end,
      case v_kind when 'fixed' then 'nguyên giá' else 'giá trị CCDC' end using errcode = 'P0001';
  end if;
  if v_open_m > v_months then
    raise exception 'Số tháng đã % đầu kỳ vượt số tháng sử dụng', case v_kind when 'fixed' then 'khấu hao' else 'phân bổ' end
      using errcode = 'P0001';
  end if;
  if (v_open_acc > 0 or v_open_m > 0) and v_start >= v_tenant_start then
    raise exception 'Số đầu kỳ chỉ khai báo cho tài sản bắt đầu sử dụng trước ngày bắt đầu nhập liệu %',
      to_char(v_tenant_start, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  if v_kind = 'fixed' and not app.asset_account_ok(p_tenant, v_asset_acc, '^21[123]') then
    raise exception 'TK nguyên giá TSCĐ phải là TK chi tiết đầu 211, 212 hoặc 213 (đang chọn %)', v_asset_acc using errcode = 'P0001';
  end if;
  if v_kind = 'fixed' and not app.asset_account_ok(p_tenant, v_accum, '^214') then
    raise exception 'TK hao mòn phải là TK chi tiết đầu 214 (đang chọn %)', v_accum using errcode = 'P0001';
  end if;
  if v_kind = 'tool' and not app.asset_account_ok(p_tenant, v_asset_acc, '^242') then
    raise exception 'TK chờ phân bổ CCDC phải là TK chi tiết đầu 242 (đang chọn %)', v_asset_acc using errcode = 'P0001';
  end if;
  if not app.asset_account_ok(p_tenant, v_expense, '^(6|154|241|811)') then
    raise exception 'TK chi phí phải là TK chi tiết đầu 6, 154, 241 hoặc 811 (đang chọn %)', v_expense using errcode = 'P0001';
  end if;
  if exists (select 1 from public.assets a where a.tenant_id = p_tenant and a.kind = v_kind and a.code = v_code
             and a.id is distinct from p_id) then
    raise exception 'Mã % % đã có', v_label, v_code using errcode = 'P0001';
  end if;

  if p_id is not null and v_has_dep then
    if (v_cost, v_start, v_acq, v_open_acc, v_open_m, v_asset_acc, v_accum)
       is distinct from (v_old.cost, v_old.start_on, v_old.acquired_on, v_old.opening_accumulated, v_old.opening_months,
                         v_old.asset_account, v_old.accum_account) then
      raise exception '% % đã %: không sửa được nguyên giá, ngày, số đầu kỳ, TK tài sản / hao mòn — xóa các tháng đã tính trước',
        v_label, v_old.code, case v_kind when 'fixed' then 'tính khấu hao' else 'phân bổ' end using errcode = 'P0001';
    end if;
    select s.months_used into v_used from app.asset_state(p_id, 'infinity'::date) s;
    if v_months < v_used then
      raise exception 'Số tháng sử dụng (%) nhỏ hơn số tháng đã tính (%)', v_months, trim_scale(round(v_used, 2)) using errcode = 'P0001';
    end if;
  end if;

  -- Phiếu ghi tăng: lập mới khi có increase; lập lại khi sửa nguyên giá / TK / ngày của phiếu cũ
  if p_id is not null and v_old.increase_voucher_id is not null then
    if v_inc is not null or (v_cost, v_asset_acc, v_acq, v_code, v_name)
       is distinct from (v_old.cost, v_old.asset_account, v_old.acquired_on, v_old.code, v_old.name) then
      v_regen := true;
      select l.credit_account, l.partner_id into v_inc_old
      from public.voucher_lines l where l.voucher_id = v_old.increase_voucher_id order by l.line_no limit 1;
      v_credit := coalesce(nullif(trim(v_inc ->> 'credit_account'), ''), v_inc_old.credit_account);
      v_partner := case when v_inc is not null then nullif(v_inc ->> 'partner_id', '')::uuid else v_inc_old.partner_id end;
    end if;
  elsif v_inc is not null then
    v_regen := true;
    v_credit := nullif(trim(v_inc ->> 'credit_account'), '');
    v_partner := nullif(v_inc ->> 'partner_id', '')::uuid;
  end if;
  if v_regen then
    if v_open_acc > 0 or v_open_m > 0 then
      raise exception 'Tài sản có số đầu kỳ đã nằm trong số dư đầu kỳ — không lập phiếu ghi tăng' using errcode = 'P0001';
    end if;
    if v_credit is null then raise exception 'Chưa chọn TK đối ứng ghi tăng' using errcode = 'P0001'; end if;
    if not exists (select 1 from public.accounts a where a.tenant_id = p_tenant and a.code = v_credit and a.is_active and a.is_postable) then
      raise exception 'TK đối ứng % không phải TK chi tiết đang dùng', v_credit using errcode = 'P0001';
    end if;
    if v_credit = v_asset_acc then raise exception 'TK đối ứng trùng TK tài sản' using errcode = 'P0001'; end if;
    if exists (select 1 from public.accounts a where a.tenant_id = p_tenant and a.code = v_credit and a.track_item) then
      raise exception 'TK % theo dõi tồn kho — xuất kho bằng phiếu xuất kho (Nợ % / Có %), rồi khai báo % không chọn ghi tăng',
        v_credit, v_asset_acc, v_credit, v_label using errcode = 'P0001';
    end if;
    if v_partner is null and exists (select 1 from public.accounts a where a.tenant_id = p_tenant and a.code = v_credit and a.track_partner) then
      raise exception 'TK % theo dõi công nợ — chọn nhà cung cấp', v_credit using errcode = 'P0001';
    end if;
  end if;

  if p_id is null then
    insert into public.assets (tenant_id, kind, code, name, category, department, quantity, uom, acquired_on, start_on, cost, months,
      opening_accumulated, opening_months, asset_account, accum_account, expense_account, suspended, note)
    values (p_tenant, v_kind, v_code, v_name, nullif(trim(p_asset ->> 'category'), ''), nullif(trim(p_asset ->> 'department'), ''),
      v_qty, nullif(trim(p_asset ->> 'uom'), ''), v_acq, v_start, v_cost, v_months, v_open_acc, v_open_m, v_asset_acc, v_accum,
      v_expense, coalesce((p_asset ->> 'suspended')::boolean, false), nullif(trim(p_asset ->> 'note'), ''))
    returning id into v_id;
  else
    v_id := p_id;
    update public.assets set code = v_code, name = v_name, category = nullif(trim(p_asset ->> 'category'), ''),
      department = nullif(trim(p_asset ->> 'department'), ''), quantity = v_qty, uom = nullif(trim(p_asset ->> 'uom'), ''),
      acquired_on = v_acq, start_on = v_start, cost = v_cost, months = v_months, opening_accumulated = v_open_acc,
      opening_months = v_open_m, asset_account = v_asset_acc, accum_account = v_accum, expense_account = v_expense,
      suspended = coalesce((p_asset ->> 'suspended')::boolean, v_old.suspended), note = nullif(trim(p_asset ->> 'note'), '')
    where id = v_id;
  end if;

  if v_regen then
    if p_id is not null and v_old.increase_voucher_id is not null then
      if (select status from public.vouchers where id = v_old.increase_voucher_id) = 'posted' then
        perform public.unpost_voucher(v_old.increase_voucher_id);
      end if;
      perform public.delete_voucher(v_old.increase_voucher_id);
    end if;
    v_voucher := public.save_voucher(jsonb_build_object(
      'tenant_id', p_tenant,
      'voucher_type', 'PK',
      'posting_date', v_acq,
      'issue_date', v_acq,
      'partner_id', v_partner,
      'description', left(format('Ghi tăng %s %s — %s', v_label, v_code, v_name), 480),
      'source', 'system',
      'lines', jsonb_build_array(jsonb_build_object('line_no', 1, 'debit_account', v_asset_acc, 'credit_account', v_credit,
        'amount', v_cost, 'partner_id', v_partner, 'description', left(format('Ghi tăng %s %s — %s', v_label, v_code, v_name), 480)))
    ), true);
    update public.assets set increase_voucher_id = v_voucher where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.delete_asset(p_tenant uuid, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.assets;
  v_month date;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền xóa tài sản');
  select * into a from public.assets where id = p_id and tenant_id = p_tenant for update;
  if not found then raise exception 'Không tìm thấy tài sản' using errcode = 'P0001'; end if;
  if exists (select 1 from public.asset_disposals x where x.asset_id = a.id) then
    raise exception 'Tài sản % đã ghi giảm — khôi phục trước khi xóa', a.code using errcode = 'P0001';
  end if;
  select max(d.month) into v_month from public.asset_depreciations d where d.asset_id = a.id;
  if v_month is not null then
    raise exception 'Tài sản % đã % tháng % — xóa các tháng đã tính trước (hoặc ghi giảm tài sản)', a.code,
      case a.kind when 'fixed' then 'tính khấu hao' else 'phân bổ' end, to_char(v_month, 'MM/YYYY') using errcode = 'P0001';
  end if;
  if a.increase_voucher_id is not null then
    if (select status from public.vouchers where id = a.increase_voucher_id) = 'posted' then
      perform public.unpost_voucher(a.increase_voucher_id);
    end if;
    perform public.delete_voucher(a.increase_voucher_id);
  end if;
  delete from public.assets where id = a.id;
end $$;

-- ---------------------------------------------------------------------------
-- Tính khấu hao TSCĐ / phân bổ CCDC tháng p_month → một phiếu kế toán ngày cuối tháng.
-- Tính lại tháng: thay phiếu cũ. Đã có tháng sau thì phải xóa tháng sau trước.
-- p_dry_run: xem trước (mọi thay đổi được hoàn tác).
-- ---------------------------------------------------------------------------
create or replace function public.run_asset_depreciation(
  p_tenant uuid, p_kind text, p_month date, p_post boolean default true, p_dry_run boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_prev date := (date_trunc('month', p_month) - interval '1 month')::date;
  v_label text := to_char(date_trunc('month', p_month), 'MM/YYYY');
  v_verb text := case p_kind when 'fixed' then 'tính khấu hao' else 'phân bổ' end;
  v_tenant_start date;
  r record;
  v_old record;
  v_later date;
  v_f numeric;
  v_days integer;
  v_amount numeric;
  v_credit text;
  v_desc text;
  v_lines jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_replaced text[] := '{}';
  v_warnings text[] := '{}';
  v_total numeric := 0;
  v_n integer := 0;
  v_id uuid;
  v_number text;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền tính khấu hao / phân bổ');
  if p_kind is null or p_kind not in ('fixed', 'tool') then
    raise exception 'Loại tài sản không hợp lệ' using errcode = 'P0001';
  end if;
  perform app.assert_period_open(p_tenant, 'PK', v_end);
  select start_date into v_tenant_start from public.tenants where id = p_tenant;

  select max(d.month) into v_later
  from public.asset_depreciations d join public.assets a on a.id = d.asset_id
  where a.tenant_id = p_tenant and a.kind = p_kind and d.source = 'run' and d.month > v_start;
  if v_later is not null then
    raise exception 'Đã % tháng % — xóa các tháng sau (từ tháng gần nhất) trước khi tính lại tháng %',
      v_verb, to_char(v_later, 'MM/YYYY'), v_label using errcode = 'P0001';
  end if;

  begin
    for v_old in
      select distinct v.id, v.number, v.status
      from public.asset_depreciations d
      join public.assets a on a.id = d.asset_id
      join public.vouchers v on v.id = d.voucher_id
      where a.tenant_id = p_tenant and a.kind = p_kind and d.month = v_start and d.source = 'run'
    loop
      if v_old.status = 'posted' then perform public.unpost_voucher(v_old.id); end if;
      perform public.delete_voucher(v_old.id);
      v_replaced := v_replaced || v_old.number;
    end loop;

    for r in
      select a.*, s.accumulated, s.months_used
      from public.assets a
      cross join lateral app.asset_state(a.id, v_start) s
      where a.tenant_id = p_tenant and a.kind = p_kind and not a.suspended and a.start_on <= v_end
        and not exists (select 1 from public.asset_disposals x where x.asset_id = a.id and x.disposed_on <= v_end)
      order by a.code
    loop
      v_days := case when p_kind = 'fixed' then app.asset_days(r.start_on, v_start) end;
      v_f := app.asset_month_fraction(p_kind, r.start_on, v_start);
      v_amount := app.asset_charge(r.cost, r.months, r.accumulated, r.months_used, v_f);
      continue when v_amount <= 0;
      v_credit := coalesce(r.accum_account, r.asset_account);
      v_desc := format('%s %s — %s tháng %s', case p_kind when 'fixed' then 'Khấu hao' else 'Phân bổ' end, r.code, r.name, v_label)
        || case when p_kind = 'fixed' and v_f < 1 then format(' (%s/%s ngày)', v_days, extract(day from v_end)) else '' end;
      v_n := v_n + 1;
      v_total := v_total + v_amount;
      v_lines := v_lines || jsonb_build_object('line_no', v_n, 'debit_account', r.expense_account, 'credit_account', v_credit,
        'amount', v_amount, 'description', left(v_desc, 480));
      v_items := v_items || jsonb_build_object('asset_id', r.id, 'code', r.code, 'name', r.name, 'department', r.department,
        'expense_account', r.expense_account, 'credit_account', v_credit, 'cost', r.cost,
        'accumulated_before', r.accumulated, 'months_used_before', r.months_used, 'fraction', round(v_f, 4), 'days', v_days,
        'amount', v_amount, 'accumulated', r.accumulated + v_amount, 'remaining', r.cost - r.accumulated - v_amount,
        'months_left', greatest(0, r.months - r.months_used - round(v_f, 4)));
    end loop;

    if v_n > 0 then
      v_id := public.save_voucher(jsonb_build_object(
        'tenant_id', p_tenant,
        'voucher_type', 'PK',
        'posting_date', v_end,
        'issue_date', v_end,
        'description', case p_kind when 'fixed' then format('Khấu hao TSCĐ tháng %s', v_label)
                                   else format('Phân bổ chi phí CCDC tháng %s', v_label) end,
        'source', 'system',
        'lines', v_lines
      ), p_post);
      select v.number into v_number from public.vouchers v where v.id = v_id;
      insert into public.asset_depreciations (tenant_id, asset_id, month, months_used, amount, source, voucher_id)
      select p_tenant, (it ->> 'asset_id')::uuid, v_start, (it ->> 'fraction')::numeric, (it ->> 'amount')::numeric, 'run', v_id
      from jsonb_array_elements(v_items) it;
    end if;

    if p_dry_run then
      raise exception 'hoàn tác' using errcode = 'P0099';
    end if;
  exception when sqlstate 'P0099' then
    -- Chạy thử: phiếu mới, việc thay phiếu cũ và bộ đếm số chứng từ đã được hoàn tác
    v_id := null;
    v_number := null;
  end;

  -- Tháng trước còn tài sản chưa tính (bỏ qua tháng trước ngày bắt đầu nhập liệu)
  if v_prev >= date_trunc('month', v_tenant_start)::date
     and not exists (
       select 1 from public.asset_depreciations d join public.assets a on a.id = d.asset_id
       where a.tenant_id = p_tenant and a.kind = p_kind and d.month = v_prev
     )
     and exists (
       select 1 from public.assets a cross join lateral app.asset_state(a.id, v_prev) s
       where a.tenant_id = p_tenant and a.kind = p_kind and not a.suspended and a.start_on < v_start
         and a.cost - s.accumulated > 0
         and not exists (select 1 from public.asset_disposals x where x.asset_id = a.id and x.disposed_on < v_start)
     ) then
    v_warnings := v_warnings || format('Tháng %s chưa %s — nên tính tháng đó trước', to_char(v_prev, 'MM/YYYY'), v_verb);
  end if;

  return jsonb_build_object(
    'ok', true, 'dry_run', p_dry_run, 'kind', p_kind, 'month', v_start, 'count', v_n, 'total', v_total,
    'voucher_id', v_id, 'number', v_number, 'posted', p_post and not p_dry_run and v_id is not null,
    'replaced', to_jsonb(v_replaced), 'warnings', to_jsonb(v_warnings), 'items', v_items);
end $$;

-- Xóa lần tính của tháng gần nhất: bỏ ghi sổ và xóa phiếu
create or replace function public.delete_asset_run(p_tenant uuid, p_kind text, p_month date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_later date;
  v_old record;
  v_deleted text[] := '{}';
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền xóa khấu hao / phân bổ');
  select max(d.month) into v_later
  from public.asset_depreciations d join public.assets a on a.id = d.asset_id
  where a.tenant_id = p_tenant and a.kind = p_kind and d.source = 'run' and d.month > v_start;
  if v_later is not null then
    raise exception 'Chỉ xóa được tháng tính gần nhất (%)', to_char(v_later, 'MM/YYYY') using errcode = 'P0001';
  end if;
  for v_old in
    select distinct v.id, v.number, v.status
    from public.asset_depreciations d
    join public.assets a on a.id = d.asset_id
    join public.vouchers v on v.id = d.voucher_id
    where a.tenant_id = p_tenant and a.kind = p_kind and d.month = v_start and d.source = 'run'
  loop
    if v_old.status = 'posted' then perform public.unpost_voucher(v_old.id); end if;
    perform public.delete_voucher(v_old.id);
    v_deleted := v_deleted || v_old.number;
  end loop;
  if cardinality(v_deleted) = 0 then
    raise exception 'Tháng % chưa %', to_char(v_start, 'MM/YYYY'), case p_kind when 'fixed' then 'tính khấu hao' else 'phân bổ' end
      using errcode = 'P0001';
  end if;
  return jsonb_build_object('ok', true, 'month', v_start, 'deleted', to_jsonb(v_deleted));
end $$;

-- ---------------------------------------------------------------------------
-- Ghi giảm (thanh lý, nhượng bán, hỏng, mất) — phiếu kế toán ngày ghi giảm:
--   TSCĐ: khấu hao phần tháng đến trước ngày giảm (Nợ chi phí / Có 214); Nợ 214 hao mòn lũy kế / Có 211;
--         Nợ p_account (mặc định 811) giá trị còn lại / Có 211.
--   CCDC: Nợ p_account (mặc định TK chi phí của CCDC) / Có 242 phần chưa phân bổ.
-- Tiền thu thanh lý (nếu có): lập phiếu thu / hóa đơn như thường (Có 711, 3331).
-- ---------------------------------------------------------------------------
create or replace function public.dispose_asset(
  p_tenant uuid, p_asset uuid, p_date date, p_reason text default null, p_account text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.assets;
  v_label text;
  v_month date := date_trunc('month', p_date)::date;
  v_dep date;
  v_acc numeric;
  v_used numeric;
  v_f numeric := 0;
  v_partial numeric := 0;
  v_remaining numeric;
  v_account text;
  v_lines jsonb := '[]'::jsonb;
  v_desc text;
  v_voucher uuid;
  v_number text;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền ghi giảm tài sản');
  if p_date is null then raise exception 'Chưa nhập ngày ghi giảm' using errcode = 'P0001'; end if;
  select * into a from public.assets where id = p_asset and tenant_id = p_tenant for update;
  if not found then raise exception 'Không tìm thấy tài sản' using errcode = 'P0001'; end if;
  v_label := case a.kind when 'fixed' then 'TSCĐ' else 'CCDC' end;
  if exists (select 1 from public.asset_disposals x where x.asset_id = a.id) then
    raise exception '% % đã ghi giảm', v_label, a.code using errcode = 'P0001';
  end if;
  if p_date < a.acquired_on then raise exception 'Ngày ghi giảm trước ngày ghi tăng' using errcode = 'P0001'; end if;
  select max(d.month) into v_dep from public.asset_depreciations d where d.asset_id = a.id and d.month >= v_month;
  if v_dep is not null then
    raise exception '% % đã % tháng % — xóa lần tính tháng đó rồi ghi giảm (ghi giảm trước khi tính khấu hao cuối tháng)',
      v_label, a.code, case a.kind when 'fixed' then 'tính khấu hao' else 'phân bổ' end, to_char(v_dep, 'MM/YYYY') using errcode = 'P0001';
  end if;
  perform app.assert_period_open(p_tenant, 'PK', p_date);

  select s.accumulated, s.months_used into v_acc, v_used from app.asset_state(a.id, v_month) s;
  v_desc := format('Ghi giảm %s %s — %s', v_label, a.code, a.name) || coalesce(' — ' || nullif(trim(p_reason), ''), '');

  if a.kind = 'fixed' then
    v_account := coalesce(nullif(trim(p_account), ''), '811');
    if not app.asset_account_ok(p_tenant, v_account, '^(811|6|154|241)') then
      raise exception 'TK ghi nhận giá trị còn lại phải là TK chi tiết đầu 811, 6, 154 hoặc 241 (đang chọn %)', v_account using errcode = 'P0001';
    end if;
    if not a.suspended and a.start_on < p_date then
      v_f := app.asset_month_fraction('fixed', a.start_on, v_month, p_date);
      v_partial := app.asset_charge(a.cost, a.months, v_acc, v_used, v_f);
    end if;
    v_acc := v_acc + v_partial;
    v_remaining := a.cost - v_acc;
    if v_partial > 0 then
      v_lines := v_lines || jsonb_build_object('debit_account', a.expense_account, 'credit_account', a.accum_account, 'amount', v_partial,
        'description', left(format('Khấu hao %s — %s tháng %s (%s ngày, đến trước ngày ghi giảm)', a.code, a.name,
          to_char(v_month, 'MM/YYYY'), app.asset_days(a.start_on, v_month, p_date)), 480));
    end if;
    if v_acc > 0 then
      v_lines := v_lines || jsonb_build_object('debit_account', a.accum_account, 'credit_account', a.asset_account, 'amount', v_acc,
        'description', left(format('Ghi giảm hao mòn lũy kế %s — %s', a.code, a.name), 480));
    end if;
    if v_remaining > 0 then
      v_lines := v_lines || jsonb_build_object('debit_account', v_account, 'credit_account', a.asset_account, 'amount', v_remaining,
        'description', left(format('Giá trị còn lại %s — %s', a.code, a.name), 480));
    end if;
  else
    v_account := coalesce(nullif(trim(p_account), ''), a.expense_account);
    if not app.asset_account_ok(p_tenant, v_account, '^(6|154|241|811)') then
      raise exception 'TK chi phí phải là TK chi tiết đầu 6, 154, 241 hoặc 811 (đang chọn %)', v_account using errcode = 'P0001';
    end if;
    v_remaining := a.cost - v_acc;
    if v_remaining > 0 then
      v_lines := v_lines || jsonb_build_object('debit_account', v_account, 'credit_account', a.asset_account, 'amount', v_remaining,
        'description', left(format('Phân bổ hết giá trị còn lại %s — %s (ghi giảm)', a.code, a.name), 480));
    end if;
  end if;

  if jsonb_array_length(v_lines) > 0 then
    v_voucher := public.save_voucher(jsonb_build_object(
      'tenant_id', p_tenant,
      'voucher_type', 'PK',
      'posting_date', p_date,
      'issue_date', p_date,
      'description', left(v_desc, 480),
      'source', 'system',
      'lines', v_lines
    ), true);
    select v.number into v_number from public.vouchers v where v.id = v_voucher;
  end if;
  insert into public.asset_disposals (asset_id, tenant_id, disposed_on, reason, voucher_id)
  values (a.id, p_tenant, p_date, nullif(trim(p_reason), ''), v_voucher);
  if v_partial > 0 then
    insert into public.asset_depreciations (tenant_id, asset_id, month, months_used, amount, source, voucher_id)
    values (p_tenant, a.id, v_month, round(v_f, 4), v_partial, 'disposal', v_voucher);
  end if;
  return jsonb_build_object('ok', true, 'voucher_id', v_voucher, 'number', v_number, 'partial', v_partial,
    'accumulated', v_acc, 'remaining', greatest(v_remaining, 0), 'account', v_account);
end $$;

-- Bỏ ghi giảm: xóa phiếu ghi giảm (dòng ghi giảm và khấu hao phần tháng mất theo)
create or replace function public.restore_asset(p_tenant uuid, p_asset uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  x public.asset_disposals;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền khôi phục tài sản');
  select * into x from public.asset_disposals where asset_id = p_asset and tenant_id = p_tenant for update;
  if not found then raise exception 'Tài sản chưa ghi giảm' using errcode = 'P0001'; end if;
  if x.voucher_id is not null then
    if (select status from public.vouchers where id = x.voucher_id) = 'posted' then
      perform public.unpost_voucher(x.voucher_id);
    end if;
    perform public.delete_voucher(x.voucher_id);
  else
    perform app.assert_period_open(p_tenant, 'PK', x.disposed_on);
  end if;
  delete from public.asset_disposals where asset_id = p_asset;
end $$;

-- ---------------------------------------------------------------------------
-- Báo cáo
-- ---------------------------------------------------------------------------
-- Sổ tài sản tại ngày p_as_of (mặc định hôm nay): tài sản đã ghi tăng đến ngày đó
create or replace function public.rpt_assets(p_tenant uuid, p_kind text, p_as_of date default null)
returns table (
  id uuid, code text, name text, category text, department text, quantity numeric, uom text,
  acquired_on date, start_on date, months integer, cost numeric, opening_accumulated numeric, opening_months numeric,
  accumulated numeric, remaining numeric, months_used numeric, months_left numeric, next_amount numeric,
  asset_account text, accum_account text, expense_account text, suspended boolean, status text,
  disposed_on date, disposal_reason text, disposal_voucher_id uuid, disposal_number text,
  increase_voucher_id uuid, increase_number text, last_month date, note text
) language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_as_of date := coalesce(p_as_of, app.today_vn());
begin
  perform app.require(app.is_member(p_tenant), 'Bạn không có quyền xem sổ tài sản');
  return query
  with dep as (
    select d.asset_id, sum(d.amount) as amount, sum(d.months_used) as used, max(d.month) as last_month
    from public.asset_depreciations d join public.vouchers v on v.id = d.voucher_id
    where d.tenant_id = p_tenant and v.status = 'posted' and v.posting_date <= v_as_of
    group by d.asset_id
  )
  select a.id, a.code, a.name, a.category, a.department, a.quantity, a.uom, a.acquired_on, a.start_on, a.months, a.cost,
    a.opening_accumulated, a.opening_months,
    (a.opening_accumulated + coalesce(dep.amount, 0))::numeric,
    (a.cost - a.opening_accumulated - coalesce(dep.amount, 0))::numeric,
    (a.opening_months + coalesce(dep.used, 0))::numeric,
    greatest(0, a.months - a.opening_months - coalesce(dep.used, 0))::numeric,
    case when x.asset_id is null and not a.suspended
         then app.asset_charge(a.cost, a.months, a.opening_accumulated + coalesce(dep.amount, 0), a.opening_months + coalesce(dep.used, 0), 1)
         else 0 end::numeric,
    a.asset_account, a.accum_account, a.expense_account, a.suspended,
    case when x.asset_id is not null then 'disposed'
         when a.cost - a.opening_accumulated - coalesce(dep.amount, 0) <= 0 then 'done'
         when a.suspended then 'suspended'
         else 'active' end,
    x.disposed_on, x.reason, x.voucher_id, xv.number, a.increase_voucher_id, iv.number, dep.last_month, a.note
  from public.assets a
  left join dep on dep.asset_id = a.id
  left join public.asset_disposals x on x.asset_id = a.id and x.disposed_on <= v_as_of
  left join public.vouchers xv on xv.id = x.voucher_id
  left join public.vouchers iv on iv.id = a.increase_voucher_id
  where a.tenant_id = p_tenant and a.kind = p_kind and a.acquired_on <= v_as_of
  order by a.code;
end $$;

-- Thẻ tài sản: từng tháng đã tính, lũy kế (chỉ phiếu đã ghi sổ), còn lại
create or replace function public.rpt_asset_card(p_tenant uuid, p_asset uuid)
returns table (
  month date, source text, months_used numeric, amount numeric, accumulated numeric, remaining numeric,
  voucher_id uuid, voucher_number text, posting_date date, posted boolean
) language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform app.require(app.is_member(p_tenant), 'Bạn không có quyền xem sổ tài sản');
  return query
  select d.month, d.source, d.months_used, d.amount,
    (a.opening_accumulated + sum(case when v.status = 'posted' then d.amount else 0 end) over w)::numeric,
    (a.cost - a.opening_accumulated - sum(case when v.status = 'posted' then d.amount else 0 end) over w)::numeric,
    d.voucher_id, v.number, v.posting_date, v.status = 'posted'
  from public.asset_depreciations d
  join public.assets a on a.id = d.asset_id
  join public.vouchers v on v.id = d.voucher_id
  where d.tenant_id = p_tenant and d.asset_id = p_asset
  window w as (order by d.month rows between unbounded preceding and current row)
  order by d.month;
end $$;

-- Các tháng đã tính khấu hao / phân bổ
create or replace function public.rpt_asset_runs(p_tenant uuid, p_kind text)
returns table (month date, voucher_id uuid, number text, status text, posting_date date, count integer, total numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform app.require(app.is_member(p_tenant), 'Bạn không có quyền xem sổ tài sản');
  return query
  select d.month, v.id, v.number, v.status, v.posting_date, count(*)::integer, sum(d.amount)::numeric
  from public.asset_depreciations d
  join public.assets a on a.id = d.asset_id
  join public.vouchers v on v.id = d.voucher_id
  where d.tenant_id = p_tenant and a.kind = p_kind and d.source = 'run'
  group by d.month, v.id, v.number, v.status, v.posting_date
  order by d.month desc;
end $$;

-- ---------------------------------------------------------------------------
-- Nhập danh sách TSCĐ / CCDC từ Excel (chuyển từ FAO). Không lập chứng từ: nguyên giá và hao mòn đầu kỳ
-- đã nằm trong số dư đầu kỳ / chứng từ mua. Một dòng lỗi thì không nhập dòng nào.
-- p_rows: [{row, code, name, category?, department?, quantity?, uom?, acquired_on?, start_on, cost, months,
--           opening_accumulated?, opening_months?, asset_account?, accum_account?, expense_account?, note?}]
-- ---------------------------------------------------------------------------
create or replace function public.import_assets(p_tenant uuid, p_kind text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  x jsonb;
  i integer := 0;
  v_row integer;
  v_code text;
  v_codes text[] := '{}';
  v_id uuid;
  v_old public.assets;
  v_errors jsonb := '[]'::jsonb;
  v_inserted integer := 0;
  v_updated integer := 0;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền khai báo tài sản');
  perform app.import_check_rows(p_rows);
  if p_kind is null or p_kind not in ('fixed', 'tool') then
    raise exception 'Loại tài sản không hợp lệ' using errcode = 'P0001';
  end if;
  begin
    for x in select e.value from jsonb_array_elements(p_rows) as e loop
      i := i + 1;
      v_row := coalesce((x ->> 'row')::integer, i);
      v_code := upper(trim(coalesce(x ->> 'code', '')));
      if v_code <> '' and v_code = any (v_codes) then
        v_errors := v_errors || jsonb_build_object('row', v_row, 'message', format('Trùng mã %s trong tệp', v_code));
        continue;
      end if;
      v_codes := v_codes || v_code;
      select * into v_old from public.assets a where a.tenant_id = p_tenant and a.kind = p_kind and a.code = v_code;
      begin
        if v_old.id is not null and exists (select 1 from public.asset_depreciations d where d.asset_id = v_old.id) then
          raise exception 'Tài sản % đã tính khấu hao / phân bổ — sửa trên thẻ tài sản', v_code using errcode = 'P0001';
        end if;
        v_id := public.save_asset(p_tenant, ((x - 'row') - 'increase') || jsonb_build_object('kind', p_kind, 'code', v_code), v_old.id);
        if v_old.id is null then v_inserted := v_inserted + 1; else v_updated := v_updated + 1; end if;
      exception when others then
        v_errors := v_errors || jsonb_build_object('row', v_row, 'message', sqlerrm);
      end;
    end loop;
    if jsonb_array_length(v_errors) > 0 then
      raise exception 'hoàn tác' using errcode = 'P0098';
    end if;
  exception when sqlstate 'P0098' then
    return jsonb_build_object('ok', false, 'errors', app.import_errors(v_errors));
  end;
  return jsonb_build_object('ok', true, 'inserted', v_inserted, 'updated', v_updated);
end $$;

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------
revoke execute on function app.asset_state(uuid, date), app.asset_default_accounts(uuid, text, text),
  app.asset_account_ok(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.save_asset(uuid, jsonb, uuid) from public, anon;
revoke execute on function public.delete_asset(uuid, uuid) from public, anon;
revoke execute on function public.run_asset_depreciation(uuid, text, date, boolean, boolean) from public, anon;
revoke execute on function public.delete_asset_run(uuid, text, date) from public, anon;
revoke execute on function public.dispose_asset(uuid, uuid, date, text, text) from public, anon;
revoke execute on function public.restore_asset(uuid, uuid) from public, anon;
revoke execute on function public.rpt_assets(uuid, text, date) from public, anon;
revoke execute on function public.rpt_asset_card(uuid, uuid) from public, anon;
revoke execute on function public.rpt_asset_runs(uuid, text) from public, anon;
revoke execute on function public.import_assets(uuid, text, jsonb) from public, anon;
grant execute on function public.save_asset(uuid, jsonb, uuid) to authenticated;
grant execute on function public.delete_asset(uuid, uuid) to authenticated;
grant execute on function public.run_asset_depreciation(uuid, text, date, boolean, boolean) to authenticated;
grant execute on function public.delete_asset_run(uuid, text, date) to authenticated;
grant execute on function public.dispose_asset(uuid, uuid, date, text, text) to authenticated;
grant execute on function public.restore_asset(uuid, uuid) to authenticated;
grant execute on function public.rpt_assets(uuid, text, date) to authenticated;
grant execute on function public.rpt_asset_card(uuid, uuid) to authenticated;
grant execute on function public.rpt_asset_runs(uuid, text) to authenticated;
grant execute on function public.import_assets(uuid, text, jsonb) to authenticated;
