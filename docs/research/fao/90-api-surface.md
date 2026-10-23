# FAO — Bề mặt API quan sát được

> Tổng hợp từ 12 kịch bản REA (23/10/2026). Đường dẫn đã template hóa, **không có token, cookie, dữ liệu**.
> Ghi chú: view `api-surface` của REA vượt ngân sách bộ nhớ với capture > 10 MB (lỗi `resource_constraint`), nên bảng dưới được tổng hợp trực tiếp từ sự kiện network của Evidence.

| Phương thức | Đường dẫn | Vai trò |
|---|---|---|
| GET | `/{tenant}/Main/Login.aspx` | Trang đăng nhập |
| POST | `/{tenant}/Main/Login.aspx/GetEntityData` | Danh sách công ty (data) |
| POST | `/{tenant}/Main/Login.aspx/GetUnitData` `{u}` | Đơn vị cơ sở của người dùng |
| POST | `/{tenant}/Main/Login.aspx/GetSticky` | Thông báo/ghi chú trang đăng nhập |
| POST | `/{tenant}/Main/Login.aspx/Refresh`, `/Challenge` | Làm mới phiên + mã thử thách chống bot |
| POST | `/{tenant}/Main/Login.aspx/Login` | Đăng nhập (user, password, data, unit, language, value, force, storage, layoutIndex) → `"Duplicate"` khi đang có phiên |
| GET | `/{tenant}/Main/Main.aspx` | Khung chính + menu |
| GET | `/{tenant}/Main/{page}.aspx?id={mã chức năng}` | Mỗi chức năng một trang |
| POST | `/AppService/FastBusiness.MenuExtenderService.asmx/GetMenuItem` `{type:0}` | **Cây menu đầy đủ theo quyền** (CommandIndex, ParentIndex, CommandName, HeaderText, Disabled) |
| POST | `/AppService/FastBusiness.MenuExtenderService.asmx/Logout` | Đăng xuất |
| POST | `/AppService/FastBusiness.ReportExtenderService.asmx/GetGridViewPage` | Lưới: **metadata cột + trang dữ liệu** (`controller`, `count`, phân trang theo khóa `firstPageItem/lastPageItem`, `memvars`, `externalKey` cho lưới con) |
| POST | `/AppService/FastBusiness.ReportExtenderService.asmx/GetDirViewPage` | Form: **metadata trường + tab** (`action`: New/Edit/View, `searchMode` cho hộp lọc báo cáo) |
| POST | `/AppService/FastBusiness.ReportExtenderService.asmx/GetDirResponse` | Phản hồi tương tác form (giá trị phụ thuộc, mặc định) |
| POST | `/AppService/FastBusiness.QueryExtenderService.asmx/DisposeQueryViewPage` | Giải phóng truy vấn phía server khi rời trang |
| POST | `/FastBusiness.DataService.asmx/GetCompletionList` | Gợi ý (autocomplete) mã danh mục khi gõ |
| POST | `/AppService/Dashboard.asmx/GetDashboardViewPage` | Màn hình tổng quan |

## Controller (định danh nghiệp vụ) đã thấy

- **Chứng từ:** `CRTran/CRDetail` (phiếu thu), `CPTran/CPDetail/CPTax/CPDeductible/CPCharge` (phiếu chi), `CBTran/CBDetail/CBCharge` (báo có), `CDTran/CDDetail/CDTax/CDDeductible` (báo nợ), `GLTran/GLDetail/GLTax` (phiếu kế toán), `SVTran/SVDetail` (hóa đơn bán hàng), `ARTran/ARDetail` (hóa đơn dịch vụ), `PVTran/PVDetail/PVTax/PVCharge` (mua hàng trong nước), `APTran/APDetail/APTax` (mua dịch vụ), `IRTran/IRDetail` (nhập kho), `ISTran/ISDetail` (xuất kho), `ITTran/ITDetail` (điều chuyển), `FATran/FADetail/FADocument/FAAttached` (TSCĐ), `TSTran/TSDetail/TSDocument/TSAttached` (CCDC).
- **Danh mục:** `Account`, `Customer`, `Item`, `Site` (kho), `Job` (vụ việc), `BankAccount`, `Contract`, `ValueAddedTax`, `VoucherBook`, `Unit`, `User`, `AllowRight`, `Options`, `LockedDate`.
- **Báo cáo:** `rptTrialBalance` (CĐPS), `rptBalanceSheet` (BC tình hình tài chính), `rptIncomeStatement` (KQKD), `rptGeneralJournal` (NKC), `rptCashBook` (sổ quỹ), `rptVATDeclaration` (tờ khai GTGT), `rptInputVATList` (bảng kê mua vào), `rptDCCustomer` (sổ chi tiết công nợ), `rptStockSummary` (NXT), `rptFADepreciation` (khấu hao).

## Bài học thiết kế cho AccEdu

- Một **endpoint metadata chung** cho form/lưới giúp FAO có 600 chức năng với ít mã client → AccEdu áp dụng ý tưởng ở dạng **schema TypeScript tĩnh** (type-safe, không phải tải metadata mỗi lần), dữ liệu qua Supabase PostgREST/RPC.
- Phân trang theo khóa (keyset) thay vì offset → AccEdu dùng keyset pagination trên `(ngay_ct, so_ct, id)`.
