-- AccEdu Platform — nền CSDL thay cho Supabase cloud (idempotent, chạy bằng superuser).
-- Tạo các role mà PostgREST + migration nghiệp vụ dùng, và schema `auth` do apps/server quản lý.
-- Dùng chung cho production (VPS) và test (supabase/scripts/local-pg.sh).

-- ---------------------------------------------------------------------------
-- Role
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  -- PostgREST đăng nhập bằng authenticator rồi SET ROLE theo claim `role` trong JWT
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
  -- apps/server: quản lý schema auth, LISTEN realtime, gọi hàm platform.*
  if not exists (select 1 from pg_roles where rolname = 'accedu_server') then create role accedu_server login; end if;
end $$;

grant anon, authenticated, service_role to authenticator;
grant authenticated to accedu_server;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists platform;

-- ---------------------------------------------------------------------------
-- Người dùng & phiên đăng nhập
-- ---------------------------------------------------------------------------
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}',
  raw_app_meta_data jsonb not null default '{}',
  must_change_password boolean not null default false,
  banned_until timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists users_email_key on auth.users (lower(email));

create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_agent text,
  ip text,
  created_at timestamptz not null default now(),
  refreshed_at timestamptz,
  revoked_at timestamptz
);
create index if not exists sessions_user on auth.sessions (user_id);

-- Refresh token xoay vòng: mỗi lần làm mới cấp token mới, token cũ bị thu hồi.
-- Dùng lại token đã thu hồi = dấu hiệu bị đánh cắp → thu hồi cả phiên.
create table if not exists auth.refresh_tokens (
  id bigint generated always as identity primary key,
  token_hash text not null unique,
  session_id uuid not null references auth.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists refresh_tokens_session on auth.refresh_tokens (session_id);

-- Claim JWT do PostgREST đặt vào `request.jwt.claims` cho từng request
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------
grant usage on schema auth to anon, authenticated, service_role, accedu_server;
grant execute on all functions in schema auth to anon, authenticated, service_role, accedu_server;
grant select, insert, update, delete on all tables in schema auth to accedu_server;
grant usage, select on all sequences in schema auth to accedu_server;
grant select on auth.users to service_role;
grant usage on schema platform to accedu_server;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema platform grant execute on functions to accedu_server;

-- Theo dõi migration đã áp (apps/server `migrate`)
create table if not exists platform.schema_migrations (
  version text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);
