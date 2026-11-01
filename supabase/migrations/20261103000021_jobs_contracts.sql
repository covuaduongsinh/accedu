-- AccEdu — P7b: Vụ việc & hợp đồng — lãi lỗ theo vụ việc (lớp, khóa, giải đấu, hợp đồng), sổ chi tiết vụ việc,
-- hợp đồng bán / mua với trường học, đối tác: giá trị, đã xuất hóa đơn, đã thu / trả, còn phải thu / trả.
-- Báo cáo doanh thu / chi phí theo kỳ không tính phiếu kết chuyển cuối kỳ (period_closings) — sửa luôn lãi gộp.

-- ---------------------------------------------------------------------------
-- Bảng hợp đồng: mỗi hợp đồng gắn đúng một vụ việc (mã, tên, thời hạn ở vụ việc) — nhập mã hợp đồng ở cột
-- "Vụ việc" của hóa đơn, phiếu thu / chi là chứng từ thuộc hợp đồng.
-- ---------------------------------------------------------------------------
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  job_id uuid not null unique references public.jobs (id) on delete restrict,
  direction text not null default 'sale' check (direction in ('sale', 'purchase')),
  number text,
  partner_id uuid not null references public.partners (id) on delete restrict,
  signed_date date,
  value numeric(18, 2) not null default 0 check (value >= 0),
  status text not null default 'active' check (status in ('draft', 'active', 'done', 'cancelled')),
  note text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.contracts is 'Hợp đồng bán (sale: trường học, nhà tài trợ) / mua (purchase) — gắn 1-1 với vụ việc; value gồm thuế GTGT';
comment on column public.contracts.status is 'draft đang thỏa thuận, active đang thực hiện, done đã thanh lý, cancelled đã hủy';
create index contracts_tenant on public.contracts (tenant_id, direction);
create index contracts_partner on public.contracts (partner_id);
create trigger contracts_audit after insert or update or delete on public.contracts for each row execute function app.audit();
create trigger contracts_touch before update on public.contracts for each row execute function app.touch_updated_at();

alter table public.contracts enable row level security;
create policy contracts_select on public.contracts for select to authenticated using (app.is_member(tenant_id));
-- Ghi qua save_contract / delete_contract (cập nhật luôn vụ việc); không mở ghi trực tiếp

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.contracts;
  end if;
end $$;

-- Tra cứu theo vụ việc
create index gl_entries_job on public.gl_entries (tenant_id, job_id, posting_date) where job_id is not null;
create index voucher_lines_job on public.voucher_lines (job_id) where job_id is not null;

-- ---------------------------------------------------------------------------
-- Doanh thu, giảm trừ, chi phí theo vụ việc trong khoảng ngày (p_from null = từ đầu), từ sổ cái.
--   Doanh thu = Có − Nợ TK loại doanh thu trừ 521 (511x, 515, 711); giảm trừ = Nợ − Có 521x;
--   chi phí = Nợ − Có TK loại chi phí; bỏ TK giá thành (611, 621, 622, 623, 627, 631) như kết chuyển 911.
-- Không tính phiếu kết chuyển cuối kỳ (chỉ đưa số dư về 0). security invoker: RLS sổ cái áp dụng.
-- ---------------------------------------------------------------------------
create or replace function app.job_pl(p_tenant uuid, p_from date, p_to date)
returns table (job_id uuid, revenue numeric, deductions numeric, cost numeric)
language sql stable security invoker set search_path = '' as $$
  select g.job_id,
         coalesce(sum(g.credit - g.debit) filter (where a.kind = 'revenue' and g.account not like '521%'), 0),
         coalesce(sum(g.debit - g.credit) filter (where a.kind = 'revenue' and g.account like '521%'), 0),
         coalesce(sum(g.debit - g.credit) filter (where a.kind = 'expense'), 0)
  from public.gl_entries g
  join public.accounts a on a.tenant_id = g.tenant_id and a.code = g.account
  where g.tenant_id = p_tenant and g.posting_date <= p_to
    and (p_from is null or g.posting_date >= p_from)
    and app.closing_account(a.code, a.kind)
    and not exists (select 1 from public.period_closings c where c.voucher_id = g.voucher_id)
  group by g.job_id
$$;

-- ---------------------------------------------------------------------------
-- Lãi lỗ theo vụ việc trong kỳ. Dòng job_id null = "(Không gắn vụ việc)" — tổng các dòng = lãi lỗ toàn đơn vị.
-- deferred: số dư Có TK 3387 của vụ việc đến cuối kỳ (học phí đã lập chưa phân bổ vào doanh thu).
-- Lọc p_kind (class, course, event, project, contract) thì bỏ dòng không gắn vụ việc.
-- ---------------------------------------------------------------------------
create or replace function public.rpt_job_pnl(p_tenant uuid, p_from date, p_to date, p_kind text default null)
returns table (job_id uuid, code text, name text, kind text, partner_name text, start_date date, end_date date,
               is_active boolean, budget numeric, revenue numeric, deductions numeric, net_revenue numeric,
               cost numeric, profit numeric, margin numeric, deferred numeric)
language sql stable security invoker set search_path = '' as $$
  with e as (
    select x.job_id, x.revenue, x.deductions, x.cost from app.job_pl(p_tenant, p_from, p_to) x
  ),
  d as (
    select y.job_id, sum(y.net) as deferred from (
      select ob.job_id, ob.credit - ob.debit as net from public.opening_balances ob
      where ob.tenant_id = p_tenant and ob.job_id is not null and ob.account like '3387%'
      union all
      select g.job_id, g.credit - g.debit from public.gl_entries g
      where g.tenant_id = p_tenant and g.job_id is not null and g.account like '3387%' and g.posting_date <= p_to
    ) y group by y.job_id
  ),
  k as (
    select coalesce(e.job_id, d.job_id) as job_id,
           coalesce(e.revenue, 0) as revenue, coalesce(e.deductions, 0) as deductions, coalesce(e.cost, 0) as cost,
           coalesce(d.deferred, 0) as deferred
    from e full join d on d.job_id = e.job_id
  )
  select k.job_id, j.code, coalesce(j.name, '(Không gắn vụ việc)'), j.kind, p.name, j.start_date, j.end_date,
         j.is_active, j.budget,
         k.revenue::numeric(18, 2), k.deductions::numeric(18, 2), (k.revenue - k.deductions)::numeric(18, 2),
         k.cost::numeric(18, 2), (k.revenue - k.deductions - k.cost)::numeric(18, 2),
         case when k.revenue - k.deductions <> 0
              then round((k.revenue - k.deductions - k.cost) * 100 / (k.revenue - k.deductions), 1) end,
         k.deferred::numeric(18, 2)
  from k
  left join public.jobs j on j.id = k.job_id
  left join public.partners p on p.id = j.partner_id
  where (k.revenue <> 0 or k.deductions <> 0 or k.cost <> 0 or k.deferred <> 0)
    and (p_kind is null or j.kind = p_kind)
  order by k.job_id is null, j.code
$$;

-- ---------------------------------------------------------------------------
-- Sổ chi tiết vụ việc (p_job null = bút toán không gắn vụ việc): lũy kế trước kỳ, từng bút toán trong kỳ
-- (doanh thu / chi phí và lãi lỗ lũy kế), cộng trong kỳ, lũy kế đến cuối kỳ.
-- p_pl_only = false (chỉ với một vụ việc): thêm bút toán công nợ, tiền, 3387… (không tính vào lãi lỗ).
-- ---------------------------------------------------------------------------
create or replace function public.rpt_job_ledger(p_tenant uuid, p_job uuid, p_from date, p_to date, p_pl_only boolean default true)
returns table (row_kind text, posting_date date, voucher_number text, voucher_type text, voucher_id uuid,
               description text, account text, account_name text, contra_account text, partner_code text,
               debit numeric, credit numeric, revenue numeric, cost numeric, profit numeric)
language sql stable security invoker set search_path = '' as $$
  with opening as (
    select coalesce(sum(x.revenue - x.deductions), 0) as revenue, coalesce(sum(x.cost), 0) as cost
    from app.job_pl(p_tenant, null, p_from - 1) x where x.job_id is not distinct from p_job
  ),
  moves as (
    select g.id, g.line_no, g.posting_date, g.voucher_number, g.voucher_type, g.voucher_id, g.description, g.account,
           a.name as account_name, g.contra_account, p.code as partner_code, g.debit, g.credit,
           case when a.kind = 'revenue' and app.closing_account(a.code, a.kind) then g.credit - g.debit end as revenue,
           case when a.kind = 'expense' and app.closing_account(a.code, a.kind) then g.debit - g.credit end as cost
    from public.gl_entries g
    join public.accounts a on a.tenant_id = g.tenant_id and a.code = g.account
    left join public.partners p on p.id = g.partner_id
    where g.tenant_id = p_tenant and g.job_id is not distinct from p_job
      and g.posting_date between p_from and p_to
      and not exists (select 1 from public.period_closings c where c.voucher_id = g.voucher_id)
  ),
  m as (
    select * from moves
    where (p_job is not null and not coalesce(p_pl_only, true)) or revenue is not null or cost is not null
  ),
  running as (
    select m.*, (select o.revenue - o.cost from opening o)
             + sum(coalesce(m.revenue, 0) - coalesce(m.cost, 0))
                 over (order by m.posting_date, m.voucher_number, m.line_no, m.debit desc, m.id) as run
    from m
  ),
  t as (
    select coalesce(sum(m.debit), 0) as debit, coalesce(sum(m.credit), 0) as credit,
           coalesce(sum(m.revenue), 0) as revenue, coalesce(sum(m.cost), 0) as cost
    from m
  )
  select x.row_kind, x.posting_date, x.voucher_number, x.voucher_type, x.voucher_id, x.description, x.account,
         x.account_name, x.contra_account, x.partner_code, x.debit, x.credit, x.revenue, x.cost, x.profit
  from (
    select 0 as k, null::integer as line_no, null::bigint as gid, 'opening' as row_kind, p_from as posting_date,
           null::text as voucher_number, null::text as voucher_type, null::uuid as voucher_id,
           'Lũy kế trước kỳ' as description, null::text as account, null::text as account_name,
           null::text as contra_account, null::text as partner_code,
           null::numeric as debit, null::numeric as credit, o.revenue, o.cost, o.revenue - o.cost as profit
    from opening o
    union all
    select 1, r.line_no, r.id, 'entry', r.posting_date, r.voucher_number, r.voucher_type, r.voucher_id, r.description,
           r.account, r.account_name, r.contra_account, r.partner_code, r.debit, r.credit, r.revenue, r.cost, r.run
    from running r
    union all
    select 2, null, null, 'total', p_to, null, null, null, 'Cộng trong kỳ', null, null, null, null,
           t.debit, t.credit, t.revenue, t.cost, t.revenue - t.cost
    from t
    union all
    select 3, null, null, 'closing', p_to, null, null, null, 'Lũy kế đến cuối kỳ', null, null, null, null,
           null, null, o.revenue + t.revenue, o.cost + t.cost, o.revenue + t.revenue - o.cost - t.cost
    from opening o, t
  ) x
  order by x.k, x.posting_date, x.voucher_number, x.line_no, x.debit desc, x.gid
$$;

-- ---------------------------------------------------------------------------
-- Theo dõi hợp đồng đến ngày p_as_of (null: mọi chứng từ đã ghi sổ, quá hạn tính theo hôm nay):
--   invoiced  = dòng hóa đơn đã ghi sổ gắn vụ việc của hợp đồng (tiền hàng + thuế): bán HDB/HDV, mua HDM/HMV;
--   settled   = phần đã thanh toán của các hóa đơn đó (theo tỷ lệ dòng của hợp đồng trong hóa đơn)
--               + khoản thu / trả không theo hóa đơn gắn vụ việc (bán: dòng Có 131; mua: dòng Nợ 331);
--   balance   = invoiced − settled (âm: đối tác ứng trước); not_invoiced = value − invoiced;
--   revenue / cost / profit: lãi lỗ lũy kế của vụ việc; overdue: đang thực hiện mà đã qua ngày kết thúc.
-- ---------------------------------------------------------------------------
create or replace function app.contract_documents(p_tenant uuid, p_as_of date)
returns table (contract_id uuid, kind text, voucher_id uuid, amount numeric, paid numeric)
language sql stable security invoker set search_path = '' as $$
  with c as (
    select c.id, c.job_id, c.direction from public.contracts c where c.tenant_id = p_tenant
  ),
  inv as (
    select c.id as contract_id, v.id as voucher_id, v.total_amount, sum(l.amount + l.vat_amount) as amount
    from c
    join public.voucher_lines l on l.job_id = c.job_id
    join public.vouchers v on v.id = l.voucher_id
    where v.tenant_id = p_tenant and v.status = 'posted' and v.posting_date <= p_as_of
      and v.voucher_type = any (case c.direction when 'sale' then array['HDB', 'HDV'] else array['HDM', 'HMV'] end)
    group by c.id, v.id, v.total_amount
  )
  select i.contract_id, 'invoice', i.voucher_id, i.amount,
         case when i.total_amount > 0 then round(coalesce((
           select sum(pl.amount) from public.voucher_lines pl join public.vouchers pv on pv.id = pl.voucher_id
           where pl.invoice_id = i.voucher_id and pv.status = 'posted' and pv.posting_date <= p_as_of
         ), 0) * least(i.amount / i.total_amount, 1), 2) else 0 end
  from inv i
  union all
  select c.id, 'advance', v.id, sum(l.amount), sum(l.amount)
  from c
  join public.voucher_lines l on l.job_id = c.job_id and l.invoice_id is null
  join public.vouchers v on v.id = l.voucher_id
  where v.tenant_id = p_tenant and v.status = 'posted' and v.posting_date <= p_as_of
    and v.voucher_type not in ('HDB', 'HDV', 'HDM', 'HMV')
    and ((c.direction = 'sale' and l.credit_account like '131%') or (c.direction = 'purchase' and l.debit_account like '331%'))
  group by c.id, v.id
$$;

create or replace function public.rpt_contracts(p_tenant uuid, p_as_of date default null)
returns table (id uuid, job_id uuid, code text, name text, number text, direction text, partner_id uuid,
               partner_code text, partner_name text, signed_date date, start_date date, end_date date,
               value numeric, status text, note text, invoiced numeric, settled numeric, balance numeric,
               not_invoiced numeric, revenue numeric, cost numeric, profit numeric, overdue boolean)
language sql stable security invoker set search_path = '' as $$
  with d as (select coalesce(p_as_of, 'infinity'::date) as upto, coalesce(p_as_of, current_date) as as_of),
  docs as (
    select x.contract_id,
           coalesce(sum(x.amount) filter (where x.kind = 'invoice'), 0) as invoiced,
           coalesce(sum(x.paid), 0) as settled
    from d, app.contract_documents(p_tenant, d.upto) x
    group by x.contract_id
  ),
  pl as (
    select x.job_id, x.revenue - x.deductions as revenue, x.cost from d, app.job_pl(p_tenant, null, d.upto) x
  )
  select c.id, c.job_id, j.code, j.name, c.number, c.direction, c.partner_id, p.code, p.name, c.signed_date,
         j.start_date, j.end_date, c.value, c.status, c.note,
         coalesce(s.invoiced, 0)::numeric(18, 2), coalesce(s.settled, 0)::numeric(18, 2),
         (coalesce(s.invoiced, 0) - coalesce(s.settled, 0))::numeric(18, 2),
         (c.value - coalesce(s.invoiced, 0))::numeric(18, 2),
         coalesce(pl.revenue, 0)::numeric(18, 2), coalesce(pl.cost, 0)::numeric(18, 2),
         (coalesce(pl.revenue, 0) - coalesce(pl.cost, 0))::numeric(18, 2),
         c.status = 'active' and j.end_date is not null and j.end_date < d.as_of
  from public.contracts c
  cross join d
  join public.jobs j on j.id = c.job_id
  join public.partners p on p.id = c.partner_id
  left join docs s on s.contract_id = c.id
  left join pl on pl.job_id = c.job_id
  where c.tenant_id = p_tenant
  order by c.direction desc, coalesce(c.signed_date, j.start_date) desc nulls last, j.code
$$;

-- Hóa đơn và khoản thu / trả không theo hóa đơn của một hợp đồng (mọi chứng từ đã ghi sổ)
create or replace function public.rpt_contract_detail(p_tenant uuid, p_contract uuid)
returns table (kind text, voucher_id uuid, voucher_type text, number text, posting_date date, invoice_number text,
               description text, amount numeric, paid numeric)
language sql stable security invoker set search_path = '' as $$
  select x.kind, v.id, v.voucher_type, v.number, v.posting_date, v.invoice_number, v.description,
         x.amount::numeric(18, 2), x.paid::numeric(18, 2)
  from app.contract_documents(p_tenant, 'infinity'::date) x
  join public.vouchers v on v.id = x.voucher_id
  where x.contract_id = p_contract
  order by v.posting_date, x.kind desc, v.number
$$;

-- ---------------------------------------------------------------------------
-- Khai báo hợp đồng (kế toán trở lên). Hợp đồng mới: mã chưa có → tạo vụ việc loại "contract"; mã là vụ việc
-- có sẵn → gắn vào (trừ lớp học hoặc vụ việc đã có hợp đồng). Sửa: cập nhật cả tên, đối tác, thời hạn của vụ việc.
-- ---------------------------------------------------------------------------
create or replace function public.save_contract(p_tenant uuid, p_contract jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_old public.contracts;
  v_job public.jobs;
  v_code text := upper(trim(coalesce(p_contract ->> 'code', '')));
  v_name text := trim(coalesce(p_contract ->> 'name', ''));
  v_direction text := coalesce(nullif(p_contract ->> 'direction', ''), 'sale');
  v_number text := nullif(trim(p_contract ->> 'number'), '');
  v_partner uuid := nullif(p_contract ->> 'partner_id', '')::uuid;
  v_signed date := nullif(p_contract ->> 'signed_date', '')::date;
  v_start date := nullif(p_contract ->> 'start_date', '')::date;
  v_end date := nullif(p_contract ->> 'end_date', '')::date;
  v_value numeric := round(coalesce(nullif(p_contract ->> 'value', '')::numeric, 0), 0);
  v_status text := coalesce(nullif(p_contract ->> 'status', ''), 'active');
  v_note text := nullif(trim(p_contract ->> 'note'), '');
  v_id uuid;
begin
  perform app.require(app.can_edit_catalog(p_tenant), 'Bạn không có quyền khai báo hợp đồng');
  if p_id is not null then
    select * into v_old from public.contracts where id = p_id and tenant_id = p_tenant for update;
    if not found then raise exception 'Không tìm thấy hợp đồng' using errcode = 'P0001'; end if;
    select * into v_job from public.jobs where id = v_old.job_id;
    v_code := v_job.code;
  end if;

  if v_code = '' then raise exception 'Chưa nhập mã hợp đồng' using errcode = 'P0001'; end if;
  if length(v_code) > 32 then raise exception 'Mã hợp đồng tối đa 32 ký tự' using errcode = 'P0001'; end if;
  if v_name = '' then raise exception 'Chưa nhập tên hợp đồng' using errcode = 'P0001'; end if;
  if v_direction not in ('sale', 'purchase') then
    raise exception 'Loại hợp đồng không hợp lệ: %', v_direction using errcode = 'P0001';
  end if;
  if v_status not in ('draft', 'active', 'done', 'cancelled') then
    raise exception 'Trạng thái hợp đồng không hợp lệ: %', v_status using errcode = 'P0001';
  end if;
  if v_partner is null or not exists (select 1 from public.partners p where p.id = v_partner and p.tenant_id = p_tenant) then
    raise exception 'Chưa chọn đối tác của hợp đồng' using errcode = 'P0001';
  end if;
  if v_value < 0 then raise exception 'Giá trị hợp đồng không được âm' using errcode = 'P0001'; end if;
  if v_start is not null and v_end is not null and v_end < v_start then
    raise exception 'Ngày kết thúc trước ngày bắt đầu' using errcode = 'P0001';
  end if;

  if p_id is not null then
    update public.jobs set name = v_name, partner_id = v_partner, start_date = v_start, end_date = v_end
    where id = v_old.job_id;
    update public.contracts set direction = v_direction, number = v_number, partner_id = v_partner,
      signed_date = v_signed, value = v_value, status = v_status, note = v_note
    where id = p_id;
    return p_id;
  end if;

  select * into v_job from public.jobs j where j.tenant_id = p_tenant and upper(j.code) = v_code;
  if found then
    if exists (select 1 from public.contracts c where c.job_id = v_job.id) then
      raise exception 'Vụ việc % đã có hợp đồng', v_job.code using errcode = 'P0001';
    end if;
    if exists (select 1 from public.classes c where c.job_id = v_job.id) then
      raise exception 'Mã % là lớp học — chọn mã khác cho hợp đồng', v_job.code using errcode = 'P0001';
    end if;
    update public.jobs set name = v_name, partner_id = v_partner, start_date = v_start, end_date = v_end
    where id = v_job.id;
  else
    insert into public.jobs (tenant_id, code, name, kind, partner_id, start_date, end_date)
    values (p_tenant, v_code, v_name, 'contract', v_partner, v_start, v_end)
    returning * into v_job;
  end if;

  insert into public.contracts (tenant_id, job_id, direction, number, partner_id, signed_date, value, status, note)
  values (p_tenant, v_job.id, v_direction, v_number, v_partner, v_signed, v_value, v_status, v_note)
  returning id into v_id;
  return v_id;
end $$;

-- Xóa hợp đồng; vụ việc loại "contract" chưa có chứng từ / số dư nào dùng thì xóa luôn, có rồi thì giữ
create or replace function public.delete_contract(p_tenant uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.contracts;
  v_kind text;
  v_job_deleted boolean := false;
begin
  perform app.require(app.can_edit_catalog(p_tenant), 'Bạn không có quyền xóa hợp đồng');
  select * into v from public.contracts where id = p_id and tenant_id = p_tenant for update;
  if not found then raise exception 'Không tìm thấy hợp đồng' using errcode = 'P0001'; end if;
  delete from public.contracts where id = p_id;

  select kind into v_kind from public.jobs where id = v.job_id;
  if v_kind = 'contract' and not exists (select 1 from public.gl_entries g where g.job_id = v.job_id) then
    begin
      delete from public.jobs where id = v.job_id;
      v_job_deleted := true;
    exception when foreign_key_violation then
      v_job_deleted := false;
    end;
  end if;
  return jsonb_build_object('ok', true, 'job_deleted', v_job_deleted);
end $$;

-- ---------------------------------------------------------------------------
-- Lãi gộp (bản 0012): không tính phiếu kết chuyển cuối kỳ — sau khi kết chuyển 911, dòng "Không gắn mã hàng"
-- từng hiện doanh thu / giá vốn âm bằng toàn bộ số của tháng.
-- ---------------------------------------------------------------------------
create or replace function public.rpt_gross_profit(p_tenant uuid, p_from date, p_to date, p_by text default 'item')
returns table (key_id uuid, code text, name text, uom text, quantity numeric, revenue numeric, deductions numeric,
               net_revenue numeric, cogs numeric, gross_profit numeric, margin numeric)
language sql stable security invoker set search_path = '' as $$
  with g as (
    select case when p_by = 'customer' then e.partner_id else e.item_id end as k,
           coalesce(sum(e.credit - e.debit) filter (where e.account like '511%'), 0)::numeric(18, 2) as revenue,
           coalesce(sum(e.debit - e.credit) filter (where e.account like '521%'), 0)::numeric(18, 2) as deductions,
           coalesce(sum(e.debit - e.credit) filter (where e.account like '632%'), 0)::numeric(18, 2) as cogs
    from public.gl_entries e
    where e.tenant_id = p_tenant and e.posting_date between p_from and p_to
      and (e.account like '511%' or e.account like '521%' or e.account like '632%')
      and not exists (select 1 from public.period_closings c where c.voucher_id = e.voucher_id)
    group by 1
  ),
  q as (
    select case when p_by = 'customer' then l.partner_id else l.item_id end as k, sum(coalesce(l.quantity, 0)) as qty
    from public.voucher_lines l join public.vouchers v on v.id = l.voucher_id
    where v.tenant_id = p_tenant and v.status = 'posted' and v.voucher_type in ('HDB', 'HDV')
      and v.posting_date between p_from and p_to
    group by 1
  )
  select g.k,
         coalesce(i.code, p.code),
         coalesce(i.name, p.name, case when p_by = 'customer' then '(Không gắn khách hàng)' else '(Không gắn mã hàng)' end),
         i.uom,
         coalesce(q.qty, 0)::numeric(18, 4),
         g.revenue, g.deductions, g.revenue - g.deductions, g.cogs, g.revenue - g.deductions - g.cogs,
         case when g.revenue - g.deductions <> 0
              then round((g.revenue - g.deductions - g.cogs) * 100 / (g.revenue - g.deductions), 1) end
  from g
  left join q on q.k is not distinct from g.k
  left join public.items i on p_by <> 'customer' and i.id = g.k
  left join public.partners p on p_by = 'customer' and p.id = g.k
  where g.revenue <> 0 or g.deductions <> 0 or g.cogs <> 0
  order by g.k is null, coalesce(i.code, p.code)
$$;

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------
revoke execute on function app.job_pl(uuid, date, date) from public, anon;
revoke execute on function app.contract_documents(uuid, date) from public, anon;
grant execute on function app.job_pl(uuid, date, date) to authenticated;
grant execute on function app.contract_documents(uuid, date) to authenticated;
revoke execute on function public.rpt_job_pnl(uuid, date, date, text) from public, anon;
revoke execute on function public.rpt_job_ledger(uuid, uuid, date, date, boolean) from public, anon;
revoke execute on function public.rpt_contracts(uuid, date) from public, anon;
revoke execute on function public.rpt_contract_detail(uuid, uuid) from public, anon;
revoke execute on function public.save_contract(uuid, jsonb, uuid) from public, anon;
revoke execute on function public.delete_contract(uuid, uuid) from public, anon;
grant execute on function public.rpt_job_pnl(uuid, date, date, text) to authenticated;
grant execute on function public.rpt_job_ledger(uuid, uuid, date, date, boolean) to authenticated;
grant execute on function public.rpt_contracts(uuid, date) to authenticated;
grant execute on function public.rpt_contract_detail(uuid, uuid) to authenticated;
grant execute on function public.save_contract(uuid, jsonb, uuid) to authenticated;
grant execute on function public.delete_contract(uuid, uuid) to authenticated;
