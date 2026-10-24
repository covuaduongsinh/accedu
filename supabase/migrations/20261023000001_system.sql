-- AccEdu — Phân hệ Hệ thống: đơn vị (tenant), đơn vị cơ sở, thành viên & vai trò, nhật ký.
-- Mọi bảng nghiệp vụ có tenant_id và bật RLS. Hàm trợ giúp đặt trong schema riêng `app` (không lộ qua API).

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Đơn vị (công ty sử dụng phần mềm) — tương đương "/DUONGSINH" của FAO
-- ---------------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,31}$'),
  name text not null check (length(name) between 1 and 256),
  tax_code text,
  address text,
  phone text,
  email text,
  regime text not null default 'TT99' check (regime in ('TT99', 'TT133')),
  base_currency char(3) not null default 'VND',
  costing_method text not null default 'weighted_period'
    check (costing_method in ('weighted_period', 'weighted_moving', 'fifo', 'specific')),
  vat_method text not null default 'deduction' check (vat_method in ('deduction', 'direct')),
  fiscal_year_start_month smallint not null default 1 check (fiscal_year_start_month between 1 and 12),
  start_date date not null default date_trunc('year', now())::date,
  settings jsonb not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.tenants is 'Đơn vị sử dụng (công ty). start_date = ngày bắt đầu nhập liệu, số dư đầu kỳ tính tại ngày này.';

-- Đơn vị cơ sở (chi nhánh/cơ sở đào tạo) — ma_dvcs của FAO
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (length(code) between 1 and 16),
  name text not null,
  tax_code text,
  address text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);
create unique index branches_one_default on public.branches (tenant_id) where is_default;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  locale text not null default 'vi' check (locale in ('vi', 'en')),
  updated_at timestamptz not null default now()
);

-- Vai trò: owner > admin > chief_accountant > accountant > cashier > viewer
create table public.memberships (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'accountant'
    check (role in ('owner', 'admin', 'chief_accountant', 'accountant', 'cashier', 'viewer')),
  branch_ids uuid[],
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index memberships_user on public.memberships (user_id);
comment on column public.memberships.branch_ids is 'Giới hạn đơn vị cơ sở được truy cập; null = tất cả (Phân quyền theo đơn vị cơ sở).';

-- ---------------------------------------------------------------------------
-- Hàm phân quyền (security definer để tránh đệ quy RLS)
-- ---------------------------------------------------------------------------
create or replace function app.is_member(p_tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant and m.user_id = (select auth.uid())
  )
$$;

create or replace function app.member_role(p_tenant uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
  where m.tenant_id = p_tenant and m.user_id = (select auth.uid())
$$;

create or replace function app.has_role(p_tenant uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(app.member_role(p_tenant) = any (p_roles), false)
$$;

-- Nhóm quyền dùng chung
create or replace function app.can_manage(p_tenant uuid) returns boolean
language sql stable set search_path = '' as $$
  select app.has_role(p_tenant, array['owner', 'admin'])
$$;
create or replace function app.can_edit_catalog(p_tenant uuid) returns boolean
language sql stable set search_path = '' as $$
  select app.has_role(p_tenant, array['owner', 'admin', 'chief_accountant', 'accountant'])
$$;
create or replace function app.can_post(p_tenant uuid) returns boolean
language sql stable set search_path = '' as $$
  select app.has_role(p_tenant, array['owner', 'admin', 'chief_accountant', 'accountant'])
$$;
create or replace function app.can_lock(p_tenant uuid) returns boolean
language sql stable set search_path = '' as $$
  select app.has_role(p_tenant, array['owner', 'admin', 'chief_accountant'])
$$;

create or replace function app.require(p_ok boolean, p_message text)
returns void language plpgsql immutable as $$
begin
  if not coalesce(p_ok, false) then
    raise exception '%', p_message using errcode = '42501';
  end if;
end $$;

grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Nhật ký hệ thống (ai sửa gì, khi nào)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  user_id uuid,
  at timestamptz not null default now()
);
create index audit_log_tenant_at on public.audit_log (tenant_id, at desc);

create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (tenant_id, table_name, record_id, action, old_data, new_data, user_id)
  values (
    (v_row ->> 'tenant_id')::uuid,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'code'),
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    (select auth.uid())
  );
  return coalesce(new, old);
end $$;

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger tenants_touch before update on public.tenants
  for each row execute function app.touch_updated_at();
create trigger memberships_audit after insert or update or delete on public.memberships
  for each row execute function app.audit();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_log enable row level security;

create policy tenants_select on public.tenants for select to authenticated
  using (app.is_member(id));
create policy tenants_update on public.tenants for update to authenticated
  using (app.can_manage(id)) with check (app.can_manage(id));

create policy branches_select on public.branches for select to authenticated
  using (app.is_member(tenant_id));
create policy branches_write on public.branches for all to authenticated
  using (app.can_manage(tenant_id)) with check (app.can_manage(tenant_id));

create policy profiles_self on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy profiles_colleagues on public.profiles for select to authenticated
  using (exists (
    select 1 from public.memberships a
    join public.memberships b on a.tenant_id = b.tenant_id
    where a.user_id = (select auth.uid()) and b.user_id = profiles.user_id
  ));

create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or app.can_manage(tenant_id));
create policy memberships_write on public.memberships for all to authenticated
  using (app.can_manage(tenant_id)) with check (app.can_manage(tenant_id) and role <> 'owner');

create policy audit_select on public.audit_log for select to authenticated
  using (app.has_role(tenant_id, array['owner', 'admin', 'chief_accountant']));
