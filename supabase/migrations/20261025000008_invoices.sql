-- AccEdu — P4a: Hóa đơn bán hàng/dịch vụ, mua hàng/dịch vụ có thuế GTGT theo dòng; sổ & tổng hợp công nợ;
-- nhập danh mục hàng hóa từ Excel.
-- Bút toán thuế sinh khi ghi sổ, theo vế của tài khoản phần đầu:
--   phần đầu bên Nợ (HDB, HDV, PT, BC):  Nợ TK phần đầu (131/111) / Có TK thuế (33311)
--   phần đầu bên Có (HDM, HMV, PC, BN):  Nợ TK thuế (1331) / Có TK phần đầu (331/111)

-- ---------------------------------------------------------------------------
-- Cột hóa đơn & thuế
-- ---------------------------------------------------------------------------
alter table public.vouchers
  add column invoice_series text,
  add column invoice_number text,
  add column invoice_date date,
  add column due_date date,
  add column partner_tax_code text,
  add column total_net numeric(18, 2) not null default 0,
  add column total_vat numeric(18, 2) not null default 0;
comment on column public.vouchers.invoice_number is 'Hóa đơn bán: số hóa đơn đã xuất; hóa đơn mua: số trên hóa đơn của nhà cung cấp';
comment on column public.vouchers.total_amount is 'Tổng thanh toán = tiền hàng (total_net) + thuế GTGT (total_vat)';

-- Không nhập trùng một hóa đơn mua (cùng nhà cung cấp, ký hiệu, số)
create unique index vouchers_purchase_invoice on public.vouchers
  (tenant_id, partner_id, coalesce(invoice_series, ''), invoice_number)
  where voucher_type in ('HDM', 'HMV') and invoice_number is not null and status <> 'cancelled';
create index vouchers_due on public.vouchers (tenant_id, due_date) where due_date is not null;

alter table public.voucher_lines
  add column uom text,
  add column discount_amount numeric(18, 2) not null default 0 check (discount_amount >= 0),
  add column vat_code text,
  add column vat_rate numeric(5, 2) not null default 0,
  add column vat_amount numeric(18, 2) not null default 0 check (vat_amount >= 0),
  add column vat_account text;
comment on column public.voucher_lines.amount is 'Thành tiền chưa thuế (đã trừ chiết khấu) — ghi vào TK doanh thu/chi phí/hàng hóa';

-- Thuế suất theo mã thuế (đồng bộ với packages/core VAT_CODES); null = mã không hợp lệ
create or replace function app.vat_rate(p_code text) returns numeric
language sql immutable set search_path = '' as $$
  select case p_code when '0' then 0 when '5' then 5 when '8' then 8 when '10' then 10
                     when 'KCT' then 0 when 'KKKNT' then 0 end::numeric
$$;

-- ---------------------------------------------------------------------------
-- save_voucher: thêm trường hóa đơn, thuế theo dòng, hạn thanh toán
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
      invoice_series, invoice_number, invoice_date, due_date, partner_tax_code)
    values (v_tenant, nullif(p_voucher ->> 'branch_id', '')::uuid, v_type, v_book, v_number, v_issue, v_posting,
      v_partner, p_voucher ->> 'partner_name', p_voucher ->> 'address',
      p_voucher ->> 'contact_name', p_voucher ->> 'description', v_currency, v_rate, v_header,
      p_voucher ->> 'original_documents', coalesce(nullif(p_voucher ->> 'source', ''), 'web'),
      (select auth.uid()), (select auth.uid()),
      nullif(trim(p_voucher ->> 'invoice_series'), ''), nullif(trim(p_voucher ->> 'invoice_number'), ''),
      v_invoice_date, v_due, nullif(trim(p_voucher ->> 'partner_tax_code'), ''))
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
      updated_by = (select auth.uid()), updated_at = now(), version = version + 1
    where id = v_id;
    delete from public.voucher_lines where voucher_id = v_id;
    delete from public.voucher_vat where voucher_id = v_id;
  end if;

  insert into public.voucher_lines (voucher_id, tenant_id, line_no, debit_account, credit_account, amount, amount_fc,
    entry_group, description, partner_id, job_id, department_id, expense_item_id, item_id, warehouse_id,
    quantity, unit_price, invoice_ref, uom, discount_amount, vat_code, vat_rate, vat_amount, vat_account)
  select v_id, v_tenant, x.line_no, x.debit_account, x.credit_account, x.amount, x.amount_fc,
    x.entry_group, x.description, x.partner_id, x.job_id, x.department_id, x.expense_item_id, x.item_id,
    x.warehouse_id, x.quantity, x.unit_price, x.invoice_ref, x.uom, x.discount_amount, x.vat_code,
    coalesce(app.vat_rate(x.vat_code), 0),
    x.vat_amount,
    case when x.vat_amount > 0
         then coalesce(x.vat_account, case vt.header_side when 'debit' then '33311' when 'credit' then '1331' end) end
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
      nullif(trim(l ->> 'vat_account'), '') as vat_account
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

  update public.vouchers v set
    total_net = s.net, total_vat = s.vat, total_amount = s.net + s.vat, total_amount_fc = s.total_fc
  from (
    select coalesce(sum(amount) filter (where debit_account is not null), 0) as net,
           coalesce(sum(vat_amount), 0) as vat,
           coalesce(sum(amount_fc) filter (where debit_account is not null), 0) as total_fc
    from public.voucher_lines where voucher_id = v_id
  ) s
  where v.id = v_id;

  if p_post then
    perform public.post_voucher(v_id);
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- post_voucher: thêm bút toán thuế GTGT
-- ---------------------------------------------------------------------------
create or replace function public.post_voucher(p_voucher_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v public.vouchers;
  v_side text;
  v_bad text;
  v_count integer;
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

  if (select sum(debit) - sum(credit) from public.gl_entries where voucher_id = v.id) <> 0 then
    raise exception 'Chứng từ % không cân Nợ – Có', v.number using errcode = 'P0001';
  end if;

  update public.vouchers set status = 'posted', posted_at = now(), posted_by = (select auth.uid())
  where id = v.id;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Công nợ theo đối tượng (security invoker: RLS của gl_entries / opening_balances áp dụng)
-- ---------------------------------------------------------------------------

-- Sổ chi tiết công nợ của một đối tượng trên một tài khoản (gồm tiểu khoản), có số dư lũy kế
create or replace function public.rpt_partner_ledger(p_tenant uuid, p_account text, p_partner uuid, p_from date, p_to date)
returns table (
  row_kind text, posting_date date, voucher_number text, voucher_type text, issue_date date, voucher_id uuid,
  description text, account text, contra_account text, debit numeric, credit numeric,
  balance_debit numeric, balance_credit numeric
)
language sql stable security invoker set search_path = '' as $$
  with opening as (
    select coalesce(sum(net), 0) as net from (
      select ob.debit - ob.credit as net from public.opening_balances ob
      where ob.tenant_id = p_tenant and ob.partner_id = p_partner and ob.account like p_account || '%'
      union all
      select g.debit - g.credit from public.gl_entries g
      where g.tenant_id = p_tenant and g.partner_id = p_partner and g.account like p_account || '%'
        and g.posting_date < p_from
    ) x
  ),
  moves as (
    select g.posting_date, g.voucher_number, g.voucher_type, g.issue_date, g.voucher_id, g.description, g.account,
           g.contra_account, g.debit, g.credit, g.id
    from public.gl_entries g
    where g.tenant_id = p_tenant and g.partner_id = p_partner and g.account like p_account || '%'
      and g.posting_date between p_from and p_to
  ),
  running as (
    select m.*, (select net from opening)
             + sum(m.debit - m.credit) over (order by m.posting_date, m.voucher_number, m.id) as bal
    from moves m
  )
  select 'opening', p_from, null, null, null, null, 'Số dư đầu kỳ', p_account, null, null, null,
         greatest(o.net, 0), greatest(-o.net, 0)
  from opening o
  union all
  select 'entry', r.posting_date, r.voucher_number, r.voucher_type, r.issue_date, r.voucher_id, r.description,
         r.account, r.contra_account, r.debit, r.credit, greatest(r.bal, 0), greatest(-r.bal, 0)
  from running r
  union all
  select 'total', p_to, null, null, null, null, 'Cộng phát sinh', p_account, null,
         coalesce(sum(m.debit), 0), coalesce(sum(m.credit), 0), null, null
  from moves m
  union all
  select 'closing', p_to, null, null, null, null, 'Số dư cuối kỳ', p_account, null, null, null,
         greatest(o.net + coalesce(t.d, 0) - coalesce(t.c, 0), 0), greatest(-(o.net + coalesce(t.d, 0) - coalesce(t.c, 0)), 0)
  from opening o, (select sum(debit) as d, sum(credit) as c from moves) t
$$;

-- Tổng hợp công nợ theo đối tượng: dư đầu kỳ, phát sinh, dư cuối kỳ (bù trừ theo từng đối tượng)
create or replace function public.rpt_partner_balances(p_tenant uuid, p_account text, p_from date, p_to date)
returns table (
  partner_id uuid, partner_code text, partner_name text,
  opening_debit numeric, opening_credit numeric, debit numeric, credit numeric,
  closing_debit numeric, closing_credit numeric
)
language sql stable security invoker set search_path = '' as $$
  with x as (
    select ob.partner_id, ob.debit - ob.credit as open_net, 0::numeric as debit, 0::numeric as credit
    from public.opening_balances ob
    where ob.tenant_id = p_tenant and ob.partner_id is not null and ob.account like p_account || '%'
    union all
    select g.partner_id,
           case when g.posting_date < p_from then g.debit - g.credit else 0 end,
           case when g.posting_date >= p_from then g.debit else 0 end,
           case when g.posting_date >= p_from then g.credit else 0 end
    from public.gl_entries g
    where g.tenant_id = p_tenant and g.partner_id is not null and g.account like p_account || '%'
      and g.posting_date <= p_to
  ),
  s as (
    select partner_id, sum(open_net) as open_net, sum(debit) as debit, sum(credit) as credit
    from x group by partner_id
  )
  select s.partner_id, p.code, p.name,
         greatest(s.open_net, 0), greatest(-s.open_net, 0), s.debit, s.credit,
         greatest(s.open_net + s.debit - s.credit, 0), greatest(-(s.open_net + s.debit - s.credit), 0)
  from s join public.partners p on p.id = s.partner_id
  where s.open_net <> 0 or s.debit <> 0 or s.credit <> 0
  order by p.code
$$;

-- ---------------------------------------------------------------------------
-- Danh mục hàng hóa, dịch vụ: nhập từ Excel (cùng quy ước với import_partners: kiểm tra hết trước khi ghi)
-- p_rows: [{row, code, name?, kind?, uom?, vat_code?, sale_price?, purchase_price?, revenue_account?,
--           inventory_account?, group_code?, barcode?}]
-- ---------------------------------------------------------------------------
create or replace function public.import_items(p_tenant uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_errors jsonb;
  v_inserted integer := 0;
  v_updated integer := 0;
begin
  perform app.require(app.can_edit_catalog(p_tenant), 'Bạn không có quyền sửa danh mục');
  perform app.import_check_rows(p_rows);

  with src as (
    select coalesce((x ->> 'row')::int, i::int) as row_no, trim(x ->> 'code') as code, x,
           row_number() over (partition by upper(trim(x ->> 'code')) order by i) as dup,
           nullif(trim(x ->> 'name'), '') as new_name
    from jsonb_array_elements(p_rows) with ordinality as e(x, i)
  ),
  cur as (
    select s.*, exists (select 1 from public.items it where it.tenant_id = p_tenant and upper(it.code) = upper(s.code)) as existing
    from src s
  ),
  checks as (
    select c.row_no, v.ord, v.msg
    from cur c, lateral (values
      (1, case when coalesce(c.code, '') = '' then 'Thiếu mã hàng' when length(c.code) > 32 then 'Mã hàng tối đa 32 ký tự' end),
      (2, case when c.dup > 1 then format('Trùng mã %s trong tệp', c.code) end),
      (3, case when c.new_name is null and (not c.existing or c.x ? 'name') then 'Thiếu tên hàng' end),
      (4, case when c.x ? 'kind' and coalesce(c.x ->> 'kind', '') not in ('goods', 'material', 'finished', 'service', 'tool', 'book')
               then 'Loại hàng không hợp lệ' end),
      (5, case when nullif(c.x ->> 'vat_code', '') is not null and app.vat_rate(c.x ->> 'vat_code') is null
               then format('Mã thuế %s không hợp lệ (0, 5, 8, 10, KCT, KKKNT)', c.x ->> 'vat_code') end),
      (6, case when (c.x ? 'sale_price' and jsonb_typeof(c.x -> 'sale_price') not in ('number', 'null'))
                 or (c.x ? 'purchase_price' and jsonb_typeof(c.x -> 'purchase_price') not in ('number', 'null'))
                 or coalesce((c.x ->> 'sale_price')::numeric, 0) < 0 or coalesce((c.x ->> 'purchase_price')::numeric, 0) < 0
               then 'Giá phải là số không âm' end),
      (7, (select format('Tài khoản %s không tồn tại hoặc không phải tài khoản chi tiết', string_agg(acc, ', '))
           from (values (nullif(c.x ->> 'revenue_account', '')), (nullif(c.x ->> 'inventory_account', ''))) a(acc)
           where acc is not null and not exists (
             select 1 from public.accounts ac where ac.tenant_id = p_tenant and ac.code = a.acc and ac.is_postable)
           having count(*) > 0))
    ) v(ord, msg)
    where v.msg is not null
  )
  select app.import_errors(jsonb_agg(jsonb_build_object('row', row_no, 'message', msg) order by row_no, ord))
  into v_errors from checks;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end if;

  with upd as (
    select it.id,
           coalesce(nullif(trim(x ->> 'name'), ''), it.name) as name,
           coalesce(nullif(x ->> 'kind', ''), it.kind) as kind,
           coalesce(nullif(trim(x ->> 'uom'), ''), it.uom) as uom,
           coalesce(nullif(x ->> 'vat_code', ''), it.vat_code) as vat_code,
           case when x ? 'sale_price' then (x ->> 'sale_price')::numeric else it.sale_price end as sale_price,
           case when x ? 'purchase_price' then (x ->> 'purchase_price')::numeric else it.purchase_price end as purchase_price,
           case when x ? 'revenue_account' then nullif(x ->> 'revenue_account', '') else it.revenue_account end as revenue_account,
           case when x ? 'inventory_account' then nullif(x ->> 'inventory_account', '') else it.inventory_account end as inventory_account,
           case when x ? 'group_code' then nullif(trim(x ->> 'group_code'), '') else it.group_code end as group_code,
           case when x ? 'barcode' then nullif(trim(x ->> 'barcode'), '') else it.barcode end as barcode
    from jsonb_array_elements(p_rows) x
    join public.items it on it.tenant_id = p_tenant and upper(it.code) = upper(trim(x ->> 'code'))
  )
  update public.items it
  set name = u.name, kind = u.kind, uom = u.uom, vat_code = u.vat_code, sale_price = u.sale_price,
      purchase_price = u.purchase_price, revenue_account = u.revenue_account, inventory_account = u.inventory_account,
      group_code = u.group_code, barcode = u.barcode, track_inventory = u.kind <> 'service', is_active = true
  from upd u
  where it.id = u.id
    and (it.name, it.kind, it.uom, it.vat_code, it.sale_price, it.purchase_price, it.revenue_account,
         it.inventory_account, it.group_code, it.barcode, it.is_active)
        is distinct from
        (u.name, u.kind, u.uom, u.vat_code, u.sale_price, u.purchase_price, u.revenue_account,
         u.inventory_account, u.group_code, u.barcode, true);
  get diagnostics v_updated = row_count;

  insert into public.items (tenant_id, code, name, kind, uom, vat_code, sale_price, purchase_price,
                            revenue_account, inventory_account, group_code, barcode, track_inventory)
  select p_tenant, trim(x ->> 'code'), trim(x ->> 'name'), coalesce(nullif(x ->> 'kind', ''), 'goods'),
         coalesce(nullif(trim(x ->> 'uom'), ''), 'Cái'), coalesce(nullif(x ->> 'vat_code', ''), '10'),
         (x ->> 'sale_price')::numeric, (x ->> 'purchase_price')::numeric,
         nullif(x ->> 'revenue_account', ''), nullif(x ->> 'inventory_account', ''),
         nullif(trim(x ->> 'group_code'), ''), nullif(trim(x ->> 'barcode'), ''),
         coalesce(nullif(x ->> 'kind', ''), 'goods') <> 'service'
  from jsonb_array_elements(p_rows) x
  where not exists (select 1 from public.items it where it.tenant_id = p_tenant and upper(it.code) = upper(trim(x ->> 'code')));
  get diagnostics v_inserted = row_count;

  return jsonb_build_object('ok', true, 'inserted', v_inserted, 'updated', v_updated,
                            'unchanged', jsonb_array_length(p_rows) - v_inserted - v_updated);
end $$;

revoke execute on function public.rpt_partner_ledger(uuid, text, uuid, date, date) from public, anon;
revoke execute on function public.rpt_partner_balances(uuid, text, date, date) from public, anon;
revoke execute on function public.import_items(uuid, jsonb) from public, anon;
grant execute on function public.rpt_partner_ledger(uuid, text, uuid, date, date) to authenticated;
grant execute on function public.rpt_partner_balances(uuid, text, date, date) to authenticated;
grant execute on function public.import_items(uuid, jsonb) to authenticated;
grant execute on function app.vat_rate(text) to authenticated, service_role;

-- Danh mục hàng hóa đồng bộ realtime giữa các thiết bị
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'items') then
    alter publication supabase_realtime add table public.items;
  end if;
end $$;
