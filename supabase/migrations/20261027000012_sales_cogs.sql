-- AccEdu — P5b: Hóa đơn bán hàng tự xuất kho & giá vốn, báo cáo lãi gộp, nhập hóa đơn XML tự gắn mã hàng.
--
-- Quy tắc:
--   Hóa đơn bán hàng (HDB): dòng có mặt hàng theo dõi tồn kho → khi ghi sổ sinh dòng sổ kho 'out' (cogs = true)
--     tại kho của dòng (bỏ trống: kho mặc định của mặt hàng → Kho chính), TK kho = items.inventory_account
--     (mặc định 1561 theo TT99, 156 theo TT133). Chặn xuất âm như phiếu xuất kho.
--   Giá vốn do app.stock_recost tính (cùng phương pháp của đơn vị), lưu ở voucher_lines.cost_amount — số tiền
--     dòng hóa đơn (doanh thu) giữ nguyên. Bút toán thêm: Nợ TK giá vốn (items.cogs_account, mặc định 632) / Có TK kho.
--   Nhập lùi ngày, bỏ ghi sổ, đổi phương pháp tính giá → giá vốn hóa đơn bán tự tính lại, bút toán dựng lại.
--   Lãi gộp (rpt_gross_profit) tính từ sổ cái: 511 − 521 − 632, theo mặt hàng hoặc khách hàng.

-- ---------------------------------------------------------------------------
-- Cột
-- ---------------------------------------------------------------------------
alter table public.voucher_lines
  add column cost_amount numeric(18, 2),
  add column cost_account text;
comment on column public.voucher_lines.cost_amount is 'Hóa đơn bán: giá vốn hàng xuất kho của dòng (do hệ thống tính khi ghi sổ)';
comment on column public.voucher_lines.cost_account is 'Hóa đơn bán: TK Nợ giá vốn (mặc định 632)';

alter table public.stock_entries add column cogs boolean not null default false;
comment on column public.stock_entries.cogs is 'Dòng xuất của hóa đơn bán: giá vốn ghi vào voucher_lines.cost_amount (không đổi số tiền dòng)';

-- ---------------------------------------------------------------------------
-- Kho mặc định của mặt hàng (kho đang dùng), không có thì Kho chính
-- ---------------------------------------------------------------------------
create or replace function app.default_warehouse(p_tenant uuid, p_item uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select w.id from public.items i join public.warehouses w on w.id = i.default_warehouse_id and w.is_active
     where i.id = p_item and i.tenant_id = p_tenant),
    (select w.id from public.warehouses w where w.tenant_id = p_tenant and w.is_active
     order by (w.code = 'KHO') desc, w.code limit 1))
$$;

-- Khớp mặt hàng theo mã (chính xác), không có thì theo tên (bỏ khoảng trắng thừa, không phân biệt hoa thường) —
-- chỉ nhận khi đúng một mặt hàng
create or replace function app.match_item(p_tenant uuid, p_code text, p_name text) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select i.id from public.items i
     where i.tenant_id = p_tenant and i.is_active and nullif(trim(p_code), '') is not null
       and upper(i.code) = upper(trim(p_code))),
    (select (array_agg(i.id))[1] from public.items i
     where i.tenant_id = p_tenant and i.is_active and nullif(trim(p_name), '') is not null
       and lower(regexp_replace(trim(i.name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(p_name), '\s+', ' ', 'g'))
     having count(*) = 1))
$$;

-- ---------------------------------------------------------------------------
-- Bút toán sổ cái của một chứng từ: thêm cặp giá vốn của hóa đơn bán (Nợ TK giá vốn / Có TK kho)
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
  cogs as (
    -- Hóa đơn bán: giá vốn hàng xuất kho của dòng
    select l.*, se.account as stock_account, round(l.cost_amount / v.exchange_rate, 2) as cost_fc
    from lines l
    join public.stock_entries se on se.voucher_id = l.voucher_id and se.line_no = l.line_no and se.cogs
    where l.cost_amount > 0
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
    union all
    -- giá vốn: vế Nợ
    select c.line_no, c.cost_account, c.stock_account, c.cost_amount, 0, c.cost_fc, 0,
           c.partner_id, c.job_id, c.department_id, c.expense_item_id, c.item_id,
           'Giá vốn ' || coalesce(c.description, v.description, '')
    from cogs c
    union all
    -- giá vốn: vế Có
    select c.line_no, c.stock_account, c.cost_account, 0, c.cost_amount, 0, c.cost_fc,
           c.partner_id, c.job_id, c.department_id, c.expense_item_id, c.item_id,
           'Giá vốn ' || coalesce(c.description, v.description, '')
    from cogs c
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
-- Tính giá vốn hàng xuất kho (bản 0011 + dòng xuất của hóa đơn bán: ghi vào cost_amount)
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
  select case costing_method when 'weighted_period' then 'monthly' else 'moving' end into v_method
  from public.tenants where id = p_tenant;
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
          if r.cogs then
            update public.voucher_lines set cost_amount = v_amt where voucher_id = r.voucher_id and line_no = r.line_no;
          else
            update public.voucher_lines set amount = v_amt, amount_fc = v_amt
            where voucher_id = r.voucher_id and line_no = r.line_no;
          end if;
          v_changed := v_changed || r.voucher_id;
        end if;
      end loop;

      exit when v_method <> 'monthly';
      -- Hết hàng cuối tháng: dồn chênh lệch làm tròn vào dòng xuất cuối cùng của tháng
      if q = 0 and val <> 0 and v_last_out is not null then
        select * into r from public.stock_entries where id = v_last_out;
        if r.amount_out + val >= 0 then
          update public.stock_entries set amount_out = r.amount_out + val where id = r.id;
          if r.cogs then
            update public.voucher_lines set cost_amount = r.amount_out + val
            where voucher_id = r.voucher_id and line_no = r.line_no;
          else
            update public.voucher_lines set amount = r.amount_out + val, amount_fc = r.amount_out + val
            where voucher_id = r.voucher_id and line_no = r.line_no;
          end if;
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
-- Ghi sổ kho cho một chứng từ (bản 0011 + nhánh hóa đơn bán hàng)
-- ---------------------------------------------------------------------------
create or replace function app.stock_post(p_voucher uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.vouchers;
  v_inv text;
  v_bad text;
  v_items uuid[];
  neg record;
begin
  select * into v from public.vouchers where id = p_voucher;
  delete from public.stock_entries where voucher_id = v.id;

  if v.voucher_type = 'HDB' then
    -- Hóa đơn bán: dòng hàng theo dõi tồn kho → xuất kho, giá vốn ghi riêng (cost_amount), doanh thu giữ nguyên
    select case when t.regime = 'TT133' then '156' else '1561' end into v_inv from public.tenants t where t.id = v.tenant_id;
    update public.voucher_lines l set
      warehouse_id = coalesce(l.warehouse_id, app.default_warehouse(v.tenant_id, l.item_id)),
      cost_account = coalesce(nullif(trim(i.cogs_account), ''), '632'),
      cost_amount = 0
    from public.items i
    where l.voucher_id = v.id and i.id = l.item_id and i.track_inventory;

    select string_agg(format('dòng %s: %s', line_no, msg), '; ' order by line_no) into v_bad
    from (
      select l.line_no,
        case
          when l.warehouse_id is null then format('chưa có kho cho mặt hàng %s', i.code)
          when coalesce(l.quantity, 0) <= 0 then format('chưa nhập số lượng bán mặt hàng %s', i.code)
          when w.tenant_id <> v.tenant_id then 'kho không thuộc đơn vị'
          when ia.code is null then format('TK kho %s của mặt hàng %s không tồn tại, không phải tài khoản chi tiết hoặc không theo dõi vật tư',
                                           coalesce(nullif(trim(i.inventory_account), ''), v_inv), i.code)
          when ca.code is null then format('TK giá vốn %s của mặt hàng %s không tồn tại hoặc không phải tài khoản chi tiết',
                                           l.cost_account, i.code)
        end as msg
      from public.voucher_lines l
      join public.items i on i.id = l.item_id and i.track_inventory
      left join public.warehouses w on w.id = l.warehouse_id
      left join public.accounts ia on ia.tenant_id = v.tenant_id and ia.code = coalesce(nullif(trim(i.inventory_account), ''), v_inv)
        and ia.is_active and ia.is_postable and ia.track_item
      left join public.accounts ca on ca.tenant_id = v.tenant_id and ca.code = l.cost_account and ca.is_active and ca.is_postable
      where l.voucher_id = v.id
    ) c
    where msg is not null;
    if v_bad is not null then
      raise exception 'Dòng hàng tồn kho chưa đủ thông tin — %', v_bad using errcode = 'P0001';
    end if;

    insert into public.stock_entries (tenant_id, voucher_id, line_no, kind, seq, voucher_type, voucher_number,
      posting_date, item_id, warehouse_id, account, qty_in, qty_out, amount_in, amount_out, cogs)
    select v.tenant_id, v.id, l.line_no, 'out', 3, v.voucher_type, v.number, v.posting_date, l.item_id,
           l.warehouse_id, coalesce(nullif(trim(i.inventory_account), ''), v_inv), 0, l.quantity, 0, 0, true
    from public.voucher_lines l
    join public.items i on i.id = l.item_id and i.track_inventory
    where l.voucher_id = v.id;
  else
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
  end if;

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
-- unpost_voucher: bản 0011 + xóa giá vốn của hóa đơn bán
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
  update public.voucher_lines set cost_amount = null where voucher_id = v.id and cost_amount is not null;
  delete from public.gl_entries where voucher_id = v.id;
  update public.vouchers set status = 'draft', posted_at = null, posted_by = null, version = version + 1
  where id = v.id;
end $$;

-- ---------------------------------------------------------------------------
-- Lãi gộp theo mặt hàng ('item') hoặc khách hàng ('customer') — từ sổ cái trong kỳ.
-- Doanh thu = Có − Nợ TK 511*; giảm trừ = Nợ − Có TK 521*; giá vốn = Nợ − Có TK 632*.
-- Số lượng bán: dòng hóa đơn bán (HDB, HDV) đã ghi sổ trong kỳ.
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
-- Nhập hóa đơn điện tử đầu vào (bản 0010 + gắn mã hàng): mỗi dòng có thể kèm item_code (MHHDVu);
-- khớp mặt hàng theo mã rồi theo tên → dòng có mã hàng, TK kho của mặt hàng, kho mặc định (hóa đơn mua hàng hóa).
-- Kết quả mỗi hóa đơn mới thêm items: {matched, lines}.
-- ---------------------------------------------------------------------------
create or replace function public.import_purchase_invoices(p_tenant uuid, p_invoices jsonb, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  x jsonb;
  i integer := 0;
  v_row integer;
  v_type text;
  v_tax text;
  v_name text;
  v_series text;
  v_short text;
  v_number text;
  v_account text;
  v_partner uuid;
  v_inserted boolean;
  v_state text;
  v_existing text;
  v_id uuid;
  v_msg text;
  v_lines jsonb;
  v_matched integer;
  v_results jsonb := '[]'::jsonb;
  v_new_taxes text[] := '{}';
  v_count_new integer := 0;
  v_count_exists integer := 0;
  v_count_errors integer := 0;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền nhập hóa đơn');
  perform app.import_check_rows(p_invoices);
  if jsonb_array_length(p_invoices) > 500 then
    raise exception 'Tối đa 500 hóa đơn mỗi lần nhập' using errcode = '22023';
  end if;

  begin
    for x in select e.value from jsonb_array_elements(p_invoices) as e loop
      i := i + 1;
      v_row := coalesce((x ->> 'row')::integer, i);
      v_type := x ->> 'voucher_type';
      v_tax := upper(regexp_replace(coalesce(x #>> '{seller,tax_code}', ''), '\s', '', 'g'));
      v_name := coalesce(nullif(trim(x #>> '{seller,name}'), ''), v_tax);
      v_series := upper(coalesce(trim(x ->> 'invoice_series'), ''));
      v_short := upper(coalesce(nullif(trim(x ->> 'invoice_series_short'), ''), v_series));
      v_number := trim(coalesce(x ->> 'invoice_number', ''));
      v_account := trim(coalesce(x ->> 'line_account', ''));
      v_partner := null;
      v_inserted := false;
      v_state := null;
      begin
        if v_type is null or v_type not in ('HDM', 'HMV') then
          raise exception 'Loại hóa đơn mua phải là HDM hoặc HMV';
        end if;
        if v_tax = '' then raise exception 'Thiếu mã số thuế người bán'; end if;
        if v_number = '' then raise exception 'Thiếu số hóa đơn'; end if;
        if jsonb_typeof(x -> 'lines') is distinct from 'array' or jsonb_array_length(x -> 'lines') = 0 then
          raise exception 'Hóa đơn không có dòng hàng hóa, dịch vụ';
        end if;
        if not exists (
          select 1 from public.accounts a
          where a.tenant_id = p_tenant and a.code = v_account and a.is_active and a.is_postable
        ) then
          raise exception 'TK % không tồn tại hoặc không phải tài khoản chi tiết', nullif(v_account, '');
        end if;

        -- Nhà cung cấp: theo MST, rồi theo mã; chưa có thì tạo (mã = MST)
        select p.id into v_partner from public.partners p
        where p.tenant_id = p_tenant and upper(regexp_replace(coalesce(p.tax_code, ''), '\s', '', 'g')) = v_tax
        order by p.is_active desc, p.code limit 1;
        if v_partner is null then
          select p.id into v_partner from public.partners p where p.tenant_id = p_tenant and upper(p.code) = v_tax;
        end if;
        if v_partner is null then
          insert into public.partners (tenant_id, code, name, tax_code, address, is_customer, is_supplier)
          values (p_tenant, left(v_tax, 16), v_name, v_tax, nullif(trim(x #>> '{seller,address}'), ''), false, true)
          returning id into v_partner;
          v_inserted := true;
        end if;
        v_state := case when v_inserted or v_tax = any (v_new_taxes) then 'new' else 'existing' end;

        -- Hóa đơn đã nhập: bỏ qua
        select v.number into v_existing from public.vouchers v
        where v.tenant_id = p_tenant and v.partner_id = v_partner and v.voucher_type in ('HDM', 'HMV')
          and v.status <> 'cancelled'
          -- Ký hiệu so theo phần sau mẫu số (1C26TAA ≡ C26TAA), vì kế toán có thể đã gõ tay một trong hai dạng
          and regexp_replace(upper(coalesce(v.invoice_series, '')), '^[0-9]', '') = regexp_replace(v_short, '^[0-9]', '')
          and ltrim(v.invoice_number, '0') = ltrim(v_number, '0')
        limit 1;
        if found then
          v_results := v_results || jsonb_build_object('row', v_row, 'status', 'exists', 'number', v_existing, 'partner', v_state);
          v_count_exists := v_count_exists + 1;
        else
          -- Dòng hàng: gắn mã hàng đã khớp; hóa đơn mua hàng hóa thì dùng TK kho của mặt hàng và kho mặc định
          select jsonb_agg(jsonb_build_object(
                   'line_no', e.ord,
                   'debit_account', case when v_type = 'HDM' and ia.code is not null then ia.code else v_account end,
                   'item_id', m.id,
                   'warehouse_id', case when v_type = 'HDM' and m.track_inventory then app.default_warehouse(p_tenant, m.id) end,
                   'amount', e.l -> 'amount',
                   'quantity', e.l -> 'quantity',
                   'unit_price', e.l -> 'unit_price',
                   'uom', e.l ->> 'uom',
                   'discount_amount', coalesce(e.l -> 'discount_amount', '0'::jsonb),
                   'description', left(e.l ->> 'description', 480),
                   'vat_code', e.l ->> 'vat_code',
                   'vat_amount', coalesce(e.l -> 'vat_amount', '0'::jsonb)
                 ) order by e.ord),
                 count(m.id)
          into v_lines, v_matched
          from jsonb_array_elements(x -> 'lines') with ordinality as e(l, ord)
          left join lateral (
            select it.* from public.items it where it.id = app.match_item(p_tenant, e.l ->> 'item_code', e.l ->> 'description')
          ) m on true
          left join public.accounts ia on ia.tenant_id = p_tenant and ia.code = nullif(trim(m.inventory_account), '')
            and ia.is_active and ia.is_postable;

          v_id := public.save_voucher(jsonb_build_object(
            'tenant_id', p_tenant,
            'voucher_type', v_type,
            'posting_date', coalesce(nullif(x ->> 'posting_date', ''), x ->> 'invoice_date'),
            'issue_date', coalesce(nullif(x ->> 'invoice_date', ''), x ->> 'posting_date'),
            'partner_id', v_partner,
            'partner_name', v_name,
            'address', nullif(trim(x #>> '{seller,address}'), ''),
            'partner_tax_code', v_tax,
            'invoice_series', nullif(v_series, ''),
            'invoice_number', v_number,
            'invoice_date', x ->> 'invoice_date',
            'description', coalesce(nullif(trim(x ->> 'description'), ''),
                                    left(format('Mua theo HĐ %s-%s của %s', v_series, v_number, v_name), 480)),
            'source', 'import',
            'lines', v_lines
          ), false);
          v_results := v_results || jsonb_build_object('row', v_row, 'status', 'new', 'voucher_id', v_id,
            'number', (select v.number from public.vouchers v where v.id = v_id), 'partner', v_state,
            'items', jsonb_build_object('matched', v_matched, 'lines', jsonb_array_length(x -> 'lines')));
          v_count_new := v_count_new + 1;
        end if;
        if v_inserted then v_new_taxes := v_new_taxes || v_tax; end if;
      exception when others then
        get stacked diagnostics v_msg = message_text;
        v_results := v_results || jsonb_build_object('row', v_row, 'status', 'error', 'message', v_msg, 'partner', v_state);
        v_count_errors := v_count_errors + 1;
      end;
    end loop;

    if p_dry_run or v_count_errors > 0 then
      raise exception 'hoàn tác' using errcode = 'P0099';
    end if;
  exception when sqlstate 'P0099' then
    -- Mọi thay đổi trong khối (nhà cung cấp mới, hóa đơn, bộ đếm số chứng từ) đã được hoàn tác
    null;
  end;

  if not p_dry_run and v_count_errors = 0 then
    select coalesce(jsonb_agg(case when r ->> 'status' = 'new' then jsonb_set(r, '{status}', '"created"') else r end), '[]'::jsonb)
    into v_results from jsonb_array_elements(v_results) as r;
  else
    -- Chưa ghi gì: bỏ id/số chứng từ dự kiến của hóa đơn mới
    select coalesce(jsonb_agg(case when r ->> 'status' = 'new' then r - 'voucher_id' - 'number' else r end), '[]'::jsonb)
    into v_results from jsonb_array_elements(v_results) as r;
  end if;

  return jsonb_build_object(
    'ok', v_count_errors = 0,
    'dry_run', p_dry_run,
    'created', case when p_dry_run or v_count_errors > 0 then 0 else v_count_new end,
    'new', v_count_new,
    'skipped', v_count_exists,
    'errors', v_count_errors,
    'partners_created', cardinality(v_new_taxes),
    'results', v_results
  );
end $$;

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------
revoke execute on function app.default_warehouse(uuid, uuid) from public, anon, authenticated;
revoke execute on function app.match_item(uuid, text, text) from public, anon, authenticated;
revoke execute on function app.build_voucher_gl(uuid) from public, anon, authenticated;
revoke execute on function app.stock_recost(uuid, uuid[], date, uuid) from public, anon, authenticated;
revoke execute on function app.stock_post(uuid) from public, anon, authenticated;
revoke execute on function public.rpt_gross_profit(uuid, date, date, text) from public, anon;
revoke execute on function public.import_purchase_invoices(uuid, jsonb, boolean) from public, anon;
grant execute on function public.rpt_gross_profit(uuid, date, date, text) to authenticated;
grant execute on function public.import_purchase_invoices(uuid, jsonb, boolean) to authenticated;
