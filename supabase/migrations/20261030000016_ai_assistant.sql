-- AccEdu — P9c-2: AI hỏi đáp số liệu (Edge Function ai-ask gọi Claude API).
--
-- Quy tắc:
--   Mỗi câu hỏi một dòng ai_usage: người hỏi, vai trò, câu hỏi, câu trả lời, báo cáo AI đã tra, số token, chi phí ước tính.
--   Hạn mức câu hỏi mỗi ngày (giờ Việt Nam) theo đơn vị: tenants.ai_daily_limit (mặc định 100; 0 = tắt AI hỏi đáp).
--     Câu hỏi lỗi kỹ thuật (status error) không tính vào hạn mức.
--   ai_begin (JWT người hỏi): kiểm tra thành viên + hạn mức, giữ chỗ một dòng 'pending', trả vai trò để chọn bộ tool.
--   ai_finish (service role): ghi câu trả lời, token, chi phí. Người hỏi không tự sửa được nhật ký.
--   Tool của AI chỉ đọc và gọi các hàm báo cáo bằng chính phiên đăng nhập của người hỏi (RLS, quyền giữ nguyên).
--   Người hỏi xem lịch sử của mình; chủ sở hữu / quản trị xem toàn bộ đơn vị.

alter table public.tenants
  add column ai_daily_limit integer not null default 100 check (ai_daily_limit between 0 and 10000);
comment on column public.tenants.ai_daily_limit is 'Số câu hỏi AI tối đa mỗi ngày của đơn vị (0 = tắt)';

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  role text not null,
  question text not null check (char_length(question) between 1 and 2000),
  answer text,
  tools text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'ok', 'refused', 'error')),
  error text,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  asked_on date not null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
comment on table public.ai_usage is 'Nhật ký AI hỏi đáp: câu hỏi, câu trả lời, báo cáo đã tra, token, chi phí ước tính (USD)';
create index ai_usage_day on public.ai_usage (tenant_id, asked_on);
create index ai_usage_user on public.ai_usage (tenant_id, user_id, created_at desc);

alter table public.ai_usage enable row level security;
create policy ai_usage_select on public.ai_usage for select to authenticated
  using ((user_id = (select auth.uid()) and (app.is_member(tenant_id) or app.is_coach(tenant_id))) or app.can_manage(tenant_id));
-- Ghi qua ai_begin / ai_finish; không mở ghi trực tiếp

-- ---------------------------------------------------------------------------
-- Hạn mức hôm nay
-- ---------------------------------------------------------------------------
create or replace function app.ai_used_today(p_tenant uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.ai_usage u
  where u.tenant_id = p_tenant and u.asked_on = app.today_vn() and u.status <> 'error'
$$;

create or replace function public.ai_quota(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit integer;
  v_used integer;
begin
  perform app.require(app.is_member(p_tenant) or app.is_coach(p_tenant), 'Bạn không thuộc đơn vị này');
  select t.ai_daily_limit into v_limit from public.tenants t where t.id = p_tenant;
  v_used := app.ai_used_today(p_tenant);
  return jsonb_build_object('limit', v_limit, 'used', v_used, 'remaining', greatest(v_limit - v_used, 0));
end $$;

-- ---------------------------------------------------------------------------
-- Bắt đầu một câu hỏi (người hỏi gọi qua Edge Function bằng JWT của mình)
-- ---------------------------------------------------------------------------
create or replace function public.ai_begin(p_tenant uuid, p_question text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_limit integer;
  v_used integer;
  v_id uuid;
  v_question text := btrim(coalesce(p_question, ''));
begin
  select m.role into v_role from public.memberships m where m.tenant_id = p_tenant and m.user_id = (select auth.uid());
  perform app.require(v_role is not null, 'Bạn không thuộc đơn vị này');
  if v_question = '' then
    raise exception 'Câu hỏi trống' using errcode = '22023';
  end if;
  if char_length(v_question) > 2000 then
    raise exception 'Câu hỏi quá dài (tối đa 2000 ký tự)' using errcode = '22023';
  end if;

  -- Hai câu hỏi cùng lúc của một đơn vị không vượt hạn mức
  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || p_tenant::text, 0));
  select t.ai_daily_limit into v_limit from public.tenants t where t.id = p_tenant;
  v_used := app.ai_used_today(p_tenant);
  if v_limit = 0 then
    return jsonb_build_object('ok', false, 'error', 'disabled', 'role', v_role, 'limit', 0, 'used', v_used, 'remaining', 0);
  end if;
  if v_used >= v_limit then
    return jsonb_build_object('ok', false, 'error', 'limit', 'role', v_role, 'limit', v_limit, 'used', v_used, 'remaining', 0);
  end if;

  insert into public.ai_usage (tenant_id, user_id, role, question, asked_on)
  values (p_tenant, (select auth.uid()), v_role, v_question, app.today_vn())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'usage_id', v_id, 'role', v_role, 'limit', v_limit, 'used', v_used + 1,
                            'remaining', v_limit - v_used - 1);
end $$;

-- ---------------------------------------------------------------------------
-- Ghi kết quả (chỉ Edge Function bằng service role)
-- ---------------------------------------------------------------------------
create or replace function public.ai_finish(p_usage uuid, p_row jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_status text := coalesce(p_row ->> 'status', 'ok');
begin
  perform app.require(app.is_service(), 'Chỉ hệ thống được ghi kết quả AI');
  if v_status not in ('ok', 'refused', 'error') then
    raise exception 'Trạng thái không hợp lệ: %', v_status using errcode = '22023';
  end if;
  update public.ai_usage u set
    status = v_status,
    answer = left(p_row ->> 'answer', 20000),
    error = left(p_row ->> 'error', 2000),
    tools = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_row -> 'tools', '[]'::jsonb)) x), '{}'),
    model = left(p_row ->> 'model', 100),
    input_tokens = coalesce((p_row ->> 'input_tokens')::integer, 0),
    output_tokens = coalesce((p_row ->> 'output_tokens')::integer, 0),
    cache_read_tokens = coalesce((p_row ->> 'cache_read_tokens')::integer, 0),
    cache_write_tokens = coalesce((p_row ->> 'cache_write_tokens')::integer, 0),
    cost_usd = coalesce((p_row ->> 'cost_usd')::numeric, 0),
    finished_at = now()
  where u.id = p_usage and u.status = 'pending';
end $$;

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------
revoke execute on function app.ai_used_today(uuid) from public, anon, authenticated;
revoke execute on function public.ai_quota(uuid) from public, anon;
revoke execute on function public.ai_begin(uuid, text) from public, anon;
revoke execute on function public.ai_finish(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ai_quota(uuid) to authenticated;
grant execute on function public.ai_begin(uuid, text) to authenticated;
grant execute on function public.ai_finish(uuid, jsonb) to service_role;
