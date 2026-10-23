-- AccEdu — Realtime bằng LISTEN/NOTIFY và các hàm quản trị của AccEdu Platform (tự host).
-- Tương thích ngược: trên Supabase cloud không có role accedu_server thì phần cấp quyền được bỏ qua.

-- ---------------------------------------------------------------------------
-- Realtime: báo thay đổi theo đơn vị qua kênh `accedu_changes`.
-- Payload chỉ gồm tenant/bảng/thao tác (+ id chứng từ) — không chứa dữ liệu, client tải lại qua API có RLS.
-- Payload trùng nhau trong một transaction được Postgres gộp làm một → thao tác hàng loạt không gây bão sự kiện.
-- ---------------------------------------------------------------------------
create or replace function app.notify_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  v_tenant text := coalesce(r ->> 'tenant_id', case when tg_table_name = 'tenants' then r ->> 'id' end);
begin
  if v_tenant is not null then
    perform pg_notify('accedu_changes', json_build_object(
      'tenant', v_tenant,
      'table', tg_table_name,
      'op', tg_op,
      'id', case when tg_table_name = 'vouchers' then r ->> 'id' end
    )::text);
  end if;
  return null;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['tenants', 'vouchers', 'accounts', 'partners', 'items', 'jobs',
                           'opening_balances', 'period_locks', 'memberships']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_notify', t);
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function app.notify_change()', t || '_notify', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Hàm quản trị nền tảng — chỉ apps/server gọi (role accedu_server), không lộ qua PostgREST
-- ---------------------------------------------------------------------------
create schema if not exists platform;

-- Quản trị đơn vị (owner/admin) tạo tài khoản mới với mật khẩu tạm; email đã có thì chỉ gán vào đơn vị.
-- p_actor: người gọi đã được server xác thực bằng JWT. p_password_hash: argon2id do server tính.
create or replace function platform.create_user(
  p_actor uuid, p_tenant uuid, p_email text, p_password_hash text, p_full_name text, p_role text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_created boolean := false;
  v_email text := lower(trim(p_email));
begin
  if not exists (
    select 1 from public.memberships
    where tenant_id = p_tenant and user_id = p_actor and role in ('owner', 'admin')
  ) then
    raise exception 'Chỉ quản trị được tạo tài khoản' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'chief_accountant', 'accountant', 'cashier', 'viewer') then
    raise exception 'Vai trò không hợp lệ: %', p_role using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email không hợp lệ' using errcode = '22023';
  end if;

  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is null then
    insert into auth.users (email, encrypted_password, raw_user_meta_data, must_change_password)
    values (v_email, p_password_hash, jsonb_build_object('full_name', nullif(trim(p_full_name), '')), true)
    returning id into v_user;
    v_created := true;
  end if;

  if exists (select 1 from public.memberships where tenant_id = p_tenant and user_id = v_user and role = 'owner') then
    raise exception 'Không thể đổi vai trò của chủ sở hữu' using errcode = '42501';
  end if;
  insert into public.memberships (tenant_id, user_id, role) values (p_tenant, v_user, p_role)
  on conflict (tenant_id, user_id) do update set role = excluded.role;

  return jsonb_build_object('user_id', v_user, 'created', v_created);
end $$;

-- Khởi tạo lần đầu (CLI trên máy chủ): chủ sở hữu + đơn vị. Chạy lại nhiều lần không sinh trùng.
create or replace function platform.bootstrap_owner(
  p_email text, p_password_hash text, p_full_name text,
  p_slug text, p_tenant_name text, p_regime text default 'TT99', p_start_date date default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_user uuid;
  v_tenant uuid;
  v_user_created boolean := false;
  v_tenant_created boolean := false;
begin
  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is null then
    insert into auth.users (email, encrypted_password, raw_user_meta_data, must_change_password)
    values (v_email, p_password_hash, jsonb_build_object('full_name', nullif(trim(p_full_name), '')), true)
    returning id into v_user;
    v_user_created := true;
  end if;

  select id into v_tenant from public.tenants where slug = lower(p_slug);
  if v_tenant is null then
    -- create_tenant dùng auth.uid(): đặt claim tạm thời cho transaction này
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    v_tenant := public.create_tenant(lower(p_slug), p_tenant_name, p_regime, null, p_start_date);
    perform set_config('request.jwt.claims', '', true);
    v_tenant_created := true;
  else
    insert into public.memberships (tenant_id, user_id, role) values (v_tenant, v_user, 'owner')
    on conflict (tenant_id, user_id) do update set role = 'owner';
  end if;

  return jsonb_build_object('user_id', v_user, 'tenant_id', v_tenant,
                            'user_created', v_user_created, 'tenant_created', v_tenant_created);
end $$;

-- Realtime kiểm tra quyền theo dõi đơn vị (accedu_server không bỏ qua RLS — dùng hàm có phạm vi hẹp)
create or replace function platform.is_member(p_tenant uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships where tenant_id = p_tenant and user_id = p_user)
$$;

-- Cập nhật họ tên hiển thị khi người dùng sửa hồ sơ qua /auth/v1/user
create or replace function platform.set_full_name(p_user uuid, p_full_name text)
returns void language sql security definer set search_path = '' as $$
  insert into public.profiles (user_id, full_name) values (p_user, nullif(trim(p_full_name), ''))
  on conflict (user_id) do update set full_name = excluded.full_name, updated_at = now()
$$;

revoke execute on function platform.is_member(uuid, uuid) from public;
revoke execute on function platform.set_full_name(uuid, text) from public;
revoke execute on function platform.create_user(uuid, uuid, text, text, text, text) from public;
revoke execute on function platform.bootstrap_owner(text, text, text, text, text, text, date) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'accedu_server') then
    grant usage on schema platform to accedu_server;
    grant execute on function platform.create_user(uuid, uuid, text, text, text, text) to accedu_server;
    grant execute on function platform.bootstrap_owner(text, text, text, text, text, text, date) to accedu_server;
    grant execute on function platform.is_member(uuid, uuid) to accedu_server;
    grant execute on function platform.set_full_name(uuid, text) to accedu_server;
  end if;
end $$;
