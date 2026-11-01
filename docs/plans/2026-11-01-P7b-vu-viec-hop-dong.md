# P7b — Vụ việc & hợp đồng: lãi lỗ theo lớp / giải đấu / hợp đồng, sổ chi tiết vụ việc, theo dõi hợp đồng

Ngày lập: 01/11/2026. Thầy chọn đợt này sau khi P7a (Cuối kỳ) lên production.

## Bối cảnh

Từ P2, AccEdu đã có danh mục **Công trình, vụ việc** (`jobs`). Mọi dòng chứng từ và bút toán sổ cái đều có cột `job_id`.

Nhiều nghiệp vụ đã tự gắn vụ việc:
- **Lớp học** là một vụ việc (`jobs.kind = 'class'`). Vì vậy học phí (Nợ 131 / Có 3387), phân bổ doanh thu 3387 → 5113 và lương HLV đều mang mã lớp.
- **Hóa đơn bán, mua** có cột *Vụ việc* trên từng dòng.

Còn thiếu ba việc:
1. **Xem lãi lỗ theo vụ việc.** Lớp Tốt K12 lãi bao nhiêu? Giải đấu tháng 10 lỗ hay lãi? Chưa có báo cáo nào trả lời được.
2. **Gắn vụ việc trên phiếu thu, chi, báo có, báo nợ, phiếu kế toán.** Chi thuê sân, in bằng khen, trọng tài cho giải đấu thường đi bằng phiếu chi. Màn hình hiện chưa có cột *Vụ việc*.
3. **Theo dõi hợp đồng.** Dương Sinh ký hợp đồng dạy cờ vua với trường học, tài trợ giải đấu, mua sách với nhà in. Cần biết với mỗi hợp đồng:
   - giá trị;
   - đã xuất hóa đơn bao nhiêu;
   - đã thu bao nhiêu;
   - còn phải thu bao nhiêu;
   - phần chưa xuất hóa đơn.

Đặc tả FAO tham khảo (`docs/research/fao/01-cay-menu.md`): *Công trình, vụ việc*, *Hợp đồng*, *Sổ chi tiết vụ việc*. Chỉ mô tả chức năng, không chép mã hay văn bản của FAST.

## Phạm vi

| Có trong P7b | Để sau |
|---|---|
| Cột **Vụ việc** trên phiếu thu, chi, báo có, báo nợ, phiếu kế toán | Phân bổ chi phí chung (điện, thuê nhà) cho các lớp theo tỷ lệ |
| **Lãi lỗ theo vụ việc**:<br>- doanh thu, giảm trừ, chi phí, lãi lỗ, tỷ suất;<br>- doanh thu chưa thực hiện (3387) còn lại;<br>- ngân sách;<br>- dòng *Không gắn vụ việc* để tổng khớp lãi lỗ toàn đơn vị | Kết chuyển 911 theo vụ việc |
| **Sổ chi tiết vụ việc**:<br>- lũy kế trước kỳ;<br>- từng bút toán doanh thu / chi phí, lãi lỗ lũy kế;<br>- xem cả bút toán công nợ, tiền | Dự toán chi tiết theo khoản mục |
| **Hợp đồng bán / mua**:<br>- số hợp đồng, đối tác, ngày ký, thời hạn, giá trị, trạng thái;<br>- đã xuất hóa đơn, đã thu / trả, còn phải thu / trả, chưa xuất hóa đơn;<br>- lãi lỗ hợp đồng;<br>- danh sách hóa đơn & thanh toán của hợp đồng | Khế ước vay (lãi vay, lịch trả nợ); nhập hợp đồng từ Excel; tiến độ thanh toán theo đợt |
| Hỏi AccEdu: tool *lãi lỗ vụ việc*, tool *hợp đồng* | |
| Sửa lỗi: báo cáo lãi gộp không tính phiếu kết chuyển cuối kỳ | |

## Thiết kế

### 1. CSDL — `20261103000021_jobs_contracts.sql`

**Bảng `contracts`** — mỗi hợp đồng gắn đúng một vụ việc (`job_id unique`):
- `direction`: `sale` bán (trường học, nhà tài trợ) | `purchase` mua;
- `number`: số hợp đồng;
- `partner_id`: đối tác, bắt buộc;
- `signed_date`: ngày ký;
- `value`: giá trị gồm thuế;
- `status`: `draft` đang thỏa thuận | `active` đang thực hiện | `done` đã thanh lý | `cancelled` đã hủy;
- `note`: ghi chú.

Mã, tên, thời hạn (bắt đầu / kết thúc) nằm ở vụ việc. Nhờ vậy, nhập mã hợp đồng ở cột *Vụ việc* trên hóa đơn, phiếu thu là gắn được chứng từ vào hợp đồng.

**`save_contract(tenant, contract, id)`** (kế toán trở lên):
- **Hợp đồng mới:**
  - mã chưa có thì tạo vụ việc loại *Hợp đồng*;
  - mã đã là vụ việc thì gắn vào vụ việc đó;
  - không cho gắn vào lớp học, hoặc vào vụ việc đã có hợp đồng khác.
- **Sửa hợp đồng:** cập nhật luôn tên, đối tác, thời hạn của vụ việc. Mã không đổi.

**`delete_contract`:**
- xóa hợp đồng;
- xóa luôn vụ việc loại *Hợp đồng* nếu chưa có chứng từ nào dùng;
- nếu đã có chứng từ thì giữ vụ việc.

**Bỏ phiếu kết chuyển cuối kỳ.** Các báo cáo doanh thu / chi phí theo kỳ không tính phiếu kết chuyển 911 (`period_closings.voucher_id`). Phiếu này chỉ đưa số dư về 0, không phải doanh thu / chi phí phát sinh.

**`rpt_job_pnl(tenant, from, to, kind)`** — lãi lỗ theo vụ việc trong kỳ, từ sổ cái:

| Cột | Tính bằng |
|---|---|
| Doanh thu | Có − Nợ các TK loại doanh thu, trừ 521 (511x, 515, 711) |
| Giảm trừ | Nợ − Có TK 521x |
| Chi phí | Nợ − Có các TK loại chi phí (632, 635, 641x, 642x, 811, 821x). Bỏ TK giá thành 611, 621, 622, 623, 627, 631, như kết chuyển 911 |
| Lãi lỗ | Doanh thu − giảm trừ − chi phí; kèm tỷ suất trên doanh thu thuần |
| Chưa thực hiện | Số dư Có TK 3387 của vụ việc đến cuối kỳ: học phí đã lập chưa phân bổ |

- Dòng **(Không gắn vụ việc)** gom mọi bút toán không có vụ việc. Tổng các dòng = lãi lỗ toàn đơn vị = số kết chuyển 911 của kỳ.
- Lọc theo loại vụ việc: lớp, khóa, giải đấu / sự kiện, dự án, hợp đồng. Khi lọc thì không có dòng *Không gắn vụ việc*.

**`rpt_job_ledger(tenant, job, from, to, pl_only)`** — sổ chi tiết một vụ việc (`job = null`: các bút toán không gắn vụ việc):
- dòng **Lũy kế trước kỳ**: doanh thu, chi phí, lãi lỗ từ khi bắt đầu đến trước kỳ;
- từng bút toán trong kỳ: TK, TK đối ứng, đối tượng, Nợ / Có, doanh thu / chi phí, lãi lỗ lũy kế;
- dòng **Cộng trong kỳ** và **Lũy kế đến cuối kỳ**;
- `pl_only = false`: thêm bút toán công nợ, tiền, 3387 của vụ việc (không tính vào lãi lỗ).

**`rpt_contracts(tenant, as_of)`** — mỗi hợp đồng đến ngày `as_of`:

| Cột | Hợp đồng bán | Hợp đồng mua |
|---|---|---|
| Đã xuất hóa đơn | Dòng HDB / HDV đã ghi sổ gắn vụ việc của hợp đồng (tiền hàng + thuế) | Dòng HDM / HMV |
| Đã thu / đã trả | Phần đã thanh toán của các hóa đơn đó (thu theo hóa đơn, chia theo tỷ lệ dòng của hợp đồng trong hóa đơn), cộng khoản thu không theo hóa đơn: dòng Có 131 gắn vụ việc (ứng trước) | Như bên bán, với dòng Nợ 331 |
| Còn phải thu / trả | Đã xuất hóa đơn − đã thu / trả (âm = khách ứng trước) | |
| Chưa xuất hóa đơn | Giá trị − đã xuất hóa đơn | |

Ngoài ra:
- doanh thu, chi phí, lãi lỗ lũy kế của vụ việc;
- cờ **quá hạn**: đang thực hiện mà đã qua ngày kết thúc.

**`rpt_contract_detail(tenant, contract)`:** các hóa đơn của hợp đồng (số tiền của hợp đồng, đã thanh toán) và các khoản thu / trả không theo hóa đơn.

**Sửa `rpt_gross_profit`:** không tính phiếu kết chuyển 911. Từ P7a, sau khi kết chuyển, dòng *Không gắn mã hàng* hiện doanh thu âm bằng toàn bộ doanh thu tháng.

**Quyền:**
- hợp đồng: thêm / sửa / xóa cần quyền sửa danh mục (kế toán trở lên); xem cần là thành viên;
- báo cáo: thành viên đơn vị trừ HLV, theo RLS sổ cái.

### 2. API, web, AI

**API:**
- `saveContract`, `deleteContract`, `jobPnl`, `jobLedger`, `contracts`, `contractDetail`;
- hook `useJobPnl`, `useJobLedger`, `useContracts`, `useContractDetail`;
- realtime bảng `contracts`.

**Web, nhóm *Dự án*:**
- **Lãi lỗ theo vụ việc** (mới):
  - chọn kỳ và loại vụ việc; dòng tổng;
  - bấm đúp một dòng mở sổ chi tiết của vụ việc đó;
  - xuất Excel.
- **Sổ chi tiết vụ việc**:
  - chọn vụ việc và kỳ; lũy kế trước kỳ, lãi lỗ lũy kế;
  - tùy chọn xem cả bút toán công nợ / tiền;
  - xuất Excel.
- **Hợp đồng**:
  - danh sách có cột theo dõi; lọc bán / mua, trạng thái;
  - thêm / sửa / xóa;
  - xem hóa đơn & thanh toán của hợp đồng.
- **Công trình, vụ việc**: thêm ô *Ngân sách*.

**Chứng từ PT / PC / BC / BN / PK:**
- thêm cột **Vụ việc** (gợi ý mã từ danh mục), như hóa đơn;
- mã không có trong danh mục thì báo lỗi khi lưu.

**Hỏi AccEdu:**
- tool `job_pnl`: *"Lớp Tốt K12 tháng này lãi bao nhiêu?"*, *"Giải đấu nào lỗ?"*;
- tool `contracts`: *"Hợp đồng trường Kim Đồng còn phải thu bao nhiêu?"*.

### 3. Kiểm thử

**CSDL `jobs.test.ts`:**
- lãi lỗ theo lớp: học phí 3387, phân bổ 5113, lương HLV 632 / 642, chi phí phiếu chi gắn lớp;
- dòng không gắn vụ việc; tổng khớp kết chuyển 911;
- phiếu kết chuyển không làm sai lãi lỗ vụ việc và lãi gộp;
- sổ chi tiết: lũy kế trước kỳ, lãi lỗ lũy kế;
- hợp đồng bán: tạo / sửa / gắn vụ việc có sẵn / chặn gắn lớp học;
- hợp đồng bán: hóa đơn một phần, thu theo hóa đơn, khoản ứng trước, còn phải thu, chưa xuất hóa đơn;
- hợp đồng mua;
- xóa hợp đồng (giữ / xóa vụ việc);
- quyền.

**E2E:**
1. tạo hợp đồng với trường;
2. lập phiếu chi có cột *Vụ việc*;
3. xuất hóa đơn dịch vụ theo hợp đồng;
4. thu một phần;
5. xem trang Hợp đồng: đã xuất hóa đơn, đã thu, còn phải thu;
6. xem *Lãi lỗ theo vụ việc* có hợp đồng và lớp.

## Lộ trình sau P7b

**P8a** BCTC: Bảng cân đối kế toán (B01), Kết quả kinh doanh (B02), xuất Excel → **P10** phát hành. Khế ước vay để đợt riêng khi Dương Sinh có khoản vay.
