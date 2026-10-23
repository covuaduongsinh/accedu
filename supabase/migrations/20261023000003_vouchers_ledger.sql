-- AccEdu — Chứng từ & sổ cái.
-- Client KHÔNG ghi trực tiếp vào vouchers/gl_entries: mọi thao tác qua RPC
-- save_voucher / post_voucher / unpost_voucher / delete_voucher (kiểm tra quyền, khóa sổ, cân Nợ–Có).

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete set null,
  voucher_type text not null references public.voucher_types (code),
  book_id uuid references public.voucher_books (id) on delete set null,
  number text not null,
  issue_date date not null,
  posting_date date not null,
  partner_id uuid references public.partners (id) on delete restrict,
  partner_name text,
  address text,
  contact_name text,
  description text,
  currency char(3) not null default 'VND' references public.currencies (code),
  exchange_rate numeric(18, 6) not null default 1 check (exchange_rate > 0),
  header_account text,
  original_documents text,
  status text not null default 'draft' check (status in ('draft', 'review', 'posted', 'cancelled')),
  total_amount numeric(18, 2) not null default 0,
  total_amount_fc numeric(18, 2) not null default 0,
  source text not null default 'web' check (source in ('web', 'desktop', 'mobile', 'import', 'system', 'ai')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  posted_by uuid references auth.users (id) on delete set null,
  posted_at timestamptz,
  version integer not null default 1,
  unique (tenant_id, voucher_type, number)
);
create index vouchers_list on public.vouchers (tenant_id, voucher_type, posting_date desc, number desc);
create index vouchers_partner on public.vouchers (tenant_id, partner_id);

create table public.voucher_lines (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  line_no integer not null check (line_no > 0),
  debit_account text,
  credit_account text,
  amount numeric(18, 2) not null default 0 check (amount >= 0),
  amount_fc numeric(18, 2) not null default 0 check (amount_fc >= 0),
  entry_group smallint not null default 1,
  description text,
  partner_id uuid references public.partners (id) on delete restrict,
  job_id uuid references public.jobs (id) on delete restrict,
  department_id uuid references public.departments (id) on delete restrict,
  expense_item_id uuid references public.expense_items (id) on delete restrict,
  item_id uuid references public.items (id) on delete restrict,
  warehouse_id uuid references public.warehouses (id) on delete restrict,
  quantity numeric(18, 4),
  unit_price numeric(18, 4),
  invoice_ref text,
  unique (voucher_id, line_no),
  check (debit_account is not null or credit_account is not null)
);
create index voucher_lines_tenant on public.voucher_lines (tenant_id);

-- Tab "Thuế" — hóa đơn GTGT gắn với chứng từ (dùng cho bảng kê & tờ khai, P4/P8)
create table public.voucher_vat (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  line_no integer not null,
  direction text not null check (direction in ('in', 'out')),
  invoice_template text,
  invoice_series text,
  invoice_number text,
  invoice_date date,
  partner_id uuid references public.partners (id) on delete restrict,
  partner_name text,
  partner_tax_code text,
  partner_address text,
  item_name text,
  net_amount numeric(18, 2) not null default 0,
  vat_code text not null,
  vat_rate numeric(5, 2) not null default 0,
  vat_amount numeric(18, 2) not null default 0,
  vat_account text,
  contra_account text,
  unique (voucher_id, line_no)
);

-- Sổ cái: mỗi dòng một vế, sinh khi ghi sổ
create table public.gl_entries (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  branch_id uuid,
  voucher_id uuid not null references public.vouchers (id) on delete cascade,
  voucher_type text not null,
  voucher_number text not null,
  issue_date date not null,
  posting_date date not null,
  line_no integer not null,
  account text not null,
  contra_account text,
  debit numeric(18, 2) not null default 0,
  credit numeric(18, 2) not null default 0,
  debit_fc numeric(18, 2) not null default 0,
  credit_fc numeric(18, 2) not null default 0,
  currency char(3) not null default 'VND',
  partner_id uuid,
  job_id uuid,
  department_id uuid,
  expense_item_id uuid,
  item_id uuid,
  description text,
  check (debit >= 0 and credit >= 0 and (debit = 0 or credit = 0))
);
create index gl_entries_account on public.gl_entries (tenant_id, account, posting_date);
create index gl_entries_date on public.gl_entries (tenant_id, posting_date, voucher_number);
create index gl_entries_voucher on public.gl_entries (voucher_id);
create index gl_entries_partner on public.gl_entries (tenant_id, partner_id, account) where partner_id is not null;

-- Số dư đầu kỳ tại ngày bắt đầu nhập liệu (tenants.start_date)
create table public.opening_balances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  account text not null,
  partner_id uuid references public.partners (id) on delete restrict,
  job_id uuid references public.jobs (id) on delete restrict,
  debit numeric(18, 2) not null default 0 check (debit >= 0),
  credit numeric(18, 2) not null default 0 check (credit >= 0),
  debit_fc numeric(18, 2) not null default 0,
  credit_fc numeric(18, 2) not null default 0,
  currency char(3) not null default 'VND'
);
create unique index opening_balances_key on public.opening_balances
  (tenant_id, account, coalesce(partner_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(job_id, '00000000-0000-0000-0000-000000000000'::uuid));

create trigger vouchers_audit after insert or update or delete on public.vouchers
  for each row execute function app.audit();

-- ---------------------------------------------------------------------------
-- RLS: chỉ đọc qua API; ghi qua RPC security definer
-- ---------------------------------------------------------------------------
alter table public.vouchers enable row level security;
alter table public.voucher_lines enable row level security;
alter table public.voucher_vat enable row level security;
alter table public.gl_entries enable row level security;
alter table public.opening_balances enable row level security;

create policy vouchers_select on public.vouchers for select to authenticated using (app.is_member(tenant_id));
create policy voucher_lines_select on public.voucher_lines for select to authenticated using (app.is_member(tenant_id));
create policy voucher_vat_select on public.voucher_vat for select to authenticated using (app.is_member(tenant_id));
create policy gl_entries_select on public.gl_entries for select to authenticated using (app.is_member(tenant_id));
create policy opening_select on public.opening_balances for select to authenticated using (app.is_member(tenant_id));
create policy opening_write on public.opening_balances for all to authenticated
  using (app.can_post(tenant_id)) with check (app.can_post(tenant_id));

-- ---------------------------------------------------------------------------
-- Hàm nghiệp vụ
-- ---------------------------------------------------------------------------

-- Kiểm tra ngày hạch toán chưa bị khóa
create or replace function app.assert_period_open(p_tenant uuid, p_type text, p_date date)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  v_until date;
begin
  if p_date < (select start_date from public.tenants where id = p_tenant) then
    raise exception 'Ngày hạch toán % trước ngày bắt đầu nhập liệu', to_char(p_date, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  select max(locked_until) into v_until from public.period_locks
  where tenant_id = p_tenant and voucher_type in ('*', p_type);
  if v_until is not null and p_date <= v_until then
    raise exception 'Số liệu đã khóa đến ngày %, không thể thay đổi chứng từ ngày %',
      to_char(v_until, 'DD/MM/YYYY'), to_char(p_date, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
end $$;

-- Cấp số chứng từ tiếp theo theo quyển (khóa hàng để tránh trùng số khi nhiều thiết bị cùng lưu)
create or replace function app.next_voucher_number(p_book uuid, p_date date)
returns text language plpgsql security definer set search_path = '' as $$
declare
  b public.voucher_books;
  v_year smallint;
  v_next integer;
begin
  select * into b from public.voucher_books where id = p_book;
  if not found then raise exception 'Không tìm thấy quyển chứng từ'; end if;
  v_year := case when b.reset_yearly then extract(year from p_date)::smallint else 0 end;
  insert into public.voucher_book_counters as c (book_id, year, last_number)
  values (p_book, v_year, 1)
  on conflict (book_id, year) do update set last_number = c.last_number + 1
  returning last_number into v_next;
  return b.prefix || lpad(v_next::text, b.padding, '0');
end $$;

-- Lưu chứng từ (thêm mới / sửa). p_voucher: jsonb snake_case, lines: mảng dòng.
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
  v_role text := app.member_role(v_tenant);
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
      original_documents, source, created_by, updated_by)
    values (v_tenant, nullif(p_voucher ->> 'branch_id', '')::uuid, v_type, v_book, v_number, v_issue, v_posting,
      nullif(p_voucher ->> 'partner_id', '')::uuid, p_voucher ->> 'partner_name', p_voucher ->> 'address',
      p_voucher ->> 'contact_name', p_voucher ->> 'description', v_currency, v_rate, v_header,
      p_voucher ->> 'original_documents', coalesce(nullif(p_voucher ->> 'source', ''), 'web'),
      (select auth.uid()), (select auth.uid()))
    returning id into v_id;
  else
    update public.vouchers set
      branch_id = nullif(p_voucher ->> 'branch_id', '')::uuid, book_id = coalesce(v_book, book_id),
      number = v_number, issue_date = v_issue, posting_date = v_posting,
      partner_id = nullif(p_voucher ->> 'partner_id', '')::uuid, partner_name = p_voucher ->> 'partner_name',
      address = p_voucher ->> 'address', contact_name = p_voucher ->> 'contact_name',
      description = p_voucher ->> 'description', currency = v_currency, exchange_rate = v_rate,
      header_account = v_header, original_documents = p_voucher ->> 'original_documents',
      updated_by = (select auth.uid()), updated_at = now(), version = version + 1
    where id = v_id;
    delete from public.voucher_lines where voucher_id = v_id;
    delete from public.voucher_vat where voucher_id = v_id;
  end if;

  insert into public.voucher_lines (voucher_id, tenant_id, line_no, debit_account, credit_account, amount, amount_fc,
    entry_group, description, partner_id, job_id, department_id, expense_item_id, item_id, warehouse_id,
    quantity, unit_price, invoice_ref)
  select v_id, v_tenant,
    coalesce((l ->> 'line_no')::int, ord::int),
    coalesce(nullif(l ->> 'debit_account', ''), case when vt.header_side = 'debit' then v_header end),
    coalesce(nullif(l ->> 'credit_account', ''), case when vt.header_side = 'credit' then v_header end),
    round(coalesce((l ->> 'amount')::numeric, round(coalesce((l ->> 'amount_fc')::numeric, 0) * v_rate)), 2),
    round(coalesce((l ->> 'amount_fc')::numeric, (l ->> 'amount')::numeric, 0), 2),
    coalesce((l ->> 'entry_group')::smallint, 1),
    coalesce(nullif(l ->> 'description', ''), p_voucher ->> 'description'),
    coalesce(nullif(l ->> 'partner_id', '')::uuid, nullif(p_voucher ->> 'partner_id', '')::uuid),
    nullif(l ->> 'job_id', '')::uuid, nullif(l ->> 'department_id', '')::uuid,
    nullif(l ->> 'expense_item_id', '')::uuid, nullif(l ->> 'item_id', '')::uuid,
    nullif(l ->> 'warehouse_id', '')::uuid, (l ->> 'quantity')::numeric, (l ->> 'unit_price')::numeric,
    l ->> 'invoice_ref'
  from jsonb_array_elements(p_voucher -> 'lines') with ordinality as x(l, ord);

  update public.vouchers v set
    total_amount = s.total, total_amount_fc = s.total_fc
  from (
    select coalesce(sum(amount) filter (where debit_account is not null), 0) as total,
           coalesce(sum(amount_fc) filter (where debit_account is not null), 0) as total_fc
    from public.voucher_lines where voucher_id = v_id
  ) s
  where v.id = v_id;

  if p_post then
    perform public.post_voucher(v_id);
  end if;
  return v_id;
end $$;

-- Ghi sổ: sinh gl_entries từ dòng chứng từ, kiểm tra tài khoản & cân Nợ–Có
create or replace function public.post_voucher(p_voucher_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v public.vouchers;
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

  -- Tài khoản phải tồn tại, đang dùng và là tài khoản chi tiết
  select string_agg(distinct acc, ', ') into v_bad
  from (
    select debit_account as acc from public.voucher_lines where voucher_id = v.id and debit_account is not null
    union all
    select credit_account from public.voucher_lines where voucher_id = v.id and credit_account is not null
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

create or replace function public.unpost_voucher(p_voucher_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.vouchers;
begin
  select * into v from public.vouchers where id = p_voucher_id for update;
  if not found then raise exception 'Không tìm thấy chứng từ'; end if;
  perform app.require(app.can_post(v.tenant_id), 'Bạn không có quyền bỏ ghi sổ');
  perform app.assert_period_open(v.tenant_id, v.voucher_type, v.posting_date);
  delete from public.gl_entries where voucher_id = v.id;
  update public.vouchers set status = 'draft', posted_at = null, posted_by = null, version = version + 1
  where id = v.id;
end $$;

create or replace function public.delete_voucher(p_voucher_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.vouchers;
begin
  select * into v from public.vouchers where id = p_voucher_id for update;
  if not found then raise exception 'Không tìm thấy chứng từ'; end if;
  perform app.require(app.has_role(v.tenant_id, array['owner', 'admin', 'chief_accountant', 'accountant', 'cashier']),
    'Bạn không có quyền xóa chứng từ');
  if v.status = 'posted' then
    raise exception 'Chứng từ % đã ghi sổ — bỏ ghi sổ trước khi xóa', v.number using errcode = 'P0001';
  end if;
  perform app.assert_period_open(v.tenant_id, v.voucher_type, v.posting_date);
  delete from public.vouchers where id = v.id;
end $$;

-- Khóa số liệu đến ngày
create or replace function public.lock_period(p_tenant uuid, p_until date, p_voucher_type text default '*')
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require(app.can_lock(p_tenant), 'Chỉ kế toán trưởng/quản trị được khóa số liệu');
  insert into public.period_locks (tenant_id, voucher_type, locked_until, locked_by)
  values (p_tenant, p_voucher_type, p_until, (select auth.uid()))
  on conflict (tenant_id, voucher_type) do update
    set locked_until = excluded.locked_until, locked_by = excluded.locked_by, locked_at = now();
end $$;

revoke execute on function public.save_voucher(jsonb, boolean) from public, anon;
revoke execute on function public.post_voucher(uuid) from public, anon;
revoke execute on function public.unpost_voucher(uuid) from public, anon;
revoke execute on function public.delete_voucher(uuid) from public, anon;
revoke execute on function public.lock_period(uuid, date, text) from public, anon;
