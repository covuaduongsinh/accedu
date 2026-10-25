-- AccEdu — P4b: Thu/chi tiền theo hóa đơn, báo cáo tuổi nợ, bảng kê hóa đơn bán ra / mua vào.
-- Dòng phiếu thu/chi (PT, BC, PC, BN, PK…) trỏ tới hóa đơn qua voucher_lines.invoice_id:
--   hóa đơn bán (HDB, HDV — Nợ 131): dòng thu ghi Có 131, cùng đối tượng;
--   hóa đơn mua (HDM, HMV — Có 331): dòng trả ghi Nợ 331, cùng đối tượng.
-- Chỉ phiếu đã ghi sổ mới được tính là đã thanh toán. Không có khóa ngoại sang vouchers (để truy vấn
-- vouchers?select=*,voucher_lines(*) không bị nhập nhằng giữa hai quan hệ) — toàn vẹn do các hàm bảo đảm.

alter table public.voucher_lines add column invoice_id uuid;
comment on column public.voucher_lines.invoice_id is 'Hóa đơn (vouchers.id loại HDB/HDV/HDM/HMV) mà dòng thu/chi này trừ vào';
create index voucher_lines_invoice on public.voucher_lines (invoice_id) where invoice_id is not null;

-- Số tiền dạng 1.234.567 trong thông báo lỗi
create or replace function app.fmt_amount(p numeric) returns text
language sql immutable set search_path = '' as $$
  select replace(to_char(p, 'FM999,999,999,999,990'), ',', '.')
$$;

-- Lỗi của các dòng trừ vào hóa đơn trong một chứng từ (null = hợp lệ)
create or replace function app.invoice_ref_errors(p_voucher uuid) returns text
language sql stable set search_path = '' as $$
  select string_agg(format('dòng %s: %s', line_no, msg), '; ' order by line_no)
  from (
    select l.line_no,
      case
        when i.id is null or i.tenant_id <> l.tenant_id then 'hóa đơn được chọn không tồn tại'
        when i.voucher_type not in ('HDB', 'HDV', 'HDM', 'HMV') then format('%s không phải hóa đơn', i.number)
        when i.id = l.voucher_id then 'không trừ hóa đơn vào chính nó'
        when i.status = 'cancelled' then format('hóa đơn %s đã hủy', i.number)
        when l.partner_id is distinct from i.partner_id then format('đối tượng khác với hóa đơn %s', i.number)
        when l.vat_amount > 0 then 'dòng trừ tiền hóa đơn không ghi thuế GTGT'
        when (case when it.header_side = 'debit' then l.credit_account else l.debit_account end)
             is distinct from i.header_account
          then format('trừ hóa đơn %s phải ghi %s TK %s', i.number,
                      case when it.header_side = 'debit' then 'Có' else 'Nợ' end, i.header_account)
        when l.amount <= 0 then 'số tiền trừ hóa đơn phải lớn hơn 0'
      end as msg
    from public.voucher_lines l
    left join public.vouchers i on i.id = l.invoice_id
    left join public.voucher_types it on it.code = i.voucher_type
    where l.voucher_id = p_voucher and l.invoice_id is not null
  ) c
  where msg is not null
$$;

-- ---------------------------------------------------------------------------
-- save_voucher: nhận invoice_id trên dòng
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
-- post_voucher: kiểm tra số đã thanh toán của hóa đơn
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
-- unpost_voucher / delete_voucher: không để phiếu thanh toán trỏ tới hóa đơn đã bỏ ghi sổ hoặc đã xóa
-- ---------------------------------------------------------------------------
create or replace function public.unpost_voucher(p_voucher_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.vouchers;
  v_refs text;
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
  delete from public.gl_entries where voucher_id = v.id;
  update public.vouchers set status = 'draft', posted_at = null, posted_by = null, version = version + 1
  where id = v.id;
end $$;

create or replace function public.delete_voucher(p_voucher_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.vouchers;
  v_refs text;
begin
  select * into v from public.vouchers where id = p_voucher_id for update;
  if not found then raise exception 'Không tìm thấy chứng từ'; end if;
  perform app.require(app.has_role(v.tenant_id, array['owner', 'admin', 'chief_accountant', 'accountant', 'cashier']),
    'Bạn không có quyền xóa chứng từ');
  if v.status = 'posted' then
    raise exception 'Chứng từ % đã ghi sổ — bỏ ghi sổ trước khi xóa', v.number using errcode = 'P0001';
  end if;
  perform app.assert_period_open(v.tenant_id, v.voucher_type, v.posting_date);
  select string_agg(distinct pv.number, ', ') into v_refs
  from public.voucher_lines pl join public.vouchers pv on pv.id = pl.voucher_id
  where pl.invoice_id = v.id and pv.id <> v.id;
  if v_refs is not null then
    raise exception 'Hóa đơn % đang được chọn ở phiếu % — bỏ chọn hóa đơn ở phiếu đó (hoặc xóa phiếu) trước', v.number, v_refs
      using errcode = 'P0001';
  end if;
  delete from public.vouchers where id = v.id;
end $$;

-- ---------------------------------------------------------------------------
-- Hóa đơn còn nợ (đã ghi sổ). p_side: receivable (HDB, HDV) | payable (HDM, HMV).
-- p_as_of: chỉ tính hóa đơn và phiếu thanh toán ghi sổ đến ngày này (null = tất cả).
-- days_overdue: số ngày quá hạn tính từ hạn thanh toán (thiếu hạn thì từ ngày hóa đơn); âm = chưa đến hạn.
-- ---------------------------------------------------------------------------
create or replace function public.open_invoices(
  p_tenant uuid, p_side text, p_partner uuid default null, p_as_of date default null,
  p_include_paid boolean default false
)
returns table (
  id uuid, voucher_type text, number text, posting_date date,
  invoice_series text, invoice_number text, invoice_date date, due_date date,
  partner_id uuid, partner_code text, partner_name text, account text, description text,
  total_amount numeric, paid numeric, remaining numeric, days_overdue integer
)
language sql stable security invoker set search_path = '' as $$
  select i.id, i.voucher_type, i.number, i.posting_date,
         i.invoice_series, i.invoice_number, i.invoice_date, i.due_date,
         i.partner_id, p.code, p.name, i.header_account, i.description,
         i.total_amount, coalesce(pay.paid, 0), i.total_amount - coalesce(pay.paid, 0),
         coalesce(p_as_of, current_date) - coalesce(i.due_date, i.invoice_date, i.posting_date)
  from public.vouchers i
  join public.voucher_types t on t.code = i.voucher_type
  left join public.partners p on p.id = i.partner_id
  left join lateral (
    select sum(pl.amount) as paid
    from public.voucher_lines pl join public.vouchers pv on pv.id = pl.voucher_id
    where pl.invoice_id = i.id and pv.status = 'posted' and (p_as_of is null or pv.posting_date <= p_as_of)
  ) pay on true
  where i.tenant_id = p_tenant and i.status = 'posted'
    and i.voucher_type in ('HDB', 'HDV', 'HDM', 'HMV')
    and t.header_side = case p_side when 'receivable' then 'debit' when 'payable' then 'credit' end
    and (p_partner is null or i.partner_id = p_partner)
    and (p_as_of is null or i.posting_date <= p_as_of)
    and (p_include_paid or i.total_amount - coalesce(pay.paid, 0) <> 0)
  order by coalesce(i.due_date, i.invoice_date, i.posting_date), i.posting_date, i.number
$$;

-- ---------------------------------------------------------------------------
-- Tuổi nợ theo đối tượng tại ngày p_as_of.
-- Các khoảng tính trên số còn nợ của từng hóa đơn; unallocated = số dư công nợ − tổng còn nợ theo hóa đơn
-- (số dư đầu kỳ, phiếu thu/chi không gắn hóa đơn, bút toán khác); total = số dư công nợ
-- (phải thu: Nợ − Có của TK 131; phải trả: Có − Nợ của TK 331 — cùng cách tính với rpt_partner_balances).
-- ---------------------------------------------------------------------------
create or replace function public.rpt_aging(p_tenant uuid, p_side text, p_as_of date, p_account text default null)
returns table (
  partner_id uuid, partner_code text, partner_name text,
  not_due numeric, d1_30 numeric, d31_60 numeric, d61_90 numeric, over_90 numeric,
  unallocated numeric, total numeric
)
language sql stable security invoker set search_path = '' as $$
  with acc as (
    select coalesce(nullif(trim(p_account), ''), case p_side when 'receivable' then '131' else '331' end) as code,
           case p_side when 'receivable' then 1 else -1 end as sign
  ),
  bal as (
    select x.partner_id, sum(x.net) * max(acc.sign) as balance
    from (
      select ob.partner_id, ob.debit - ob.credit as net
      from public.opening_balances ob, acc
      where ob.tenant_id = p_tenant and ob.partner_id is not null and ob.account like acc.code || '%'
      union all
      select g.partner_id, g.debit - g.credit
      from public.gl_entries g, acc
      where g.tenant_id = p_tenant and g.partner_id is not null and g.account like acc.code || '%'
        and g.posting_date <= p_as_of
    ) x, acc
    group by x.partner_id
  ),
  inv as (
    select o.partner_id,
           sum(o.remaining) filter (where o.days_overdue <= 0) as not_due,
           sum(o.remaining) filter (where o.days_overdue between 1 and 30) as d1_30,
           sum(o.remaining) filter (where o.days_overdue between 31 and 60) as d31_60,
           sum(o.remaining) filter (where o.days_overdue between 61 and 90) as d61_90,
           sum(o.remaining) filter (where o.days_overdue > 90) as over_90,
           sum(o.remaining) as invoiced
    from public.open_invoices(p_tenant, p_side, null, p_as_of) o, acc
    where o.account like acc.code || '%'
    group by o.partner_id
  )
  select p.id, p.code, p.name,
         coalesce(inv.not_due, 0), coalesce(inv.d1_30, 0), coalesce(inv.d31_60, 0),
         coalesce(inv.d61_90, 0), coalesce(inv.over_90, 0),
         coalesce(bal.balance, 0) - coalesce(inv.invoiced, 0), coalesce(bal.balance, 0)
  from bal full join inv on inv.partner_id = bal.partner_id
  join public.partners p on p.id = coalesce(bal.partner_id, inv.partner_id)
  where p_side in ('receivable', 'payable')
    and (coalesce(bal.balance, 0) <> 0 or coalesce(inv.invoiced, 0) <> 0)
  order by p.code
$$;

-- ---------------------------------------------------------------------------
-- Bảng kê hóa đơn, chứng từ hàng hóa dịch vụ bán ra (p_direction 'out': HDB, HDV, PT, BC…)
-- / mua vào ('in': HDM, HMV, PC, BN…) — chứng từ đã ghi sổ, theo ngày hạch toán.
-- Mỗi chứng từ × mã thuế một dòng; nhóm KCT → 0% → 5% → 8% → 10% → KKKNT.
-- ---------------------------------------------------------------------------
create or replace function public.rpt_vat_listing(p_tenant uuid, p_direction text, p_from date, p_to date)
returns table (
  group_order integer, vat_code text, vat_rate numeric,
  voucher_id uuid, voucher_type text, voucher_number text, posting_date date,
  invoice_series text, invoice_number text, invoice_date date,
  partner_code text, partner_name text, partner_tax_code text, item_description text,
  net_amount numeric, vat_amount numeric
)
language sql stable security invoker set search_path = '' as $$
  select case l.vat_code when 'KCT' then 1 when '0' then 2 when '5' then 3 when '8' then 4 when '10' then 5 else 6 end,
         l.vat_code, max(l.vat_rate),
         v.id, v.voucher_type, v.number, v.posting_date,
         v.invoice_series, v.invoice_number, coalesce(v.invoice_date, v.issue_date),
         p.code, coalesce(nullif(v.partner_name, ''), p.name), coalesce(nullif(v.partner_tax_code, ''), p.tax_code),
         (array_agg(coalesce(l.description, v.description) order by l.line_no))[1],
         sum(l.amount), sum(l.vat_amount)
  from public.vouchers v
  join public.voucher_types t on t.code = v.voucher_type
  join public.voucher_lines l on l.voucher_id = v.id
  left join public.partners p on p.id = v.partner_id
  where v.tenant_id = p_tenant and v.status = 'posted' and v.posting_date between p_from and p_to
    and l.vat_code is not null
    and t.header_side = case p_direction when 'out' then 'debit' when 'in' then 'credit' end
  group by l.vat_code, v.id, p.id
  order by 1, 10, 9, 6
$$;

revoke execute on function app.fmt_amount(numeric) from public, anon, authenticated;
revoke execute on function app.invoice_ref_errors(uuid) from public, anon, authenticated;
revoke execute on function public.open_invoices(uuid, text, uuid, date, boolean) from public, anon;
revoke execute on function public.rpt_aging(uuid, text, date, text) from public, anon;
revoke execute on function public.rpt_vat_listing(uuid, text, date, date) from public, anon;
grant execute on function public.open_invoices(uuid, text, uuid, date, boolean) to authenticated;
grant execute on function public.rpt_aging(uuid, text, date, text) to authenticated;
grant execute on function public.rpt_vat_listing(uuid, text, date, date) to authenticated;
