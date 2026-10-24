-- AccEdu — Khởi tạo chủ sở hữu + đơn vị đầu tiên (Supabase tự host, tắt đăng ký tự do).
-- Tài khoản được tạo trước bằng GoTrue admin API (workflow triển khai / E2E); hàm này chỉ gán quyền và
-- tạo đơn vị. Chạy lại nhiều lần không sinh trùng. Chỉ postgres / service_role gọi được.
create or replace function app.bootstrap_owner(
  p_user_id uuid, p_slug text, p_name text, p_regime text default 'TT99', p_start_date date default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid;
  v_created boolean := false;
begin
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Không có tài khoản %', p_user_id using errcode = '22023';
  end if;

  select id into v_tenant from public.tenants where slug = lower(p_slug);
  if v_tenant is null then
    -- create_tenant dùng auth.uid(): đặt claim tạm thời trong transaction này
    perform set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
    v_tenant := public.create_tenant(lower(p_slug), p_name, p_regime, null, p_start_date);
    perform set_config('request.jwt.claims', '', true);
    v_created := true;
  else
    insert into public.memberships (tenant_id, user_id, role) values (v_tenant, p_user_id, 'owner')
    on conflict (tenant_id, user_id) do update set role = 'owner';
  end if;

  return jsonb_build_object('tenant_id', v_tenant, 'tenant_created', v_created);
end $$;

revoke execute on function app.bootstrap_owner(uuid, text, text, text, date) from public, anon, authenticated;
grant execute on function app.bootstrap_owner(uuid, text, text, text, date) to service_role;

-- Đổi tên / thông tin đơn vị cũng đồng bộ realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tenants') then
    alter publication supabase_realtime add table public.tenants;
  end if;
end $$;
