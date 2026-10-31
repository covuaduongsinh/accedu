# Kế hoạch P3b — Sao kê ngân hàng, tự khớp học phí chuyển khoản, đối chiếu TK 112

> Kế hoạch tổng thể: [2026-10-23-ke-hoach-tong-the-accedu.md](2026-10-23-ke-hoach-tong-the-accedu.md) (P3 Tiền: "import sao kê để đối chiếu").
> Thầy giao: "tự động đề xuất và lên kế hoạch triển khai tiếp" (30/10/2026).

## Vì sao làm đợt này trước

Từ P9a, mỗi thông báo / email học phí đều có mã VietQR với nội dung chuyển khoản chuẩn `HP <mã học viên> <số hóa đơn>`. Phụ huynh quét mã là tiền về TK ngân hàng, nhưng kế toán vẫn phải mở sao kê, dò từng dòng, rồi bấm *Thu học phí* cho từng em. Cuối tháng còn phải đối chiếu số dư TK 112 với sao kê.

**P3b tự động hóa phần đó:**
- tải tệp sao kê (Excel / CSV xuất từ internet banking);
- AccEdu đọc nội dung chuyển khoản, nhận ra học viên và phiếu học phí, đề xuất phiếu báo có;
- kế toán bấm **Xác nhận** một lần cho cả loạt;
- phí ngân hàng, lãi tiền gửi lập bằng một cú bấm;
- bảng đối chiếu số dư sổ – sao kê.

Đây là việc hằng ngày của kế toán CLB, dùng được ngay, không phụ thuộc phần khác.

## Lộ trình sau P3b (đề xuất)

| Đợt | Nội dung | Vì sao |
|---|---|---|
| **P7a** Cuối kỳ | Kết chuyển doanh thu, chi phí → 911 → 421 tự động theo tháng / quý / năm; phân bổ chi phí trả trước 242 | Có kết quả kinh doanh từng tháng; điều kiện để lập BCTC |
| **P8a** BCTC | B01 (tình hình tài chính), B02 (kết quả hoạt động) theo TT133 / TT99; xuất Excel | Quyết toán năm 2026 (hạn 31/3/2027) |
| **P6** TSCĐ + CCDC | Thẻ tài sản, khấu hao đường thẳng, phân bổ CCDC, tự sinh PK hằng tháng | Bàn cờ, đồng hồ, máy chiếu của CLB |
| **P10** Phát hành | Bộ cài Windows (Tauri), app Android / iOS (EAS), trang giới thiệu | Đưa đến kế toán và HLV ngoài trình duyệt |

Mỗi đợt một PR, Thầy duyệt "merge" như các đợt trước.

---

## P3b — Thiết kế

### 1. Đọc tệp sao kê (core, thuần TypeScript, có test)

`packages/core/src/money/bank-statement.ts`

**Dò cột:** dùng chung `detectHeader` / `autoMap` của bộ nhập Excel. Tên cột tương đương có cả tiếng Việt lẫn tiếng Anh của các ngân hàng phổ biến (Vietcombank, Techcombank, BIDV, VietinBank, MB, ACB, TPBank, VPBank…):

| Trường | Tên cột tương đương |
|---|---|
| Ngày giao dịch | Ngày giao dịch, Ngày GD, Ngày hiệu lực, Transaction date, Posting date, Value date |
| Số tham chiếu | Số tham chiếu, Mã giao dịch, Số bút toán, Reference, Transaction no |
| Nội dung | Nội dung, Diễn giải, Mô tả, Description, Details, Remark |
| Tiền vào | Ghi có, Số tiền ghi có, Credit, Tiền vào, Phát sinh có |
| Tiền ra | Ghi nợ, Số tiền ghi nợ, Debit, Tiền ra, Phát sinh nợ |
| Số tiền (một cột có dấu) | Số tiền, Amount — dùng khi không có cột vào / ra riêng |
| Số dư | Số dư, Balance |

**Đọc dòng:**
- Ngày dạng `dd/mm/yyyy`, có thể kèm giờ, `yyyy-mm-dd`, hoặc ô ngày của Excel.
- Số tiền kiểu `1.200.000` / `1,200,000` / `(11.000)`.
- Bỏ dòng tổng cộng, số dư đầu / cuối kỳ và dòng trống.
- Trả về danh sách dòng, kỳ (từ – đến), số dư cuối, lỗi theo dòng.

**Khóa chống trùng:** `fingerprint` = ngày + số tham chiếu + số tiền vào / ra + nội dung đã chuẩn hóa. Nhập lại cùng một tệp, hoặc hai tệp chồng kỳ, không tạo dòng trùng.

### 2. CSDL — migration `20261031000017_bank_statements.sql`

**Bảng:**
- **`bank_statements`:** mỗi lần nhập một dòng.
  - TK 112 chi tiết (`account`), tên tệp, kỳ, số dư cuối theo sao kê;
  - số dòng mới / trùng, người nhập.
- **`bank_lines`:** mỗi dòng sao kê.
  - ngày, số tham chiếu, nội dung, tiền vào, tiền ra, số dư;
  - `fingerprint` (duy nhất theo đơn vị + TK);
  - `voucher_id`: chứng từ đã khớp;
  - `ignored`: kế toán bỏ qua;
  - người khớp, thời điểm khớp.
- RLS: `select` cho thành viên; ghi qua hàm (`can_post`).

**Hàm:**
- **`import_bank_statement(p_tenant, p_account, p_meta, p_lines)`:**
  - TK phải là TK chi tiết đầu 112;
  - bỏ dòng trùng `fingerprint`;
  - trả về số dòng mới / trùng.
- **`app.bank_suggest(line)`:** gợi ý khớp, tính lúc đọc nên luôn theo số liệu mới nhất. Thứ tự:
  1. **Chứng từ đã có:** BC (tiền vào) hoặc BN (tiền ra) đã ghi sổ trên đúng TK, cùng số tiền, ngày lệch ≤ 3 ngày, chưa gắn với dòng sao kê nào → *khớp chứng từ có sẵn*. Trường hợp này là kế toán đã lập tay trước.
  2. **Học phí:** nội dung có `HP <mã HV> [số HĐ]`. Chuẩn hóa không dấu, chữ hoa; ngân hàng có thể chèn ký tự khác.
     - Có số hóa đơn: trừ vào đúng phiếu học phí đó.
     - Chỉ có mã học viên: trừ dần các phiếu còn nợ, cũ trước.
     - Đủ tiền: độ tin cậy **chắc chắn**. Thiếu hoặc thừa: **cần xem**; phần thừa ghi Có 131 chưa gắn hóa đơn (trả trước).
  3. **Hóa đơn bán hàng:** nội dung chứa số hóa đơn (vd. `HD0002`, `DV0001`) của hóa đơn bán còn nợ, cùng số tiền → **chắc chắn**.
  4. Không có gợi ý → *chưa khớp*.
- **`rpt_bank_lines(p_tenant, p_account, p_from, p_to, p_status)`:** danh sách dòng, trạng thái (đã khớp / gợi ý / chưa khớp / bỏ qua) và gợi ý.
- **`bank_confirm(p_tenant, p_lines uuid[])`:** áp dụng gợi ý cho các dòng được chọn.
  - Học phí, hóa đơn: lập **BC** Nợ TK 112 của sao kê / Có 131. Mỗi dòng Có trỏ `invoice_id`; ngày = ngày giao dịch; số tham chiếu ghi vào chứng từ gốc. Ghi sổ ngay.
  - Chứng từ có sẵn: chỉ gắn `voucher_id`.
  - Kỳ đã khóa: báo lỗi theo dòng, các dòng khác vẫn chạy.
- **`bank_create_voucher(p_tenant, p_line, p_row)`:** lập BC / BN cho dòng chưa khớp với TK đối ứng do kế toán chọn.
  - Gợi ý sẵn: phí ngân hàng Nợ 6422 (TT133) / 6427 (TT99); lãi tiền gửi Có 515.
  - Có thể chọn đối tượng (khách hàng / NCC → 131 / 331).
- **`bank_link(p_tenant, p_line, p_voucher)`:** gắn dòng với chứng từ chọn tay.
- **`bank_unlink`**, **`bank_ignore`**.
- **`rpt_bank_reconciliation(p_tenant, p_account, p_as_of)`:**
  - số dư sổ TK 112 đến ngày;
  - số dư theo sao kê (số dư của dòng cuối ≤ ngày);
  - chênh lệch;
  - tổng tiền vào / ra trên sao kê chưa khớp;
  - BC / BN trên TK đó chưa gắn dòng sao kê nào (đã ghi sổ nhưng ngân hàng chưa có, hoặc ghi nhầm).
- Xóa chứng từ thì `voucher_id` về null; dòng sao kê quay lại *chưa khớp*.

### 3. API, web

**API:** `importBankStatement`, `bankLines`, `bankConfirm`, `bankCreateVoucher`, `bankLink`, `bankUnlink`, `bankIgnore`, `bankReconciliation`; hook; đồng bộ realtime `bank_lines`.

**Web — *Tiền › Sao kê ngân hàng*** (thay mục *Tài khoản ngân hàng* đang để "sắp có"):
- **Thanh công cụ:** chọn TK 112, kỳ; nút **Nhập sao kê**.
  - Kéo thả tệp xlsx / csv;
  - xem trước số dòng, kỳ, tổng vào / ra, số dư cuối, cột đã nhận;
  - **Nhập**.
- **Thẻ đối chiếu:** số dư sổ, số dư sao kê, chênh lệch; số dòng chưa khớp.
- **Lưới dòng sao kê:** ngày, tham chiếu, nội dung, vào, ra, số dư, trạng thái.
  - Đã khớp: số chứng từ, bấm để mở.
  - Gợi ý: "Thu học phí HV102 · DV0003 — đủ tiền".
- **Thao tác:**
  - **Xác nhận các gợi ý chắc chắn** (cả loạt);
  - từng dòng: **Xác nhận**, **Lập chứng từ** (hộp thoại chọn TK đối ứng, đối tượng, diễn giải), **Gắn chứng từ có sẵn**, **Bỏ qua**, **Bỏ khớp**.
- **Học phí:** dòng *Đã thu qua sao kê* trong nhật ký thu.

**Hỏi AccEdu:** thêm tool `bank_reconciliation` (đối chiếu TK 112 và dòng sao kê chưa khớp), để hỏi được câu như *"Sao kê tháng này còn khoản nào chưa khớp?"*.

### 4. Kiểm thử

- **Core:**
  - đọc sao kê dạng Vietcombank (Ghi nợ / Ghi có, có dòng tiêu đề phía trên);
  - dạng tiếng Anh (Debit / Credit);
  - một cột số tiền có dấu;
  - ngày kèm giờ, ô ngày Excel;
  - bỏ dòng tổng cộng;
  - `fingerprint` ổn định.
- **CSDL:**
  - nhập + chống trùng;
  - gợi ý học phí: có số HĐ / chỉ mã HV / thiếu / thừa tiền;
  - gợi ý hóa đơn bán, gợi ý chứng từ có sẵn;
  - xác nhận lập BC đúng định khoản và trừ đúng hóa đơn;
  - lập BN phí ngân hàng; gắn / bỏ gắn; bỏ qua;
  - kỳ khóa sổ;
  - phân quyền (người xem, HLV);
  - đối chiếu số dư.
- **E2E:**
  1. nhập tệp sao kê giả: tiền học phí HV102, phí quản lý TK, lãi tiền gửi, một khoản lạ;
  2. thấy gợi ý → **Xác nhận** → học phí HV102 hết nợ;
  3. lập BN phí ngân hàng;
  4. bỏ qua khoản lạ;
  5. đối chiếu khớp số dư.

### 5. Tài liệu

`docs/huong-dan/sao-ke-ngan-hang.md`: tải sao kê từ ngân hàng, nhập, xác nhận, đối chiếu cuối tháng; mẹo dặn phụ huynh giữ nguyên nội dung chuyển khoản.

### Ràng buộc

- Chỉ thêm bảng, cột, hàm; migration tương thích ngược.
- Dữ liệu test giả hoàn toàn. Không commit sao kê thật.
- Trước khi push: `pnpm check`, `pnpm db:test`, E2E trên Supabase local.

---

## Kết quả đợt P3b (31/10/2026)

| Hạng mục | Trạng thái | Kiểm chứng |
|---|---|---|
| Core: đọc sao kê Excel / CSV (tiêu đề Việt / Anh, ghi nợ / ghi có hoặc số tiền có dấu, ngày kèm giờ, ô ngày Excel, dòng thông tin phía trên tiêu đề), khóa chống trùng | Xong | `bank-statement.test.ts` (7 test) |
| Migration 0017: `bank_statements`, `bank_lines`, gợi ý khớp, xác nhận lập BC, lập BC / BN TK đối ứng tự chọn, gắn / bỏ khớp / bỏ qua, xóa lần nhập, đối chiếu số dư | Xong | `bank.test.ts` (9 test) |
| Web: *Tiền › Sao kê ngân hàng & đối chiếu* | Xong | E2E 17/17 (kịch bản mới: nhập CSV, xác nhận học phí HV102, BN phí 6422, BC lãi 515, bỏ qua khoản lạ, đối chiếu) |
| Hỏi AccEdu: tool `bank_reconciliation` | Xong | `ai-agent.test.ts` (+1 test) |

**Lỗi tìm ra khi chạy E2E (đã sửa ở core, dùng chung mọi chức năng nhập CSV):**
- Đoán dấu phân cách sai khi tệp có dòng tên báo cáo / số tài khoản phía trên tiêu đề (dòng đó không có dấu phân cách). Nay chọn dấu xuất hiện cùng số lần trên nhiều dòng nhất.
- Dò tiêu đề 2 tầng ghép nhầm dòng ghi chú phía trên. Nay chỉ ghép khi nhận thêm được cột so với dòng dưới đứng một mình.

**Khác kế hoạch:**
- Gợi ý khớp tính lúc đọc (không lưu), nên luôn theo số liệu mới nhất.
- Thêm *Xóa lần nhập sao kê* để gỡ tệp nhập nhầm.
- Chứng từ lập từ sao kê có `source = import`, chứng từ gốc "Sao kê <TK> · <số tham chiếu>".

Tổng số test: core 139, api 3, CSDL 138 (+9 sao kê, +1 tool AI), E2E 17.
