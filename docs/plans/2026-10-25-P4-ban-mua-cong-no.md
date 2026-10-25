# Kế hoạch P4 — Bán hàng / Mua hàng / Công nợ

## Context

Thầy chọn triển khai P4 sau khi P2.5 (Nhập từ Excel) đã chạy production (PR #3 đã merge, `main` = `2943bdf`).

Hiện trạng AccEdu:
- Đã có phiếu thu/chi, báo có/nợ, phiếu kế toán, sổ cái, CĐPS.
- Đã có sẵn nhưng chưa dùng:
  - loại chứng từ **HDB / HDV / HDM / HMV** (bảng `voucher_types`, `packages/core/src/accounting/voucher-types.ts`);
  - bảng `voucher_vat`;
  - cột `voucher_lines.quantity / unit_price / item_id / invoice_ref`;
  - bảng `items` (danh mục hàng hóa);
  - các mục menu P4 trong `modules.ts`.
- **Chưa có:**
  - màn hình hóa đơn;
  - thuế GTGT khi ghi sổ (`save_voucher` không lưu thuế, `post_voucher` không sinh bút toán thuế);
  - trừ thanh toán vào từng hóa đơn;
  - báo cáo công nợ và tuổi nợ;
  - bảng kê thuế;
  - nhập XML hóa đơn đầu vào.

Nhu cầu của Dương Sinh:
- **Hóa đơn dịch vụ:** học phí (dịch vụ giáo dục, không chịu thuế — KCT), giải đấu.
- **Hóa đơn bán hàng:** sách và đồ dùng cờ vua.
- **Hóa đơn mua:** sách, bàn cờ, thuê mặt bằng, dịch vụ.
- Theo dõi công nợ học viên / nhà cung cấp theo từng hóa đơn.
- Đọc XML hóa đơn điện tử đầu vào để khỏi gõ tay.

Theo khảo sát (`docs/research/fao/02-chung-tu.md`, `04-bao-cao.md`, `99-gap-analysis.md` mục 2.4–2.5), FAO có:
- trên phiếu thu/chi: từng dòng trỏ tới hóa đơn để trừ công nợ;
- trên hóa đơn: thuế theo từng dòng;
- báo cáo Sổ chi tiết công nợ và Bảng kê mua vào.

P4 làm thành **3 đợt**. Mỗi đợt là 1 PR riêng, CI xanh thì merge. Nhờ vậy Thầy dùng được dần, không phải chờ cả 4 tuần.
- Kế hoạch lưu tại `docs/plans/2026-10-25-P4-ban-mua-cong-no.md`.
- Mỗi đợt tách nhánh `claude/beautiful-pascal-y8xgxa` lại từ `main` mới nhất.

## Đợt P4a — Hóa đơn bán/mua có thuế GTGT + danh mục hàng hóa + sổ công nợ

**Migration `20261025000008_invoices.sql`**
- **Cột mới trên `vouchers`:** `invoice_series` (ký hiệu), `invoice_number`, `invoice_date`, `due_date`, `buyer_tax_code`.
  - Hóa đơn bán: số hóa đơn = số chứng từ.
  - Hóa đơn mua: ghi số / ký hiệu / ngày trên hóa đơn của nhà cung cấp, như các trường `so_ct0`, `so_seri0`, `ngay_ct0` của FAO.
  - Thêm unique index chống nhập trùng hóa đơn mua: (tenant, đối tượng, ký hiệu, số).
- **Cột mới trên `voucher_lines`:** `uom`, `vat_code`, `vat_rate`, `vat_amount`, `vat_account`, `discount_amount`.
- **`save_voucher`** (create or replace):
  - lưu các trường mới;
  - `total_amount` = tiền hàng + thuế;
  - với loại hóa đơn: hạn thanh toán mặc định = ngày hóa đơn + `partners.payment_term_days`.
- **`post_voucher`:** sinh thêm bút toán thuế cho mọi dòng có `vat_amount > 0`.
  - Tài khoản phần đầu bên Nợ (HDB/HDV/PT/BC): **Nợ TK phần đầu (131/111) / Có TK thuế (33311)**.
  - Tài khoản phần đầu bên Có (HDM/HMV/PC/BN): **Nợ 1331 / Có TK phần đầu (331/111)**.
  - Quy tắc này dùng chung cho mọi chứng từ kiểu cặp, nên PT/PC sau này có thuế ngay mà không phải viết thêm.
  - Kiểm tra: tổng thuế từng dòng khớp thuế suất (sai lệch do làm tròn ≤ 1 đồng/dòng); TK thuế phải là tài khoản chi tiết.
- **Báo cáo** (`security invoker`, tận dụng RLS của `gl_entries`, cùng kiểu với `rpt_account_ledger`):
  - `rpt_partner_ledger(tenant, account, partner, from, to)`: Sổ chi tiết công nợ một đối tượng. Số dư đầu kỳ lấy từ `opening_balances` có `partner_id` cộng `gl_entries` trước kỳ; có số dư lũy kế.
  - `rpt_partner_balances(tenant, account, from, to)`: Tổng hợp công nợ theo đối tượng (dư đầu kỳ, phát sinh, dư cuối kỳ Nợ/Có).
- **Hàm nhập** `import_items(tenant, rows)`: cùng mẫu với `import_partners` (kiểm tra hết trước, nguyên khối).

**Core** (`packages/core`)
- `accounting/invoice.ts`:
  - `invoiceDefaults(regime, type)`:
    - TK doanh thu: HDB 5111, HDV 5113;
    - TK hàng mua: TT99 1561, TT133 156;
    - TK dịch vụ mua: TT99 6427, TT133 6422;
    - TK thuế: 33311 / 1331.
  - `computeInvoiceLine` (SL × đơn giá − chiết khấu → thành tiền → thuế, dùng `vatAmount` sẵn có trong `vat.ts`).
  - `invoiceTotals`.
  - `buildLedgerEntries` thêm vế thuế, khớp với SQL.
- `schemas/voucher.ts`: thêm trường hóa đơn và trường thuế của dòng.
- `schemas/catalog.ts`: thêm `itemSchema`.
- Đặc tả nhập Excel `items` trong `import/specs.ts` + `validate.ts` (dùng lại toàn bộ khung P2.5).

**API:** `toVoucherPayload` / `fromVoucherRow` thêm trường mới; `api.items/saveItem/importItems`; `api.partnerLedger/partnerBalances` và hook React tương ứng.

**Web**
- **`features/vouchers/InvoiceEditor.tsx`** (form riêng cho 4 loại hóa đơn):
  - **Phần đầu:** mã khách / NCC, tên – địa chỉ – MST người mua, ký hiệu – số – ngày hóa đơn, ngày hạch toán, hạn thanh toán, TK 131/331, diễn giải.
  - **Lưới dòng:** Mã hàng (tra từ danh mục: tự điền tên, đvt, giá, TK, mã thuế), Tên hàng/diễn giải, Đvt, SL, Đơn giá, Chiết khấu, Thành tiền, TK doanh thu/chi phí, Mã thuế, Tiền thuế, Lớp/vụ việc.
  - **Chân:** Tiền hàng, Tiền thuế, Tổng thanh toán, số tiền bằng chữ.
  - Thuế mặc định theo mặt hàng. HDV học phí mặc định KCT.
- `VoucherModule` chọn editor theo loại chứng từ. `config.ts` thêm HDB/HDV/HDM/HMV. Danh sách chứng từ thêm các cột Số HĐ, Ngày HĐ, Hạn TT.
- **`features/catalogs/ItemsPage.tsx`** — Danh mục hàng hóa, dịch vụ: Mới/Sửa, Nhập từ Excel, Xuất Excel.
- **Báo cáo:**
  - `PartnerLedgerPage`: Sổ chi tiết công nợ khách hàng / nhà cung cấp — chọn đối tượng, kỳ; in và xuất Excel.
  - `PartnerBalancesPage`: Tổng hợp công nợ.
- `modules.ts`:
  - bật `sales/invoices`, `sales/service-invoices`, `purchase/invoices`, `purchase/service-invoices`, `sales/receivable-ledger`, `purchase/payable-ledger`, `inventory/items`;
  - thêm `sales/receivable-summary`, `purchase/payable-summary`.

## Đợt P4b — Thanh toán theo hóa đơn + tuổi nợ + bảng kê thuế

**Migration `…0009_settlements.sql`**
- `voucher_lines.invoice_id uuid references vouchers` (dòng phiếu thu/chi/báo có/báo nợ trỏ tới hóa đơn), kèm index.
- `public.open_invoices(tenant, partner?, side 'receivable'|'payable', as_of)`: hóa đơn đã ghi sổ còn nợ — tổng tiền, đã thanh toán (chỉ tính phiếu đã ghi sổ), còn lại, hạn, số ngày quá hạn.
- **`post_voucher` kiểm tra thêm:**
  - dòng có `invoice_id` phải cùng đối tượng, cùng TK công nợ (131/331) với hóa đơn;
  - hóa đơn đã ghi sổ;
  - không trả vượt số còn lại.
- **`unpost_voucher` / `delete_voucher`:** chặn bỏ ghi sổ hoặc xóa hóa đơn đã có phiếu thanh toán ghi sổ ("bỏ ghi sổ phiếu thu PTxxxx trước").
- **`rpt_aging(tenant, account, as_of)`:** tuổi nợ theo hóa đơn — chưa đến hạn, 1–30, 31–60, 61–90, >90 ngày. Thêm cột "Không theo hóa đơn" (số dư đầu kỳ hoặc bút toán không gắn hóa đơn), để tổng khớp với Tổng hợp công nợ.
- **`rpt_vat_listing(tenant, direction 'out'|'in', from, to)`:** bảng kê hóa đơn bán ra / mua vào, nhóm theo thuế suất (KCT, 0, 5, 8, 10) như mẫu 01-1, 01-2/GTGT. Lấy từ mọi chứng từ có dòng thuế, cả PC/BN.

**Web**
- **`VoucherEditor` (PT/PC/BC/BN):**
  - khi dòng là TK theo dõi công nợ và đã có đối tượng: thêm cột **Hóa đơn**, chọn trong danh sách hóa đơn còn nợ, hiện Tiền HĐ / Đã TT / Còn lại;
  - nút **Phân bổ tự động**: trừ dần vào hóa đơn cũ nhất trước.
- Trang **Tuổi nợ phải thu / phải trả**.
- Trang **Bảng kê hóa đơn bán ra / mua vào**: lọc theo kỳ, xuất Excel.
- Hóa đơn: hiển thị "Đã thu/trả X — còn Y" và danh sách phiếu thanh toán liên quan.
- **Mobile:** màn hình *Công nợ phải thu* (chỉ xem): đối tượng còn nợ và số ngày quá hạn, dùng `rpt_partner_balances` + `open_invoices`.

## Đợt P4c — Nhập XML hóa đơn điện tử đầu vào

- **Core `import/einvoice.ts`:** đọc XML hóa đơn điện tử theo TT78/2021 (QĐ 1450/QĐ-TCT).
  - **Các thẻ cần đọc:** `HDon/DLHDon/TTChung` (KHMSHDon, KHHDon, SHDon, NLap, DVTTe, TGia), `NDHDon/NBan`, `NMua`, `DSHHDVu/HHDVu` (TChat, THHDVu, DVTinh, SLuong, DGia, STCKhau, ThTien, TSuat), `TToan` (TgTCThue, TgTThue, TgTTTBSo), `MCCQT`.
  - Dùng thư viện `fast-xml-parser` (thuần JS, chạy được cả trình duyệt lẫn Node).
  - **Kết quả trả về:** dữ liệu hóa đơn đã chuẩn hóa, thuế suất ánh xạ về mã thuế AccEdu, kèm cảnh báo:
    - MST người mua khác MST đơn vị;
    - tổng tiền không khớp từng dòng;
    - thiếu mã cơ quan thuế.
- **Web trang `purchase/input-invoices`:**
  - kéo thả nhiều tệp `.xml` (hoặc `.zip`) → bảng xem trước, mỗi hóa đơn hiện: nhà cung cấp, số/ký hiệu/ngày, tiền hàng, thuế, trạng thái (Mới / Đã có / Cảnh báo);
  - chọn TK chi phí/hàng hóa mặc định cho từng hóa đơn;
  - nút "Tạo hóa đơn mua";
  - nhà cung cấp chưa có (tra theo MST) thì tự tạo.
- **Migration `…0010_einvoice_import.sql`:** hàm `import_purchase_invoices(tenant, invoices jsonb)`.
  - Tạo HDM/HMV **ở trạng thái nháp** để kế toán xem lại rồi mới ghi sổ.
  - Bỏ qua hóa đơn đã có (trùng MST + ký hiệu + số).
- **Ngoài phạm vi** (ghi vào backlog P8): kiểm tra chữ ký số, tra cứu hóa đơn trên cổng thuế, cảnh báo doanh nghiệp rủi ro.

## Ngoài phạm vi P4 (giữ đúng lộ trình)

- Giá vốn / xuất kho khi bán hàng (P5).
- Tờ khai 01/GTGT và hóa đơn điện tử đầu ra (P8).
- Đơn hàng, hóa đơn điều chỉnh/trả lại (backlog P4+).
- Học phí theo lớp và TK 3387 (P9). P4 đã dùng được HDV cho học phí.

## Kiểm thử từng đợt

- **Core (Vitest + fast-check):**
  - tính dòng hóa đơn và làm tròn thuế;
  - `buildLedgerEntries` có vế thuế cân Nợ = Có;
  - với P4c: đọc XML mẫu (dữ liệu giả, tự soạn theo cấu trúc chuẩn — không dùng hóa đơn thật).
- **CSDL (`supabase/tests/invoices.test.ts`, `settlements.test.ts`):**
  - ghi sổ HDV (KCT) / HDB (10%) / HDM sinh đúng bút toán thuế;
  - CĐPS cân;
  - đối tượng bắt buộc;
  - trùng hóa đơn mua bị chặn;
  - phiếu thu trừ hóa đơn: vượt số còn lại → lỗi; chặn bỏ ghi sổ hóa đơn đã có thanh toán;
  - tuổi nợ khớp tổng hợp công nợ;
  - viewer và tenant khác bị chặn (RLS).
- **E2E (Playwright trên Supabase local):**
  - **P4a:** lập HDV học phí 3.000.000 (KCT) và HDB sách có thuế 10%, ghi sổ; sổ chi tiết công nợ hiện đúng số dư.
  - **P4b:** phiếu thu trừ vào HDV, tuổi nợ còn 0; bảng kê bán ra.
  - **P4c:** kéo thả XML mẫu → tạo HDM nháp → ghi sổ.
- Mỗi đợt: `pnpm check`, `pnpm db:test`, E2E local, `cargo check`. Sau đó push → PR → CI 4/4 + `supabase-deploy` xanh → merge → kiểm tra Vercel production READY → báo Thầy (kèm ảnh chụp màn hình).

## Kết quả đợt P4a (25/10/2026)

| Hạng mục | Trạng thái | Kiểm chứng |
|---|---|---|
| Migration 0008: cột hóa đơn và thuế; `save_voucher` kiểm tra thuế, tính hạn thanh toán; `post_voucher` sinh bút toán thuế; chặn nhập trùng hóa đơn mua | Xong | Test CSDL `invoices.test.ts`: HDV KCT, HDB 10%, HDM, HMV, PC có thuế 8%, các trường hợp thuế sai, trùng hóa đơn |
| `rpt_partner_ledger`, `rpt_partner_balances` | Xong | Test: dư đầu kỳ + phát sinh = dư cuối kỳ; tổng hợp phải thu/phải trả |
| `import_items` + mẫu Excel danh mục hàng hóa | Xong | Test CSDL + test core (mã thuế `10%` / `0.08` / `KCT`, loại hàng, TK) |
| Core: tính hóa đơn, TK mặc định theo TT99/TT133, vế thuế trong `buildLedgerEntries` | Xong | 13 test mới; thuộc tính Nợ = Có = tiền hàng + thuế |
| Web: form hóa đơn, danh mục hàng hóa, sổ và tổng hợp công nợ | Xong | E2E 9/9 trên Supabase local: hóa đơn học phí KCT, hóa đơn bán sách 5%, sổ công nợ 6.252.000 |

Tổng số test: core 95, api 3, CSDL 47, E2E 9.

## Đợt P4b — chi tiết (26/10/2026)

### Context

P4a đã chạy production: PR covuaduongsinh/accedu#4 merge vào `main` `81787ec`, CI xanh, migration 0008 đã áp, Vercel READY. AccEdu đã lập được hóa đơn và xem được công nợ theo đối tượng. Nhưng **phiếu thu/chi chưa trừ được vào từng hóa đơn**, nên chưa biết:
- hóa đơn học phí nào đã thu đủ, hóa đơn nào còn nợ;
- nợ quá hạn bao lâu.

FAO thì làm được cả hai: dòng phiếu thu trỏ tới hóa đơn (trường `so_hd`, "Còn phải thanh toán" trong `docs/research/fao/02-chung-tu.md`). FAO cũng có bảng kê mua vào/bán ra (`04-bao-cao.md`).

Thầy chọn P4b (đợt 2/3 của `docs/plans/2026-10-25-P4-ban-mua-cong-no.md`). Kết quả mong muốn:
- **Phiếu thu học phí:** chọn trừ vào hóa đơn học phí (HDV) còn nợ, hoặc nhập số tiền rồi bấm phân bổ tự động trừ hóa đơn cũ nhất trước.
- **Báo cáo tuổi nợ:** phải thu / phải trả, khớp với tổng hợp công nợ.
- **Bảng kê hóa đơn:** bán ra / mua vào, nhóm theo thuế suất, xuất Excel.
- **Mobile:** màn hình xem công nợ phải thu.

Cách làm như các đợt trước:
- tách lại nhánh `claude/beautiful-pascal-y8xgxa` từ `main` mới nhất;
- PR mới, CI xanh thì **hỏi Thầy trước khi merge**;
- kế hoạch bổ sung vào `docs/plans/2026-10-25-P4-ban-mua-cong-no.md` (mục "Đợt P4b — chi tiết").

### CSDL — migration `20261026000009_settlements.sql`

- **`voucher_lines.invoice_id uuid references vouchers(id) on delete restrict`**, kèm index `(invoice_id)`.
  - Dòng PT/BC (Có 131) hoặc PC/BN (Nợ 331) trỏ tới hóa đơn HDB/HDV hoặc HDM/HMV.
  - Cột `invoice_ref` (chữ) hiện có giữ nguyên, không dùng.
- **`save_voucher`** (create or replace từ bản 0008):
  - nhận `invoice_id` trên dòng;
  - kiểm tra sớm: hóa đơn cùng đơn vị, đúng loại hóa đơn, cùng đối tượng với dòng; TK công nợ của dòng (vế đối diện với tiền) bằng `header_account` của hóa đơn.
- **`post_voucher`** kiểm tra thêm:
  - hóa đơn được trỏ tới phải đã ghi sổ;
  - tổng đã thanh toán (các phiếu đã ghi sổ, tính cả phiếu này) không vượt `total_amount` của hóa đơn — báo "Phiếu trả vượt số còn nợ của hóa đơn X".
- **`unpost_voucher` / `delete_voucher`:**
  - không cho bỏ ghi sổ hay xóa hóa đơn đang có phiếu thanh toán đã ghi sổ — báo "Hóa đơn X đã có phiếu thanh toán PTxxxx — bỏ ghi sổ phiếu đó trước";
  - xóa hóa đơn đang có phiếu nháp trỏ tới thì báo dễ hiểu, thay vì để lỗi khóa ngoại.
- **`public.open_invoices(p_tenant, p_side 'receivable'|'payable', p_partner uuid default null, p_as_of date default null, p_exclude_voucher uuid default null)`** (`security invoker`):
  - trả từng hóa đơn đã ghi sổ: id, loại, số, ký hiệu/số/ngày hóa đơn, hạn TT, đối tượng, TK, tổng, đã trả, còn lại, số ngày quá hạn;
  - mặc định chỉ hóa đơn còn nợ;
  - `p_exclude_voucher`: khi sửa phiếu thu, không tính phần phiếu đó đã phân bổ.
- **`public.rpt_aging(p_tenant, p_side, p_as_of)`:** theo từng đối tượng.
  - Các cột: Chưa đến hạn, 1–30, 31–60, 61–90, >90 ngày (tính theo `due_date`; thiếu hạn thì theo ngày hóa đơn); "Không theo hóa đơn" = số dư công nợ − tổng còn nợ của các hóa đơn (số dư đầu kỳ, phiếu thu không gắn hóa đơn…); Tổng = số dư cuối của đối tượng.
  - Số dư lấy cùng cách với `rpt_partner_balances`: 131 dư Nợ, 331 dư Có, nên Tổng khớp báo cáo tổng hợp công nợ.
- **`public.rpt_vat_listing(p_tenant, p_direction 'out'|'in', p_from, p_to)`:**
  - lấy dòng có `vat_code` của chứng từ đã ghi sổ trong kỳ (theo ngày hạch toán);
  - bán ra = loại có TK phần đầu bên Nợ (HDB, HDV, PT, BC); mua vào = bên Có (HDM, HMV, PC, BN);
  - mỗi hóa đơn × mã thuế một dòng: ký hiệu, số, ngày HĐ, tên & MST đối tượng, mặt hàng (dòng đầu), doanh số chưa thuế, thuế suất, tiền thuế;
  - sắp theo nhóm KCT → 0% → 5% → 8% → 10% (như mẫu 01-1/GTGT, 01-2/GTGT).
- Thu quyền `public, anon`; cấp `authenticated` cho các hàm báo cáo.

### Core — `packages/core`

- **`accounting/settlement.ts`:**
  - `allocateFifo(amount, invoices[{id, remaining, dueDate, invoiceDate}])` → `[{invoiceId, amount}]` (trừ hóa đơn cũ nhất trước) + phần thừa;
  - `agingBucket(dueDate | invoiceDate, asOf)`;
  - `paymentSide(voucherType)` (PT/BC → phải thu, PC/BN → phải trả).
- **`schemas/voucher.ts`:** dòng thêm `invoiceId`.
- **Test Vitest:** FIFO (đủ / thiếu / thừa), biên tuổi nợ (0, 30, 31, 90, 91 ngày), thuộc tính: tổng phân bổ ≤ min(tiền, tổng còn nợ).

### API — `packages/api`

- **Mapper:** thêm `invoice_id` vào `toVoucherPayload` / `fromVoucherRow`.
- **Kiểu dữ liệu:** `OpenInvoiceRow`, `AgingRow`, `VatListingRow`.
- **Hàm:** `api.openInvoices`, `api.aging`, `api.vatListing`, `api.invoicePayments(invoiceId)` (danh sách phiếu đã trừ vào hóa đơn).
- **Hook:** `useOpenInvoices`, `useAging`, `useVatListing`, `useInvoicePayments`.
- **Khi lưu hoặc ghi sổ chứng từ:** invalidate thêm `["report", tenant]` (đã có) và key `open-invoices`.

### Web

- **`VoucherEditor` (PT/PC/BC/BN):**
  - **Cột "Hóa đơn" trên dòng:** hiện khi TK của dòng theo dõi công nợ và đã có đối tượng; chọn trong danh sách hóa đơn còn nợ của đối tượng đó, hiện "Còn lại X" bên cạnh.
  - **Nút "Thu/chi theo hóa đơn":**
    - mở bảng hóa đơn còn nợ (ngày, số, hạn, còn lại) kèm ô "Số tiền" và nút **Phân bổ tự động** (`allocateFifo`);
    - xác nhận thì sinh mỗi hóa đơn một dòng: TK 131/331, số tiền, `invoice_id`, diễn giải "Thu tiền hóa đơn …";
    - phần thừa thành một dòng không gắn hóa đơn (trả trước).
- **`InvoiceEditor`:** hóa đơn đã ghi sổ hiện "Đã thu/trả X — còn Y" và danh sách phiếu thanh toán (`useInvoicePayments`).
- **Trang mới (`features/reports/`):**
  - `AgingPage` (side) — phải thu / phải trả: chọn ngày tính tuổi; lưới theo đối tượng có dòng tổng; nhấp đúp mở sổ chi tiết công nợ (đã có); xuất Excel.
  - `VatListingPage` (direction) — bán ra / mua vào: lọc kỳ; lưới nhóm theo thuế suất kèm tổng từng nhóm; xuất Excel.
- **`modules.ts` + `feature.tsx`:** thêm
  - `sales/aging` "Tuổi nợ phải thu";
  - `purchase/aging` "Tuổi nợ phải trả";
  - `general/vat-out` "Bảng kê hóa đơn bán ra";
  - `general/vat-in` "Bảng kê hóa đơn mua vào".

### Mobile — `apps/mobile`

- **`app/[tenant]/receivables.tsx`:** chỉ xem.
  - Danh sách đối tượng còn nợ (từ `useAging(side receivable, hôm nay)`): tên, tổng nợ, phần quá hạn tô đỏ.
  - Kéo xuống để làm mới.
- **Link từ dashboard:** "Công nợ phải thu ›", cạnh link Bảng cân đối phát sinh.
- Bật `mobile: true` cho `sales/aging` trong `modules.ts`.

### Kiểm thử

- **CSDL `supabase/tests/settlements.test.ts`:**
  - phiếu thu trừ hóa đơn: `open_invoices` còn lại giảm;
  - trả vượt số còn nợ thì lỗi;
  - sai đối tượng hoặc sai TK thì lỗi;
  - trỏ tới hóa đơn chưa ghi sổ thì lỗi;
  - bỏ ghi sổ hoặc xóa hóa đơn đã có thanh toán thì bị chặn;
  - `p_exclude_voucher` hoạt động;
  - tuổi nợ: các khoảng và cột "không theo hóa đơn"; Tổng = `rpt_partner_balances`;
  - bảng kê bán ra/mua vào nhóm đúng thuế suất, chỉ chứng từ đã ghi sổ;
  - RLS: tenant khác không thấy.
- **Core:** test FIFO / tuổi nợ như trên.
- **E2E** (nối tiếp kịch bản P4a: học viên HV002 có HDV 3.000.000 + HDB 252.000):
  - lập phiếu thu → "Thu theo hóa đơn" → số tiền 3.252.000 → phân bổ tự động → ghi sổ;
  - tuổi nợ phải thu của HV002 chỉ còn 3.000.000 ở cột "không theo hóa đơn" (số dư đầu kỳ nhập từ Excel);
  - bảng kê bán ra có 2 nhóm (KCT và 5%);
  - chụp ảnh màn hình.
- **Mỗi bước:** `pnpm check`, `pnpm db:test`, E2E trên Supabase local (`supabase db reset` để áp 0009; Edge Function local cần mount CA như trước), `expo export` cho mobile qua CI.
- **Đưa lên:**
  - push → PR mới → theo dõi CI 4/4 và `supabase-deploy`;
  - migration chỉ thêm cột, hàm mới và kiểm tra mới, nên bản web cũ vẫn chạy được;
  - **hỏi Thầy "merge"** trước khi gộp; sau merge kiểm tra Vercel production.
- **Tài liệu:**
  - bổ sung mục 4 vào `docs/huong-dan/hoa-don-cong-no.md`: thu theo hóa đơn, tuổi nợ, bảng kê;
  - cập nhật kết quả vào kế hoạch P4 và file tiến độ.
