-- AccEdu — P4c: Nhập hóa đơn điện tử đầu vào (XML theo TT78) thành hóa đơn mua nháp.
-- Client (packages/core, @accedu/core/einvoice) đọc XML; hàm này cho từng hóa đơn:
--   tìm nhà cung cấp theo MST (rồi theo mã), chưa có thì tạo mới (mã = MST);
--   bỏ qua hóa đơn đã nhập (cùng nhà cung cấp, ký hiệu, số — không phân biệt số 0 đầu);
--   tạo HDM/HMV ở trạng thái nháp qua save_voucher để kế toán xem lại rồi mới ghi sổ.
-- Nguyên khối như các hàm import_*: chỉ cần một hóa đơn lỗi (hoặc p_dry_run) là không ghi gì;
-- chạy thử trả về trạng thái từng hóa đơn để hiển thị bảng xem trước.
--
-- p_invoices: [{row, voucher_type 'HDM'|'HMV', posting_date, line_account,
--               seller: {name, tax_code, address}, invoice_series, invoice_series_short, invoice_number, invoice_date,
--               description?, lines: [{description, uom, quantity, unit_price, amount, discount_amount, vat_code, vat_amount}]}]

create or replace function public.import_purchase_invoices(p_tenant uuid, p_invoices jsonb, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  x jsonb;
  i integer := 0;
  v_row integer;
  v_type text;
  v_tax text;
  v_name text;
  v_series text;
  v_short text;
  v_number text;
  v_account text;
  v_partner uuid;
  v_inserted boolean;
  v_state text;
  v_existing text;
  v_id uuid;
  v_msg text;
  v_results jsonb := '[]'::jsonb;
  v_new_taxes text[] := '{}';
  v_count_new integer := 0;
  v_count_exists integer := 0;
  v_count_errors integer := 0;
begin
  perform app.require(app.can_post(p_tenant), 'Bạn không có quyền nhập hóa đơn');
  perform app.import_check_rows(p_invoices);
  if jsonb_array_length(p_invoices) > 500 then
    raise exception 'Tối đa 500 hóa đơn mỗi lần nhập' using errcode = '22023';
  end if;

  begin
    for x in select e.value from jsonb_array_elements(p_invoices) as e loop
      i := i + 1;
      v_row := coalesce((x ->> 'row')::integer, i);
      v_type := x ->> 'voucher_type';
      v_tax := upper(regexp_replace(coalesce(x #>> '{seller,tax_code}', ''), '\s', '', 'g'));
      v_name := coalesce(nullif(trim(x #>> '{seller,name}'), ''), v_tax);
      v_series := upper(coalesce(trim(x ->> 'invoice_series'), ''));
      v_short := upper(coalesce(nullif(trim(x ->> 'invoice_series_short'), ''), v_series));
      v_number := trim(coalesce(x ->> 'invoice_number', ''));
      v_account := trim(coalesce(x ->> 'line_account', ''));
      v_partner := null;
      v_inserted := false;
      v_state := null;
      begin
        if v_type is null or v_type not in ('HDM', 'HMV') then
          raise exception 'Loại hóa đơn mua phải là HDM hoặc HMV';
        end if;
        if v_tax = '' then raise exception 'Thiếu mã số thuế người bán'; end if;
        if v_number = '' then raise exception 'Thiếu số hóa đơn'; end if;
        if jsonb_typeof(x -> 'lines') is distinct from 'array' or jsonb_array_length(x -> 'lines') = 0 then
          raise exception 'Hóa đơn không có dòng hàng hóa, dịch vụ';
        end if;
        if not exists (
          select 1 from public.accounts a
          where a.tenant_id = p_tenant and a.code = v_account and a.is_active and a.is_postable
        ) then
          raise exception 'TK % không tồn tại hoặc không phải tài khoản chi tiết', nullif(v_account, '');
        end if;

        -- Nhà cung cấp: theo MST, rồi theo mã; chưa có thì tạo (mã = MST)
        select p.id into v_partner from public.partners p
        where p.tenant_id = p_tenant and upper(regexp_replace(coalesce(p.tax_code, ''), '\s', '', 'g')) = v_tax
        order by p.is_active desc, p.code limit 1;
        if v_partner is null then
          select p.id into v_partner from public.partners p where p.tenant_id = p_tenant and upper(p.code) = v_tax;
        end if;
        if v_partner is null then
          insert into public.partners (tenant_id, code, name, tax_code, address, is_customer, is_supplier)
          values (p_tenant, left(v_tax, 16), v_name, v_tax, nullif(trim(x #>> '{seller,address}'), ''), false, true)
          returning id into v_partner;
          v_inserted := true;
        end if;
        v_state := case when v_inserted or v_tax = any (v_new_taxes) then 'new' else 'existing' end;

        -- Hóa đơn đã nhập: bỏ qua
        select v.number into v_existing from public.vouchers v
        where v.tenant_id = p_tenant and v.partner_id = v_partner and v.voucher_type in ('HDM', 'HMV')
          and v.status <> 'cancelled'
          -- Ký hiệu so theo phần sau mẫu số (1C26TAA ≡ C26TAA), vì kế toán có thể đã gõ tay một trong hai dạng
          and regexp_replace(upper(coalesce(v.invoice_series, '')), '^[0-9]', '') = regexp_replace(v_short, '^[0-9]', '')
          and ltrim(v.invoice_number, '0') = ltrim(v_number, '0')
        limit 1;
        if found then
          v_results := v_results || jsonb_build_object('row', v_row, 'status', 'exists', 'number', v_existing, 'partner', v_state);
          v_count_exists := v_count_exists + 1;
        else
          v_id := public.save_voucher(jsonb_build_object(
            'tenant_id', p_tenant,
            'voucher_type', v_type,
            'posting_date', coalesce(nullif(x ->> 'posting_date', ''), x ->> 'invoice_date'),
            'issue_date', coalesce(nullif(x ->> 'invoice_date', ''), x ->> 'posting_date'),
            'partner_id', v_partner,
            'partner_name', v_name,
            'address', nullif(trim(x #>> '{seller,address}'), ''),
            'partner_tax_code', v_tax,
            'invoice_series', nullif(v_series, ''),
            'invoice_number', v_number,
            'invoice_date', x ->> 'invoice_date',
            'description', coalesce(nullif(trim(x ->> 'description'), ''),
                                    left(format('Mua theo HĐ %s-%s của %s', v_series, v_number, v_name), 480)),
            'source', 'import',
            'lines', (
              select jsonb_agg(jsonb_build_object(
                'line_no', e.ord,
                'debit_account', v_account,
                'amount', e.l -> 'amount',
                'quantity', e.l -> 'quantity',
                'unit_price', e.l -> 'unit_price',
                'uom', e.l ->> 'uom',
                'discount_amount', coalesce(e.l -> 'discount_amount', '0'::jsonb),
                'description', left(e.l ->> 'description', 480),
                'vat_code', e.l ->> 'vat_code',
                'vat_amount', coalesce(e.l -> 'vat_amount', '0'::jsonb)
              ) order by e.ord)
              from jsonb_array_elements(x -> 'lines') with ordinality as e(l, ord)
            )
          ), false);
          v_results := v_results || jsonb_build_object('row', v_row, 'status', 'new', 'voucher_id', v_id,
            'number', (select v.number from public.vouchers v where v.id = v_id), 'partner', v_state);
          v_count_new := v_count_new + 1;
        end if;
        if v_inserted then v_new_taxes := v_new_taxes || v_tax; end if;
      exception when others then
        get stacked diagnostics v_msg = message_text;
        v_results := v_results || jsonb_build_object('row', v_row, 'status', 'error', 'message', v_msg, 'partner', v_state);
        v_count_errors := v_count_errors + 1;
      end;
    end loop;

    if p_dry_run or v_count_errors > 0 then
      raise exception 'hoàn tác' using errcode = 'P0099';
    end if;
  exception when sqlstate 'P0099' then
    -- Mọi thay đổi trong khối (nhà cung cấp mới, hóa đơn, bộ đếm số chứng từ) đã được hoàn tác
    null;
  end;

  if not p_dry_run and v_count_errors = 0 then
    select coalesce(jsonb_agg(case when r ->> 'status' = 'new' then jsonb_set(r, '{status}', '"created"') else r end), '[]'::jsonb)
    into v_results from jsonb_array_elements(v_results) as r;
  else
    -- Chưa ghi gì: bỏ id/số chứng từ dự kiến của hóa đơn mới
    select coalesce(jsonb_agg(case when r ->> 'status' = 'new' then r - 'voucher_id' - 'number' else r end), '[]'::jsonb)
    into v_results from jsonb_array_elements(v_results) as r;
  end if;

  return jsonb_build_object(
    'ok', v_count_errors = 0,
    'dry_run', p_dry_run,
    'created', case when p_dry_run or v_count_errors > 0 then 0 else v_count_new end,
    'new', v_count_new,
    'skipped', v_count_exists,
    'errors', v_count_errors,
    'partners_created', cardinality(v_new_taxes),
    'results', v_results
  );
end $$;

revoke execute on function public.import_purchase_invoices(uuid, jsonb, boolean) from public, anon;
grant execute on function public.import_purchase_invoices(uuid, jsonb, boolean) to authenticated;
