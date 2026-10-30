-- AccEdu — P3b: Sao kê ngân hàng, tự khớp học phí chuyển khoản, đối chiếu TK 112.
--
-- Quy tắc:
--   Kế toán nhập tệp sao kê (Excel / CSV) cho một TK 112 chi tiết; mỗi giao dịch một dòng bank_lines, chống trùng bằng
--     fingerprint (ngày + tham chiếu + số tiền + nội dung) nên nhập lại hoặc nhập chồng kỳ không sinh dòng trùng.
--   Gợi ý khớp (app.bank_suggest) tính lúc đọc nên luôn theo số liệu mới nhất, theo thứ tự:
--     1. BC / BN đã ghi sổ trên đúng TK, cùng số tiền, ngày lệch ≤ 3 ngày, chưa gắn dòng sao kê nào (kế toán lập tay trước);
--     2. học phí: nội dung có "HP <mã học viên> [số hóa đơn]" (nội dung VietQR của AccEdu) → trừ vào phiếu học phí còn nợ;
--     3. hóa đơn bán hàng / dịch vụ: nội dung có số hóa đơn còn nợ.
--   Xác nhận gợi ý: lập Giấy báo có Nợ TK 112 của sao kê / Có 131 trừ đúng hóa đơn (thừa tiền ghi Có 131 trả trước), ghi sổ
--     ngay theo ngày giao dịch; hoặc chỉ gắn chứng từ có sẵn. Dòng không có gợi ý: lập BC / BN với TK đối ứng tự chọn
--     (phí ngân hàng, lãi tiền gửi…), gắn tay một chứng từ, hoặc bỏ qua.
--   Đối chiếu: số dư sổ TK 112 đến ngày so với số dư trên sao kê; dòng sao kê chưa khớp; BC / BN chưa có trên sao kê.

create table public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  account text not null,
  file_name text,
  period_from date,
  period_to date,
  closing_balance numeric(18, 2),
  inserted integer not null default 0,
  duplicates integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.bank_statements is 'Lần nhập sao kê ngân hàng: TK 112, tệp, kỳ, số dư cuối theo sao kê, số dòng mới / trùng';

create table public.bank_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  statement_id uuid not null references public.bank_statements (id) on delete cascade,
  account text not null,
  txn_date date not null,
  seq integer not null default 0,
  ref text,
  description text not null default '',
  amount_in numeric(18, 2) not null default 0 check (amount_in >= 0),
  amount_out numeric(18, 2) not null default 0 check (amount_out >= 0),
  balance numeric(18, 2),
  fingerprint text not null,
  voucher_id uuid references public.vouchers (id) on delete set null,
  ignored boolean not null default false,
  matched_by uuid references auth.users (id) on delete set null,
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  check ((amount_in > 0) <> (amount_out > 0)),
  unique (tenant_id, account, fingerprint)
);
comment on table public.bank_lines is 'Dòng sao kê ngân hàng: giao dịch, chứng từ đã khớp (voucher_id) hoặc bỏ qua';
create index bank_lines_period on public.bank_lines (tenant_id, account, txn_date);
create unique index bank_lines_voucher on public.bank_lines (voucher_id) where voucher_id is not null;

alter table public.bank_statements enable row level security;
alter table public.bank_lines enable row level security;
create policy bank_statements_select on public.bank_statements for select to authenticated using (app.is_member(tenant_id));
create policy bank_lines_select on public.bank_lines for select to authenticated using (app.is_member(tenant_id));
-- Ghi qua các hàm bên dưới; không mở ghi trực tiếp

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.bank_statements, public.bank_lines;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Tiện ích
-- ---------------------------------------------------------------------------
create or replace function app.bank_account_ok(p_tenant uuid, p_account text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.accounts a
    where a.tenant_id = p_tenant and a.code = p_account and a.code like '112%' and a.is_postable and a.is_active
  )
$$;

/** Nội dung sao kê → các từ chữ hoa không dấu (ký tự khác chữ / số thành khoảng trắng) */
create or replace function app.bank_tokens(p_text text) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_remove(regexp_split_to_array(
           btrim(regexp_replace(upper(coalesce(p_text, '')), '[^A-Z0-9]+', ' ', 'g')), ' '), ''), '{}')
$$;

/** Số đã thu / đã trả của một hóa đơn (dòng phiếu thu / chi đã ghi sổ trỏ tới hóa đơn) */
create or replace function app.invoice_remaining(p_invoice uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select v.total_amount - coalesce((
    select sum(pl.amount) from public.voucher_lines pl join public.vouchers pv on pv.id = pl.voucher_id
    where pl.invoice_id = v.id and pv.status = 'posted'), 0)
  from public.vouchers v where v.id = p_invoice
$$;

-- ---------------------------------------------------------------------------
-- Nhập sao kê
-- ---------------------------------------------------------------------------
create or replace function public.import_bank_statement(p_tenant uuid, p_account text, p_meta jsonb, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_total integer := jsonb_array_length(coalesce(p_lines, '[]'::jsonb));
  v_inserted integer;
  r record;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền nhập sao kê ngân hàng');
  if not app.bank_account_ok(p_tenant, p_account) then
    raise exception 'Tài khoản % không phải TK tiền gửi ngân hàng chi tiết (đầu 112)', p_account using errcode = 'P0001';
  end if;
  if v_total = 0 then raise exception 'Tệp sao kê không có giao dịch' using errcode = 'P0001'; end if;
  if v_total > 5000 then raise exception 'Mỗi lần nhập tối đa 5000 giao dịch' using errcode = 'P0001'; end if;

  for r in
    select ord, l from jsonb_array_elements(p_lines) with ordinality x(l, ord)
  loop
    if (r.l ->> 'txn_date') is null or (r.l ->> 'fingerprint') is null
       or ((coalesce((r.l ->> 'amount_in')::numeric, 0) > 0) = (coalesce((r.l ->> 'amount_out')::numeric, 0) > 0))
       or coalesce((r.l ->> 'amount_in')::numeric, 0) < 0 or coalesce((r.l ->> 'amount_out')::numeric, 0) < 0 then
      raise exception 'Dòng % của sao kê không hợp lệ (cần ngày và đúng một trong tiền vào / tiền ra)', r.ord using errcode = 'P0001';
    end if;
  end loop;

  insert into public.bank_statements (tenant_id, account, file_name, period_from, period_to, closing_balance, created_by)
  values (p_tenant, p_account, left(p_meta ->> 'file_name', 200), (p_meta ->> 'period_from')::date, (p_meta ->> 'period_to')::date,
          (p_meta ->> 'closing_balance')::numeric, (select auth.uid()))
  returning id into v_id;

  with ins as (
    insert into public.bank_lines (tenant_id, statement_id, account, txn_date, seq, ref, description, amount_in, amount_out,
                                   balance, fingerprint)
    select p_tenant, v_id, p_account, (l ->> 'txn_date')::date, coalesce((l ->> 'seq')::integer, ord::integer),
           nullif(left(btrim(l ->> 'ref'), 100), ''), left(coalesce(l ->> 'description', ''), 1000),
           coalesce((l ->> 'amount_in')::numeric, 0), coalesce((l ->> 'amount_out')::numeric, 0),
           (l ->> 'balance')::numeric, left(l ->> 'fingerprint', 400)
    from jsonb_array_elements(p_lines) with ordinality x(l, ord)
    on conflict (tenant_id, account, fingerprint) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  update public.bank_statements set inserted = v_inserted, duplicates = v_total - v_inserted where id = v_id;
  return jsonb_build_object('ok', true, 'statement_id', v_id, 'inserted', v_inserted, 'duplicates', v_total - v_inserted);
end $$;

create or replace function public.delete_bank_statement(p_tenant uuid, p_statement uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_lines integer;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền xóa sao kê ngân hàng');
  select count(*) into v_lines from public.bank_lines where statement_id = p_statement and tenant_id = p_tenant;
  delete from public.bank_statements where id = p_statement and tenant_id = p_tenant;
  if not found then raise exception 'Không tìm thấy lần nhập sao kê' using errcode = 'P0002'; end if;
  return v_lines;
end $$;

-- ---------------------------------------------------------------------------
-- Gợi ý khớp một dòng sao kê
-- ---------------------------------------------------------------------------
create or replace function app.bank_suggest(p_line public.bank_lines)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_amount numeric := greatest(p_line.amount_in, p_line.amount_out);
  v_tokens text[];
  v_code text;
  v_inv text;
  v_student record;
  v_alloc jsonb := '[]'::jsonb;
  v_left numeric;
  v_open numeric := 0;
  v_take numeric;
  r record;
  i integer;
begin
  if p_line.voucher_id is not null or p_line.ignored then return null; end if;

  -- 1. BC / BN đã ghi sổ trên đúng TK, cùng số tiền, ngày lệch ≤ 3 ngày, chưa gắn dòng sao kê nào
  select v.id, v.number, v.voucher_type, v.posting_date, v.description into r
  from public.vouchers v
  where v.tenant_id = p_line.tenant_id and v.status = 'posted'
    and v.voucher_type = case when p_line.amount_in > 0 then 'BC' else 'BN' end
    and v.header_account = p_line.account and v.total_amount = v_amount
    and abs(v.posting_date - p_line.txn_date) <= 3
    and not exists (select 1 from public.bank_lines b where b.voucher_id = v.id)
  order by abs(v.posting_date - p_line.txn_date), v.posting_date, v.number
  limit 1;
  if found then
    return jsonb_build_object('kind', 'existing', 'sure', true, 'voucher_id', r.id, 'number', r.number,
                              'voucher_type', r.voucher_type, 'posting_date', r.posting_date, 'description', r.description);
  end if;

  if p_line.amount_in = 0 then return null; end if;
  v_tokens := app.bank_tokens(p_line.description);

  -- 2. Học phí: "HP <mã học viên> [số hóa đơn]" (cho phép dính liền "HPHV102")
  for i in 1 .. coalesce(array_length(v_tokens, 1), 0) loop
    v_code := null;
    v_inv := null;
    if v_tokens[i] = 'HP' and i < array_length(v_tokens, 1) then
      v_code := v_tokens[i + 1];
      if i + 2 <= array_length(v_tokens, 1) and v_tokens[i + 2] ~ '^[A-Z]{1,4}[0-9]{2,10}$' then v_inv := v_tokens[i + 2]; end if;
    elsif v_tokens[i] ~ '^HP[A-Z0-9]{2,}$' then
      v_code := substr(v_tokens[i], 3);
      if i + 1 <= array_length(v_tokens, 1) and v_tokens[i + 1] ~ '^[A-Z]{1,4}[0-9]{2,10}$' then v_inv := v_tokens[i + 1]; end if;
    end if;
    continue when v_code is null;
    select p.id, p.code, p.name into v_student
    from public.partners p
    where p.tenant_id = p_line.tenant_id and p.is_student and regexp_replace(upper(p.code), '[^A-Z0-9]', '', 'g') = v_code
    limit 1;
    continue when not found;

    -- Phiếu học phí còn nợ của học viên (cũ trước); có số hóa đơn thì chỉ hóa đơn đó
    v_left := v_amount;
    for r in
      select v.id, v.number, v.header_account, app.invoice_remaining(v.id) as remaining
      from public.tuition_bills t
      join public.enrollments e on e.id = t.enrollment_id
      join public.vouchers v on v.id = t.invoice_id
      where e.student_id = v_student.id and v.status = 'posted' and app.invoice_remaining(v.id) > 0
        and (v_inv is null or v.number = v_inv
             or not exists (select 1 from public.tuition_bills t2 join public.enrollments e2 on e2.id = t2.enrollment_id
                            join public.vouchers v2 on v2.id = t2.invoice_id
                            where e2.student_id = v_student.id and v2.status = 'posted' and v2.number = v_inv
                              and app.invoice_remaining(v2.id) > 0))
      order by (v.number = v_inv) desc nulls last, v.posting_date, v.number
    loop
      v_open := v_open + r.remaining;
      continue when v_left <= 0;
      v_take := least(v_left, r.remaining);
      v_alloc := v_alloc || jsonb_build_object('invoice_id', r.id, 'number', r.number, 'account', r.header_account,
                                               'remaining', r.remaining, 'amount', v_take);
      v_left := v_left - v_take;
    end loop;
    return jsonb_build_object(
      'kind', 'tuition', 'partner_id', v_student.id, 'partner_code', v_student.code, 'partner_name', v_student.name,
      'invoice_number', v_inv, 'allocations', v_alloc, 'advance', v_left, 'open', v_open,
      -- Chắc chắn: trả trọn các phiếu (không trả một phần, không thừa)
      'sure', v_left = 0 and jsonb_array_length(v_alloc) > 0 and v_amount = (
        select coalesce(sum((a ->> 'remaining')::numeric), 0) from jsonb_array_elements(v_alloc) a));
  end loop;

  -- 3. Hóa đơn bán hàng / dịch vụ còn nợ có số trong nội dung
  for i in 1 .. coalesce(array_length(v_tokens, 1), 0) loop
    continue when v_tokens[i] !~ '^[A-Z]{1,4}[0-9]{2,10}$';
    select v.id, v.number, v.header_account, v.partner_id, p.code as partner_code, p.name as partner_name,
           app.invoice_remaining(v.id) as remaining into r
    from public.vouchers v left join public.partners p on p.id = v.partner_id
    where v.tenant_id = p_line.tenant_id and v.status = 'posted' and v.voucher_type in ('HDB', 'HDV')
      and v.number = v_tokens[i] and app.invoice_remaining(v.id) > 0
    limit 1;
    continue when not found;
    v_take := least(v_amount, r.remaining);
    return jsonb_build_object(
      'kind', 'invoice', 'partner_id', r.partner_id, 'partner_code', r.partner_code, 'partner_name', r.partner_name,
      'invoice_number', r.number,
      'allocations', jsonb_build_array(jsonb_build_object('invoice_id', r.id, 'number', r.number, 'account', r.header_account,
                                                          'remaining', r.remaining, 'amount', v_take)),
      'advance', v_amount - v_take, 'open', r.remaining, 'sure', v_amount = r.remaining);
  end loop;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Danh sách dòng sao kê + trạng thái + gợi ý
-- ---------------------------------------------------------------------------
create or replace function public.rpt_bank_lines(p_tenant uuid, p_account text, p_from date, p_to date)
returns table (id uuid, statement_id uuid, account text, txn_date date, seq integer, ref text, description text,
               amount_in numeric, amount_out numeric, balance numeric, status text, voucher_id uuid, voucher_number text,
               voucher_type text, voucher_status text, suggestion jsonb, matched_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require(app.is_member(p_tenant), 'Bạn không thuộc đơn vị này');
  return query
    select l.id, l.statement_id, l.account, l.txn_date, l.seq, l.ref, l.description, l.amount_in, l.amount_out, l.balance,
           case when l.voucher_id is not null then 'matched' when l.ignored then 'ignored'
                when s.sg is not null then 'suggested' else 'new' end,
           l.voucher_id, v.number, v.voucher_type, v.status, s.sg, l.matched_at
    from public.bank_lines l
    left join public.vouchers v on v.id = l.voucher_id
    cross join lateral (select app.bank_suggest(l) as sg) s
    where l.tenant_id = p_tenant and l.account = p_account and l.txn_date between p_from and p_to
    order by l.txn_date, l.created_at, l.seq;
end $$;

-- ---------------------------------------------------------------------------
-- Lập chứng từ cho một dòng (BC tiền vào / BN tiền ra) và gắn dòng
-- ---------------------------------------------------------------------------
create or replace function app.bank_post(p_line public.bank_lines, p_partner uuid, p_description text, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  v_id := public.save_voucher(jsonb_build_object(
    'tenant_id', p_line.tenant_id,
    'voucher_type', case when p_line.amount_in > 0 then 'BC' else 'BN' end,
    'header_account', p_line.account,
    'posting_date', p_line.txn_date,
    'issue_date', p_line.txn_date,
    'partner_id', p_partner,
    'description', left(p_description, 480),
    'original_documents', left('Sao kê ' || p_line.account || coalesce(' · ' || p_line.ref, ''), 200),
    'source', 'import',
    'lines', p_lines
  ), true);
  update public.bank_lines set voucher_id = v_id, matched_by = (select auth.uid()), matched_at = now() where id = p_line.id;
  return v_id;
end $$;

create or replace function public.bank_confirm(p_tenant uuid, p_lines uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.bank_lines;
  v_sg jsonb;
  v_id uuid;
  v_lines jsonb;
  v_results jsonb := '[]'::jsonb;
  v_ok integer := 0;
  a jsonb;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền xác nhận sao kê ngân hàng');
  for l in
    select * from public.bank_lines where tenant_id = p_tenant and id = any (p_lines) order by txn_date, created_at, seq
  loop
    begin
      v_sg := app.bank_suggest(l);
      if v_sg is null then
        raise exception 'Không có gợi ý (đã khớp, đã bỏ qua hoặc không nhận ra)' using errcode = 'P0001';
      end if;
      if v_sg ->> 'kind' = 'existing' then
        update public.bank_lines set voucher_id = (v_sg ->> 'voucher_id')::uuid, matched_by = (select auth.uid()), matched_at = now()
        where id = l.id;
        v_id := (v_sg ->> 'voucher_id')::uuid;
      else
        v_lines := '[]'::jsonb;
        for a in select * from jsonb_array_elements(v_sg -> 'allocations') loop
          v_lines := v_lines || jsonb_build_object('credit_account', a ->> 'account', 'amount', (a ->> 'amount')::numeric,
                                                   'invoice_id', a ->> 'invoice_id', 'partner_id', v_sg ->> 'partner_id',
                                                   'description', 'Thu tiền hóa đơn ' || (a ->> 'number'));
        end loop;
        if (v_sg ->> 'advance')::numeric > 0 then
          v_lines := v_lines || jsonb_build_object('credit_account', '131', 'amount', (v_sg ->> 'advance')::numeric,
                                                   'partner_id', v_sg ->> 'partner_id', 'description', 'Nhận trước');
        end if;
        v_id := app.bank_post(l, (v_sg ->> 'partner_id')::uuid,
          case v_sg ->> 'kind' when 'tuition' then 'Thu học phí ' || (v_sg ->> 'partner_name') || ' (chuyển khoản)'
               else 'Thu tiền ' || coalesce(v_sg ->> 'partner_name', '') || ' theo hóa đơn ' || (v_sg ->> 'invoice_number') end,
          v_lines);
      end if;
      v_ok := v_ok + 1;
      v_results := v_results || jsonb_build_object('line_id', l.id, 'ok', true, 'kind', v_sg ->> 'kind', 'voucher_id', v_id,
                                                   'number', (select number from public.vouchers where id = v_id));
    exception when others then
      v_results := v_results || jsonb_build_object('line_id', l.id, 'ok', false, 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('confirmed', v_ok, 'failed', jsonb_array_length(v_results) - v_ok, 'results', v_results);
end $$;

/** Dòng chưa khớp: lập BC / BN với TK đối ứng tự chọn (phí ngân hàng, lãi tiền gửi, khách hàng, NCC…) */
create or replace function public.bank_create_voucher(p_tenant uuid, p_line uuid, p_row jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.bank_lines;
  v_contra text := btrim(p_row ->> 'account');
  v_partner uuid := nullif(p_row ->> 'partner_id', '')::uuid;
  v_desc text;
  v_id uuid;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền lập chứng từ từ sao kê');
  select * into l from public.bank_lines where id = p_line and tenant_id = p_tenant for update;
  if not found then raise exception 'Không tìm thấy dòng sao kê' using errcode = 'P0002'; end if;
  if l.voucher_id is not null then raise exception 'Dòng sao kê đã khớp chứng từ' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.accounts a where a.tenant_id = p_tenant and a.code = v_contra and a.is_postable and a.is_active) then
    raise exception 'Tài khoản đối ứng % không hợp lệ (phải là TK chi tiết)', coalesce(v_contra, '') using errcode = 'P0001';
  end if;
  if v_contra = l.account then raise exception 'Tài khoản đối ứng trùng TK ngân hàng' using errcode = 'P0001'; end if;
  v_desc := left(coalesce(nullif(btrim(p_row ->> 'description'), ''), nullif(l.description, ''), 'Giao dịch ngân hàng'), 480);
  v_id := app.bank_post(l, v_partner, v_desc, jsonb_build_array(jsonb_build_object(
    case when l.amount_in > 0 then 'credit_account' else 'debit_account' end, v_contra,
    'amount', greatest(l.amount_in, l.amount_out), 'partner_id', v_partner, 'description', v_desc)));
  update public.bank_lines set ignored = false where id = l.id;
  return jsonb_build_object('voucher_id', v_id, 'number', (select number from public.vouchers where id = v_id));
end $$;

/** Gắn tay một chứng từ đã ghi sổ: ảnh hưởng thuần lên TK ngân hàng phải bằng đúng số tiền của dòng */
create or replace function public.bank_link(p_tenant uuid, p_line uuid, p_voucher uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  l public.bank_lines;
  v_net numeric;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền khớp sao kê ngân hàng');
  select * into l from public.bank_lines where id = p_line and tenant_id = p_tenant for update;
  if not found then raise exception 'Không tìm thấy dòng sao kê' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.vouchers v where v.id = p_voucher and v.tenant_id = p_tenant and v.status = 'posted') then
    raise exception 'Chứng từ chưa ghi sổ hoặc không thuộc đơn vị' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.bank_lines b where b.voucher_id = p_voucher and b.id <> l.id) then
    raise exception 'Chứng từ đã khớp với một dòng sao kê khác' using errcode = 'P0001';
  end if;
  select coalesce(sum(g.debit - g.credit), 0) into v_net from public.gl_entries g
  where g.voucher_id = p_voucher and g.account = l.account;
  if v_net <> l.amount_in - l.amount_out then
    raise exception 'Chứng từ ghi TK % số tiền % khác dòng sao kê %', l.account, v_net, l.amount_in - l.amount_out
      using errcode = 'P0001';
  end if;
  update public.bank_lines set voucher_id = p_voucher, ignored = false, matched_by = (select auth.uid()), matched_at = now()
  where id = l.id;
end $$;

/** Bỏ khớp: chỉ gỡ liên kết, không xóa chứng từ */
create or replace function public.bank_unlink(p_tenant uuid, p_line uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền khớp sao kê ngân hàng');
  update public.bank_lines set voucher_id = null, matched_by = null, matched_at = null where id = p_line and tenant_id = p_tenant;
  if not found then raise exception 'Không tìm thấy dòng sao kê' using errcode = 'P0002'; end if;
end $$;

create or replace function public.bank_ignore(p_tenant uuid, p_line uuid, p_ignored boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền khớp sao kê ngân hàng');
  update public.bank_lines set ignored = p_ignored where id = p_line and tenant_id = p_tenant and voucher_id is null;
  if not found then raise exception 'Không tìm thấy dòng sao kê chưa khớp' using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Đối chiếu số dư TK 112 với sao kê
-- ---------------------------------------------------------------------------
create or replace function public.rpt_bank_reconciliation(p_tenant uuid, p_account text, p_as_of date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_book numeric;
  v_stmt record;
  v_first date;
  v_unmatched record;
  v_book_only jsonb;
begin
  perform app.require(app.is_member(p_tenant), 'Bạn không thuộc đơn vị này');
  select coalesce(sum(net), 0) into v_book from app.leaf_net_before(p_tenant, p_as_of + 1) where account = p_account;

  -- Số dư theo sao kê: dòng có số dư, ngày lớn nhất ≤ ngày đối chiếu (cùng ngày: nhập sau, thứ tự sau)
  select l.balance, l.txn_date into v_stmt from public.bank_lines l
  where l.tenant_id = p_tenant and l.account = p_account and l.txn_date <= p_as_of and l.balance is not null
  order by l.txn_date desc, l.created_at desc, l.seq desc limit 1;
  select min(l.txn_date) into v_first from public.bank_lines l where l.tenant_id = p_tenant and l.account = p_account;

  select count(*) as n, coalesce(sum(l.amount_in), 0) as amount_in, coalesce(sum(l.amount_out), 0) as amount_out into v_unmatched
  from public.bank_lines l
  where l.tenant_id = p_tenant and l.account = p_account and l.txn_date <= p_as_of and l.voucher_id is null and not l.ignored;

  -- Chứng từ ghi TK này trong thời gian có sao kê nhưng chưa khớp dòng nào (ngân hàng chưa ghi nhận / ghi nhầm)
  select coalesce(jsonb_agg(jsonb_build_object('voucher_id', x.voucher_id, 'number', x.voucher_number, 'voucher_type', x.voucher_type,
                                               'posting_date', x.posting_date, 'amount', x.net, 'description', x.description)
                            order by x.posting_date, x.voucher_number), '[]'::jsonb)
  into v_book_only
  from (
    select g.voucher_id, g.voucher_number, g.voucher_type, g.posting_date, max(g.description) as description,
           sum(g.debit - g.credit) as net
    from public.gl_entries g
    where g.tenant_id = p_tenant and g.account = p_account and v_first is not null
      and g.posting_date between v_first and p_as_of
      and not exists (select 1 from public.bank_lines b where b.voucher_id = g.voucher_id)
    group by g.voucher_id, g.voucher_number, g.voucher_type, g.posting_date
    having sum(g.debit - g.credit) <> 0
  ) x;

  return jsonb_build_object(
    'account', p_account, 'as_of', p_as_of, 'book_balance', v_book,
    'statement_balance', v_stmt.balance, 'statement_date', v_stmt.txn_date,
    'difference', case when v_stmt.balance is null then null else v_stmt.balance - v_book end,
    'statement_from', v_first,
    'unmatched_count', v_unmatched.n, 'unmatched_in', v_unmatched.amount_in, 'unmatched_out', v_unmatched.amount_out,
    'book_only', v_book_only);
end $$;

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------
revoke execute on function app.bank_account_ok(uuid, text), app.invoice_remaining(uuid), app.bank_suggest(public.bank_lines),
  app.bank_post(public.bank_lines, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.import_bank_statement(uuid, text, jsonb, jsonb) from public, anon;
revoke execute on function public.delete_bank_statement(uuid, uuid) from public, anon;
revoke execute on function public.rpt_bank_lines(uuid, text, date, date) from public, anon;
revoke execute on function public.bank_confirm(uuid, uuid[]) from public, anon;
revoke execute on function public.bank_create_voucher(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.bank_link(uuid, uuid, uuid) from public, anon;
revoke execute on function public.bank_unlink(uuid, uuid) from public, anon;
revoke execute on function public.bank_ignore(uuid, uuid, boolean) from public, anon;
revoke execute on function public.rpt_bank_reconciliation(uuid, text, date) from public, anon;
grant execute on function public.import_bank_statement(uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.delete_bank_statement(uuid, uuid) to authenticated;
grant execute on function public.rpt_bank_lines(uuid, text, date, date) to authenticated;
grant execute on function public.bank_confirm(uuid, uuid[]) to authenticated;
grant execute on function public.bank_create_voucher(uuid, uuid, jsonb) to authenticated;
grant execute on function public.bank_link(uuid, uuid, uuid) to authenticated;
grant execute on function public.bank_unlink(uuid, uuid) to authenticated;
grant execute on function public.bank_ignore(uuid, uuid, boolean) to authenticated;
grant execute on function public.rpt_bank_reconciliation(uuid, text, date) to authenticated;
