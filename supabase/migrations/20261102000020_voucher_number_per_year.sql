-- AccEdu — Số chứng từ đánh lại từ đầu mỗi năm (quyển chứng từ reset_yearly, như FAO): số chỉ không được trùng
-- trong cùng loại chứng từ và cùng năm hạch toán. Ràng buộc cũ (không trùng trên mọi năm) làm mọi chứng từ
-- của năm sau trùng số với năm trước (PK0001 năm 2027 trùng PK0001 năm 2026) và không lưu được.
alter table public.vouchers drop constraint vouchers_tenant_id_voucher_type_number_key;
-- Tên giữ tiền tố cũ để thông báo lỗi "Số chứng từ đã tồn tại" (packages/api mappers) vẫn nhận ra
create unique index vouchers_tenant_id_voucher_type_number_year
  on public.vouchers (tenant_id, voucher_type, number, (extract(year from posting_date)));
