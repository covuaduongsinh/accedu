-- AccEdu — P7a: Cuối kỳ — kết chuyển xác định kết quả kinh doanh (911 → 4212), chuyển lợi nhuận năm trước
-- (4212 → 4211), danh sách việc cuối tháng.

-- ---------------------------------------------------------------------------
-- Bảng
-- ---------------------------------------------------------------------------
create table public.period_closings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('pl', 'carry')),
  month date not null check (month = date_trunc('month', month)::date),
  voucher_id uuid not null references public.vouchers (id) on delete cascade,
  revenue numeric(18, 2),
  expense numeric(18, 2),
  profit numeric(18, 2) not null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (tenant_id, kind, month)
);
comment on table public.period_closings is 'Kết chuyển cuối kỳ: pl = kết chuyển 911 → 4212 của tháng; carry = chuyển lợi nhuận năm trước 4212 → 4211 (month = đầu năm tài chính)';
create index period_closings_voucher on public.period_closings (voucher_id);

alter table public.period_closings enable row level security;
create policy period_closings_select on public.period_closings for select to authenticated using (app.is_member(tenant_id));
-- Ghi qua close_period / carry_forward_profit; không mở ghi trực tiếp

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.period_closings;
  end if;
end $$;

-- TK doanh thu / chi phí được kết chuyển vào 911: TK chi tiết đầu 5–8, trừ TK giá thành sản xuất
-- (611, 621, 622, 623, 627, 631 — kết chuyển vào 154, Dương Sinh không dùng)
create or replace function app.closing_account(p_code text, p_kind text)
returns boolean language sql immutable as $$
  select p_kind in ('revenue', 'expense') and p_code !~ '^(611|621|622|623|627|631)'
$$;

-- Số dư (Nợ − Có) các TK doanh thu / chi phí tại cuối ngày p_to (gồm số dư đầu kỳ)
create or replace function app.closing_balances(p_tenant uuid, p_to date)
returns table (account text, name text, kind text, net numeric)
language sql stable security definer set search_path = '' as $$
  select a.code, a.name, a.kind, b.net
  from app.leaf_net_before(p_tenant, p_to + 1) b
  join public.accounts a on a.tenant_id = p_tenant and a.code = b.account
  where app.closing_account(a.code, a.kind) and b.net <> 0
  order by a.code
$$;

-- ---------------------------------------------------------------------------
-- Kết chuyển xác định kết quả kinh doanh tháng p_month: một phiếu kế toán ngày cuối tháng.
--   TK dư Có (doanh thu, thu nhập): Nợ TK / Có 911; TK dư Nợ (chi phí, giảm trừ doanh thu): Nợ 911 / Có TK;
--   số dư 911 còn lại (lợi nhuận) → 4212: lãi Nợ 911 / Có 4212, lỗ Nợ 4212 / Có 911.
-- Tính lại tháng: thay phiếu cũ. Đã kết chuyển tháng sau thì phải xóa tháng sau trước.
-- ---------------------------------------------------------------------------
create or replace function public.close_period(
  p_tenant uuid, p_month date, p_post boolean default true, p_dry_run boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_prev date := (date_trunc('month', p_month) - interval '1 month')::date;
  v_label text := to_char(date_trunc('month', p_month), 'MM/YYYY');
  v_tenant_start date;
  v_later date;
  v_old record;
  r record;
  v_n integer := 0;
  v_lines jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_replaced text[] := '{}';
  v_warnings text[] := '{}';
  v_revenue numeric := 0;
  v_expense numeric := 0;
  v_b911 numeric := 0;
  v_sum numeric := 0;
  v_profit numeric := 0;
  v_drafts integer;
  v_id uuid;
  v_number text;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền kết chuyển cuối kỳ');
  if p_month is null then raise exception 'Chưa chọn tháng kết chuyển' using errcode = 'P0001'; end if;
  perform app.assert_period_open(p_tenant, 'PK', v_end);
  if not exists (select 1 from public.accounts a where a.tenant_id = p_tenant and a.code = '911' and a.is_active and a.is_postable)
     or not exists (select 1 from public.accounts a where a.tenant_id = p_tenant and a.code = '4212' and a.is_active and a.is_postable) then
    raise exception 'Cần TK 911 và 4212 là tài khoản chi tiết đang dùng' using errcode = 'P0001';
  end if;
  select start_date into v_tenant_start from public.tenants where id = p_tenant;

  select max(c.month) into v_later from public.period_closings c
  where c.tenant_id = p_tenant and c.kind = 'pl' and c.month > v_start;
  if v_later is not null then
    raise exception 'Đã kết chuyển tháng % — xóa kết chuyển các tháng sau (từ tháng gần nhất) trước khi kết chuyển lại tháng %',
      to_char(v_later, 'MM/YYYY'), v_label using errcode = 'P0001';
  end if;

  begin
    for v_old in
      select v.id, v.number, v.status from public.period_closings c join public.vouchers v on v.id = c.voucher_id
      where c.tenant_id = p_tenant and c.kind = 'pl' and c.month = v_start
    loop
      if v_old.status = 'posted' then perform public.unpost_voucher(v_old.id); end if;
      perform public.delete_voucher(v_old.id);
      v_replaced := v_replaced || v_old.number;
    end loop;

    select coalesce(sum(b.net), 0) into v_b911 from app.leaf_net_before(p_tenant, v_end + 1) b where b.account = '911';

    for r in select * from app.closing_balances(p_tenant, v_end) loop
      v_n := v_n + 1;
      v_sum := v_sum + r.net;
      if r.kind = 'revenue' then v_revenue := v_revenue - r.net; else v_expense := v_expense + r.net; end if;
      v_lines := v_lines || jsonb_build_object('line_no', v_n,
        'debit_account', case when r.net > 0 then '911' else r.account end,
        'credit_account', case when r.net > 0 then r.account else '911' end,
        'amount', abs(r.net),
        'description', left(format('Kết chuyển %s %s', r.account, r.name), 480));
      v_items := v_items || jsonb_build_object('account', r.account, 'name', r.name, 'kind', r.kind, 'balance', r.net,
        'debit_account', case when r.net > 0 then '911' else r.account end,
        'credit_account', case when r.net > 0 then r.account else '911' end, 'amount', abs(r.net));
    end loop;

    -- Lợi nhuận = số dư Có của 911 sau khi kết chuyển (gồm số dư 911 hạch toán tay nếu có)
    v_profit := -(v_b911 + v_sum);
    if v_profit <> 0 then
      v_n := v_n + 1;
      v_lines := v_lines || jsonb_build_object('line_no', v_n,
        'debit_account', case when v_profit > 0 then '911' else '4212' end,
        'credit_account', case when v_profit > 0 then '4212' else '911' end,
        'amount', abs(v_profit),
        'description', format('Kết chuyển %s tháng %s', case when v_profit > 0 then 'lãi' else 'lỗ' end, v_label));
      v_items := v_items || jsonb_build_object('account', '4212', 'name', 'Lợi nhuận sau thuế chưa phân phối năm nay', 'kind', 'result',
        'balance', null, 'debit_account', case when v_profit > 0 then '911' else '4212' end,
        'credit_account', case when v_profit > 0 then '4212' else '911' end, 'amount', abs(v_profit));
    end if;

    if v_n > 0 then
      v_id := public.save_voucher(jsonb_build_object(
        'tenant_id', p_tenant,
        'voucher_type', 'PK',
        'posting_date', v_end,
        'issue_date', v_end,
        'description', format('Kết chuyển xác định kết quả kinh doanh tháng %s', v_label),
        'source', 'system',
        'lines', v_lines
      ), p_post);
      select v.number into v_number from public.vouchers v where v.id = v_id;
      insert into public.period_closings (tenant_id, kind, month, voucher_id, revenue, expense, profit)
      values (p_tenant, 'pl', v_start, v_id, v_revenue, v_expense, v_profit);
    end if;

    if p_dry_run then
      raise exception 'hoàn tác' using errcode = 'P0099';
    end if;
  exception when sqlstate 'P0099' then
    v_id := null;
    v_number := null;
  end;

  select count(*)::integer into v_drafts from public.vouchers v
  where v.tenant_id = p_tenant and v.status in ('draft', 'review') and v.posting_date between v_start and v_end;
  if v_drafts > 0 then
    v_warnings := v_warnings || format('Còn %s chứng từ chưa ghi sổ trong tháng — ghi sổ rồi kết chuyển lại', v_drafts);
  end if;
  if v_b911 <> 0 then
    v_warnings := v_warnings || format('TK 911 có số dư %s trước khi kết chuyển (hạch toán tay) — đã tính vào lợi nhuận',
      app.fmt_amount(v_b911));
  end if;
  if v_prev >= date_trunc('month', v_tenant_start)::date
     and not exists (select 1 from public.period_closings c where c.tenant_id = p_tenant and c.kind = 'pl' and c.month = v_prev)
     and exists (select 1 from app.closing_balances(p_tenant, (v_start - 1))) then
    v_warnings := v_warnings || format('Tháng %s chưa kết chuyển — kết quả tháng này gồm cả số liệu tháng trước',
      to_char(v_prev, 'MM/YYYY'));
  end if;

  return jsonb_build_object(
    'ok', true, 'dry_run', p_dry_run, 'month', v_start, 'count', jsonb_array_length(v_items),
    'revenue', v_revenue, 'expense', v_expense, 'other', -v_b911, 'profit', v_profit,
    'voucher_id', v_id, 'number', v_number, 'posted', p_post and not p_dry_run and v_id is not null,
    'replaced', to_jsonb(v_replaced), 'warnings', to_jsonb(v_warnings), 'items', v_items);
end $$;

-- ---------------------------------------------------------------------------
-- Chuyển lợi nhuận năm trước: số dư 4212 trước ngày đầu năm tài chính → 4211 (phiếu ngày đầu năm).
-- p_date: ngày bất kỳ trong năm tài chính cần chuyển.
-- ---------------------------------------------------------------------------
create or replace function public.carry_forward_profit(
  p_tenant uuid, p_date date, p_post boolean default true, p_dry_run boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.tenants;
  v_start date;
  v_last date;
  v_old record;
  v_bal numeric := 0;
  v_id uuid;
  v_number text;
  v_replaced text[] := '{}';
  v_warnings text[] := '{}';
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền kết chuyển cuối kỳ');
  if p_date is null then raise exception 'Chưa chọn năm tài chính' using errcode = 'P0001'; end if;
  select * into t from public.tenants where id = p_tenant;
  v_start := make_date(extract(year from p_date)::integer, t.fiscal_year_start_month, 1);
  if v_start > p_date then v_start := (v_start - interval '1 year')::date; end if;
  v_last := (v_start - interval '1 month')::date;
  if v_start < t.start_date then
    raise exception 'Năm tài chính bắt đầu % trước ngày bắt đầu nhập liệu % — lợi nhuận năm trước đã nằm trong số dư đầu kỳ; chuyển vào đầu năm tài chính sau',
      to_char(v_start, 'DD/MM/YYYY'), to_char(t.start_date, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  perform app.assert_period_open(p_tenant, 'PK', v_start);
  if not exists (select 1 from public.accounts a where a.tenant_id = p_tenant and a.code = '4211' and a.is_active and a.is_postable)
     or not exists (select 1 from public.accounts a where a.tenant_id = p_tenant and a.code = '4212' and a.is_active and a.is_postable) then
    raise exception 'Cần TK 4211 và 4212 là tài khoản chi tiết đang dùng' using errcode = 'P0001';
  end if;

  begin
    for v_old in
      select v.id, v.number, v.status from public.period_closings c join public.vouchers v on v.id = c.voucher_id
      where c.tenant_id = p_tenant and c.kind = 'carry' and c.month = date_trunc('month', v_start)::date
    loop
      if v_old.status = 'posted' then perform public.unpost_voucher(v_old.id); end if;
      perform public.delete_voucher(v_old.id);
      v_replaced := v_replaced || v_old.number;
    end loop;

    -- Số dư 4212 trước ngày đầu năm (gồm số dư đầu kỳ và các lần chuyển của những năm trước)
    select coalesce(sum(b.net), 0) into v_bal from app.leaf_net_before(p_tenant, v_start) b where b.account = '4212';

    if v_bal <> 0 then
      v_id := public.save_voucher(jsonb_build_object(
        'tenant_id', p_tenant,
        'voucher_type', 'PK',
        'posting_date', v_start,
        'issue_date', v_start,
        'description', format('Chuyển %s năm trước sang lợi nhuận chưa phân phối năm trước (4212 → 4211)',
          case when v_bal < 0 then 'lợi nhuận' else 'lỗ' end),
        'source', 'system',
        'lines', jsonb_build_array(jsonb_build_object('line_no', 1,
          'debit_account', case when v_bal < 0 then '4212' else '4211' end,
          'credit_account', case when v_bal < 0 then '4211' else '4212' end,
          'amount', abs(v_bal)))
      ), p_post);
      select v.number into v_number from public.vouchers v where v.id = v_id;
      insert into public.period_closings (tenant_id, kind, month, voucher_id, profit)
      values (p_tenant, 'carry', date_trunc('month', v_start)::date, v_id, -v_bal);
    end if;

    if p_dry_run then
      raise exception 'hoàn tác' using errcode = 'P0099';
    end if;
  exception when sqlstate 'P0099' then
    v_id := null;
    v_number := null;
  end;

  if v_last >= date_trunc('month', t.start_date)::date
     and not exists (select 1 from public.period_closings c where c.tenant_id = p_tenant and c.kind = 'pl' and c.month = v_last)
     and exists (select 1 from app.closing_balances(p_tenant, (v_start - 1))) then
    v_warnings := v_warnings || format('Tháng %s (cuối năm trước) chưa kết chuyển 911 — lợi nhuận năm trước chưa đầy đủ',
      to_char(v_last, 'MM/YYYY'));
  end if;

  return jsonb_build_object('ok', true, 'dry_run', p_dry_run, 'year_start', v_start, 'profit', -v_bal,
    'voucher_id', v_id, 'number', v_number, 'posted', p_post and not p_dry_run and v_id is not null,
    'replaced', to_jsonb(v_replaced), 'warnings', to_jsonb(v_warnings));
end $$;

-- Xóa kết chuyển: pl chỉ xóa được tháng gần nhất; carry xóa theo năm
create or replace function public.delete_period_closing(p_tenant uuid, p_kind text, p_month date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_later date;
  c record;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền xóa kết chuyển');
  if p_kind = 'pl' then
    select max(x.month) into v_later from public.period_closings x
    where x.tenant_id = p_tenant and x.kind = 'pl' and x.month > v_start;
    if v_later is not null then
      raise exception 'Chỉ xóa được kết chuyển tháng gần nhất (%)', to_char(v_later, 'MM/YYYY') using errcode = 'P0001';
    end if;
  end if;
  select x.voucher_id, v.number, v.status into c from public.period_closings x join public.vouchers v on v.id = x.voucher_id
  where x.tenant_id = p_tenant and x.kind = p_kind and x.month = v_start;
  if not found then
    raise exception 'Chưa có kết chuyển % tháng %', case p_kind when 'pl' then '911' else 'lợi nhuận năm trước' end,
      to_char(v_start, 'MM/YYYY') using errcode = 'P0001';
  end if;
  if c.status = 'posted' then perform public.unpost_voucher(c.voucher_id); end if;
  perform public.delete_voucher(c.voucher_id);
  return jsonb_build_object('ok', true, 'number', c.number);
end $$;

-- Lịch sử kết chuyển
create or replace function public.rpt_period_closings(p_tenant uuid)
returns table (kind text, month date, voucher_id uuid, number text, status text, posting_date date,
               revenue numeric, expense numeric, profit numeric, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform app.require(app.is_member(p_tenant), 'Bạn không có quyền xem kết chuyển cuối kỳ');
  return query
  select c.kind, c.month, c.voucher_id, v.number, v.status, v.posting_date, c.revenue, c.expense, c.profit, c.created_at
  from public.period_closings c join public.vouchers v on v.id = c.voucher_id
  where c.tenant_id = p_tenant
  order by c.month desc, c.kind;
end $$;

-- ---------------------------------------------------------------------------
-- Việc cuối tháng: 9 bước, mỗi bước status done / pending / na, diễn giải và màn hình cần mở
-- ---------------------------------------------------------------------------
create or replace function public.rpt_period_checklist(p_tenant uuid, p_month date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_items jsonb := '[]'::jsonb;
  n integer;
  m integer;
  v_text text;
  v_amount numeric;
  v_lock date;
  v_close public.period_closings;
  k text;
begin
  perform app.require(app.is_member(p_tenant), 'Bạn không có quyền xem việc cuối kỳ');

  -- 1. Chứng từ chưa ghi sổ
  select coalesce(sum(x.c), 0)::integer, string_agg(format('%s %s', x.c, x.t), ', ' order by x.t) into n, v_text
  from (select v.voucher_type as t, count(*) as c from public.vouchers v
        where v.tenant_id = p_tenant and v.status in ('draft', 'review') and v.posting_date between v_start and v_end
        group by 1) x;
  v_items := v_items || jsonb_build_object('key', 'drafts', 'label', 'Ghi sổ các chứng từ trong tháng',
    'status', case when n > 0 then 'pending' else 'done' end,
    'detail', case when n > 0 then format('%s chứng từ chưa ghi sổ (%s)', n, v_text) else 'Mọi chứng từ trong tháng đã ghi sổ' end,
    'count', n, 'path', 'general/journal');

  -- 2. Phân bổ doanh thu học phí 3387 → 5113
  select count(*)::integer into n from public.tuition_recognitions tr where tr.tenant_id = p_tenant and tr.month = v_start;
  if n > 0 then
    v_items := v_items || jsonb_build_object('key', 'tuition', 'label', 'Phân bổ doanh thu học phí (3387 → 5113)', 'status', 'done',
      'detail', format('Đã phân bổ %s dòng học phí', n), 'count', n, 'path', 'education/revenue');
  else
    select count(*)::integer into m from public.tuition_bills b
    join public.vouchers inv on inv.id = b.invoice_id and inv.status = 'posted' and inv.posting_date <= v_end
    where b.tenant_id = p_tenant and b.period_start <= v_end
      and b.amount > coalesce((select sum(tr.amount) from public.tuition_recognitions tr
                               join public.vouchers pv on pv.id = tr.voucher_id and pv.status = 'posted' where tr.bill_id = b.id), 0);
    v_items := v_items || jsonb_build_object('key', 'tuition', 'label', 'Phân bổ doanh thu học phí (3387 → 5113)',
      'status', case when m > 0 then 'pending' else 'na' end,
      'detail', case when m > 0 then format('%s phiếu học phí còn chờ phân bổ', m) else 'Không có học phí chờ phân bổ' end,
      'count', m, 'path', 'education/revenue');
  end if;

  -- 3. Lương HLV theo buổi dạy
  select count(*)::integer into n from public.coach_pay p where p.tenant_id = p_tenant and p.month = v_start;
  if n > 0 then
    v_items := v_items || jsonb_build_object('key', 'coach_pay', 'label', 'Lương HLV theo buổi dạy', 'status', 'done',
      'detail', format('Đã lập lương %s HLV', n), 'count', n, 'path', 'education/coach-pay');
  else
    select count(*)::integer into m from public.class_sessions s
    where s.tenant_id = p_tenant and s.held_on between v_start and v_end and s.coach_partner_id is not null
      and exists (select 1 from public.attendance a where a.session_id = s.id);
    v_items := v_items || jsonb_build_object('key', 'coach_pay', 'label', 'Lương HLV theo buổi dạy',
      'status', case when m > 0 then 'pending' else 'na' end,
      'detail', case when m > 0 then format('%s buổi dạy trong tháng chưa lập lương', m) else 'Không có buổi dạy cần trả lương' end,
      'count', m, 'path', 'education/coach-pay');
  end if;

  -- 4–5. Khấu hao TSCĐ, phân bổ CCDC
  foreach k in array array['fixed', 'tool'] loop
    select count(*)::integer into n from public.asset_depreciations d join public.assets a on a.id = d.asset_id
    where a.tenant_id = p_tenant and a.kind = k and d.month = v_start and d.source = 'run';
    if n > 0 then
      m := n;
    else
      select count(*)::integer into m from public.assets a cross join lateral app.asset_state(a.id, v_start) s
      where a.tenant_id = p_tenant and a.kind = k and not a.suspended and a.start_on <= v_end and a.cost - s.accumulated > 0
        and not exists (select 1 from public.asset_disposals x where x.asset_id = a.id and x.disposed_on <= v_end);
    end if;
    v_items := v_items || jsonb_build_object('key', case k when 'fixed' then 'depreciation' else 'tools' end,
      'label', case k when 'fixed' then 'Khấu hao TSCĐ' else 'Phân bổ CCDC' end,
      'status', case when n > 0 then 'done' when m > 0 then 'pending' else 'na' end,
      'detail', case when n > 0 then format('Đã tính %s %s', n, case k when 'fixed' then 'TSCĐ' else 'CCDC' end)
                     when m > 0 then format('%s %s cần %s', m, case k when 'fixed' then 'TSCĐ' else 'CCDC' end,
                                            case k when 'fixed' then 'tính khấu hao' else 'phân bổ' end)
                     else format('Không có %s cần tính', case k when 'fixed' then 'TSCĐ' else 'CCDC' end) end,
      'count', m, 'path', case k when 'fixed' then 'assets/depreciation' else 'tools/allocation' end);
  end loop;

  -- 6. Tồn kho khớp sổ cái
  select count(*)::integer, coalesce(sum(abs(x.difference)), 0), string_agg(x.account, ', ' order by x.account) filter (where x.difference <> 0)
  into n, v_amount, v_text
  from public.rpt_stock_vs_ledger(p_tenant, v_end) x;
  v_items := v_items || jsonb_build_object('key', 'stock', 'label', 'Tồn kho khớp sổ cái',
    'status', case when n = 0 then 'na' when v_amount = 0 then 'done' else 'pending' end,
    'detail', case when n = 0 then 'Không theo dõi tồn kho' when v_amount = 0 then 'Giá trị tồn kho khớp sổ cái'
                   else format('Chênh %s đ ở TK %s', app.fmt_amount(v_amount), v_text) end,
    'count', n, 'path', 'inventory/stock-summary');

  -- 7. Sao kê ngân hàng
  select count(*)::integer, count(*) filter (where b.voucher_id is null and not b.ignored)::integer into n, m
  from public.bank_lines b where b.tenant_id = p_tenant and b.txn_date between v_start and v_end;
  v_items := v_items || jsonb_build_object('key', 'bank', 'label', 'Khớp sao kê ngân hàng',
    'status', case when n = 0 then 'na' when m = 0 then 'done' else 'pending' end,
    'detail', case when n = 0 then 'Chưa nhập sao kê tháng này' when m = 0 then format('%s dòng sao kê đã khớp / bỏ qua', n)
                   else format('%s / %s dòng sao kê chưa khớp', m, n) end,
    'count', m, 'path', 'cash/bank-statements');

  -- 8. Kết chuyển 911
  select * into v_close from public.period_closings c where c.tenant_id = p_tenant and c.kind = 'pl' and c.month = v_start;
  select count(*)::integer into n from app.closing_balances(p_tenant, v_end);
  v_items := v_items || jsonb_build_object('key', 'closing', 'label', 'Kết chuyển xác định kết quả (911)',
    'status', case when n > 0 then 'pending' when v_close.id is not null then 'done' else 'na' end,
    'detail', case when n > 0 and v_close.id is not null then format('Số liệu thay đổi sau khi kết chuyển: %s TK doanh thu / chi phí còn số dư — kết chuyển lại', n)
                   when n > 0 then format('%s TK doanh thu / chi phí còn số dư', n)
                   when v_close.id is not null then format('Đã kết chuyển: %s %s đ', case when v_close.profit >= 0 then 'lãi' else 'lỗ' end,
                                                          app.fmt_amount(abs(v_close.profit)))
                   else 'Không có doanh thu / chi phí' end,
    'count', n, 'path', 'general/closing');

  -- 9. Khóa sổ
  select max(l.locked_until) into v_lock from public.period_locks l where l.tenant_id = p_tenant and l.voucher_type = '*';
  v_items := v_items || jsonb_build_object('key', 'lock', 'label', 'Khóa sổ',
    'status', case when v_lock >= v_end then 'done' else 'pending' end,
    'detail', case when v_lock is null then 'Chưa khóa sổ' else format('Đã khóa đến %s', to_char(v_lock, 'DD/MM/YYYY')) end,
    'count', 0, 'path', 'system/periods');

  return jsonb_build_object('month', v_start,
    'pending', (select count(*) from jsonb_array_elements(v_items) i where i ->> 'status' = 'pending'),
    'items', v_items);
end $$;

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------
revoke execute on function app.closing_balances(uuid, date) from public, anon, authenticated;
revoke execute on function public.close_period(uuid, date, boolean, boolean) from public, anon;
revoke execute on function public.carry_forward_profit(uuid, date, boolean, boolean) from public, anon;
revoke execute on function public.delete_period_closing(uuid, text, date) from public, anon;
revoke execute on function public.rpt_period_closings(uuid) from public, anon;
revoke execute on function public.rpt_period_checklist(uuid, date) from public, anon;
grant execute on function public.close_period(uuid, date, boolean, boolean) to authenticated;
grant execute on function public.carry_forward_profit(uuid, date, boolean, boolean) to authenticated;
grant execute on function public.delete_period_closing(uuid, text, date) to authenticated;
grant execute on function public.rpt_period_closings(uuid) to authenticated;
grant execute on function public.rpt_period_checklist(uuid, date) to authenticated;
