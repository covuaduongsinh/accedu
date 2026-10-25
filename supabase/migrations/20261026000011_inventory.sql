-- AccEdu — P5a: Kho hàng — danh mục kho, tồn kho đầu kỳ, sổ kho (stock_entries), phiếu nhập/xuất/điều chuyển,
-- giá vốn hàng xuất kho theo bình quân di động hoặc bình quân cả tháng (chọn theo đơn vị), chặn xuất âm kho,
-- báo cáo nhập–xuất–tồn, thẻ kho.
--
-- Quy tắc:
--   Dòng kho = dòng chứng từ đã ghi sổ có mặt hàng theo dõi tồn kho và TK theo dõi vật tư (accounts.track_item):
--     TK vật tư ở vế Nợ → nhập (PNK, HDM…); ở vế Có → xuất (PXK…); PDC → xuất kho đi + nhập kho đến.
--   Giá bình quân tính theo mặt hàng, chung mọi kho (điều chuyển không đổi giá).
--   Thứ tự: ngày hạch toán → trong ngày nhập trước, điều chuyển, rồi xuất → số chứng từ → số dòng.
--   Ghi sổ / bỏ ghi sổ một dòng kho thì tự tính lại giá các dòng xuất từ ngày đó (bỏ qua kỳ đã khóa),
--   số tiền dòng xuất (voucher_lines.amount) và bút toán của các phiếu bị ảnh hưởng được dựng lại.

-- ---------------------------------------------------------------------------
-- Cột & bảng
-- ---------------------------------------------------------------------------
alter table public.tenants
  add column stock_cost_method text not null default 'moving' check (stock_cost_method in ('moving', 'monthly'));
comment on column public.tenants.stock_cost_method is 'Giá vốn hàng xuất kho: moving = bình quân di động (tức thời), monthly = bình quân cả tháng';

alter table public.warehouses
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();
create trigger warehouses_touch before update on public.warehouses for each row execute function app.touch_updated_at();
create trigger warehouses_audit after insert or update or delete on public.warehouses for each row execute function app.audit();

alter table public.vouchers add column to_warehouse_id uuid references public.warehouses (id) on delete restrict;
comment on column public.vouchers.to_warehouse_id is 'Phiếu điều chuyển (PDC): kho nhập';

update public.voucher_types set default_header_account = '331' where code = 'PNK';
update public.voucher_types set default_header_account = '632' where code = 'PXK';

-- Mỗi đơn vị có sẵn "Kho chính"
create or replace function app.tenant_default_warehouse() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.warehouses (tenant_id, code, name) values (new.id, 'KHO', 'Kho chính')
  on conflict (tenant_id, code) do nothing;
  return new;
end $$;
create trigger tenants_default_warehouse after insert on public.tenants
  for each row execute function app.tenant_default_warehouse();
insert into public.warehouses (tenant_id, code, name)
select t.id, 'KHO', 'Kho chính' from public.tenants t
where not exists (select 1 from public.warehouses w where w.tenant_id = t.id);

-- Tồn kho đầu kỳ theo mặt hàng × kho (giá trị khớp số dư đầu kỳ TK vật tư)
create table public.stock_openings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  account text not null,
  quantity numeric(18, 4) not null default 0 check (quantity >= 0),
  amount numeric(18, 2) not null default 0 check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, item_id, warehouse_id)
);
create trigger stock_openings_touch before update on public.stock_openings for each row execute function app.touch_updated_at();

-- Sổ kho: sinh khi ghi sổ, chỉ hàm hệ thống được ghi
create table public.stock_entries (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  voucher_id uuid not null references public.vouchers (id) on delete cascade,
  line_no integer not null,
  kind text not null check (kind in ('in', 'out', 'xfer_out', 'xfer_in')),
  -- Thứ tự trong cùng ngày: 0 nhập, 1 chuyển đi, 2 chuyển đến, 3 xuất
  seq smallint not null,
  voucher_type text not null,
  voucher_number text not null,
  posting_date date not null,
  item_id uuid not null references public.items (id) on delete restrict,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  account text not null,
  qty_in numeric(18, 4) not null default 0,
  qty_out numeric(18, 4) not null default 0,
  amount_in numeric(18, 2) not null default 0,
  amount_out numeric(18, 2) not null default 0
);
create index stock_entries_item on public.stock_entries (tenant_id, item_id, posting_date);
create index stock_entries_warehouse on public.stock_entries (tenant_id, warehouse_id);
create index stock_entries_voucher on public.stock_entries (voucher_id);
create index voucher_lines_item on public.voucher_lines (item_id) where item_id is not null;

alter table public.stock_openings enable row level security;
alter table public.stock_entries enable row level security;
create policy stock_openings_select on public.stock_openings for select to authenticated using (app.is_member(tenant_id));
create policy stock_entries_select on public.stock_entries for select to authenticated using (app.is_member(tenant_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.warehouses, public.stock_openings;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Tiện ích
-- ---------------------------------------------------------------------------
create or replace function app.fmt_qty(p numeric) returns text
language sql immutable set search_path = '' as $$
  select replace(trim_scale(p)::text, '.', ',')
$$;

create or replace function app.locked_until(p_tenant uuid, p_type text) returns date
language sql stable security definer set search_path = '' as $$
  select max(locked_until) from public.period_locks where tenant_id = p_tenant and voucher_type in ('*', p_type)
$$;

-- Tổng tiền chứng từ theo dòng (dùng chung save_voucher và tính giá vốn)
create or replace function app.voucher_totals(p_voucher uuid) returns void
language sql security definer set search_path = '' as $$
  update public.vouchers v set
    total_net = s.net, total_vat = s.vat, total_amount = s.net + s.vat, total_amount_fc = s.total_fc
  from (
    select coalesce(sum(amount) filter (where debit_account is not null), 0) as net,
           coalesce(sum(vat_amount), 0) as vat,
           coalesce(sum(amount_fc) filter (where debit_account is not null), 0) as total_fc
    from public.voucher_lines where voucher_id = p_voucher
  ) s
  where v.id = p_voucher
$$;

-- ---------------------------------------------------------------------------
-- Bút toán sổ cái của một chứng từ (tách từ post_voucher bản 0009, hành vi không đổi)
-- ---------------------------------------------------------------------------
create or replace function app.build_voucher_gl(p_voucher uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v public.vouchers;
  v_side text;
  v_count integer;
begin
  select * into v from public.vouchers where id = p_voucher;
  select header_side into v_side from public.voucher_types where code = v.voucher_type;

  delete from public.gl_entries where voucher_id = v.id;

  with lines as (
    select l.*, (l.debit_account is not null and l.credit_account is not null) as is_pair
    from public.voucher_lines l where l.voucher_id = v.id
  ),
  single_sides as (
    select entry_group,
           case when count(*) filter (where debit_account is not null) = 1
                then max(debit_account) end as only_debit,
           case when count(*) filter (where credit_account is not null) = 1
                then max(credit_account) end as only_credit
    from lines where not is_pair group by entry_group
  ),
  vat as (
    -- Bán: Nợ TK phần đầu (vế Nợ của dòng) / Có TK thuế; mua: Nợ TK thuế / Có TK phần đầu (vế Có của dòng)
    select l.*,
           case when v_side = 'debit' then l.debit_account else l.vat_account end as vat_debit,
           case when v_side = 'debit' then l.vat_account else l.credit_account end as vat_credit,
           round(l.vat_amount / v.exchange_rate, 2) as vat_fc
    from lines l where l.vat_amount > 0 and l.is_pair
  ),
  entries as (
    -- vế Nợ
    select l.line_no, l.debit_account as account,
           case when l.is_pair then l.credit_account else s.only_credit end as contra,
           l.amount as debit, 0::numeric as credit, l.amount_fc as debit_fc, 0::numeric as credit_fc,
           l.partner_id, l.job_id, l.department_id, l.expense_item_id, l.item_id, l.description
    from lines l left join single_sides s on s.entry_group = l.entry_group and not l.is_pair
    where l.debit_account is not null
    union all
    -- vế Có
    select l.line_no, l.credit_account,
           case when l.is_pair then l.debit_account else s.only_debit end,
           0, l.amount, 0, l.amount_fc,
           l.partner_id, l.job_id, l.department_id, l.expense_item_id, l.item_id, l.description
    from lines l left join single_sides s on s.entry_group = l.entry_group and not l.is_pair
    where l.credit_account is not null
    union all
    -- thuế GTGT: vế Nợ
    select t.line_no, t.vat_debit, t.vat_credit, t.vat_amount, 0, t.vat_fc, 0,
           t.partner_id, t.job_id, t.department_id, t.expense_item_id, t.item_id,
           'Thuế GTGT ' || coalesce(t.description, v.description, '')
    from vat t
    union all
    -- thuế GTGT: vế Có
    select t.line_no, t.vat_credit, t.vat_debit, 0, t.vat_amount, 0, t.vat_fc,
           t.partner_id, t.job_id, t.department_id, t.expense_item_id, t.item_id,
           'Thuế GTGT ' || coalesce(t.description, v.description, '')
    from vat t
  )
  insert into public.gl_entries (tenant_id, branch_id, voucher_id, voucher_type, voucher_number, issue_date,
    posting_date, line_no, account, contra_account, debit, credit, debit_fc, credit_fc, currency,
    partner_id, job_id, department_id, expense_item_id, item_id, description)
  select v.tenant_id, v.branch_id, v.id, v.voucher_type, v.number, v.issue_date, v.posting_date,
    e.line_no, e.account, e.contra, e.debit, e.credit, e.debit_fc, e.credit_fc, v.currency,
    e.partner_id, e.job_id, e.department_id, e.expense_item_id, e.item_id, coalesce(e.description, v.description)
  from entries e;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Xuất âm kho: dòng đầu tiên làm số tồn (mặt hàng × kho) âm, theo thứ tự sổ kho
-- ---------------------------------------------------------------------------
create or replace function app.stock_first_negative(p_tenant uuid, p_items uuid[])
returns table (item_id uuid, warehouse_id uuid, voucher_id uuid, voucher_number text, posting_date date,
               balance numeric, qty_out numeric)
language sql stable security definer set search_path = '' as $$
  with mv as (
    select o.item_id, o.warehouse_id, null::date as d, -1 as seq, ''::text as num, 0 as line_no, 0::bigint as id,
           o.quantity as delta, null::uuid as vid, 0::numeric as qo
    from public.stock_openings o where o.tenant_id = p_tenant and o.item_id = any (p_items)
    union all
    select e.item_id, e.warehouse_id, e.posting_date, e.seq, e.voucher_number, e.line_no, e.id,
           e.qty_in - e.qty_out, e.voucher_id, e.qty_out
    from public.stock_entries e where e.tenant_id = p_tenant and e.item_id = any (p_items)
  ),
  run as (
    select mv.*, sum(mv.delta) over (partition by mv.item_id, mv.warehouse_id
                                     order by mv.d nulls first, mv.seq, mv.num, mv.line_no, mv.id
                                     rows unbounded preceding) as bal
    from mv
  )
  select r.item_id, r.warehouse_id, r.vid, r.num, r.d, r.bal, r.qo
  from run r where r.bal < 0
  order by r.d nulls first, r.seq, r.num, r.line_no, r.id
  limit 1
$$;

create or replace function app.stock_negative_message(
  p_item uuid, p_warehouse uuid, p_voucher uuid, p_number text, p_date date, p_balance numeric, p_qty_out numeric,
  p_current uuid
) returns text language sql stable security definer set search_path = '' as $$
  select case
    when p_voucher is not distinct from p_current and p_current is not null then
      format('Không đủ tồn: %s tại kho %s còn %s %s, phiếu này xuất %s',
             i.code, w.code, app.fmt_qty(p_balance + p_qty_out), i.uom, app.fmt_qty(p_qty_out))
    else
      format('%s tại kho %s — phiếu %s ngày %s sẽ bị xuất âm (thiếu %s %s)',
             i.code, w.code, p_number, to_char(p_date, 'DD/MM/YYYY'), app.fmt_qty(-p_balance), i.uom)
  end
  from public.items i, public.warehouses w
  where i.id = p_item and w.id = p_warehouse
$$;

-- ---------------------------------------------------------------------------
-- Tính giá vốn hàng xuất kho cho các mặt hàng, từ ngày p_from (phương pháp tháng: từ đầu tháng của p_from).
-- Cập nhật amount_out của dòng xuất / chuyển đi (và amount_in của dòng chuyển đến), số tiền dòng chứng từ,
-- rồi dựng lại tổng tiền & bút toán các phiếu đã ghi sổ bị thay đổi (trừ p_skip_gl: phiếu đang ghi sổ).
-- Dòng thuộc kỳ đã khóa giữ nguyên. Trả số chứng từ bị thay đổi.
-- ---------------------------------------------------------------------------
create or replace function app.stock_recost(p_tenant uuid, p_items uuid[], p_from date, p_skip_gl uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_method text;
  v_item uuid;
  v_start date;
  v_end date;
  m date;
  q numeric;
  val numeric;
  in_q numeric;
  in_v numeric;
  v_avg numeric;
  v_amt numeric;
  v_locked boolean;
  v_last_out bigint;
  r record;
  v_changed uuid[] := '{}';
  v_vid uuid;
begin
  select stock_cost_method into v_method from public.tenants where id = p_tenant;
  foreach v_item in array coalesce(p_items, '{}'::uuid[]) loop
    v_start := case when v_method = 'monthly' then date_trunc('month', p_from)::date else p_from end;
    select coalesce(sum(quantity), 0), coalesce(sum(amount), 0) into q, val
    from public.stock_openings where tenant_id = p_tenant and item_id = v_item;
    select q + coalesce(sum(qty_in - qty_out), 0), val + coalesce(sum(amount_in - amount_out), 0) into q, val
    from public.stock_entries
    where tenant_id = p_tenant and item_id = v_item and posting_date < v_start and kind in ('in', 'out');

    if v_method = 'monthly' then
      select max(posting_date) into v_end from public.stock_entries where tenant_id = p_tenant and item_id = v_item;
      m := v_start;
    else
      v_end := null;
    end if;

    loop
      -- Bình quân di động: một lượt từ v_start; bình quân tháng: từng tháng một
      exit when v_method = 'monthly' and (v_end is null or m > v_end);
      if v_method = 'monthly' then
        select coalesce(sum(qty_in), 0), coalesce(sum(amount_in), 0) into in_q, in_v
        from public.stock_entries
        where tenant_id = p_tenant and item_id = v_item and kind = 'in'
          and posting_date >= m and posting_date < (m + interval '1 month')::date;
        v_avg := case when q + in_q > 0 then (val + in_v) / (q + in_q) else 0 end;
        v_last_out := null;
      end if;

      for r in
        select e.* from public.stock_entries e
        where e.tenant_id = p_tenant and e.item_id = v_item and e.kind <> 'xfer_in'
          and e.posting_date >= coalesce(m, v_start)
          and (v_method <> 'monthly' or e.posting_date < (m + interval '1 month')::date)
        order by e.posting_date, e.seq, e.voucher_number, e.line_no, e.id
      loop
        if r.kind = 'in' then
          q := q + r.qty_in;
          val := val + r.amount_in;
          continue;
        end if;
        v_locked := r.posting_date <= coalesce(app.locked_until(p_tenant, r.voucher_type), '-infinity'::date);
        if v_locked then
          v_amt := r.amount_out;
        elsif v_method = 'monthly' then
          v_amt := round(r.qty_out * v_avg, 0);
        elsif q <= 0 then
          v_amt := 0;
        elsif r.kind = 'out' and q - r.qty_out <= 0 then
          v_amt := greatest(val, 0); -- xuất hết số tồn: lấy trọn giá trị còn lại
        else
          v_amt := round(r.qty_out * val / q, 0);
        end if;
        if r.kind = 'out' then
          q := q - r.qty_out;
          val := val - v_amt;
          if not v_locked then v_last_out := r.id; end if;
        end if;
        if v_amt is distinct from r.amount_out then
          update public.stock_entries set amount_out = v_amt where id = r.id;
          if r.kind = 'xfer_out' then
            update public.stock_entries set amount_in = v_amt
            where voucher_id = r.voucher_id and line_no = r.line_no and kind = 'xfer_in';
          end if;
          update public.voucher_lines set amount = v_amt, amount_fc = v_amt
          where voucher_id = r.voucher_id and line_no = r.line_no;
          v_changed := v_changed || r.voucher_id;
        end if;
      end loop;

      exit when v_method <> 'monthly';
      -- Hết hàng cuối tháng: dồn chênh lệch làm tròn vào dòng xuất cuối cùng của tháng
      if q = 0 and val <> 0 and v_last_out is not null then
        select * into r from public.stock_entries where id = v_last_out;
        if r.amount_out + val >= 0 then
          update public.stock_entries set amount_out = r.amount_out + val where id = r.id;
          update public.voucher_lines set amount = r.amount_out + val, amount_fc = r.amount_out + val
          where voucher_id = r.voucher_id and line_no = r.line_no;
          v_changed := v_changed || r.voucher_id;
          val := 0;
        end if;
      end if;
      m := (m + interval '1 month')::date;
    end loop;
  end loop;

  for v_vid in select distinct x from unnest(v_changed) as x loop
    perform app.voucher_totals(v_vid);
    if v_vid is distinct from p_skip_gl
       and exists (select 1 from public.vouchers where id = v_vid and status = 'posted') then
      perform app.build_voucher_gl(v_vid);
    end if;
  end loop;
  return (select count(distinct x) from unnest(v_changed) as x);
end $$;

-- ---------------------------------------------------------------------------
-- Ghi sổ kho cho một chứng từ (gọi trong post_voucher, trước khi dựng bút toán)
-- ---------------------------------------------------------------------------
create or replace function app.stock_post(p_voucher uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.vouchers;
  v_bad text;
  v_items uuid[];
  neg record;
begin
  select * into v from public.vouchers where id = p_voucher;
  delete from public.stock_entries where voucher_id = v.id;

  select string_agg(format('dòng %s: %s', line_no, msg), '; ' order by line_no) into v_bad
  from (
    select l.line_no,
      case
        when l.warehouse_id is null then format('chưa chọn kho cho mặt hàng %s', i.code)
        when v.voucher_type = 'PDC' and v.to_warehouse_id is null then 'chưa chọn kho nhập'
        when v.voucher_type = 'PDC' and v.to_warehouse_id = l.warehouse_id then 'kho xuất trùng kho nhập'
        when coalesce(l.quantity, 0) < 0 then 'số lượng không được âm'
        when (coalesce(ca.track_item, false) or v.voucher_type = 'PDC') and coalesce(l.quantity, 0) <= 0
          then format('chưa nhập số lượng xuất mặt hàng %s', i.code)
        when coalesce(w.tenant_id, v.tenant_id) <> v.tenant_id then 'kho không thuộc đơn vị'
      end as msg
    from public.voucher_lines l
    join public.items i on i.id = l.item_id and i.track_inventory
    left join public.warehouses w on w.id = l.warehouse_id
    left join public.accounts da on da.tenant_id = v.tenant_id and da.code = l.debit_account
    left join public.accounts ca on ca.tenant_id = v.tenant_id and ca.code = l.credit_account
    where l.voucher_id = v.id and (coalesce(da.track_item, false) or coalesce(ca.track_item, false))
  ) c
  where msg is not null;
  if v_bad is not null then
    raise exception 'Dòng hàng tồn kho chưa đủ thông tin — %', v_bad using errcode = 'P0001';
  end if;

  insert into public.stock_entries (tenant_id, voucher_id, line_no, kind, seq, voucher_type, voucher_number,
    posting_date, item_id, warehouse_id, account, qty_in, qty_out, amount_in, amount_out)
  select v.tenant_id, v.id, l.line_no, k.kind, k.seq, v.voucher_type, v.number, v.posting_date, l.item_id,
         k.wh, k.acc, k.qi, k.qo, k.ai, k.ao
  from public.voucher_lines l
  join public.items i on i.id = l.item_id and i.track_inventory
  left join public.accounts da on da.tenant_id = v.tenant_id and da.code = l.debit_account
  left join public.accounts ca on ca.tenant_id = v.tenant_id and ca.code = l.credit_account
  cross join lateral (
    select x.* from (values
      ('xfer_out', 1, l.warehouse_id, l.credit_account, 0::numeric, l.quantity, 0::numeric, l.amount, v.voucher_type = 'PDC'),
      ('xfer_in', 2, v.to_warehouse_id, l.debit_account, l.quantity, 0::numeric, l.amount, 0::numeric, v.voucher_type = 'PDC'),
      ('out', 3, l.warehouse_id, l.credit_account, 0::numeric, l.quantity, 0::numeric, l.amount,
        v.voucher_type <> 'PDC' and coalesce(ca.track_item, false)),
      ('in', 0, l.warehouse_id, l.debit_account, coalesce(l.quantity, 0), 0::numeric, l.amount, 0::numeric,
        v.voucher_type <> 'PDC' and coalesce(da.track_item, false) and not coalesce(ca.track_item, false)
        and (coalesce(l.quantity, 0) > 0 or l.amount > 0))
    ) as x(kind, seq, wh, acc, qi, qo, ai, ao, ok)
    where x.ok
  ) k
  where l.voucher_id = v.id and (coalesce(da.track_item, false) or coalesce(ca.track_item, false));

  select array_agg(distinct e.item_id) into v_items from public.stock_entries e where e.voucher_id = v.id;
  if v_items is null then return; end if;

  select * into neg from app.stock_first_negative(v.tenant_id, v_items);
  if found then
    raise exception '%', app.stock_negative_message(neg.item_id, neg.warehouse_id, neg.voucher_id, neg.voucher_number,
                                                    neg.posting_date, neg.balance, neg.qty_out, v.id)
      using errcode = 'P0001';
  end if;
  perform app.stock_recost(v.tenant_id, v_items, v.posting_date, v.id);
end $$;

-- ---------------------------------------------------------------------------
-- save_voucher: kho nhập của phiếu điều chuyển; tổng tiền qua app.voucher_totals
-- ---------------------------------------------------------------------------
create or replace function public.save_voucher(p_voucher jsonb, p_post boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p_voucher ->> 'id', '')::uuid;
  v_tenant uuid := (p_voucher ->> 'tenant_id')::uuid;
  v_type text := p_voucher ->> 'voucher_type';
  vt public.voucher_types;
  v_old public.vouchers;
  v_book uuid := nullif(p_voucher ->> 'book_id', '')::uuid;
  v_number text := nullif(trim(p_voucher ->> 'number'), '');
  v_posting date := (p_voucher ->> 'posting_date')::date;
  v_issue date := coalesce((p_voucher ->> 'issue_date')::date, (p_voucher ->> 'posting_date')::date);
  v_header text := nullif(p_voucher ->> 'header_account', '');
  v_rate numeric := coalesce((p_voucher ->> 'exchange_rate')::numeric, 1);
  v_currency text := coalesce(nullif(p_voucher ->> 'currency', ''), 'VND');
  v_partner uuid := nullif(p_voucher ->> 'partner_id', '')::uuid;
  v_invoice_date date := nullif(p_voucher ->> 'invoice_date', '')::date;
  v_due date := nullif(p_voucher ->> 'due_date', '')::date;
  v_dec int := case when coalesce(nullif(p_voucher ->> 'currency', ''), 'VND') = 'VND' then 0 else 2 end;
  v_role text := app.member_role(v_tenant);
  v_bad text;
begin
  perform app.require(v_role is not null, 'Bạn không thuộc đơn vị này');
  perform app.require(v_role <> 'viewer', 'Vai trò chỉ xem không được lập chứng từ');
  select * into vt from public.voucher_types where code = v_type;
  if not found then raise exception 'Loại chứng từ % không hợp lệ', v_type; end if;
  perform app.require(v_role <> 'cashier' or vt.module = 'cash', 'Thủ quỹ chỉ được lập chứng từ tiền');
  if v_posting is null then raise exception 'Chưa nhập ngày hạch toán'; end if;
  if jsonb_typeof(p_voucher -> 'lines') is distinct from 'array' or jsonb_array_length(p_voucher -> 'lines') = 0 then
    raise exception 'Chứng từ chưa có dòng chi tiết';
  end if;
  perform app.assert_period_open(v_tenant, v_type, v_posting);
  if vt.style = 'pair' and vt.header_side is not null and v_header is null then
    v_header := vt.default_header_account;
  end if;
  -- Hóa đơn: hạn thanh toán mặc định theo điều khoản của đối tượng
  if vt.module in ('sales', 'purchase') and v_due is null and v_partner is not null then
    select coalesce(v_invoice_date, v_issue) + p.payment_term_days into v_due
    from public.partners p where p.id = v_partner and p.payment_term_days is not null;
  end if;

  if v_id is not null then
    select * into v_old from public.vouchers where id = v_id and tenant_id = v_tenant for update;
    if not found then raise exception 'Không tìm thấy chứng từ'; end if;
    if v_old.status in ('posted', 'cancelled') then
      raise exception 'Chứng từ % đã ghi sổ/hủy — bỏ ghi sổ trước khi sửa', v_old.number using errcode = 'P0001';
    end if;
    perform app.assert_period_open(v_tenant, v_type, v_old.posting_date);
    if (p_voucher ? 'version') and (p_voucher ->> 'version')::int <> v_old.version then
      raise exception 'Chứng từ đã được người khác sửa (phiên bản %), hãy tải lại', v_old.version using errcode = '40001';
    end if;
  end if;

  if v_number is null then
    if v_book is null then
      select id into v_book from public.voucher_books
      where tenant_id = v_tenant and voucher_type = v_type and is_default and is_active;
    end if;
    if v_book is null then raise exception 'Chưa khai báo quyển chứng từ cho loại %', v_type; end if;
    v_number := coalesce(v_old.number, app.next_voucher_number(v_book, v_posting));
  end if;

  if v_id is null then
    insert into public.vouchers (tenant_id, branch_id, voucher_type, book_id, number, issue_date, posting_date,
      partner_id, partner_name, address, contact_name, description, currency, exchange_rate, header_account,
      original_documents, source, created_by, updated_by,
      invoice_series, invoice_number, invoice_date, due_date, partner_tax_code, to_warehouse_id)
    values (v_tenant, nullif(p_voucher ->> 'branch_id', '')::uuid, v_type, v_book, v_number, v_issue, v_posting,
      v_partner, p_voucher ->> 'partner_name', p_voucher ->> 'address',
      p_voucher ->> 'contact_name', p_voucher ->> 'description', v_currency, v_rate, v_header,
      p_voucher ->> 'original_documents', coalesce(nullif(p_voucher ->> 'source', ''), 'web'),
      (select auth.uid()), (select auth.uid()),
      nullif(trim(p_voucher ->> 'invoice_series'), ''), nullif(trim(p_voucher ->> 'invoice_number'), ''),
      v_invoice_date, v_due, nullif(trim(p_voucher ->> 'partner_tax_code'), ''),
      nullif(p_voucher ->> 'to_warehouse_id', '')::uuid)
    returning id into v_id;
  else
    update public.vouchers set
      branch_id = nullif(p_voucher ->> 'branch_id', '')::uuid, book_id = coalesce(v_book, book_id),
      number = v_number, issue_date = v_issue, posting_date = v_posting,
      partner_id = v_partner, partner_name = p_voucher ->> 'partner_name',
      address = p_voucher ->> 'address', contact_name = p_voucher ->> 'contact_name',
      description = p_voucher ->> 'description', currency = v_currency, exchange_rate = v_rate,
      header_account = v_header, original_documents = p_voucher ->> 'original_documents',
      invoice_series = nullif(trim(p_voucher ->> 'invoice_series'), ''),
      invoice_number = nullif(trim(p_voucher ->> 'invoice_number'), ''),
      invoice_date = v_invoice_date, due_date = v_due,
      partner_tax_code = nullif(trim(p_voucher ->> 'partner_tax_code'), ''),
      to_warehouse_id = nullif(p_voucher ->> 'to_warehouse_id', '')::uuid,
      updated_by = (select auth.uid()), updated_at = now(), version = version + 1
    where id = v_id;
    delete from public.voucher_lines where voucher_id = v_id;
    delete from public.voucher_vat where voucher_id = v_id;
  end if;

  insert into public.voucher_lines (voucher_id, tenant_id, line_no, debit_account, credit_account, amount, amount_fc,
    entry_group, description, partner_id, job_id, department_id, expense_item_id, item_id, warehouse_id,
    quantity, unit_price, invoice_ref, uom, discount_amount, vat_code, vat_rate, vat_amount, vat_account, invoice_id)
  select v_id, v_tenant, x.line_no, x.debit_account, x.credit_account, x.amount, x.amount_fc,
    x.entry_group, x.description, x.partner_id, x.job_id, x.department_id, x.expense_item_id, x.item_id,
    x.warehouse_id, x.quantity, x.unit_price, x.invoice_ref, x.uom, x.discount_amount, x.vat_code,
    coalesce(app.vat_rate(x.vat_code), 0),
    x.vat_amount,
    case when x.vat_amount > 0
         then coalesce(x.vat_account, case vt.header_side when 'debit' then '33311' when 'credit' then '1331' end) end,
    x.invoice_id
  from (
    select
      coalesce((l ->> 'line_no')::int, ord::int) as line_no,
      coalesce(nullif(l ->> 'debit_account', ''), case when vt.header_side = 'debit' then v_header end) as debit_account,
      coalesce(nullif(l ->> 'credit_account', ''), case when vt.header_side = 'credit' then v_header end) as credit_account,
      a.amount,
      round(coalesce((l ->> 'amount_fc')::numeric, (l ->> 'amount')::numeric, 0), 2) as amount_fc,
      coalesce((l ->> 'entry_group')::smallint, 1) as entry_group,
      coalesce(nullif(l ->> 'description', ''), p_voucher ->> 'description') as description,
      coalesce(nullif(l ->> 'partner_id', '')::uuid, v_partner) as partner_id,
      nullif(l ->> 'job_id', '')::uuid as job_id, nullif(l ->> 'department_id', '')::uuid as department_id,
      nullif(l ->> 'expense_item_id', '')::uuid as expense_item_id, nullif(l ->> 'item_id', '')::uuid as item_id,
      nullif(l ->> 'warehouse_id', '')::uuid as warehouse_id, (l ->> 'quantity')::numeric as quantity,
      (l ->> 'unit_price')::numeric as unit_price, l ->> 'invoice_ref' as invoice_ref,
      nullif(trim(l ->> 'uom'), '') as uom,
      round(coalesce((l ->> 'discount_amount')::numeric, 0), 2) as discount_amount,
      nullif(trim(l ->> 'vat_code'), '') as vat_code,
      -- Tiền thuế: lấy theo client (cho phép khớp đúng hóa đơn nhà cung cấp), thiếu thì tự tính
      round(coalesce((l ->> 'vat_amount')::numeric,
                     a.amount * coalesce(app.vat_rate(nullif(trim(l ->> 'vat_code'), '')), 0) / 100), v_dec) as vat_amount,
      nullif(trim(l ->> 'vat_account'), '') as vat_account,
      nullif(l ->> 'invoice_id', '')::uuid as invoice_id
    from jsonb_array_elements(p_voucher -> 'lines') with ordinality as e(l, ord),
    lateral (select round(coalesce((l ->> 'amount')::numeric,
                                   round(coalesce((l ->> 'amount_fc')::numeric, 0) * v_rate)), 2) as amount) a
  ) x;

  -- Kiểm tra thuế theo dòng
  select string_agg(format('dòng %s: %s', line_no, msg), '; ' order by line_no) into v_bad
  from (
    select l.line_no,
      case
        when l.vat_code is not null and app.vat_rate(l.vat_code) is null then format('mã thuế %s không hợp lệ', l.vat_code)
        when l.vat_amount > 0 and l.vat_code is null then 'có tiền thuế nhưng chưa chọn mã thuế'
        when l.vat_amount > 0 and l.vat_rate = 0 then format('thuế suất %s không có tiền thuế', l.vat_code)
        when l.vat_amount > 0 and (vt.style = 'single' or vt.header_side is null)
          then 'loại chứng từ này không có dòng thuế — hạch toán TK 1331/33311 thành dòng riêng'
        when l.vat_rate > 0
          and abs(l.vat_amount - round(l.amount * l.vat_rate / 100, v_dec)) > greatest(10, round(l.amount * l.vat_rate / 100) * 0.01)
          then format('tiền thuế %s lệch xa thuế suất %s%%', l.vat_amount, l.vat_rate)
      end as msg
    from public.voucher_lines l where l.voucher_id = v_id
  ) c where msg is not null;
  if v_bad is not null then
    raise exception 'Thuế GTGT không hợp lệ — %', v_bad using errcode = 'P0001';
  end if;

  -- Dòng trừ vào hóa đơn: kiểm tra sớm để báo lỗi ngay khi lưu (ghi sổ kiểm tra lại)
  v_bad := app.invoice_ref_errors(v_id);
  if v_bad is not null then
    raise exception 'Thanh toán theo hóa đơn không hợp lệ — %', v_bad using errcode = 'P0001';
  end if;

  perform app.voucher_totals(v_id);

  if p_post then
    perform public.post_voucher(v_id);
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- post_voucher: ghi sổ kho trước khi dựng bút toán
-- ---------------------------------------------------------------------------
create or replace function public.post_voucher(p_voucher_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v public.vouchers;
  v_side text;
  v_bad text;
  v_count integer;
  v_paid numeric;
  inv public.vouchers;
  r record;
begin
  select * into v from public.vouchers where id = p_voucher_id for update;
  if not found then raise exception 'Không tìm thấy chứng từ'; end if;
  perform app.require(app.can_post(v.tenant_id), 'Bạn không có quyền ghi sổ');
  if v.status = 'posted' then return 0; end if;
  if v.status = 'cancelled' then raise exception 'Chứng từ đã hủy'; end if;
  perform app.assert_period_open(v.tenant_id, v.voucher_type, v.posting_date);
  select header_side into v_side from public.voucher_types where code = v.voucher_type;

  -- Tài khoản (kể cả TK thuế) phải tồn tại, đang dùng và là tài khoản chi tiết
  select string_agg(distinct acc, ', ') into v_bad
  from (
    select debit_account as acc from public.voucher_lines where voucher_id = v.id and debit_account is not null
    union all
    select credit_account from public.voucher_lines where voucher_id = v.id and credit_account is not null
    union all
    select vat_account from public.voucher_lines where voucher_id = v.id and vat_amount > 0
  ) x
  where not exists (
    select 1 from public.accounts a
    where a.tenant_id = v.tenant_id and a.code = x.acc and a.is_active and a.is_postable
  );
  if v_bad is not null then
    raise exception 'Tài khoản không tồn tại hoặc không phải tài khoản chi tiết: %', v_bad using errcode = 'P0001';
  end if;

  -- Tài khoản theo dõi công nợ bắt buộc có đối tượng
  select string_agg(distinct a.code, ', ') into v_bad
  from public.voucher_lines l
  join public.accounts a on a.tenant_id = v.tenant_id and a.code in (l.debit_account, l.credit_account)
  where l.voucher_id = v.id and a.track_partner and l.partner_id is null;
  if v_bad is not null then
    raise exception 'Tài khoản % theo dõi công nợ — chưa nhập mã đối tượng', v_bad using errcode = 'P0001';
  end if;

  -- Kiểu một vế: cân theo nhóm định khoản
  for r in
    select entry_group,
           sum(amount) filter (where debit_account is not null) as d,
           sum(amount) filter (where credit_account is not null) as c
    from public.voucher_lines
    where voucher_id = v.id and (debit_account is null or credit_account is null)
    group by entry_group
  loop
    if coalesce(r.d, 0) <> coalesce(r.c, 0) then
      raise exception 'Nhóm định khoản %: tổng Nợ % ≠ tổng Có %', r.entry_group, coalesce(r.d, 0), coalesce(r.c, 0)
        using errcode = 'P0001';
    end if;
  end loop;

  -- Trừ vào hóa đơn: hóa đơn đã ghi sổ; tổng các phiếu đã ghi sổ (kể cả phiếu này) không vượt tổng thanh toán.
  -- Khóa dòng hóa đơn để hai phiếu ghi sổ đồng thời không cùng vượt.
  v_bad := app.invoice_ref_errors(v.id);
  if v_bad is not null then
    raise exception 'Thanh toán theo hóa đơn không hợp lệ — %', v_bad using errcode = 'P0001';
  end if;
  for r in
    select l.invoice_id, sum(l.amount) as amount
    from public.voucher_lines l
    where l.voucher_id = v.id and l.invoice_id is not null
    group by l.invoice_id order by l.invoice_id
  loop
    select * into inv from public.vouchers where id = r.invoice_id for update;
    if inv.status <> 'posted' then
      raise exception 'Hóa đơn % chưa ghi sổ — ghi sổ hóa đơn trước khi thu/trả tiền', inv.number using errcode = 'P0001';
    end if;
    select coalesce(sum(pl.amount), 0) into v_paid
    from public.voucher_lines pl join public.vouchers pv on pv.id = pl.voucher_id
    where pl.invoice_id = inv.id and pv.status = 'posted' and pv.id <> v.id;
    if v_paid + r.amount > inv.total_amount then
      raise exception 'Phiếu trả vượt số còn nợ của hóa đơn %: còn %, phiếu này %',
        inv.number, app.fmt_amount(inv.total_amount - v_paid), app.fmt_amount(r.amount) using errcode = 'P0001';
    end if;
  end loop;

  -- Sổ kho: sinh dòng nhập/xuất, chặn xuất âm, tính giá vốn (cập nhật số tiền dòng xuất)
  perform app.stock_post(v.id);

  v_count := app.build_voucher_gl(v.id);

  if (select sum(debit) - sum(credit) from public.gl_entries where voucher_id = v.id) <> 0 then
    raise exception 'Chứng từ % không cân Nợ – Có', v.number using errcode = 'P0001';
  end if;

  update public.vouchers set status = 'posted', posted_at = now(), posted_by = (select auth.uid())
  where id = v.id;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- unpost_voucher: gỡ sổ kho, chặn khi phiếu nhập đã bị xuất, tính lại giá vốn
-- ---------------------------------------------------------------------------
create or replace function public.unpost_voucher(p_voucher_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.vouchers;
  v_refs text;
  v_items uuid[];
  neg record;
begin
  select * into v from public.vouchers where id = p_voucher_id for update;
  if not found then raise exception 'Không tìm thấy chứng từ'; end if;
  perform app.require(app.can_post(v.tenant_id), 'Bạn không có quyền bỏ ghi sổ');
  perform app.assert_period_open(v.tenant_id, v.voucher_type, v.posting_date);
  select string_agg(distinct pv.number, ', ') into v_refs
  from public.voucher_lines pl join public.vouchers pv on pv.id = pl.voucher_id
  where pl.invoice_id = v.id and pv.status = 'posted' and pv.id <> v.id;
  if v_refs is not null then
    raise exception 'Hóa đơn % đã có phiếu thanh toán % — bỏ ghi sổ phiếu đó trước', v.number, v_refs
      using errcode = 'P0001';
  end if;
  -- Sổ kho: bỏ dòng nhập/xuất của phiếu; phiếu nhập đã bị xuất thì không bỏ được
  select array_agg(distinct e.item_id) into v_items from public.stock_entries e where e.voucher_id = v.id;
  if v_items is not null then
    delete from public.stock_entries where voucher_id = v.id;
    select * into neg from app.stock_first_negative(v.tenant_id, v_items);
    if found then
      raise exception 'Không bỏ ghi sổ được: %', app.stock_negative_message(neg.item_id, neg.warehouse_id, neg.voucher_id, neg.voucher_number,
                                                                       neg.posting_date, neg.balance, neg.qty_out, null) using errcode = 'P0001';
    end if;
    perform app.stock_recost(v.tenant_id, v_items, v.posting_date, v.id);
  end if;
  delete from public.gl_entries where voucher_id = v.id;
  update public.vouchers set status = 'draft', posted_at = null, posted_by = null, version = version + 1
  where id = v.id;
end $$;

-- ---------------------------------------------------------------------------
-- Tính lại giá vốn (nút "Tính lại giá vốn từ ngày…") và đổi phương pháp tính giá
-- ---------------------------------------------------------------------------
create or replace function public.recost_inventory(p_tenant uuid, p_from date default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_start date;
  v_items uuid[];
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền tính giá vốn');
  select start_date into v_start from public.tenants where id = p_tenant;
  select array_agg(distinct x.item_id) into v_items from (
    select item_id from public.stock_entries where tenant_id = p_tenant
    union select item_id from public.stock_openings where tenant_id = p_tenant
  ) x;
  return app.stock_recost(p_tenant, v_items, greatest(coalesce(p_from, v_start), v_start));
end $$;

create or replace function public.set_stock_cost_method(p_tenant uuid, p_method text)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  perform app.require(app.can_manage(p_tenant), 'Chỉ chủ sở hữu / quản trị được đổi phương pháp tính giá vốn');
  if p_method not in ('moving', 'monthly') then
    raise exception 'Phương pháp tính giá không hợp lệ: %', p_method using errcode = '22023';
  end if;
  update public.tenants set stock_cost_method = p_method where id = p_tenant;
  return public.recost_inventory(p_tenant, null);
end $$;

-- ---------------------------------------------------------------------------
-- Tồn kho đầu kỳ: nhập từ Excel hoặc lưu từ lưới (thay toàn bộ). Nguyên khối như các hàm import_*.
-- p_rows: [{row, warehouse_code, item_code, quantity, amount, account?}]
-- ---------------------------------------------------------------------------
create or replace function public.import_stock_openings(p_tenant uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_errors jsonb;
  v_norm jsonb;
  v_regime text;
  v_inserted integer;
  v_items uuid[];
  neg record;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền nhập tồn kho đầu kỳ');
  perform app.assert_period_open(p_tenant, '*', (select start_date from public.tenants where id = p_tenant));
  perform app.import_check_rows(p_rows);
  select regime into v_regime from public.tenants where id = p_tenant;

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_norm
  from (
    select s.row_no, s.warehouse_code, s.item_code, s.quantity, s.amount, s.bad_number,
           w.id as warehouse_id, i.id as item_id, coalesce(i.track_inventory, false) as track_inventory,
           coalesce(s.account, nullif(i.inventory_account, ''), case when v_regime = 'TT133' then '156' else '1561' end) as account,
           coalesce(a.track_item and a.is_postable and a.is_active, false) as account_ok,
           row_number() over (partition by lower(s.warehouse_code), lower(s.item_code) order by s.i) as dup
    from (
      select coalesce((x ->> 'row')::int, i::int) as row_no, i,
             nullif(trim(x ->> 'warehouse_code'), '') as warehouse_code,
             nullif(trim(x ->> 'item_code'), '') as item_code,
             nullif(trim(x ->> 'account'), '') as account,
             case when jsonb_typeof(x -> 'quantity') = 'number' then (x ->> 'quantity')::numeric else 0 end as quantity,
             case when jsonb_typeof(x -> 'amount') = 'number' then (x ->> 'amount')::numeric else 0 end as amount,
             not (coalesce(jsonb_typeof(x -> 'quantity'), 'null') in ('number', 'null')
                  and coalesce(jsonb_typeof(x -> 'amount'), 'null') in ('number', 'null')) as bad_number
      from jsonb_array_elements(p_rows) with ordinality as e(x, i)
    ) s
    left join public.warehouses w on w.tenant_id = p_tenant and lower(w.code) = lower(s.warehouse_code)
    left join public.items i on i.tenant_id = p_tenant and lower(i.code) = lower(s.item_code)
    left join public.accounts a on a.tenant_id = p_tenant
      and a.code = coalesce(s.account, nullif(i.inventory_account, ''), case when v_regime = 'TT133' then '156' else '1561' end)
  ) t;

  select app.import_errors(jsonb_agg(jsonb_build_object('row', row_no, 'message', msg) order by row_no, ord))
  into v_errors
  from jsonb_to_recordset(v_norm) as o(row_no int, warehouse_code text, item_code text, quantity numeric, amount numeric,
                                        bad_number boolean, warehouse_id uuid, item_id uuid, track_inventory boolean,
                                        account text, account_ok boolean, dup bigint),
  lateral (values
    (1, case when o.bad_number or o.quantity < 0 or o.amount < 0 then 'Số lượng, giá trị phải là số không âm' end),
    (2, case when o.item_code is null then 'Thiếu mã hàng' end),
    (3, case when o.item_code is not null and o.item_id is null
             then format('Chưa có mã hàng %s — nhập danh mục hàng hóa trước', o.item_code) end),
    (4, case when o.item_id is not null and not o.track_inventory then format('Mặt hàng %s không theo dõi tồn kho', o.item_code) end),
    (5, case when o.warehouse_code is null then 'Thiếu mã kho' end),
    (6, case when o.warehouse_code is not null and o.warehouse_id is null then format('Chưa có kho %s', o.warehouse_code) end),
    (7, case when not o.account_ok then format('TK %s không phải tài khoản vật tư chi tiết', o.account) end),
    (8, case when o.dup > 1 then 'Trùng mã kho + mã hàng trong tệp' end),
    (9, case when o.quantity = 0 and o.amount > 0 then 'Có giá trị nhưng số lượng bằng 0' end)
  ) v(ord, msg)
  where v.msg is not null and (o.quantity <> 0 or o.amount <> 0 or v.ord in (1));

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end if;

  select array_agg(distinct item_id) into v_items from public.stock_openings where tenant_id = p_tenant;
  delete from public.stock_openings where tenant_id = p_tenant;
  insert into public.stock_openings (tenant_id, item_id, warehouse_id, account, quantity, amount)
  select p_tenant, o.item_id, o.warehouse_id, o.account, o.quantity, round(o.amount, 2)
  from jsonb_to_recordset(v_norm) as o(item_id uuid, warehouse_id uuid, account text, quantity numeric, amount numeric)
  where o.quantity <> 0 or o.amount <> 0;
  get diagnostics v_inserted = row_count;

  -- Tồn đầu kỳ đổi: kiểm tra xuất âm và tính lại giá vốn toàn bộ
  select array_agg(distinct x) into v_items from (
    select unnest(coalesce(v_items, '{}'::uuid[])) as x
    union select item_id from public.stock_openings where tenant_id = p_tenant
  ) s;
  if v_items is not null then
    select * into neg from app.stock_first_negative(p_tenant, v_items);
    if found then
      raise exception 'Tồn kho đầu kỳ mới không đủ: %',
        app.stock_negative_message(neg.item_id, neg.warehouse_id, neg.voucher_id, neg.voucher_number,
                                   neg.posting_date, neg.balance, neg.qty_out, null)
        using errcode = 'P0001';
    end if;
    perform app.stock_recost(p_tenant, v_items, (select start_date from public.tenants where id = p_tenant));
  end if;

  return jsonb_build_object('ok', true, 'inserted', v_inserted, 'skipped', jsonb_array_length(p_rows) - v_inserted,
    'quantity', (select coalesce(sum(quantity), 0) from public.stock_openings where tenant_id = p_tenant),
    'amount', (select coalesce(sum(amount), 0) from public.stock_openings where tenant_id = p_tenant));
end $$;

-- ---------------------------------------------------------------------------
-- Báo cáo
-- ---------------------------------------------------------------------------
-- Tồn kho (số lượng, giá trị) đến ngày theo mặt hàng × kho, kèm tổng mặt hàng (để tính giá bình quân hiện tại)
create or replace function public.stock_balances(p_tenant uuid, p_as_of date default null, p_warehouse uuid default null)
returns table (item_id uuid, warehouse_id uuid, quantity numeric, amount numeric, item_quantity numeric, item_amount numeric)
language sql stable security invoker set search_path = '' as $$
  with mv as (
    select o.item_id, o.warehouse_id, o.quantity as q, o.amount as a
    from public.stock_openings o where o.tenant_id = p_tenant
    union all
    select e.item_id, e.warehouse_id, e.qty_in - e.qty_out, e.amount_in - e.amount_out
    from public.stock_entries e where e.tenant_id = p_tenant and (p_as_of is null or e.posting_date <= p_as_of)
  ),
  w as (select mv.item_id, mv.warehouse_id, sum(mv.q) as q, sum(mv.a) as a from mv group by 1, 2),
  t as (select w.item_id, sum(w.q) as q, sum(w.a) as a from w group by 1)
  select w.item_id, w.warehouse_id, w.q, w.a, t.q, t.a
  from w join t on t.item_id = w.item_id
  where (p_warehouse is null or w.warehouse_id = p_warehouse) and (w.q <> 0 or w.a <> 0)
$$;

-- Tổng hợp nhập – xuất – tồn. Không lọc kho: điều chuyển nội bộ không tính là nhập/xuất.
create or replace function public.rpt_stock_summary(p_tenant uuid, p_from date, p_to date, p_warehouse uuid default null)
returns table (item_id uuid, item_code text, item_name text, uom text, account text,
               opening_qty numeric, opening_amount numeric, in_qty numeric, in_amount numeric,
               out_qty numeric, out_amount numeric, closing_qty numeric, closing_amount numeric)
language sql stable security invoker set search_path = '' as $$
  with mv as (
    select o.item_id, o.account, o.quantity as oq, o.amount as oa,
           0::numeric as iq, 0::numeric as ia, 0::numeric as xq, 0::numeric as xa
    from public.stock_openings o
    where o.tenant_id = p_tenant and (p_warehouse is null or o.warehouse_id = p_warehouse)
    union all
    select e.item_id, e.account,
           case when e.posting_date < p_from then e.qty_in - e.qty_out else 0 end,
           case when e.posting_date < p_from then e.amount_in - e.amount_out else 0 end,
           case when e.posting_date >= p_from then e.qty_in else 0 end,
           case when e.posting_date >= p_from then e.amount_in else 0 end,
           case when e.posting_date >= p_from then e.qty_out else 0 end,
           case when e.posting_date >= p_from then e.amount_out else 0 end
    from public.stock_entries e
    where e.tenant_id = p_tenant and e.posting_date <= p_to
      and (p_warehouse is null or e.warehouse_id = p_warehouse)
      and (p_warehouse is not null or e.kind in ('in', 'out'))
  ),
  s as (
    select mv.item_id, mv.account, sum(oq) as oq, sum(oa) as oa, sum(iq) as iq, sum(ia) as ia, sum(xq) as xq, sum(xa) as xa
    from mv group by 1, 2
  )
  select s.item_id, i.code, i.name, i.uom, s.account, s.oq, s.oa, s.iq, s.ia, s.xq, s.xa,
         s.oq + s.iq - s.xq, s.oa + s.ia - s.xa
  from s join public.items i on i.id = s.item_id
  where s.oq <> 0 or s.oa <> 0 or s.iq <> 0 or s.ia <> 0 or s.xq <> 0 or s.xa <> 0
  order by i.code, s.account
$$;

-- Đối chiếu giá trị tồn kho với số dư sổ cái các TK vật tư đến ngày
create or replace function public.rpt_stock_vs_ledger(p_tenant uuid, p_to date)
returns table (account text, stock_amount numeric, ledger_amount numeric, difference numeric)
language sql stable security invoker set search_path = '' as $$
  with st as (
    select o.account, sum(o.amount) as a from public.stock_openings o where o.tenant_id = p_tenant group by 1
    union all
    select e.account, sum(e.amount_in - e.amount_out) from public.stock_entries e
    where e.tenant_id = p_tenant and e.posting_date <= p_to group by 1
  ),
  lg as (
    select ob.account, sum(ob.debit - ob.credit) as a from public.opening_balances ob
    join public.accounts ac on ac.tenant_id = ob.tenant_id and ac.code = ob.account and ac.track_item
    where ob.tenant_id = p_tenant group by 1
    union all
    select g.account, sum(g.debit - g.credit) from public.gl_entries g
    join public.accounts ac on ac.tenant_id = g.tenant_id and ac.code = g.account and ac.track_item
    where g.tenant_id = p_tenant and g.posting_date <= p_to group by 1
  ),
  s as (
    select account, sum(a) as stock, 0::numeric as ledger from st group by 1
    union all
    select account, 0, sum(a) from lg group by 1
  )
  select account, sum(stock), sum(ledger), sum(stock) - sum(ledger)
  from s group by account
  having sum(stock) <> 0 or sum(ledger) <> 0
  order by account
$$;

-- Thẻ kho / sổ chi tiết vật tư của một mặt hàng
create or replace function public.rpt_stock_card(p_tenant uuid, p_item uuid, p_from date, p_to date, p_warehouse uuid default null)
returns table (row_kind text, line integer, posting_date date, voucher_id uuid, voucher_type text, voucher_number text,
               description text, warehouse_code text, qty_in numeric, amount_in numeric, qty_out numeric, amount_out numeric,
               balance_qty numeric, balance_amount numeric)
language sql stable security invoker set search_path = '' as $$
  with base as (
    select e.* from public.stock_entries e
    where e.tenant_id = p_tenant and e.item_id = p_item and e.posting_date <= p_to
      and (p_warehouse is null or e.warehouse_id = p_warehouse)
      and (p_warehouse is not null or e.kind in ('in', 'out'))
  ),
  op as (
    select coalesce((select sum(o.quantity) from public.stock_openings o
                     where o.tenant_id = p_tenant and o.item_id = p_item
                       and (p_warehouse is null or o.warehouse_id = p_warehouse)), 0)
           + coalesce((select sum(b.qty_in - b.qty_out) from base b where b.posting_date < p_from), 0) as q,
           coalesce((select sum(o.amount) from public.stock_openings o
                     where o.tenant_id = p_tenant and o.item_id = p_item
                       and (p_warehouse is null or o.warehouse_id = p_warehouse)), 0)
           + coalesce((select sum(b.amount_in - b.amount_out) from base b where b.posting_date < p_from), 0) as a
  ),
  ent as (
    select b.*, coalesce(nullif(l.description, ''), v.description) as descr, w.code as wcode,
           row_number() over w0 as rn,
           sum(b.qty_in - b.qty_out) over w0 as cq,
           sum(b.amount_in - b.amount_out) over w0 as ca
    from base b
    join public.vouchers v on v.id = b.voucher_id
    join public.warehouses w on w.id = b.warehouse_id
    left join public.voucher_lines l on l.voucher_id = b.voucher_id and l.line_no = b.line_no
    where b.posting_date >= p_from
    window w0 as (order by b.posting_date, b.seq, b.voucher_number, b.line_no, b.id rows unbounded preceding)
  )
  select * from (
    select 'opening'::text, 0, p_from, null::uuid, null::text, null::text, 'Tồn đầu kỳ'::text, null::text,
           null::numeric, null::numeric, null::numeric, null::numeric, op.q, op.a
    from op
    union all
    select 'entry', e.rn::integer, e.posting_date, e.voucher_id, e.voucher_type, e.voucher_number, e.descr, e.wcode,
           e.qty_in, e.amount_in, e.qty_out, e.amount_out, op.q + e.cq, op.a + e.ca
    from ent e, op
    union all
    select 'closing', 2147483647, p_to, null, null, null, 'Tồn cuối kỳ', null,
           coalesce(sum(e.qty_in), 0), coalesce(sum(e.amount_in), 0), coalesce(sum(e.qty_out), 0), coalesce(sum(e.amount_out), 0),
           op.q + coalesce(sum(e.qty_in - e.qty_out), 0), op.a + coalesce(sum(e.amount_in - e.amount_out), 0)
    from op left join ent e on true
    group by op.q, op.a
  ) r(row_kind, line, posting_date, voucher_id, voucher_type, voucher_number, description, warehouse_code,
      qty_in, amount_in, qty_out, amount_out, balance_qty, balance_amount)
  order by line
$$;

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------
revoke execute on function app.fmt_qty(numeric) from public, anon, authenticated;
revoke execute on function app.locked_until(uuid, text) from public, anon, authenticated;
revoke execute on function app.voucher_totals(uuid) from public, anon, authenticated;
revoke execute on function app.build_voucher_gl(uuid) from public, anon, authenticated;
revoke execute on function app.stock_first_negative(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function app.stock_negative_message(uuid, uuid, uuid, text, date, numeric, numeric, uuid) from public, anon, authenticated;
revoke execute on function app.stock_recost(uuid, uuid[], date, uuid) from public, anon, authenticated;
revoke execute on function app.stock_post(uuid) from public, anon, authenticated;
revoke execute on function app.tenant_default_warehouse() from public, anon, authenticated;
revoke execute on function public.recost_inventory(uuid, date) from public, anon;
revoke execute on function public.set_stock_cost_method(uuid, text) from public, anon;
revoke execute on function public.import_stock_openings(uuid, jsonb) from public, anon;
revoke execute on function public.stock_balances(uuid, date, uuid) from public, anon;
revoke execute on function public.rpt_stock_summary(uuid, date, date, uuid) from public, anon;
revoke execute on function public.rpt_stock_vs_ledger(uuid, date) from public, anon;
revoke execute on function public.rpt_stock_card(uuid, uuid, date, date, uuid) from public, anon;
grant execute on function public.recost_inventory(uuid, date) to authenticated;
grant execute on function public.set_stock_cost_method(uuid, text) to authenticated;
grant execute on function public.import_stock_openings(uuid, jsonb) to authenticated;
grant execute on function public.stock_balances(uuid, date, uuid) to authenticated;
grant execute on function public.rpt_stock_summary(uuid, date, date, uuid) to authenticated;
grant execute on function public.rpt_stock_vs_ledger(uuid, date) to authenticated;
grant execute on function public.rpt_stock_card(uuid, uuid, date, date, uuid) to authenticated;
