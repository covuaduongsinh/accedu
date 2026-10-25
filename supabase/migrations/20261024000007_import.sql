-- AccEdu — Nhập từ Excel (chuyển dữ liệu từ FAO): danh mục tài khoản, đối tượng, số dư đầu kỳ.
-- Mỗi hàm kiểm tra hết các dòng trước: có lỗi thì trả {ok:false, errors:[{row, message}]} và không ghi gì;
-- không lỗi thì ghi trong cùng transaction và trả số dòng thêm/cập nhật.
-- Trường vắng mặt trong một dòng = giữ nguyên giá trị hiện có khi cập nhật.

-- Tài khoản đã có số liệu (số dư đầu kỳ, chứng từ, sổ cái) thì không thêm tài khoản con / đổi loại được
create or replace function app.account_has_data(p_tenant uuid, p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.opening_balances where tenant_id = p_tenant and account = p_code)
      or exists (select 1 from public.gl_entries where tenant_id = p_tenant and account = p_code)
      or exists (select 1 from public.voucher_lines where tenant_id = p_tenant and p_code in (debit_account, credit_account))
$$;

create or replace function app.import_check_rows(p_rows jsonb) returns void
language plpgsql immutable as $$
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Dữ liệu nhập phải là danh sách dòng' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Tối đa 5.000 dòng mỗi lần nhập — chia tệp thành nhiều phần' using errcode = '22023';
  end if;
end $$;

-- Gom lỗi: mỗi dòng một thông báo (lỗi đầu tiên theo thứ tự kiểm tra), tối đa 500 dòng
create or replace function app.import_errors(p_errors jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(e order by (e ->> 'row')::int), '[]'::jsonb)
  from (
    select distinct on ((x ->> 'row')::int) x as e
    from jsonb_array_elements(coalesce(p_errors, '[]'::jsonb)) with ordinality as t(x, i)
    order by (x ->> 'row')::int, i
    limit 500
  ) s
$$;

-- Sau khi đổi tài khoản mẹ: tính lại bậc cho cả cây
create or replace function app.accounts_relevel(p_tenant uuid) returns void
language sql security definer set search_path = '' as $$
  with recursive t as (
    select code, 1 as lvl from public.accounts where tenant_id = p_tenant and parent_code is null
    union all
    select a.code, t.lvl + 1 from public.accounts a join t on a.parent_code = t.code where a.tenant_id = p_tenant
  )
  update public.accounts a set level = t.lvl
  from t where a.tenant_id = p_tenant and a.code = t.code and a.level <> t.lvl
$$;

-- ---------------------------------------------------------------------------
-- Danh mục tài khoản
-- p_rows: [{row, code, name?, name_en?, parent_code?, kind?, normal_side?, currency?, track_partner?, track_item?}]
-- ---------------------------------------------------------------------------
create or replace function public.import_accounts(p_tenant uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_errors jsonb;
  v_new text[];
  v_inserted integer := 0;
  v_updated integer := 0;
  r record;
begin
  perform app.require(app.can_edit_catalog(p_tenant), 'Bạn không có quyền sửa danh mục');
  perform app.import_check_rows(p_rows);

  with src as (
    select coalesce((x ->> 'row')::int, i::int) as row_no, i, trim(x ->> 'code') as code, x,
           row_number() over (partition by trim(x ->> 'code') order by i) as dup
    from jsonb_array_elements(p_rows) with ordinality as e(x, i)
  ),
  cur as (
    select s.*, a.id is not null as existing, a.kind as cur_kind, a.parent_code as cur_parent,
           case when s.x ? 'parent_code' then nullif(trim(s.x ->> 'parent_code'), '') else a.parent_code end as new_parent,
           nullif(trim(s.x ->> 'name'), '') as new_name
    from src s left join public.accounts a on a.tenant_id = p_tenant and a.code = s.code
  ),
  checks as (
    select c.row_no, c.i, v.ord, v.msg
    from cur c, lateral (values
      (1, case when c.code is null or c.code !~ '^[0-9]{3,16}$' then 'Số hiệu tài khoản chỉ gồm chữ số (3–16 ký tự)' end),
      (2, case when c.dup > 1 then format('Trùng số hiệu %s trong tệp', c.code) end),
      (3, case when c.new_name is null and (not c.existing or c.x ? 'name') then 'Thiếu tên tài khoản' end),
      (4, case when length(c.new_name) > 128 then 'Tên tài khoản tối đa 128 ký tự' end),
      (5, case when c.new_parent is not null
                and (c.new_parent !~ '^[0-9]{3,16}$' or c.code not like c.new_parent || '%' or c.new_parent = c.code)
               then format('Tài khoản mẹ %s không hợp lệ (số hiệu con phải bắt đầu bằng số hiệu mẹ)', c.new_parent) end),
      (6, case when c.new_parent is not null
                and not exists (select 1 from public.accounts a where a.tenant_id = p_tenant and a.code = c.new_parent)
                and not exists (select 1 from src s where s.code = c.new_parent)
               then format('Chưa có tài khoản mẹ %s', c.new_parent) end),
      (7, case when c.new_parent is not null and c.new_parent is distinct from c.cur_parent
                and app.account_has_data(p_tenant, c.new_parent)
               then format('Tài khoản mẹ %s đã có số liệu — không thêm tài khoản con được', c.new_parent) end),
      (8, case when (not c.existing or c.x ? 'kind')
                and coalesce(c.x ->> 'kind', '') not in ('asset', 'liability', 'equity', 'revenue', 'expense', 'result')
               then 'Loại tài khoản không hợp lệ' end),
      (9, case when c.x ? 'normal_side' and coalesce(c.x ->> 'normal_side', '') not in ('debit', 'credit', 'both')
               then 'Tính chất phải là Nợ, Có hoặc Lưỡng tính' end),
      (10, case when nullif(c.x ->> 'currency', '') is not null
                 and not exists (select 1 from public.currencies cu where cu.code = upper(c.x ->> 'currency'))
                then format('Chưa có mã ngoại tệ %s', c.x ->> 'currency') end),
      (11, case when (c.x ? 'track_partner' and jsonb_typeof(c.x -> 'track_partner') <> 'boolean')
                  or (c.x ? 'track_item' and jsonb_typeof(c.x -> 'track_item') <> 'boolean')
                then 'Theo dõi công nợ/vật tư phải là có hoặc không' end),
      (12, case when c.existing and c.x ? 'kind' and c.x ->> 'kind' <> c.cur_kind and app.account_has_data(p_tenant, c.code)
                then format('Tài khoản %s đã có số liệu — không đổi loại tài khoản', c.code) end)
    ) v(ord, msg)
    where v.msg is not null
  )
  select app.import_errors(jsonb_agg(jsonb_build_object('row', row_no, 'message', msg) order by row_no, ord))
  into v_errors from checks;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end if;

  select coalesce(array_agg(trim(x ->> 'code')), '{}') into v_new
  from jsonb_array_elements(p_rows) x
  where not exists (select 1 from public.accounts a where a.tenant_id = p_tenant and a.code = trim(x ->> 'code'));

  -- Tài khoản mới: chèn từ số hiệu ngắn đến dài để tài khoản mẹ luôn có trước (trigger accounts_check_parent)
  for r in
    select x, trim(x ->> 'code') as code from jsonb_array_elements(p_rows) x
    where trim(x ->> 'code') = any (v_new)
    order by length(trim(x ->> 'code')), trim(x ->> 'code')
  loop
    insert into public.accounts (tenant_id, code, name, name_en, parent_code, kind, normal_side, currency, track_partner, track_item)
    values (
      p_tenant, r.code, trim(r.x ->> 'name'), nullif(trim(r.x ->> 'name_en'), ''), nullif(trim(r.x ->> 'parent_code'), ''),
      r.x ->> 'kind', coalesce(r.x ->> 'normal_side', 'debit'), upper(nullif(r.x ->> 'currency', '')),
      coalesce((r.x ->> 'track_partner')::boolean, false), coalesce((r.x ->> 'track_item')::boolean, false)
    );
    v_inserted := v_inserted + 1;
  end loop;

  with upd as (
    select a.id,
           coalesce(nullif(trim(x ->> 'name'), ''), a.name) as name,
           case when x ? 'name_en' then nullif(trim(x ->> 'name_en'), '') else a.name_en end as name_en,
           case when x ? 'parent_code' then nullif(trim(x ->> 'parent_code'), '') else a.parent_code end as parent_code,
           coalesce(x ->> 'kind', a.kind) as kind,
           coalesce(x ->> 'normal_side', a.normal_side) as normal_side,
           case when x ? 'currency' then upper(nullif(x ->> 'currency', '')) else a.currency end as currency,
           coalesce((x ->> 'track_partner')::boolean, a.track_partner) as track_partner,
           coalesce((x ->> 'track_item')::boolean, a.track_item) as track_item
    from jsonb_array_elements(p_rows) x
    join public.accounts a on a.tenant_id = p_tenant and a.code = trim(x ->> 'code')
    where not (trim(x ->> 'code') = any (v_new))
  )
  update public.accounts a
  set name = u.name, name_en = u.name_en, parent_code = u.parent_code, kind = u.kind, normal_side = u.normal_side,
      currency = u.currency, track_partner = u.track_partner, track_item = u.track_item, is_active = true
  from upd u
  where a.id = u.id
    and (a.name, a.name_en, a.parent_code, a.kind, a.normal_side, a.currency, a.track_partner, a.track_item, a.is_active)
        is distinct from (u.name, u.name_en, u.parent_code, u.kind, u.normal_side, u.currency, u.track_partner, u.track_item, true);
  get diagnostics v_updated = row_count;

  perform app.accounts_relevel(p_tenant);

  return jsonb_build_object('ok', true, 'inserted', v_inserted, 'updated', v_updated,
                            'unchanged', jsonb_array_length(p_rows) - v_inserted - v_updated);
end $$;

-- ---------------------------------------------------------------------------
-- Danh mục đối tượng (khách hàng / nhà cung cấp / nhân viên / học viên) — mã so khớp không phân biệt hoa thường
-- ---------------------------------------------------------------------------
create or replace function public.import_partners(p_tenant uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_errors jsonb;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_text text[] := array['tax_code', 'id_number', 'address', 'phone', 'email', 'contact_name', 'group_code',
                         'bank_account_no', 'bank_name', 'note'];
  v_flags text[] := array['is_customer', 'is_supplier', 'is_employee', 'is_student'];
begin
  perform app.require(app.can_edit_catalog(p_tenant), 'Bạn không có quyền sửa danh mục');
  perform app.import_check_rows(p_rows);

  with src as (
    select coalesce((x ->> 'row')::int, i::int) as row_no, trim(x ->> 'code') as code, x,
           row_number() over (partition by lower(trim(x ->> 'code')) order by i) as dup,
           nullif(trim(x ->> 'name'), '') as new_name
    from jsonb_array_elements(p_rows) with ordinality as e(x, i)
  ),
  cur as (
    select s.*, exists (select 1 from public.partners p where p.tenant_id = p_tenant and lower(p.code) = lower(s.code)) as existing
    from src s
  ),
  checks as (
    select c.row_no, v.ord, v.msg
    from cur c, lateral (values
      (1, case when coalesce(c.code, '') = '' then 'Thiếu mã đối tượng' when length(c.code) > 16 then 'Mã tối đa 16 ký tự' end),
      (2, case when c.dup > 1 then format('Trùng mã %s trong tệp', c.code) end),
      (3, case when c.new_name is null and (not c.existing or c.x ? 'name') then 'Thiếu tên đối tượng' end),
      (4, case when length(c.new_name) > 256 then 'Tên tối đa 256 ký tự' end),
      (5, case when nullif(c.x ->> 'tax_code', '') !~ '^[0-9]{10}(-[0-9]{3})?$|^[0-9]{12}$'
               then 'Mã số thuế 10 số, 10-3 số hoặc CCCD 12 số' end),
      (6, case when nullif(trim(c.x ->> 'email'), '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then 'Email không hợp lệ' end),
      (7, case when exists (select 1 from unnest(v_flags) f where c.x ? f and jsonb_typeof(c.x -> f) <> 'boolean')
               then 'Loại đối tượng phải là có hoặc không' end),
      (8, case when exists (select 1 from unnest(v_text) f where c.x ? f and jsonb_typeof(c.x -> f) not in ('string', 'null'))
               then 'Dữ liệu chữ không hợp lệ' end)
    ) v(ord, msg)
    where v.msg is not null
  )
  select app.import_errors(jsonb_agg(jsonb_build_object('row', row_no, 'message', msg) order by row_no, ord))
  into v_errors from checks;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end if;

  with upd as (
    select p.id,
           coalesce(nullif(trim(x ->> 'name'), ''), p.name) as name,
           case when x ? 'tax_code' then nullif(trim(x ->> 'tax_code'), '') else p.tax_code end as tax_code,
           case when x ? 'id_number' then nullif(trim(x ->> 'id_number'), '') else p.id_number end as id_number,
           case when x ? 'address' then nullif(trim(x ->> 'address'), '') else p.address end as address,
           case when x ? 'phone' then nullif(trim(x ->> 'phone'), '') else p.phone end as phone,
           case when x ? 'email' then nullif(trim(x ->> 'email'), '') else p.email end as email,
           case when x ? 'contact_name' then nullif(trim(x ->> 'contact_name'), '') else p.contact_name end as contact_name,
           case when x ? 'group_code' then nullif(trim(x ->> 'group_code'), '') else p.group_code end as group_code,
           case when x ? 'bank_account_no' then nullif(trim(x ->> 'bank_account_no'), '') else p.bank_account_no end as bank_account_no,
           case when x ? 'bank_name' then nullif(trim(x ->> 'bank_name'), '') else p.bank_name end as bank_name,
           case when x ? 'note' then nullif(trim(x ->> 'note'), '') else p.note end as note,
           coalesce((x ->> 'is_customer')::boolean, p.is_customer) as is_customer,
           coalesce((x ->> 'is_supplier')::boolean, p.is_supplier) as is_supplier,
           coalesce((x ->> 'is_employee')::boolean, p.is_employee) as is_employee,
           coalesce((x ->> 'is_student')::boolean, p.is_student) as is_student
    from jsonb_array_elements(p_rows) x
    join public.partners p on p.tenant_id = p_tenant and lower(p.code) = lower(trim(x ->> 'code'))
  )
  update public.partners p
  set name = u.name, tax_code = u.tax_code, id_number = u.id_number, address = u.address, phone = u.phone, email = u.email,
      contact_name = u.contact_name, group_code = u.group_code, bank_account_no = u.bank_account_no, bank_name = u.bank_name,
      note = u.note, is_customer = u.is_customer, is_supplier = u.is_supplier, is_employee = u.is_employee,
      is_student = u.is_student, is_active = true
  from upd u
  where p.id = u.id
    and (p.name, p.tax_code, p.id_number, p.address, p.phone, p.email, p.contact_name, p.group_code, p.bank_account_no,
         p.bank_name, p.note, p.is_customer, p.is_supplier, p.is_employee, p.is_student, p.is_active)
        is distinct from
        (u.name, u.tax_code, u.id_number, u.address, u.phone, u.email, u.contact_name, u.group_code, u.bank_account_no,
         u.bank_name, u.note, u.is_customer, u.is_supplier, u.is_employee, u.is_student, true);
  get diagnostics v_updated = row_count;

  insert into public.partners (tenant_id, code, name, tax_code, id_number, address, phone, email, contact_name, group_code,
                               bank_account_no, bank_name, note, is_customer, is_supplier, is_employee, is_student)
  select p_tenant, trim(x ->> 'code'), trim(x ->> 'name'), nullif(trim(x ->> 'tax_code'), ''), nullif(trim(x ->> 'id_number'), ''),
         nullif(trim(x ->> 'address'), ''), nullif(trim(x ->> 'phone'), ''), nullif(trim(x ->> 'email'), ''),
         nullif(trim(x ->> 'contact_name'), ''), nullif(trim(x ->> 'group_code'), ''), nullif(trim(x ->> 'bank_account_no'), ''),
         nullif(trim(x ->> 'bank_name'), ''), nullif(trim(x ->> 'note'), ''),
         coalesce((x ->> 'is_customer')::boolean, true), coalesce((x ->> 'is_supplier')::boolean, false),
         coalesce((x ->> 'is_employee')::boolean, false), coalesce((x ->> 'is_student')::boolean, false)
  from jsonb_array_elements(p_rows) x
  where not exists (select 1 from public.partners p where p.tenant_id = p_tenant and lower(p.code) = lower(trim(x ->> 'code')));
  get diagnostics v_inserted = row_count;

  return jsonb_build_object('ok', true, 'inserted', v_inserted, 'updated', v_updated,
                            'unchanged', jsonb_array_length(p_rows) - v_inserted - v_updated);
end $$;

-- ---------------------------------------------------------------------------
-- Số dư đầu kỳ (tại ngày bắt đầu nhập liệu)
--   p_scope = 'account': thay số dư cấp tài khoản (không đối tượng); TK theo dõi công nợ bị bỏ qua
--   p_scope = 'partner': thay số dư công nợ theo đối tượng; TK phải theo dõi công nợ
-- p_rows: [{row, account, partner_code?, debit, credit}]; TK tổng hợp và dòng không có số dư được bỏ qua
-- ---------------------------------------------------------------------------
create or replace function public.import_opening_balances(p_tenant uuid, p_scope text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_errors jsonb;
  v_norm jsonb;
  v_inserted integer;
  v_skipped integer;
  v_debit numeric;
  v_credit numeric;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền nhập số dư đầu kỳ');
  perform app.assert_period_open(p_tenant, '*', (select start_date from public.tenants where id = p_tenant));
  if p_scope not in ('account', 'partner') then
    raise exception 'Phạm vi số dư không hợp lệ: %', p_scope using errcode = '22023';
  end if;
  perform app.import_check_rows(p_rows);

  -- Chuẩn hóa từng dòng một lần (không dùng bảng tạm: hàm security definer)
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_norm
  from (
    select s.row_no, s.account, s.partner_code,
           (select p.id from public.partners p where p.tenant_id = p_tenant and lower(p.code) = lower(s.partner_code)
            order by p.code limit 1) as partner_id,
           s.debit, s.credit, coalesce(a.is_postable, false) as is_postable, coalesce(a.track_partner, false) as track_partner,
           a.id is not null as account_exists, s.bad_amount,
           row_number() over (partition by s.account, lower(coalesce(s.partner_code, '')) order by s.i) as dup
    from (
      select coalesce((x ->> 'row')::int, i::int) as row_no, i, trim(x ->> 'account') as account,
             case when p_scope = 'partner' then nullif(trim(x ->> 'partner_code'), '') end as partner_code,
             case when jsonb_typeof(x -> 'debit') = 'number' then (x ->> 'debit')::numeric else 0 end as debit,
             case when jsonb_typeof(x -> 'credit') = 'number' then (x ->> 'credit')::numeric else 0 end as credit,
             not (coalesce(jsonb_typeof(x -> 'debit'), 'null') in ('number', 'null')
                  and coalesce(jsonb_typeof(x -> 'credit'), 'null') in ('number', 'null')) as bad_amount
      from jsonb_array_elements(p_rows) with ordinality as e(x, i)
    ) s
    left join public.accounts a on a.tenant_id = p_tenant and a.code = s.account
  ) t;

  select app.import_errors(jsonb_agg(jsonb_build_object('row', row_no, 'message', msg) order by row_no, ord))
  into v_errors
  from jsonb_to_recordset(v_norm) as o(row_no int, account text, partner_code text, partner_id uuid, debit numeric,
                                        credit numeric, is_postable boolean, track_partner boolean, account_exists boolean,
                                        bad_amount boolean, dup bigint),
  lateral (values
    (1, case when o.bad_amount or o.debit < 0 or o.credit < 0 then 'Số tiền không hợp lệ (phải là số không âm)' end),
    (2, case when not o.account_exists and (o.debit <> 0 or o.credit <> 0)
             then format('Chưa có tài khoản %s — nhập danh mục tài khoản trước', o.account) end),
    (3, case when p_scope = 'partner' and o.is_postable and not o.track_partner and (o.debit <> 0 or o.credit <> 0)
             then format('Tài khoản %s không theo dõi công nợ — nhập ở mẫu Số dư tài khoản', o.account) end),
    (4, case when p_scope = 'partner' and o.partner_code is null and o.is_postable and (o.debit <> 0 or o.credit <> 0)
             then 'Thiếu mã đối tượng' end),
    (5, case when p_scope = 'partner' and o.partner_code is not null and o.partner_id is null
             then format('Chưa có đối tượng %s — nhập danh mục đối tượng trước', o.partner_code) end),
    (6, case when o.dup > 1 and (o.debit <> 0 or o.credit <> 0) and o.is_postable
             then case when p_scope = 'partner' then 'Trùng tài khoản + đối tượng trong tệp' else 'Trùng tài khoản trong tệp' end end)
  ) v(ord, msg)
  where v.msg is not null;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end if;

  if p_scope = 'account' then
    delete from public.opening_balances where tenant_id = p_tenant and partner_id is null and job_id is null;
  else
    delete from public.opening_balances where tenant_id = p_tenant and partner_id is not null;
  end if;

  -- Bỏ qua: không có số dư, TK tổng hợp, TK công nợ khi nhập số dư tài khoản
  insert into public.opening_balances (tenant_id, account, partner_id, debit, credit)
  select p_tenant, o.account, o.partner_id, round(o.debit, 2), round(o.credit, 2)
  from jsonb_to_recordset(v_norm) as o(account text, partner_id uuid, debit numeric, credit numeric, is_postable boolean,
                                        track_partner boolean)
  where (round(o.debit, 2) <> 0 or round(o.credit, 2) <> 0) and o.is_postable and not (p_scope = 'account' and o.track_partner);
  get diagnostics v_inserted = row_count;
  v_skipped := jsonb_array_length(p_rows) - v_inserted;

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into v_debit, v_credit
  from public.opening_balances
  where tenant_id = p_tenant and (case when p_scope = 'account' then partner_id is null and job_id is null else partner_id is not null end);
  return jsonb_build_object('ok', true, 'inserted', v_inserted, 'skipped', v_skipped, 'debit', v_debit, 'credit', v_credit);
end $$;

-- ---------------------------------------------------------------------------
-- Sửa set_opening_balances (màn hình nhập trên lưới): chỉ thay số dư cấp tài khoản, giữ nguyên số dư công nợ;
-- TK theo dõi công nợ phải nhập theo đối tượng
-- ---------------------------------------------------------------------------
create or replace function public.set_opening_balances(p_tenant uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_bad text;
  v_count integer;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền nhập số dư đầu kỳ');
  perform app.assert_period_open(p_tenant, '*', (select start_date from public.tenants where id = p_tenant));

  if exists (select 1 from jsonb_array_elements(p_rows) r where nullif(r ->> 'partner_id', '') is not null) then
    raise exception 'Số dư theo đối tượng nhập ở màn hình Số dư công nợ' using errcode = '22023';
  end if;

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

  select string_agg(distinct r ->> 'account', ', ') into v_bad
  from jsonb_array_elements(p_rows) r
  join public.accounts a on a.tenant_id = p_tenant and a.code = r ->> 'account' and a.track_partner
  where coalesce((r ->> 'debit')::numeric, 0) <> 0 or coalesce((r ->> 'credit')::numeric, 0) <> 0;
  if v_bad is not null then
    raise exception 'Tài khoản theo dõi công nợ phải nhập số dư theo từng đối tượng: %', v_bad using errcode = 'P0001';
  end if;

  delete from public.opening_balances where tenant_id = p_tenant and partner_id is null and job_id is null;
  insert into public.opening_balances (tenant_id, account, debit, credit)
  select p_tenant, r ->> 'account',
         round(coalesce((r ->> 'debit')::numeric, 0), 2), round(coalesce((r ->> 'credit')::numeric, 0), 2)
  from jsonb_array_elements(p_rows) r
  where coalesce((r ->> 'debit')::numeric, 0) <> 0 or coalesce((r ->> 'credit')::numeric, 0) <> 0;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.import_accounts(uuid, jsonb) from public, anon;
revoke execute on function public.import_partners(uuid, jsonb) from public, anon;
revoke execute on function public.import_opening_balances(uuid, text, jsonb) from public, anon;
-- Hàm phụ chỉ dùng bên trong các hàm nhập (security definer) — người dùng không gọi trực tiếp
revoke execute on function app.account_has_data(uuid, text) from public, anon, authenticated;
revoke execute on function app.accounts_relevel(uuid) from public, anon, authenticated;
grant execute on function public.import_accounts(uuid, jsonb) to authenticated;
grant execute on function public.import_partners(uuid, jsonb) to authenticated;
grant execute on function public.import_opening_balances(uuid, text, jsonb) to authenticated;
grant execute on function app.import_check_rows(jsonb), app.import_errors(jsonb) to authenticated, service_role;
