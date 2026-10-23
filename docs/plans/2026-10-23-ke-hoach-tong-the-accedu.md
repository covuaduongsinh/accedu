# Kế hoạch AccEdu: phần mềm kế toán đám mây cho web, desktop và mobile, mô phỏng Fast Accounting Online

## 1. Bối cảnh

Hiện Dương Sinh đang dùng **Fast Accounting Online (FAO)** tại `https://e6.faonline.vn/DUONGSINH`. Đây là phần mềm kế toán đám mây của công ty FAST, gồm phân hệ Hệ thống và 9 phân hệ nghiệp vụ: Tổng hợp, Tiền, Bán hàng, Mua hàng, Tồn kho, Tài sản cố định (TSCĐ), Công cụ dụng cụ (CCDC), Giá thành, Thuế/Báo cáo tài chính (BCTC).

Thầy muốn tự xây một ứng dụng tương đương trong repo `accedu` (hiện còn trống, chỉ có LICENSE), với các yêu cầu sau:
- Chạy trên 3 nền tảng web, desktop, mobile, dữ liệu đồng bộ giữa các nền tảng, dùng công nghệ mới.
- Dùng REA (`covuaduongsinh/rea`, bản fork của `rea-agents` v6.7.0, một MCP/CLI để reverse-engineer ứng dụng) để khảo sát FAO.

Các lựa chọn Thầy đã chốt:
- Mục tiêu: dùng **nội bộ trước, bán SaaS sau**. Kiến trúc nhiều doanh nghiệp (multi-tenant) ngay từ đầu.
- Hạ tầng: **Supabase + Vercel**.
- Khảo sát: **mở mạng cho container** để tôi tự chạy REA.
- Phạm vi: **đầy đủ nhất có thể**, gồm Lõi kế toán, Mua–Bán–Công nợ, Kho–TSCĐ–CCDC, BCTC & Thuế.

Cơ sở pháp lý về chế độ kế toán:
- **Thông tư 99/2025/TT-BTC** thay thế TT200, hiệu lực từ 01/01/2026.
- **Thông tư 133/2016** cho doanh nghiệp nhỏ và vừa.
- Hệ thống cho phép mỗi đơn vị chọn một trong hai chế độ. Danh mục tài khoản và mẫu biểu sẽ được đối chiếu với Phụ lục gốc khi làm.

## 2. Những gì REA làm được (đã đọc repo)

**Bước khảo sát FAO.** Công cụ chính là `capture_browser_scenario`, chạy trình duyệt bằng Playwright:
- Đăng nhập bằng secret lấy từ biến môi trường `{"source":"secret"}`. Mật khẩu không bao giờ nằm trong file.
- Chụp DOM, cây accessibility, screenshot và network (cả body).
- Cấu hình `locale: vi-VN`, `timezone: Asia/Ho_Chi_Minh`.
- Tài liệu: `docs/browser-scenario-contract.md`, ví dụ đăng nhập ở `docs/agent-environments.md:57-110`.

**Bước phân tích offline:**
- `inspect_analysis_view`: lấy kho API (`api-surface`) và mô hình thực thể (`environment-manifest`, `environment-state`).
- `export_web_scripts`, sau đó `analyze_javascript_application` và `trace_application_feature`: lần theo logic từng màn hình.
- `compare_web_captures`: kiểm tra độ tương đương giao diện/chức năng giữa FAO và AccEdu.

**Giới hạn (theo `DISCLAIMER.md`):**
- Chỉ dùng tài khoản của chính Dương Sinh, chỉ **đọc** (không bấm Lưu/Xóa/Ghi sổ).
- Kết quả chỉ dùng làm **đặc tả chức năng**. Mã, logo và nội dung của FAST không được sao chép; AccEdu được xây theo hướng clean-room.
- Capture thô có thể chứa token phiên trong response body, nên **không bao giờ commit**.

## 3. Kiến trúc và công nghệ

Phiên bản lấy từ npm ngày 23/10/2026. Khi scaffold sẽ pin chính xác.

| Lớp | Công nghệ | Lý do |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo 2.11, TypeScript strict; oxlint/oxfmt, Vitest, husky giống `rea` | Một repo, chia sẻ code cho cả 3 app |
| Web | Vite 8 + React 19.3 + TanStack Router/Query + Tailwind 4.3 + shadcn/ui + AG Grid Community 36 (lưới nhập chứng từ bằng bàn phím như FAO) | ERP sau đăng nhập không cần SSR; build tĩnh dùng lại được cho desktop |
| Desktop | Tauri 2.12 bọc bản build web; có in ấn native, lưu file XML/Excel, auto-update, bộ cài MSI/NSIS cho Windows | Nhẹ hơn Electron khoảng 10 lần; dùng chung 100% UI web |
| Mobile | Expo SDK 58 + Expo Router + NativeWind; camera quét QR hóa đơn; push duyệt chứng từ | Trải nghiệm native, build bằng EAS, cập nhật OTA |
| Backend | Supabase: Postgres + Auth + RLS theo `tenant_id` + Realtime + Storage + Edge Functions | Một nguồn dữ liệu cho cả 3 nền tảng |
| Đồng bộ | Realtime (`postgres_changes`) làm mới cache TanStack Query trên mọi thiết bị; cache được lưu bền; outbox cho chứng từ nháp khi offline. Ghi sổ luôn do server quyết định | Dữ liệu kế toán phải nhất quán tuyệt đối |
| Lõi nghiệp vụ | Hàm PL/pgSQL `post_voucher()` chạy trong transaction, ràng buộc tổng Nợ = tổng Có; báo cáo viết bằng hàm SQL (RPC) | Một logic dùng chung cho mọi client, chạy nhanh |
| Hosting | Web trên Vercel; desktop qua GitHub Releases; mobile qua EAS | |
| AI (giai đoạn sau) | Claude API qua Edge Function: đọc hóa đơn PDF/ảnh thành chứng từ nháp, gợi ý định khoản, hỏi đáp báo cáo | |

Nhận diện thương hiệu Dương Sinh (navy `#2B3990` + gold, font Roboto) được đặt trong `packages/ui-tokens`, dùng chung cho Tailwind (web) và NativeWind (mobile).

## 4. Cấu trúc repo

```
accedu/
  CLAUDE.md                 quy ước: plans ở docs/plans, tiếng Việt, nhận diện thương hiệu
  apps/web/                 Vite SPA, route /:tenantSlug/... (giống /DUONGSINH của FAO)
  apps/desktop/src-tauri/   vỏ Tauri, nạp apps/web/dist
  apps/mobile/              Expo Router
  packages/core/            kiểu dữ liệu, zod schema, quy tắc kế toán, đọc số thành chữ, VAT, làm tròn
  packages/api/             tạo supabase client, query/mutation có kiểu, hook TanStack, đồng bộ realtime
  packages/ui-tokens/       màu, font, preset Tailwind và NativeWind
  packages/i18n/            vi (mặc định), en
  packages/reports/         bảng ánh xạ chỉ tiêu BCTC (B01/B02/B03) và tờ khai 01/GTGT
  supabase/                 config.toml, migrations/, seed/ (hệ thống tài khoản TT99 và TT133),
                            functions/ (einvoice, xml-export, ai-ocr), tests/ (pgTAP)
  docs/plans/  docs/research/fao/  docs/adr/
  .github/workflows/        ci.yml, desktop-release.yml, mobile-eas.yml
```

## 5. Mô hình dữ liệu cốt lõi (Supabase)

**Hệ thống:**
- `tenants` (gồm cài đặt chế độ TT99/TT133, phương pháp tính giá kho, phương pháp VAT), `branches`, `memberships`.
- `roles` và `role_permissions` theo chức năng × quyền xem/thêm/sửa/xóa/in, giống mục "Phân quyền truy cập" của FAO.
- `fiscal_years`, `periods` (khóa sổ), `number_sequences` (quyển chứng từ), `audit_log` (ghi bằng trigger).

**Danh mục:**
- Tài khoản có cờ theo dõi công nợ/vật tư/ngoại tệ.
- Đối tượng (khách hàng/nhà cung cấp/nhân viên).
- Vật tư hàng hóa dịch vụ, kho, đơn vị tính, bộ phận, vụ việc/dự án (cũng dùng làm lớp học).
- Khoản mục phí, ngoại tệ/tỷ giá, tài khoản ngân hàng, thuế suất, TSCĐ, CCDC, mã lưu chuyển tiền tệ.

**Chứng từ:**
- Dùng chung `vouchers` (header) và `voucher_lines` (hạch toán, số lượng/đơn giá, kho, vụ việc), cộng `voucher_vat` (tab thuế: số/ký hiệu hóa đơn, mã số thuế, thuế suất).
- Các loại chứng từ: PT, PC, BC, BN, HĐ bán, PN mua, PX, chuyển kho, phiếu kế toán, khấu hao, phân bổ…
- Trạng thái: nháp → đã ghi sổ → hủy. Muốn sửa chứng từ đã ghi sổ phải bỏ ghi, và không được làm khi kỳ đã khóa.

**Sổ (sinh ra khi ghi sổ):** `gl_entries`, `arap_entries` + `settlements` (phân bổ thanh toán), `stock_ledger`, `vat_ledger`, `asset_ledger`, cùng các bảng số dư đầu kỳ.

**Báo cáo (RPC):**
- Nhật ký chung, sổ cái, sổ chi tiết, sổ quỹ/sổ tiền gửi, bảng cân đối phát sinh.
- Công nợ (tổng hợp, chi tiết, tuổi nợ), nhập–xuất–tồn, thẻ kho, khấu hao.
- BCTC theo TT99/TT133, bảng kê mua vào/bán ra, tờ khai 01/GTGT xuất XML cho HTKK/eTax.

## 6. Lộ trình

Web được làm đầy đủ ở mọi phase. Desktop tự có nhờ dùng chung bản build web. Mobile làm phần phù hợp với điện thoại: dashboard, duyệt chứng từ, thu/chi nhanh, tra cứu, quét hóa đơn. Thời gian dưới đây là ước tính.

| Phase | Nội dung | Ước tính |
|---|---|---|
| **P0** Khảo sát FAO bằng REA | Cây menu, danh sách màn hình/trường/cột/nút, danh sách báo cáo và tham số, kho API, phân tích khoảng cách (gap analysis), lưu ở `docs/research/fao/` | 1 tuần |
| **P1** Nền tảng | Monorepo, CI; 3 app chạy được với đăng nhập, chọn đơn vị, đổi tenant; design system; RLS; demo realtime giữa 3 app | 2 tuần |
| **P2** Hệ thống + Tổng hợp | Danh mục, hệ thống tài khoản TT99/TT133, số dư đầu kỳ, phiếu kế toán, engine ghi sổ, khóa sổ, nhật ký chung, sổ cái, bảng cân đối phát sinh | 3 tuần |
| **P3** Tiền | PT/PC/BC/BN, sổ quỹ, sổ tiền gửi, mã VietQR, import sao kê để đối chiếu | 2 tuần |
| **P4** Bán hàng / Mua hàng / Công nợ | Hóa đơn, phân bổ thanh toán, tuổi nợ, bảng kê thuế, import XML hóa đơn đầu vào | 4 tuần |
| **P5** Tồn kho | Nhập/xuất/chuyển kho, giá vốn bình quân (tức thời và cuối kỳ), nhập–xuất–tồn, thẻ kho | 3 tuần |
| **P6** TSCĐ + CCDC | Tăng/giảm tài sản, khấu hao đường thẳng, phân bổ CCDC, tự sinh chứng từ | 2 tuần |
| **P7** Giá thành + Cuối kỳ | Giá thành theo vụ việc/sản phẩm, kết chuyển 911, chênh lệch tỷ giá | 3 tuần |
| **P8** BCTC + Thuế + Hóa đơn điện tử | Mẫu biểu B01–B03 và thuyết minh, 01/GTGT XML, adapter nhà cung cấp hóa đơn điện tử | 4 tuần |
| **P9** Riêng cho Dương Sinh + AI | Học phí, lớp (vụ việc), lương HLV, doanh thu nhận trước 3387; AI đọc hóa đơn và hỏi đáp | 3 tuần |
| **P10** Phát hành | Bộ cài Windows/mac, CH Play/App Store, chuyển dữ liệu từ FAO (Excel), sẵn sàng SaaS (đăng ký, gói cước) | 3 tuần |

## 7. Phần thực thi ngay sau khi Thầy duyệt

Làm trên nhánh `claude/beautiful-pascal-y8xgxa`, commit và push sau mỗi mốc, không tạo PR khi Thầy chưa yêu cầu.

1. **Tài liệu:** tạo `docs/plans/2026-10-23-ke-hoach-tong-the-accedu.md` (nội dung kế hoạch này), `docs/plans/P0-khao-sat-fao.md`, `CLAUDE.md`. Commit.
2. **P0, khi container đã mở mạng:**
   - Kiểm tra bằng `curl -sI https://e6.faonline.vn/DUONGSINH`.
   - Chạy `npx -y rea-agents@6.7.0 capture-browser-scenario` với Chromium tại `/opt/pw-browsers`, mật khẩu lấy từ biến môi trường `FAO_PASSWORD` lúc chạy.
   - Đi lần lượt từng phân hệ, chỉ mở danh sách, form ở chế độ xem và báo cáo.
   - Capture thô để ở scratchpad (trong `.gitignore`). Chỉ commit đặc tả dạng text đã bỏ hết số liệu và tên đối tượng thật.
   - Nếu mạng chưa mở thì làm P1 trước rồi quay lại.
3. **P1:** scaffold monorepo và 3 app, migration hệ thống/RLS, design tokens, CI.
   - Database chạy local bằng `supabase start` (Docker có sẵn).
   - Nếu không kéo được image thì dùng Postgres 16 local, kèm stub cho schema `auth`.
4. **P2:** danh mục, ghi sổ, báo cáo tổng hợp. Làm tới đâu commit tới đó, rồi báo tiến độ.

**Cần Thầy xác nhận trước khi tôi tạo tài nguyên cloud:**
- Project Supabase `accedu-dev` (gói free, vùng Singapore).
- Project Vercel.
- Tài khoản Expo/EAS.

## 8. Việc Thầy cần làm

1. Vào cài đặt môi trường: Network access → Allowed domains, thêm `faonline.vn`, `e6.faonline.vn`, `help.faonline.vn` (giữ tick "Allow package managers"). Hướng dẫn: https://code.claude.com/docs/en/cloud-environments#network-access. Có thể phải mở session mới thì cài đặt mới có hiệu lực.
2. Mật khẩu FAO chỉ được dùng qua biến môi trường lúc chạy, không ghi vào file hay commit. Thầy nên **đổi mật khẩu sau khi khảo sát xong**, vì mật khẩu đã xuất hiện trong khung chat.
3. Kiểm tra điều khoản sử dụng FAO. Dương Sinh là khách hàng có tài khoản hợp lệ, và việc khảo sát chỉ đọc giao diện của chính mình.

## 9. Cách kiểm chứng

- `pnpm turbo lint typecheck test`:
  - `packages/core` dùng Vitest + fast-check, với các bất biến: đọc số thành chữ, làm tròn, VAT.
  - SQL dùng pgTAP qua `supabase test db`, với các bất biến: tổng Nợ = tổng Có, bảng cân đối phát sinh cân, kỳ đã khóa thì không ghi được, RLS chặn được dữ liệu của tenant khác.
- **E2E web (Playwright, Chromium có sẵn):** đăng nhập → chọn đơn vị → lập phiếu thu → ghi sổ → sổ quỹ và bảng cân đối phát sinh hiện bút toán; chụp screenshot.
- **Đồng bộ:** mở 2 context trình duyệt (đóng vai web và desktop), tạo chứng từ ở bên này thì bên kia thấy trong vòng 2 giây.
- **Desktop:** `cargo check` cho `src-tauri`; CI chạy runner `windows-latest` để build MSI.
- **Mobile:** `expo export` + test bằng jest; Thầy chạy thử trên điện thoại bằng Expo Go.
- **Đối chiếu với FAO:** dùng `compare_web_captures` của REA giữa FAO và AccEdu trên cùng màn hình. Bộ dữ liệu mẫu 1 tháng phải cho bảng cân đối phát sinh và BCTC khớp với số FAO xuất ra.
