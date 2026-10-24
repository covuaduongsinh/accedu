-- AccEdu — Người sử dụng & phân quyền theo đơn vị; số dư đầu kỳ.

-- Hồ sơ người dùng tự tạo khi đăng ký (họ tên lấy từ metadata đăng ký)
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- Danh sách thành viên của đơn vị (kèm email — chỉ quản trị xem được email người khác)
create or replace function public.list_members(p_tenant uuid)
returns table (user_id uuid, email text, full_name text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require(app.is_member(p_tenant), 'Bạn không thuộc đơn vị này');
  return query
    select m.user_id,
           case when app.can_manage(p_tenant) or m.user_id = (select auth.uid()) then u.email::text end,
           p.full_name, m.role, m.created_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
    where m.tenant_id = p_tenant
    order by case m.role when 'owner' then 0 when 'admin' then 1 when 'chief_accountant' then 2
                         when 'accountant' then 3 when 'cashier' then 4 else 5 end, u.email;
end $$;

-- Thêm (hoặc đổi vai trò) thành viên theo email đã đăng ký
create or replace function public.set_member(p_tenant uuid, p_email text, p_role text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_current text;
begin
  perform app.require(app.can_manage(p_tenant), 'Chỉ quản trị được phân quyền người dùng');
  if p_role not in ('admin', 'chief_accountant', 'accountant', 'cashier', 'viewer') then
    raise exception 'Vai trò không hợp lệ: %', p_role;
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Email % chưa đăng ký tài khoản AccEdu', p_email using errcode = 'P0002';
  end if;
  select role into v_current from public.memberships where tenant_id = p_tenant and user_id = v_user;
  if v_current = 'owner' then
    raise exception 'Không thể đổi vai trò của chủ sở hữu' using errcode = '42501';
  end if;
  insert into public.memberships (tenant_id, user_id, role) values (p_tenant, v_user, p_role)
  on conflict (tenant_id, user_id) do update set role = excluded.role;
  return v_user;
end $$;

create or replace function public.remove_member(p_tenant uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require(app.can_manage(p_tenant), 'Chỉ quản trị được xóa người dùng');
  if exists (select 1 from public.memberships where tenant_id = p_tenant and user_id = p_user and role = 'owner') then
    raise exception 'Không thể xóa chủ sở hữu' using errcode = '42501';
  end if;
  delete from public.memberships where tenant_id = p_tenant and user_id = p_user;
end $$;

-- Ghi đè số dư đầu kỳ của các tài khoản (tại ngày bắt đầu nhập liệu)
-- p_rows: [{account, partner_id?, debit, credit}]
create or replace function public.set_opening_balances(p_tenant uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_bad text;
  v_count integer;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền nhập số dư đầu kỳ');
  perform app.assert_period_open(p_tenant, '*', (select start_date from public.tenants where id = p_tenant));

  select string_agg(distinct r ->> 'account', ', ') into v_bad
  from jsonb_array_elements(p_rows) r
  where (coalesce((r ->> 'debit')::numeric, 0) <> 0 or coalesce((r ->> 'credit')::numeric, 0) <> 0)
    and not exists (
    select 1 from public.accounts a
    where a.tenant_id = p_tenant and a.code = r ->> 'account' and a.is_postable
  );
  if v_bad is not null then
    raise exception 'Tài khoản không tồn tại hoặc không phải tài khoản chi tiết: %', v_bad using errcode = 'P0001';
  end if;

  delete from public.opening_balances where tenant_id = p_tenant;
  insert into public.opening_balances (tenant_id, account, partner_id, debit, credit)
  select p_tenant, r ->> 'account', nullif(r ->> 'partner_id', '')::uuid,
         round(coalesce((r ->> 'debit')::numeric, 0), 2), round(coalesce((r ->> 'credit')::numeric, 0), 2)
  from jsonb_array_elements(p_rows) r
  where coalesce((r ->> 'debit')::numeric, 0) <> 0 or coalesce((r ->> 'credit')::numeric, 0) <> 0;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.list_members(uuid) from public, anon;
revoke execute on function public.set_member(uuid, text, text) from public, anon;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
revoke execute on function public.set_opening_balances(uuid, jsonb) from public, anon;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.opening_balances, public.memberships;
  end if;
end $$;
