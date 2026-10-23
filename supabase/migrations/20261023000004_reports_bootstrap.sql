-- AccEdu — Báo cáo tổng hợp (security invoker: RLS của gl_entries áp dụng) và khởi tạo đơn vị.

-- Số dư ròng (Nợ - Có) của từng tài khoản chi tiết trước ngày p_before
create or replace function app.leaf_net_before(p_tenant uuid, p_before date)
returns table (account text, net numeric)
language sql stable security invoker set search_path = '' as $$
  select account, sum(net) from (
    select ob.account, ob.debit - ob.credit as net
    from public.opening_balances ob where ob.tenant_id = p_tenant
    union all
    select g.account, g.debit - g.credit
    from public.gl_entries g where g.tenant_id = p_tenant and g.posting_date < p_before
  ) x group by account
$$;

-- Bảng cân đối số phát sinh (Trial balance) — tài khoản mẹ = tổng các tài khoản con
create or replace function public.rpt_trial_balance(p_tenant uuid, p_from date, p_to date, p_max_level int default 9)
returns table (
  account_code text, account_name text, level smallint, is_postable boolean,
  opening_debit numeric, opening_credit numeric, debit numeric, credit numeric,
  closing_debit numeric, closing_credit numeric
)
language sql stable security invoker set search_path = '' as $$
  with leaf_open as (
    select account, net from app.leaf_net_before(p_tenant, p_from)
  ),
  leaf_move as (
    select g.account, sum(g.debit) as debit, sum(g.credit) as credit
    from public.gl_entries g
    where g.tenant_id = p_tenant and g.posting_date between p_from and p_to
    group by g.account
  ),
  leaf as (
    select coalesce(o.account, m.account) as account,
           coalesce(o.net, 0) as open_net, coalesce(m.debit, 0) as debit, coalesce(m.credit, 0) as credit
    from leaf_open o full join leaf_move m on m.account = o.account
  ),
  leaf_split as (
    select account,
           greatest(open_net, 0) as od, greatest(-open_net, 0) as oc, debit, credit,
           greatest(open_net + debit - credit, 0) as cd, greatest(-(open_net + debit - credit), 0) as cc
    from leaf
  )
  select a.code, a.name, a.level, a.is_postable,
         sum(l.od), sum(l.oc), sum(l.debit), sum(l.credit), sum(l.cd), sum(l.cc)
  from public.accounts a
  join leaf_split l on l.account like a.code || '%'
  where a.tenant_id = p_tenant and a.level <= p_max_level
  group by a.code, a.name, a.level, a.is_postable
  having sum(l.od) <> 0 or sum(l.oc) <> 0 or sum(l.debit) <> 0 or sum(l.credit) <> 0
  order by a.code
$$;

-- Sổ nhật ký chung
create or replace function public.rpt_general_journal(p_tenant uuid, p_from date, p_to date)
returns table (
  posting_date date, voucher_number text, issue_date date, voucher_type text, voucher_id uuid,
  description text, account text, contra_account text, debit numeric, credit numeric, line_no int
)
language sql stable security invoker set search_path = '' as $$
  select g.posting_date, g.voucher_number, g.issue_date, g.voucher_type, g.voucher_id,
         g.description, g.account, g.contra_account, g.debit, g.credit, g.line_no
  from public.gl_entries g
  where g.tenant_id = p_tenant and g.posting_date between p_from and p_to
  order by g.posting_date, g.voucher_number, g.line_no, g.debit desc, g.id
$$;

-- Sổ chi tiết / sổ cái một tài khoản (gồm các tiểu khoản), có số dư lũy kế
create or replace function public.rpt_account_ledger(p_tenant uuid, p_account text, p_from date, p_to date)
returns table (
  row_kind text, posting_date date, voucher_number text, issue_date date, voucher_id uuid,
  description text, account text, contra_account text, debit numeric, credit numeric,
  balance_debit numeric, balance_credit numeric
)
language sql stable security invoker set search_path = '' as $$
  with opening as (
    select coalesce(sum(net), 0) as net
    from app.leaf_net_before(p_tenant, p_from) where account like p_account || '%'
  ),
  moves as (
    select g.posting_date, g.voucher_number, g.issue_date, g.voucher_id, g.description, g.account,
           g.contra_account, g.debit, g.credit, g.id
    from public.gl_entries g
    where g.tenant_id = p_tenant and g.account like p_account || '%'
      and g.posting_date between p_from and p_to
  ),
  running as (
    select m.*, (select net from opening)
             + sum(m.debit - m.credit) over (order by m.posting_date, m.voucher_number, m.id) as bal
    from moves m
  )
  select 'opening', p_from, null, null, null, 'Số dư đầu kỳ', p_account, null, null, null,
         greatest(o.net, 0), greatest(-o.net, 0)
  from opening o
  union all
  select 'entry', r.posting_date, r.voucher_number, r.issue_date, r.voucher_id, r.description, r.account,
         r.contra_account, r.debit, r.credit, greatest(r.bal, 0), greatest(-r.bal, 0)
  from running r
  union all
  select 'total', p_to, null, null, null, 'Cộng phát sinh', p_account, null,
         coalesce(sum(m.debit), 0), coalesce(sum(m.credit), 0), null, null
  from moves m
  union all
  select 'closing', p_to, null, null, null, 'Số dư cuối kỳ', p_account, null, null, null,
         greatest(o.net + coalesce(t.d, 0) - coalesce(t.c, 0), 0), greatest(-(o.net + coalesce(t.d, 0) - coalesce(t.c, 0)), 0)
  from opening o, (select sum(debit) as d, sum(credit) as c from moves) t
$$;

-- ---------------------------------------------------------------------------
-- Khởi tạo đơn vị mới: tenant + đơn vị cơ sở + chủ sở hữu + hệ thống tài khoản + quyển chứng từ
-- ---------------------------------------------------------------------------
create or replace function public.create_tenant(
  p_slug text, p_name text, p_regime text default 'TT99', p_tax_code text default null,
  p_start_date date default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_tenant uuid;
begin
  perform app.require(v_uid is not null, 'Cần đăng nhập để tạo đơn vị');
  if p_regime not in ('TT99', 'TT133') then raise exception 'Chế độ kế toán không hợp lệ: %', p_regime; end if;

  insert into public.tenants (slug, name, regime, tax_code, start_date, created_by)
  values (lower(p_slug), p_name, p_regime, p_tax_code,
          coalesce(p_start_date, date_trunc('year', now())::date), v_uid)
  returning id into v_tenant;

  insert into public.memberships (tenant_id, user_id, role) values (v_tenant, v_uid, 'owner');
  insert into public.branches (tenant_id, code, name, is_default) values (v_tenant, 'CTY', p_name, true);

  -- Hệ thống tài khoản theo chế độ (chèn theo cấp để tài khoản mẹ có trước)
  insert into public.accounts (tenant_id, code, name, parent_code, kind, normal_side, track_partner, track_item)
  select v_tenant, t.code, t.name, t.parent_code, t.kind, t.normal_side, t.track_partner, t.track_item
  from public.coa_templates t where t.regime = p_regime
  order by t.level, t.code;

  -- Một quyển chứng từ mặc định cho mỗi loại
  insert into public.voucher_books (tenant_id, code, name, voucher_type, prefix, is_default)
  select v_tenant, vt.code, vt.name, vt.code, vt.prefix, true from public.voucher_types vt;

  return v_tenant;
end $$;
revoke execute on function public.create_tenant(text, text, text, text, date) from public, anon;

-- Danh sách đơn vị của người dùng hiện tại (màn hình chọn đơn vị)
create or replace view public.my_tenants with (security_invoker = true) as
  select t.id, t.slug, t.name, t.regime, t.tax_code, m.role
  from public.tenants t
  join public.memberships m on m.tenant_id = t.id and m.user_id = (select auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime: đồng bộ web / desktop / mobile
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.vouchers, public.accounts, public.partners, public.items, public.jobs, public.period_locks;
  end if;
end $$;
