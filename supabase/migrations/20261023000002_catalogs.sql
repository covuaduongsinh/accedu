-- AccEdu — Danh mục: hệ thống tài khoản, đối tượng, vật tư, kho, vụ việc, bộ phận, phí,
-- tiền tệ & tỷ giá, tài khoản ngân hàng, loại & quyển chứng từ, khóa số liệu.

-- ---------------------------------------------------------------------------
-- Danh mục dùng chung toàn hệ thống (không theo tenant)
-- ---------------------------------------------------------------------------
create table public.coa_templates (
  regime text not null check (regime in ('TT99', 'TT133')),
  code text not null,
  name text not null,
  parent_code text,
  level smallint not null,
  kind text not null check (kind in ('asset', 'liability', 'equity', 'revenue', 'expense', 'result')),
  normal_side text not null check (normal_side in ('debit', 'credit', 'both')),
  track_partner boolean not null default false,
  track_item boolean not null default false,
  primary key (regime, code)
);
comment on table public.coa_templates is 'Hệ thống tài khoản mẫu theo chế độ kế toán; sinh từ packages/core/src/accounting/coa.ts';

create table public.currencies (
  code char(3) primary key,
  name text not null,
  decimals smallint not null default 2
);
insert into public.currencies (code, name, decimals) values
  ('VND', 'Đồng Việt Nam', 0), ('USD', 'Đô la Mỹ', 2), ('EUR', 'Euro', 2),
  ('JPY', 'Yên Nhật', 0), ('CNY', 'Nhân dân tệ', 2), ('KRW', 'Won Hàn Quốc', 0),
  ('SGD', 'Đô la Singapore', 2), ('GBP', 'Bảng Anh', 2), ('AUD', 'Đô la Úc', 2), ('THB', 'Bạt Thái', 2);

-- Loại chứng từ (đồng bộ với packages/core VOUCHER_TYPES)
create table public.voucher_types (
  code text primary key,
  name text not null,
  module text not null,
  style text not null check (style in ('pair', 'single')),
  header_side text check (header_side in ('debit', 'credit')),
  default_header_account text,
  prefix text not null
);
insert into public.voucher_types (code, name, module, style, header_side, default_header_account, prefix) values
  ('PT', 'Phiếu thu tiền mặt', 'cash', 'pair', 'debit', '1111', 'PT'),
  ('PC', 'Phiếu chi tiền mặt', 'cash', 'pair', 'credit', '1111', 'PC'),
  ('BC', 'Giấy báo có', 'cash', 'pair', 'debit', '1121', 'BC'),
  ('BN', 'Giấy báo nợ', 'cash', 'pair', 'credit', '1121', 'BN'),
  ('PK', 'Phiếu kế toán', 'general', 'single', null, null, 'PK'),
  ('HDB', 'Hóa đơn bán hàng', 'sales', 'pair', 'debit', '131', 'HD'),
  ('HDV', 'Hóa đơn dịch vụ', 'sales', 'pair', 'debit', '131', 'DV'),
  ('HDM', 'Hóa đơn mua hàng', 'purchase', 'pair', 'credit', '331', 'MH'),
  ('HMV', 'Hóa đơn mua dịch vụ', 'purchase', 'pair', 'credit', '331', 'MV'),
  ('PNK', 'Phiếu nhập kho', 'inventory', 'pair', 'credit', null, 'PN'),
  ('PXK', 'Phiếu xuất kho', 'inventory', 'pair', 'debit', null, 'PX'),
  ('PDC', 'Phiếu xuất điều chuyển', 'inventory', 'pair', null, null, 'DC'),
  ('KH', 'Bút toán khấu hao TSCĐ', 'assets', 'pair', null, null, 'KH'),
  ('PB', 'Bút toán phân bổ CCDC', 'tools', 'pair', null, null, 'PB'),
  ('KC', 'Bút toán kết chuyển', 'general', 'pair', null, null, 'KC');

alter table public.coa_templates enable row level security;
alter table public.currencies enable row level security;
alter table public.voucher_types enable row level security;
create policy coa_templates_read on public.coa_templates for select to authenticated using (true);
create policy currencies_read on public.currencies for select to anon, authenticated using (true);
create policy voucher_types_read on public.voucher_types for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Danh mục theo đơn vị
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{3,16}$'),
  name text not null,
  name_en text,
  parent_code text,
  level smallint not null default 1,
  kind text not null check (kind in ('asset', 'liability', 'equity', 'revenue', 'expense', 'result')),
  normal_side text not null default 'debit' check (normal_side in ('debit', 'credit', 'both')),
  currency char(3) references public.currencies (code),
  track_partner boolean not null default false,
  track_item boolean not null default false,
  is_postable boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code),
  check (parent_code is null or (code like parent_code || '%' and code <> parent_code))
);
comment on column public.accounts.is_postable is 'Tài khoản chi tiết (không có tài khoản con) mới được hạch toán — tự cập nhật bằng trigger.';

-- Giữ cờ is_postable & level đúng khi thêm/xóa tài khoản con
create or replace function app.accounts_maintain_tree() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := coalesce(new.tenant_id, old.tenant_id);
begin
  update public.accounts a
  set is_postable = not exists (
        select 1 from public.accounts c where c.tenant_id = a.tenant_id and c.parent_code = a.code
      )
  where a.tenant_id = v_tenant
    and a.code in (coalesce(new.parent_code, ''), coalesce(old.parent_code, ''), coalesce(new.code, ''));
  return null;
end $$;

create or replace function app.accounts_check_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_parent_level smallint;
begin
  if new.parent_code is null then
    new.level := 1;
  else
    select level into v_parent_level from public.accounts
    where tenant_id = new.tenant_id and code = new.parent_code;
    if v_parent_level is null then
      raise exception 'Tài khoản mẹ % không tồn tại', new.parent_code using errcode = '23503';
    end if;
    new.level := v_parent_level + 1;
  end if;
  return new;
end $$;

create trigger accounts_check_parent before insert or update of parent_code on public.accounts
  for each row execute function app.accounts_check_parent();
create trigger accounts_tree after insert or delete or update of parent_code on public.accounts
  for each row execute function app.accounts_maintain_tree();
create trigger accounts_touch before update on public.accounts
  for each row execute function app.touch_updated_at();
create trigger accounts_audit after insert or update or delete on public.accounts
  for each row execute function app.audit();

-- Đối tượng: khách hàng / nhà cung cấp / nhân viên / học viên (FAO dùng chung "Danh mục khách hàng")
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (length(code) between 1 and 16),
  name text not null,
  tax_code text,
  id_number text,
  address text,
  phone text,
  email text,
  contact_name text,
  group_code text,
  is_customer boolean not null default true,
  is_supplier boolean not null default false,
  is_employee boolean not null default false,
  is_student boolean not null default false,
  payment_term_days smallint,
  credit_limit numeric(18, 2),
  receivable_account text,
  payable_account text,
  bank_account_no text,
  bank_name text,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
create index partners_name on public.partners (tenant_id, name);
create trigger partners_touch before update on public.partners for each row execute function app.touch_updated_at();
create trigger partners_audit after insert or update or delete on public.partners for each row execute function app.audit();

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  name text not null,
  branch_id uuid references public.branches (id) on delete set null,
  account_code text,
  address text,
  is_active boolean not null default true,
  unique (tenant_id, code)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (length(code) between 1 and 32),
  name text not null,
  kind text not null default 'goods'
    check (kind in ('goods', 'material', 'finished', 'service', 'tool', 'book')),
  uom text not null default 'Cái',
  group_code text,
  inventory_account text,
  revenue_account text,
  cogs_account text,
  sales_return_account text,
  vat_code text not null default '10',
  sale_price numeric(18, 2),
  purchase_price numeric(18, 2),
  track_inventory boolean not null default true,
  barcode text,
  default_warehouse_id uuid references public.warehouses (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
create trigger items_touch before update on public.items for each row execute function app.touch_updated_at();

-- Công trình, vụ việc — dùng cho lớp học/khóa học/giải đấu
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null default 'project' check (kind in ('project', 'class', 'course', 'event', 'contract')),
  group_code text,
  partner_id uuid references public.partners (id) on delete set null,
  start_date date,
  end_date date,
  budget numeric(18, 2),
  is_active boolean not null default true,
  unique (tenant_id, code)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  unique (tenant_id, code)
);

create table public.expense_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  name text not null,
  group_code text,
  is_active boolean not null default true,
  unique (tenant_id, code)
);

create table public.exchange_rates (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  currency char(3) not null references public.currencies (code),
  rate_date date not null,
  rate numeric(18, 6) not null check (rate > 0),
  primary key (tenant_id, currency, rate_date)
);

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  account_no text not null,
  bank_name text not null,
  bank_bin text,
  branch_name text,
  account_code text not null,
  currency char(3) not null default 'VND' references public.currencies (code),
  is_active boolean not null default true,
  unique (tenant_id, account_no)
);
comment on column public.bank_accounts.bank_bin is 'Mã BIN ngân hàng (Napas) để sinh mã VietQR';

-- Quyển chứng từ & bộ đếm số
create table public.voucher_books (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  name text not null,
  voucher_type text not null references public.voucher_types (code),
  prefix text not null,
  padding smallint not null default 4 check (padding between 1 and 10),
  reset_yearly boolean not null default true,
  is_default boolean not null default false,
  is_active boolean not null default true,
  unique (tenant_id, code)
);
create unique index voucher_books_default on public.voucher_books (tenant_id, voucher_type) where is_default;

create table public.voucher_book_counters (
  book_id uuid not null references public.voucher_books (id) on delete cascade,
  year smallint not null,
  last_number integer not null default 0,
  primary key (book_id, year)
);

-- Khóa số liệu đến ngày (theo loại chứng từ, '*' = tất cả)
create table public.period_locks (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  voucher_type text not null default '*',
  locked_until date not null,
  locked_by uuid references auth.users (id) on delete set null,
  locked_at timestamptz not null default now(),
  primary key (tenant_id, voucher_type)
);

-- ---------------------------------------------------------------------------
-- RLS danh mục: thành viên được xem; kế toán trở lên được sửa
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'partners', 'warehouses', 'items', 'jobs', 'departments',
                           'expense_items', 'exchange_rates', 'bank_accounts', 'voucher_books']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.is_member(tenant_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.can_edit_catalog(tenant_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app.can_edit_catalog(tenant_id)) with check (app.can_edit_catalog(tenant_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (app.can_edit_catalog(tenant_id))', t || '_delete', t);
  end loop;
end $$;

alter table public.voucher_book_counters enable row level security;
create policy voucher_book_counters_select on public.voucher_book_counters for select to authenticated
  using (exists (select 1 from public.voucher_books b where b.id = book_id and app.is_member(b.tenant_id)));

alter table public.period_locks enable row level security;
create policy period_locks_select on public.period_locks for select to authenticated
  using (app.is_member(tenant_id));
create policy period_locks_write on public.period_locks for all to authenticated
  using (app.can_lock(tenant_id)) with check (app.can_lock(tenant_id));
