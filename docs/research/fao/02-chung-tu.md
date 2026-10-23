# FAO — Màn hình chứng từ

> Định nghĩa form nhập chứng từ (phần đầu, các tab, lưới chi tiết) lấy từ metadata `GetDirViewPage` (action New) và `GetGridViewPage` (controller chi tiết).
>
> Nguồn: REA `capture-browser-scenario`, tài khoản ADMIN, chỉ đọc, 23/10/2026. Chỉ ghi cấu trúc; không có số liệu/đối tượng thật.

### Phiếu thu tiền mặt

*Menu:* Tiền › Phiếu thu tiền mặt — trang `cactpt1`

**Cột danh sách:** Đơn vị, Ngày, Số, Mã khách, Tên khách, Tiền, Mã nt, Diễn giải

**Form nhập liệu** (phiếu thu; tab: Chi tiết, Thanh toán, Chứng từ gốc)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã khách | `ma_kh` | chuỗi(16) | tra cứu: Customer |
| — | `ten_kh` | chuỗi | chỉ đọc |
| Địa chỉ | `dia_chi` | chuỗi(256) |  |
| Người nộp tiền | `ong_ba` | chuỗi(128) |  |
| Lý do nộp | `dien_giai` | chuỗi(480) |  |
| Tài khoản nợ | `tk` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk` | chuỗi | chỉ đọc |
| Loại phiếu thu | `loai_ct` | chuỗi(2) | tra cứu: TransactionType, mặc định: 2 |
| — | `ten_loai_ct` | chuỗi | chỉ đọc |
| Số phiếu thu | `so_ct` | chuỗi(12) |  |
| Ngày lập | `ngay_lct` | ngày |  |
| Ngày hạch toán | `ngay_ct` | ngày |  |
| — | `ma_nk` | chuỗi(8) | tra cứu: VoucherBook |
| — | `ten_tt` | chuỗi | chỉ đọc |
| Mã nt | `ma_nt` | chuỗi(3) | tra cứu: Currency |
| — | `ten_nt` | chuỗi | chỉ đọc |
| Tỷ giá | `ty_gia` | số | mặc định: 1 |
| Trạng thái | `status` | chuỗi | chọn: 0=0. Lập chứng từ; 1=1. Chuyển KTTH; 2=2. Chuyển sổ cái |

*Chi tiết*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Chi tiết | `d41` | chuỗi | chọn: ForeignKey=String: stt_rec, stt_rec |

*Thanh toán*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Số chứng từ | `so_ct0` | chuỗi(12) |  |
| Ngày chứng từ | `ngay_ct0` | ngày |  |
| Mã thanh toán | `ma_tt` | chuỗi(2) | tra cứu: Term |

*Chứng từ gốc*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Kèm theo | `so_ct_goc` | số |  |
| Chứng từ gốc | `dien_giai_ct_goc` | chuỗi(128) |  |

*Phần chân/tổng*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Theo dõi thanh toán | `hd_yn` | có/không |  |
| Sửa tỷ giá ghi sổ | `sua_tg_yn` | có/không |  |
| Tiền | `t_tien_nt` | số |  |
| Tiền | `t_tien` | số |  |

*Lưới chi tiết `CRDetail`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tk có | `tk_co` | chuỗi(16) | tra cứu: Account |
| Tên tài khoản | `ten_tk` | chuỗi | chỉ đọc |
| Số hóa đơn | `so_hd` | chuỗi(12) | tra cứu: CRInvoiceLookup |
| Ngày hóa đơn | `ngay_hd` | ngày | chỉ đọc |
| Tiền trên hóa đơn | `tien_hd_nt` | số | chỉ đọc |
| Đã thanh toán | `da_tt_nt` | số | chỉ đọc |
| Còn phải thanh toán | `cl_nt` | số | chỉ đọc |
| Ngoại tệ | `ma_nt_i` | chuỗi | chỉ đọc |
| Thanh toán quy đổi | `tt_qd` | số |  |
| Mã khách | `ma_kh_i` | chuỗi(16) | tra cứu: Customer |
| Tên khách hàng | `ten_kh_i` | chuỗi | chỉ đọc |
| Diễn giải | `dien_giai` | chuỗi(480) |  |
| Tiền nt | `tien_nt` | số |  |
| Tỷ giá gs | `ty_gia_ht2` | số |  |
| Tiền | `tien` | số |  |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |

### Phiếu chi tiền mặt

*Menu:* Tiền › Phiếu chi tiền mặt — trang `cactpc1`

**Cột danh sách:** Đơn vị, Ngày, Số, Mã khách, Tên khách, Tiền, Mã nt, Diễn giải

**Form nhập liệu** (phiếu chi; tab: Chi tiết, Thuế, Thanh toán, Khấu trừ thuế, Chứng từ gốc)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã khách | `ma_kh` | chuỗi(16) | tra cứu: Customer |
| — | `ten_kh` | chuỗi | chỉ đọc |
| Địa chỉ | `dia_chi` | chuỗi(256) |  |
| Người nhận tiền | `ong_ba` | chuỗi(128) |  |
| Lý do chi | `dien_giai` | chuỗi(480) |  |
| Tài khoản có | `tk` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk` | chuỗi | chỉ đọc |
| Loại phiếu chi | `loai_ct` | chuỗi(2) | tra cứu: TransactionType, mặc định: 2 |
| — | `ten_loai` | chuỗi | chỉ đọc |
| — | `ma_nk` | chuỗi(8) | tra cứu: VoucherBook |
| Số phiếu chi | `so_ct` | chuỗi(12) |  |
| Ngày lập | `ngay_lct` | ngày |  |
| Ngày hạch toán | `ngay_ct` | ngày |  |
| Mã nt | `ma_nt` | chuỗi(3) | tra cứu: Currency |
| — | `ten_nt` | chuỗi | chỉ đọc |
| TGGD | `ty_gia` | số | mặc định: 1 |
| Tỷ giá gs | `ty_gia_ht` | số | mặc định: 1 |
| Trạng thái | `status` | chuỗi | chọn: 0=0. Lập chứng từ; 1=1. Chuyển KTTH; 2=2. Chuyển sổ cái |

*Chi tiết*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Chi tiết | `d51` | chuỗi | tra cứu: CDDetail, chọn: ForeignKey=String: stt_rec, stt_rec |

*Thuế*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Thuế | `r30` | chuỗi | tra cứu: CDTax, chọn: ForeignKey=String: stt_rec, stt_rec |

*Thanh toán*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã thanh toán | `ma_tt` | chuỗi(2) | tra cứu: Term |
| — | `ten_tt` | chuỗi | chỉ đọc |
| Số chứng từ | `so_ct0` | chuỗi(12) |  |
| Ngày chứng từ | `ngay_ct0` | ngày |  |

*Khấu trừ thuế*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Khấu trừ thuế | `k51` | chuỗi | tra cứu: CDDeductible, chọn: ForeignKey=String: stt_rec, stt_rec |

*Chứng từ gốc*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Kèm theo | `so_ct_goc` | số |  |
| Chứng từ gốc | `dien_giai_ct_goc` | chuỗi(128) |  |

*Phần chân/tổng*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Theo dõi thanh toán | `hd_yn` | có/không |  |
| Sửa tỷ giá ghi sổ | `sua_tg_yn` | có/không |  |
| Tiền nt | `t_tien_nt` | số |  |
| Tiền | `t_tien` | số |  |
| Tiền thuế | `t_thue` | số |  |
| Tiền thuế nt | `t_thue_nt` | số |  |
| Tổng thanh toán | `t_tt` | số |  |
| Tổng thanh toán nt | `t_tt_nt` | số |  |

*Lưới chi tiết `CDDetail`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tk nợ | `tk_no` | chuỗi(16) | tra cứu: Account |
| Tên tài khoản | `ten_tk_no` | chuỗi | chỉ đọc |
| Số hóa đơn | `so_hd` | chuỗi(12) | tra cứu: CDInvoiceLookup |
| Ngày hóa đơn | `ngay_hd` | ngày | chỉ đọc |
| Tiền trên hóa đơn | `tien_hd_nt` | số | chỉ đọc |
| Đã thanh toán | `da_tt_nt` | số | chỉ đọc |
| Còn phải thanh toán | `cl_nt` | số | chỉ đọc |
| Ngoại tệ | `ma_nt_i` | chuỗi | chỉ đọc |
| Thanh toán quy đổi | `tt_qd` | số |  |
| Mã khách | `ma_kh_i` | chuỗi(16) | tra cứu: Customer |
| Tên khách hàng | `ten_kh_i` | chuỗi | chỉ đọc |
| Diễn giải | `dien_giai` | chuỗi(480) |  |
| Tiền nt | `tien_nt` | số |  |
| Hóa đơn | `loai_hd` | chuỗi(1) | tra cứu: InvoiceTypeTax |
| Mã thuế | `ma_thue` | chuỗi(8) | tra cứu: Tax |
| Thuế suất | `thue_suat` | số | chỉ đọc |
| Tk thuế | `tk_thue` | chuỗi(16) | tra cứu: Account |
| Thuế nt | `thue_nt` | số |  |
| Thuế | `thue` | số |  |
| Thanh toán nt | `tt_nt` | số | chỉ đọc |
| Thanh toán | `tt` | số | chỉ đọc |
| Mẫu báo cáo | `mau_bc` | chuỗi(3) | tra cứu: VATForm, mặc định: '3' |
| Mã tính chất | `ma_tc` | chuỗi(16) | tra cứu: TaxType |
| Mẫu hóa đơn | `ma_mau_ct` | chuỗi(16) | tra cứu: VoucherTemplate |
| Số hóa đơn | `so_ct0` | chuỗi(12) |  |
| Ký hiệu | `so_seri0` | chuỗi(12) |  |
| Ngày hóa đơn | `ngay_ct0` | ngày |  |
| Mã ncc | `ma_kh` | chuỗi(16) | tra cứu: Customer |
| Tên nhà cung cấp | `ten_kh` | chuỗi(128) |  |
| Địa chỉ | `dia_chi` | chuỗi(256) |  |
| Mã số thuế | `ma_so_thue` | chuỗi(18) |  |
| Điện thoại | `dien_thoai` | chuỗi(32) |  |
| Tên hàng hóa - dịch vụ | `ten_vt` | chuỗi(480) |  |
| Cục thuế | `ma_kh2` | chuỗi(16) | tra cứu: Customer |
| Ghi chú | `ghi_chu` | chuỗi(128) |  |
| Tỷ giá gs | `ty_gia_ht2` | số | mặc định: 1 |
| Tiền | `tien` | số |  |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |

*Lưới chi tiết `CDTax`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mẫu báo cáo | `mau_bc` | chuỗi(3) | tra cứu: VATForm, mặc định: '3' |
| Mã tính chất | `ma_tc` | chuỗi(16) | tra cứu: TaxType |
| Mẫu hóa đơn | `ma_mau_ct` | chuỗi(16) | tra cứu: VoucherTemplate |
| Số hóa đơn | `so_ct0` | chuỗi(12) |  |
| Ký hiệu | `so_seri0` | chuỗi(12) |  |
| Ngày hóa đơn | `ngay_ct0` | ngày |  |
| Mã ncc | `ma_kh` | chuỗi(16) | tra cứu: Supplier |
| Tên nhà cung cấp | `ten_kh` | chuỗi(128) |  |
| Địa chỉ | `dia_chi` | chuỗi(256) |  |
| Mã số thuế | `ma_so_thue` | chuỗi(18) |  |
| Điện thoại | `dien_thoai` | chuỗi(32) |  |
| Tên hàng hóa - dịch vụ | `ten_vt` | chuỗi(480) |  |
| Mã kho | `ma_kho` | chuỗi(16) | tra cứu: Site |
| Tiền hàng nt | `t_tien_nt` | số |  |
| Tiền hàng | `t_tien` | số |  |
| Mã thuế | `ma_thue` | chuỗi(8) | tra cứu: Tax |
| Thuế suất | `thue_suat` | số | chỉ đọc |
| Tk thuế | `tk_thue_no` | chuỗi(16) | tra cứu: Account |
| Thuế nt | `t_thue_nt` | số |  |
| Thuế | `t_thue` | số |  |
| Cục thuế | `ma_kh2` | chuỗi(16) | tra cứu: Customer |
| Loại kê khai | `loai_kk` | chuỗi(1) | tra cứu: DeclarationTypelist, mặc định: 1 |
| Mã thanh toán | `ma_tt` | chuỗi(2) | tra cứu: Term |
| Ghi chú | `ghi_chu` | chuỗi(128) |  |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |

*Lưới chi tiết `CDDeductible`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tài khoản | `tk` | chuỗi(16) | tra cứu: Account |
| Tên tài khoản | `ten_tk` | chuỗi | chỉ đọc |
| Mã khách | `ma_kh` | chuỗi(16) | tra cứu: Customer |
| Tên khách | `ten_kh` | chuỗi | chỉ đọc |
| Phát sinh nợ nt | `ps_no_nt` | số |  |
| Phát sinh có nt | `ps_co_nt` | số |  |
| Diễn giải | `dien_giai` | chuỗi(480) |  |
| Phát sinh nợ | `ps_no` | số |  |
| Phát sinh có | `ps_co` | số |  |
| Nhóm định khoản | `nh_dk` | chuỗi(3) | mặc định: '1' |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |

### Giấy báo có

*Menu:* Tiền › Giấy báo có — trang `cactbc1`

**Cột danh sách:** Đơn vị, Ngày, Số, Mã khách, Tên khách, Tiền, Mã nt, Diễn giải

**Form nhập liệu** (giấy báo có; tab: Chi tiết, Thanh toán, Phí ngân hàng, Chứng từ gốc)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã khách | `ma_kh` | chuỗi(16) | tra cứu: Customer |
| — | `ten_kh` | chuỗi | chỉ đọc |
| Địa chỉ | `dia_chi` | chuỗi(256) |  |
| Người nộp tiền | `ong_ba` | chuỗi(128) |  |
| Lý do nộp | `dien_giai` | chuỗi(480) |  |
| Tài khoản nợ | `tk` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk` | chuỗi | chỉ đọc |
| Loại phiếu thu | `loai_ct` | chuỗi(2) | tra cứu: TransactionType, mặc định: 2 |
| — | `ten_loai_ct` | chuỗi | chỉ đọc |
| Số phiếu thu | `so_ct` | chuỗi(12) |  |
| Ngày lập | `ngay_lct` | ngày |  |
| Ngày hạch toán | `ngay_ct` | ngày |  |
| — | `ma_nk` | chuỗi(8) | tra cứu: VoucherBook |
| Mã nt | `ma_nt` | chuỗi(3) | tra cứu: Currency |
| — | `ten_nt` | chuỗi | chỉ đọc |
| Tỷ giá | `ty_gia` | số | mặc định: 1 |
| Trạng thái | `status` | chuỗi | chọn: 0=0. Lập chứng từ; 1=1. Chuyển KTTH; 2=2. Chuyển sổ cái |

*Chi tiết*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Chi tiết | `d46` | chuỗi | tra cứu: CBDetail, chọn: ForeignKey=String: stt_rec, stt_rec |

*Thanh toán*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Số chứng từ | `so_ct0` | chuỗi(12) |  |
| Ngày chứng từ | `ngay_ct0` | ngày |  |
| Mã thanh toán | `ma_tt` | chuỗi(2) | tra cứu: Term |
| — | `ten_tt` | chuỗi | chỉ đọc |

*Phí ngân hàng*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Phí ngân hàng | `f46` | chuỗi | tra cứu: CBCharge, chọn: ForeignKey=String: stt_rec, stt_rec |

*Chứng từ gốc*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Kèm theo | `so_ct_goc` | số |  |
| Chứng từ gốc | `dien_giai_ct_goc` | chuỗi(128) |  |

*Phần chân/tổng*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Theo dõi thanh toán | `hd_yn` | có/không |  |
| Sửa tỷ giá ghi sổ | `sua_tg_yn` | có/không |  |
| Tiền | `t_tien_nt` | số |  |
| Tiền | `t_tien` | số |  |

*Lưới chi tiết `CBDetail`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tk có | `tk_co` | chuỗi(16) | tra cứu: Account |
| Tên tài khoản | `ten_tk` | chuỗi | chỉ đọc |
| Số hóa đơn | `so_hd` | chuỗi(12) | tra cứu: CRInvoiceLookup |
| Ngày hóa đơn | `ngay_hd` | ngày | chỉ đọc |
| Tiền trên hóa đơn | `tien_hd_nt` | số | chỉ đọc |
| Đã thanh toán | `da_tt_nt` | số | chỉ đọc |
| Còn phải thanh toán | `cl_nt` | số | chỉ đọc |
| Ngoại tệ | `ma_nt_i` | chuỗi | chỉ đọc |
| Thanh toán quy đổi | `tt_qd` | số |  |
| Mã khách | `ma_kh_i` | chuỗi(16) | tra cứu: Customer |
| Tên khách hàng | `ten_kh_i` | chuỗi | chỉ đọc |
| Diễn giải | `dien_giai` | chuỗi(480) |  |
| Tiền nt | `tien_nt` | số |  |
| Tỷ giá gs | `ty_gia_ht2` | số |  |
| Tiền | `tien` | số |  |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |

*Lưới chi tiết `CBCharge`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã phí | `ma_cp` | chuỗi(16) | tra cứu: BankCharges |
| Tên phí | `ten_cp` | chuỗi | chỉ đọc |
| Tiền nt | `tien_cp_nt` | số |  |
| Diễn giải | `dien_giai` | chuỗi(480) |  |
| Tiền | `tien_cp` | số |  |
| Tk đối ứng | `tk_du` | chuỗi(16) | tra cứu: Account |
| Tỷ giá gs | `ty_gia` | số |  |
| Số thứ tự hóa đơn | `hd_ln` | số |  |
| Mã thuế | `ma_thue` | chuỗi | chỉ đọc |
| Thuế nt | `t_thue_nt` | số |  |
| Thuế | `t_thue` | số |  |
| Số hóa đơn | `so_ct0` | chuỗi(12) |  |
| Ký hiệu | `so_seri0` | chuỗi(12) |  |
| Ngày hóa đơn | `ngay_ct0` | ngày |  |
| Ghi chú | `ghi_chu` | chuỗi(128) |  |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |

### Giấy báo nợ

*Menu:* Tiền › Giấy báo nợ — trang `cactbn1`

**Cột danh sách:** Đơn vị, Ngày, Số, Mã khách, Tên khách, Tiền, Mã nt, Diễn giải

**Form nhập liệu** (giấy báo nợ; tab: Chi tiết, Thuế, Thanh toán, Khấu trừ thuế, Phí ngân hàng, Ủy nhiệm chi)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã khách | `ma_kh` | chuỗi(16) | tra cứu: Customer |
| — | `ten_kh` | chuỗi | chỉ đọc |
| Địa chỉ | `dia_chi` | chuỗi(256) |  |
| Người nhận tiền | `ong_ba` | chuỗi(128) |  |
| Lý do chi | `dien_giai` | chuỗi(480) |  |
| Tài khoản có | `tk` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk` | chuỗi | chỉ đọc |
| Loại phiếu chi | `loai_ct` | chuỗi(2) | tra cứu: TransactionType, mặc định: 2 |
| — | `ten_loai` | chuỗi | chỉ đọc |
| — | `ma_nk` | chuỗi(8) | tra cứu: VoucherBook |
| Số phiếu chi | `so_ct` | chuỗi(12) |  |
| Ngày lập | `ngay_lct` | ngày |  |
| Ngày hạch toán | `ngay_ct` | ngày |  |
| Mã nt | `ma_nt` | chuỗi(3) | tra cứu: Currency |
| — | `ten_nt` | chuỗi | chỉ đọc |
| TGGD | `ty_gia` | số | mặc định: 1 |
| Tỷ giá gs | `ty_gia_ht` | số | mặc định: 1 |
| Trạng thái | `status` | chuỗi | chọn: 0=0. Lập chứng từ; 1=1. Chuyển KTTH; 2=2. Chuyển sổ cái |

*Chi tiết*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Chi tiết | `d56` | chuỗi | tra cứu: CPDetail, chọn: ForeignKey=String: stt_rec, stt_rec |

*Thuế*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Thuế | `r30` | chuỗi | tra cứu: CPTax, chọn: ForeignKey=String: stt_rec, stt_rec |

*Thanh toán*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã thanh toán | `ma_tt` | chuỗi(2) | tra cứu: Term |
| — | `ten_tt` | chuỗi | chỉ đọc |
| Số chứng từ | `so_ct0` | chuỗi(12) |  |
| Ngày chứng từ | `ngay_ct0` | ngày |  |

*Khấu trừ thuế*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Khấu trừ thuế | `k51` | chuỗi | tra cứu: CPDeductible, chọn: ForeignKey=String: stt_rec, stt_rec |

*Phí ngân hàng*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Phí ngân hàng | `f56` | chuỗi | tra cứu: CPCharge, chọn: ForeignKey=String: stt_rec, stt_rec |

*Ủy nhiệm chi*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Đơn vị nhận tiền | `ten_dv` | chuỗi(128) |  |
| Số tài khoản | `tk_nh` | chuỗi |  |
| Tại ngân hàng | `ngan_hang` | chuỗi |  |
| Tỉnh thành | `tinh_thanh` | chuỗi |  |
| Nội dung | `noi_dung` | chuỗi(128) |  |
| Người nhận chịu phí ngân hàng | `phi_nhan_yn` | có/không |  |

*Phần chân/tổng*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Theo dõi thanh toán | `hd_yn` | có/không |  |
| Sửa tỷ giá ghi sổ | `sua_tg_yn` | có/không |  |
| Tiền nt | `t_tien_nt` | số |  |
| Tiền | `t_tien` | số |  |
| Tiền thuế | `t_thue` | số |  |
| Tiền thuế nt | `t_thue_nt` | số |  |
| Tổng thanh toán | `t_tt` | số |  |
| Tổng thanh toán nt | `t_tt_nt` | số |  |

*Lưới chi tiết `CPDetail`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tk nợ | `tk_no` | chuỗi(16) | tra cứu: Account |
| Tên tài khoản | `ten_tk_no` | chuỗi | chỉ đọc |
| Số hóa đơn | `so_hd` | chuỗi(12) | tra cứu: CDInvoiceLookup |
| Ngày hóa đơn | `ngay_hd` | ngày | chỉ đọc |
| Tiền trên hóa đơn | `tien_hd_nt` | số | chỉ đọc |
| Đã thanh toán | `da_tt_nt` | số | chỉ đọc |
| Còn phải thanh toán | `cl_nt` | số | chỉ đọc |
| Ngoại tệ | `ma_nt_i` | chuỗi | chỉ đọc |
| Thanh toán quy đổi | `tt_qd` | số |  |
| Mã khách | `ma_kh_i` | chuỗi(16) | tra cứu: Customer |
| Tên khách hàng | `ten_kh_i` | chuỗi | chỉ đọc |
| Diễn giải | `dien_giai` | chuỗi(480) |  |
| Tiền nt | `tien_nt` | số |  |
| Hóa đơn | `loai_hd` | chuỗi(1) | tra cứu: InvoiceTypeTax |
| Mã thuế | `ma_thue` | chuỗi(8) | tra cứu: Tax |
| Thuế suất | `thue_suat` | số | chỉ đọc |
| Tk thuế | `tk_thue` | chuỗi(16) | tra cứu: Account |
| Thuế nt | `thue_nt` | số |  |
| Thuế | `thue` | số |  |
| Thanh toán nt | `tt_nt` | số | chỉ đọc |
| Thanh toán | `tt` | số | chỉ đọc |
| Mẫu báo cáo | `mau_bc` | chuỗi(3) | tra cứu: VATForm, mặc định: '3' |
| Mã tính chất | `ma_tc` | chuỗi(16) | tra cứu: TaxType |
| Mẫu hóa đơn | `ma_mau_ct` | chuỗi(16) | tra cứu: VoucherTemplate |
| Số hóa đơn | `so_ct0` | chuỗi(12) |  |
| Ký hiệu | `so_seri0` | chuỗi(12) |  |
| Ngày hóa đơn | `ngay_ct0` | ngày |  |
| Mã ncc | `ma_kh` | chuỗi(16) | tra cứu: Customer |
| Tên nhà cung cấp | `ten_kh` | chuỗi(128) |  |
| Địa chỉ | `dia_chi` | chuỗi(256) |  |
| Mã số thuế | `ma_so_thue` | chuỗi(18) |  |
| Điện thoại | `dien_thoai` | chuỗi(32) |  |
| Tên hàng hóa - dịch vụ | `ten_vt` | chuỗi(480) |  |
| Cục thuế | `ma_kh2` | chuỗi(16) | tra cứu: Customer |
| Ghi chú | `ghi_chu` | chuỗi(128) |  |
| Tỷ giá gs | `ty_gia_ht2` | số | mặc định: 1 |
| Tiền | `tien` | số |  |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |

*Lưới chi tiết `CPTax`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mẫu báo cáo | `mau_bc` | chuỗi(3) | tra cứu: VATForm, mặc định: '3' |
| Mã tính chất | `ma_tc` | chuỗi(16) | tra cứu: TaxType |
| Mẫu hóa đơn | `ma_mau_ct` | chuỗi(16) | tra cứu: VoucherTemplate |
| Số hóa đơn | `so_ct0` | chuỗi(12) |  |
| Ký hiệu | `so_seri0` | chuỗi(12) |  |
| Ngày hóa đơn | `ngay_ct0` | ngày |  |
| Mã ncc | `ma_kh` | chuỗi(16) | tra cứu: Supplier |
| Tên nhà cung cấp | `ten_kh` | chuỗi(128) |  |
| Địa chỉ | `dia_chi` | chuỗi(256) |  |
| Mã số thuế | `ma_so_thue` | chuỗi(18) |  |
| Điện thoại | `dien_thoai` | chuỗi(32) |  |
| Tên hàng hóa - dịch vụ | `ten_vt` | chuỗi(480) |  |
| Mã kho | `ma_kho` | chuỗi(16) | tra cứu: Site |
| Tiền hàng nt | `t_tien_nt` | số |  |
| Tiền hàng | `t_tien` | số |  |
| Mã thuế | `ma_thue` | chuỗi(8) | tra cứu: Tax |
| Thuế suất | `thue_suat` | số | chỉ đọc |
| Tk thuế | `tk_thue_no` | chuỗi(16) | tra cứu: Account |
| Thuế nt | `t_thue_nt` | số |  |
| Thuế | `t_thue` | số |  |
| Cục thuế | `ma_kh2` | chuỗi(16) | tra cứu: Customer |
| Loại kê khai | `loai_kk` | chuỗi(1) | tra cứu: DeclarationTypelist, mặc định: 1 |
| Mã thanh toán | `ma_tt` | chuỗi(2) | tra cứu: Term |
| Ghi chú | `ghi_chu` | chuỗi(128) |  |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |

*Lưới chi tiết `CPDeductible`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tài khoản | `tk` | chuỗi(16) | tra cứu: Account |
| Tên tài khoản | `ten_tk` | chuỗi | chỉ đọc |
| Mã khách | `ma_kh` | chuỗi(16) | tra cứu: Customer |
| Tên khách | `ten_kh` | chuỗi | chỉ đọc |
| Phát sinh nợ nt | `ps_no_nt` | số |  |
| Phát sinh có nt | `ps_co_nt` | số |  |
| Diễn giải | `dien_giai` | chuỗi(480) |  |
| Phát sinh nợ | `ps_no` | số |  |
| Phát sinh có | `ps_co` | số |  |
| Nhóm định khoản | `nh_dk` | chuỗi(3) | mặc định: '1' |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |

*Lưới chi tiết `CPCharge`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã phí | `ma_cp` | chuỗi(16) | tra cứu: BankCharges |
| Tên phí | `ten_cp` | chuỗi | chỉ đọc |
| Tiền nt | `tien_cp_nt` | số |  |
| Diễn giải | `dien_giai` | chuỗi(480) |  |
| Tiền | `tien_cp` | số |  |
| Mã thuế | `ma_thue` | chuỗi | chỉ đọc |
| Thuế nt | `t_thue_nt` | số |  |
| TGGD | `ty_gia` | số | mặc định: 1 |
| Thuế | `t_thue` | số |  |
| Số hóa đơn | `so_ct0` | chuỗi(12) |  |
| Ký hiệu | `so_seri0` | chuỗi(12) |  |
| Ngày hóa đơn | `ngay_ct0` | ngày |  |
| Ghi chú | `ghi_chu` | chuỗi(128) |  |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |

### Phiếu kế toán tổng hợp

*Menu:* Tổng hợp › Phiếu kế toán tổng hợp — trang `glctpk1`

**Cột danh sách:** Đơn vị, Ngày, Số, Diễn giải, Tổng phát sinh, Mã nt

**Form nhập liệu** (phiếu kế toán; tab: Chi tiết, Thuế GTGT đầu vào)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Diễn giải | `dien_giai` | chuỗi(480) |  |
| — | `ma_nk` | chuỗi(8) | tra cứu: VoucherBook |
| Số chứng từ | `so_ct` | chuỗi(12) |  |
| Ngày lập | `ngay_lct` | ngày |  |
| Ngày hạch toán | `ngay_ct` | ngày |  |
| Mã nt | `ma_nt` | chuỗi(3) | tra cứu: Currency |
| — | `ten_nt` | chuỗi | chỉ đọc |
| Tỷ giá | `ty_gia` | số | mặc định: 1 |
| Trạng thái | `status` | chuỗi | chọn: 0=0. Lập chứng từ; 1=1. Chờ duyệt; 2=2. Chuyển sổ cái |

*Chi tiết*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Chi tiết | `d11` | chuỗi | tra cứu: GLDetail, chọn: ForeignKey=String: stt_rec, stt_rec |

*Thuế GTGT đầu vào*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Thuế GTGT đầu vào | `r30` | chuỗi | tra cứu: GLTax, chọn: ForeignKey=String: stt_rec, stt_rec |

*Lưới chi tiết `GLDetail`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tài khoản | `tk` | chuỗi(16) | tra cứu: Account |
| Tên tài khoản | `ten_tk` | chuỗi | chỉ đọc |
| Mã khách | `ma_kh` | chuỗi(16) | tra cứu: Customer |
| Tên khách | `ten_kh` | chuỗi | chỉ đọc |
| Phát sinh nợ nt | `ps_no_nt` | số |  |
| Phát sinh có nt | `ps_co_nt` | số |  |
| Diễn giải | `dien_giai` | chuỗi(480) |  |
| Phát sinh nợ | `ps_no` | số |  |
| Phát sinh có | `ps_co` | số |  |
| Mã thanh toán | `ma_tt` | chuỗi(2) | tra cứu: Term |
| Số hóa đơn | `so_ct0` | chuỗi(12) |  |
| Ngày hóa đơn | `ngay_ct0` | ngày |  |
| Nhóm định khoản | `nh_dk` | chuỗi(3) | mặc định: '1' |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |

*Lưới chi tiết `GLTax`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mẫu báo cáo | `mau_bc` | chuỗi(3) | tra cứu: VATForm, mặc định: '3' |
| Mã tính chất | `ma_tc` | chuỗi(16) | tra cứu: TaxType |
| Mẫu hóa đơn | `ma_mau_ct` | chuỗi(16) | tra cứu: VoucherTemplate |
| Số hóa đơn | `so_ct0` | chuỗi(12) |  |
| Ký hiệu | `so_seri0` | chuỗi(12) |  |
| Ngày hóa đơn | `ngay_ct0` | ngày |  |
| Mã ncc | `ma_kh` | chuỗi(16) | tra cứu: Supplier |
| Tên nhà cung cấp | `ten_kh` | chuỗi(128) |  |
| Địa chỉ | `dia_chi` | chuỗi(256) |  |
| Mã số thuế | `ma_so_thue` | chuỗi(18) |  |
| Điện thoại | `dien_thoai` | chuỗi(32) |  |
| Tên hàng hóa - dịch vụ | `ten_vt` | chuỗi(480) |  |
| Mã kho | `ma_kho` | chuỗi(16) | tra cứu: Site |
| Tiền hàng nt | `t_tien_nt` | số |  |
| Tiền hàng | `t_tien` | số |  |
| Mã thuế | `ma_thue` | chuỗi(8) | tra cứu: Tax |
| Thuế suất | `thue_suat` | số | chỉ đọc |
| Tk thuế | `tk_thue_no` | chuỗi(16) | tra cứu: Account |
| Thuế nt | `t_thue_nt` | số |  |
| Thuế | `t_thue` | số |  |
| Cục thuế | `ma_kh2` | chuỗi(16) | tra cứu: Customer |
| Loại kê khai | `loai_kk` | chuỗi(1) | tra cứu: DeclarationTypelist, mặc định: 1 |
| Mã thanh toán | `ma_tt` | chuỗi(2) | tra cứu: Term |
| Ghi chú | `ghi_chu` | chuỗi(128) |  |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |
| Tk đối ứng | `tk_du` | chuỗi(16) | tra cứu: Account |

### Hóa đơn bán hàng

*Menu:* Bán hàng › Hóa đơn bán hàng — trang `socthda`

**Cột danh sách:** Đơn vị, Ngày, Số, Mã khách, Tên khách, Thanh toán, Mã nt, Diễn giải

**Form nhập liệu** (hóa đơn; tab: Chi tiết, Chứng từ gốc, Khác)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã khách | `ma_kh` | chuỗi(16) | tra cứu: Customer |
| — | `ten_kh` | chuỗi | chỉ đọc |
| Người mua | `ong_ba` | chuỗi(128) |  |
| Diễn giải | `dien_giai` | chuỗi(480) |  |
| Tài khoản nợ | `tk` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk` | chuỗi | chỉ đọc |
| Mã giao dịch | `ma_gd` | chuỗi(2) | tra cứu: TransactionCode, mặc định: 2 |
| — | `ten_gd` | chuỗi | chỉ đọc |
| Mã thanh toán | `ma_tt` | chuỗi(2) | tra cứu: Term |
| — | `ten_tt` | chuỗi | chỉ đọc |
| — | `ma_nk` | chuỗi(8) | tra cứu: VoucherBook |
| Số hóa đơn | `so_ct` | chuỗi(12) |  |
| Ký hiệu | `so_seri` | chuỗi(12) |  |
| Ngày lập | `ngay_lct` | ngày |  |
| Ngày hạch toán | `ngay_ct` | ngày |  |
| Mã nt | `ma_nt` | chuỗi(3) | tra cứu: Currency |
| — | `ten_nt` | chuỗi | chỉ đọc |
| Tỷ giá | `ty_gia` | số | mặc định: 1 |
| Trạng thái | `status` | chuỗi | chọn: 0=0. Lập chứng từ; 1=1. Chuyển KTTH; 2=2. Chuyển sổ cái |

*Chi tiết*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Chi tiết | `d81` | chuỗi | tra cứu: SVDetail, chọn: ForeignKey=String: stt_rec, stt_rec |

*Chứng từ gốc*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Kèm theo | `so_ct_goc` | số nguyên |  |
| Chứng từ gốc | `dien_giai_ct_goc` | chuỗi(128) |  |
| Số bảng kê | `so_bk` | chuỗi(32) |  |
| Ngày bảng kê | `ngay_bk` | ngày | mặc định: null |

*Khác*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Nhân viên bán | `ma_nvbh` | chuỗi(8) | tra cứu: SalesEmployee |
| — | `ten_nvbh` | chuỗi | chỉ đọc |
| Tên khách hàng | `ten_khthue` | chuỗi(128) |  |
| Địa chỉ | `dia_chithue` | chuỗi(256) |  |
| Mã số thuế | `ma_so_thue` | chuỗi(18) |  |
| Nhóm hàng | `ten_vtthue` | chuỗi(128) |  |
| Ghi chú | `ghi_chuthue` | chuỗi(128) |  |
| Mã số đơn vị mua | `ma_dv_mua` | chuỗi(7) |  |
| Tổng tiền vốn | `t_tien_nt` | số |  |
| Tổng doanh thu | `t_tc_tien_nt2` | số |  |
| Tổng chiết khấu | `t_ck_nt` | số |  |
| Tổng khuyến mãi | `t_km_nt` | số |  |
| Tổng khuyến mãi ct | `t_km_ct_nt` | số |  |
| Thuế khuyến mãi | `t_thue_km_nt` | số |  |
| Cộng khuyến mãi | `t_tien_km_nt` | số |  |
| Loại kê khai | `loai_kk` | chuỗi(1) | tra cứu: DeclarationTypelist |
| — | `ten_kk` | chuỗi | chỉ đọc |

*Phần chân/tổng*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã thuế | `ma_thue` | chuỗi(8) | tra cứu: Tax |
| Tk thuế nợ | `tk_thue_no` | chuỗi(16) | tra cứu: Account |
| Tk thuế | `tk_thue_co` | chuỗi(16) | tra cứu: Account |
| Cục thuế | `ma_kh2` | chuỗi(16) | tra cứu: Customer |
| Tổng cộng | `t_so_luong` | số |  |
| Tiền hàng nt | `t_tien_nt2` | số |  |
| Tiền hàng | `t_tien2` | số |  |
| Tiền thuế | `t_thue_nt` | số |  |
| Tổng thanh toán | `t_tt_nt` | số |  |

*Lưới chi tiết `SVDetail`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã hàng | `ma_vt` | chuỗi(16) | tra cứu: Item |
| Tên mặt hàng | `ten_vt` | chuỗi | chỉ đọc |
| Đvt | `dvt` | chuỗi(32) | tra cứu: UOMItem |
| Khuyến mãi | `km_yn` | số |  |
| Mã kho | `ma_kho` | chuỗi(16) | tra cứu: Site |
| Tồn | `ton13` | số | chỉ đọc |
| Số lượng | `so_luong` | số |  |
| Giá bán nt | `gia_nt2` | số |  |
| Tiền hàng nt | `tien_nt2` | số |  |
| Tỷ lệ chiết khấu (%) | `tl_ck` | số |  |
| Chiết khấu nt | `ck_nt` | số |  |
| Tk doanh thu | `tk_dt` | chuỗi(16) | tra cứu: Account |
| Tk chiết khấu | `tk_ck` | chuỗi(16) | tra cứu: Account |
| Giá đích danh | `px_gia_dd` | có/không |  |
| Giá vốn nt | `gia_nt` | số |  |
| Tiền vốn nt | `tien_nt` | số |  |
| Tk kho | `tk_vt` | chuỗi(16) | tra cứu: Account |
| Tk giá vốn | `tk_gv` | chuỗi(16) | tra cứu: Account |
| Tk chi phí khuyến mãi | `tk_cpbh` | chuỗi(16) | tra cứu: Account |
| Giá bán | `gia2` | số |  |
| Tiền hàng | `tien2` | số |  |
| Chiết khấu | `ck` | số |  |
| Giá vốn | `gia` | số |  |
| Tiền vốn | `tien` | số |  |
| Đơn hàng | `dh_so` | chuỗi | chỉ đọc |
| Dòng | `dh_ln` | số nguyên | chỉ đọc |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |
| Bộ phận | `ma_bp` | chuỗi(16) | tra cứu: Department |
| Lsx | `so_lsx` | chuỗi(16) | tra cứu: MO |
| Sản phẩm | `ma_sp` | chuỗi(16) | tra cứu: Product |
| Hợp đồng | `ma_hd` | chuỗi(16) | tra cứu: Contract |
| Phí | `ma_phi` | chuỗi(16) | tra cứu: Expense |
| Khế ước | `ma_ku` | chuỗi(16) | tra cứu: LoanContract |

### Hóa đơn dịch vụ

*Menu:* Bán hàng › Hóa đơn dịch vụ — trang `arcthd1`

**Cột danh sách:** Đơn vị, Ngày, Số, Mã khách, Tên khách, Tiền, Mã nt, Diễn giải

**Form nhập liệu** (hóa đơn; tab: Chi tiết, Khác)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã khách | `ma_kh` | chuỗi(16) | tra cứu: Customer |
| — | `ten_kh` | chuỗi | chỉ đọc |
| Người mua | `ong_ba` | chuỗi(128) |  |
| Diễn giải | `dien_giai` | chuỗi(480) |  |
| Tài khoản nợ | `tk` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk` | chuỗi | chỉ đọc |
| Mã giao dịch | `ma_gd` | chuỗi(2) | tra cứu: TransactionCode, mặc định: 2 |
| — | `ten_gd` | chuỗi | chỉ đọc |
| Mã thanh toán | `ma_tt` | chuỗi(2) | tra cứu: Term |
| — | `ten_tt` | chuỗi | chỉ đọc |
| — | `ma_nk` | chuỗi(8) | tra cứu: VoucherBook |
| Số hóa đơn | `so_ct` | chuỗi(12) |  |
| Ký hiệu | `so_seri` | chuỗi(12) |  |
| Ngày lập | `ngay_lct` | ngày |  |
| Ngày hạch toán | `ngay_ct` | ngày |  |
| Mã nt | `ma_nt` | chuỗi(3) | tra cứu: Currency |
| — | `ten_nt` | chuỗi | chỉ đọc |
| Tỷ giá | `ty_gia` | số | mặc định: 1 |
| Trạng thái | `status` | chuỗi | chọn: 0=0. Lập chứng từ; 1=1. Chuyển KTTH; 2=2. Chuyển sổ cái |
| Nv bán hàng | `ma_nvbh` | chuỗi(8) | tra cứu: SalesEmployee |

*Chi tiết*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Chi tiết | `d21` | chuỗi | tra cứu: ARDetail, chọn: ForeignKey=String: stt_rec, stt_rec |

*Khác*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| — | `ten_nvbh` | chuỗi | chỉ đọc |
| Tên khách hàng | `ten_khthue` | chuỗi(128) |  |
| Địa chỉ | `dia_chithue` | chuỗi(256) |  |
| Mã số thuế | `ma_so_thue` | chuỗi(18) |  |
| Nhóm hàng | `ten_vtthue` | chuỗi(128) |  |
| Ghi chú | `ghi_chuthue` | chuỗi(128) |  |
| Mã số đơn vị mua | `ma_dv_mua` | chuỗi(7) |  |
| Số bảng kê | `so_bk` | chuỗi(32) |  |
| Ngày bảng kê | `ngay_bk` | ngày | mặc định: null |
| Loại kê khai | `loai_kk` | chuỗi(1) | tra cứu: DeclarationTypelist |
| — | `ten_kk` | chuỗi | chỉ đọc |

*Phần chân/tổng*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tk đối ứng thuế | `tk_thue_no` | chuỗi(16) | tra cứu: Account |
| Tiền hàng nt | `t_tien_nt2` | số |  |
| Tiền hàng | `t_tien2` | số |  |
| Tiền thuế | `t_thue_nt` | số |  |
| Tổng thanh toán | `t_tt_nt` | số |  |
| Tiền chiết khấu | `t_ck_nt` | số |  |

*Lưới chi tiết `ARDetail`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tk doanh thu | `tk_dt` | chuỗi(16) | tra cứu: Account |
| Tên tài khoản | `ten_tk` | chuỗi | chỉ đọc |
| Đvt | `dvt` | chuỗi(32) |  |
| Số lượng | `so_luong` | số |  |
| Giá nt | `gia_nt` | số |  |
| Tiền hàng nt | `tien_nt2` | số |  |
| Tỷ lệ chiết khấu (%) | `tl_ck` | số |  |
| Chiết khấu nt | `ck_nt` | số |  |
| Tk chiết khấu | `tk_ck` | chuỗi(16) | tra cứu: Account |
| Mã thuế | `ma_thue` | chuỗi(8) | tra cứu: Tax |
| Thuế suất | `thue_suat` | số | chỉ đọc |
| Tk thuế | `tk_thue` | chuỗi(16) | tra cứu: Account |
| Thuế nt | `thue_nt` | số |  |
| Cục thuế | `ma_kh2` | chuỗi(16) | tra cứu: Customer |
| Diễn giải | `dien_giai` | chuỗi(480) |  |
| Giá | `gia` | số |  |
| Tiền | `tien2` | số |  |
| Chiết khấu | `ck` | số |  |
| Thuế | `thue` | số |  |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |

### Hóa đơn mua hàng trong nước

*Menu:* Mua hàng › Hóa đơn mua hàng trong nước — trang `poctpna`

**Cột danh sách:** Đơn vị, Ngày, Số, Mã khách, Tên khách, Tiền, Mã nt, Diễn giải

**Form nhập liệu** (hóa đơn; tab: Chi tiết, Chi phí, Thuế, Chứng từ gốc)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã ncc | `ma_kh` | chuỗi(16) | tra cứu: Customer |
| — | `ten_kh` | chuỗi | chỉ đọc |
| Người giao hàng | `ong_ba` | chuỗi(128) |  |
| Mã giao dịch | `ma_gd` | chuỗi(2) | tra cứu: TransactionCode, mặc định: 2 |
| — | `ten_gd` | chuỗi | chỉ đọc |
| Diễn giải | `dien_giai` | chuỗi(480) |  |
| Tài khoản có | `tk` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk` | chuỗi | chỉ đọc |
| Số hóa đơn | `so_ct0` | chuỗi(12) |  |
| Ký hiệu | `so_seri0` | chuỗi(12) |  |
| Ngày hóa đơn | `ngay_ct0` | ngày |  |
| — | `ma_nk` | chuỗi(8) | tra cứu: VoucherBook |
| Số chứng từ | `so_ct` | chuỗi(12) |  |
| Ngày lập | `ngay_lct` | ngày |  |
| Ngày hạch toán | `ngay_ct` | ngày |  |
| Mã nt | `ma_nt` | chuỗi(3) | tra cứu: Currency |
| — | `ten_nt` | chuỗi | chỉ đọc |
| Tỷ giá | `ty_gia` | số | mặc định: 1 |
| Trạng thái | `status` | chuỗi | chọn: 0=0. Lập chứng từ; 1=1. Chuyển KTTH; 2=2. Chuyển sổ cái |

*Chi tiết*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Chi tiết | `d71` | chuỗi | tra cứu: PVDetail, chọn: ForeignKey=String: stt_rec, stt_rec |

*Chi phí*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Chi phí | `r60` | chuỗi | tra cứu: PVCharge, chọn: ForeignKey=String: stt_rec, stt_rec |

*Thuế*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Thuế | `r30` | chuỗi | tra cứu: PVTax, chọn: ForeignKey=String: stt_rec, stt_rec |

*Chứng từ gốc*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Kèm theo | `so_ct_goc` | số nguyên |  |
| Chứng từ gốc | `dien_giai_ct_goc` | chuỗi(128) |  |

*Phần chân/tổng*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã thanh toán | `ma_tt` | chuỗi(2) | tra cứu: Term |
| — | `ten_tt` | chuỗi | chỉ đọc |
| Tổng cộng | `t_so_luong` | số |  |
| Chi phí | `t_cp_nt` | số |  |
| Tiền thuế | `t_thue_nt` | số |  |
| Tổng thanh toán | `t_tt_nt` | số |  |

*Lưới chi tiết `PVDetail`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã hàng | `ma_vt` | chuỗi(16) | tra cứu: Item |
| Tên mặt hàng | `ten_vt` | chuỗi | chỉ đọc |
| Đvt | `dvt` | chuỗi(32) | tra cứu: UOMItem |
| Mã kho | `ma_kho` | chuỗi(16) | tra cứu: Site |
| Số lượng | `so_luong` | số |  |
| Giá nt | `gia_nt0` | số |  |
| Tiền hàng nt | `tien_nt0` | số |  |
| Tk nợ | `tk_vt` | chuỗi(16) | tra cứu: Account |
| Giá | `gia0` | số |  |
| Tiền hàng | `tien0` | số |  |
| Đơn hàng | `dh_so` | chuỗi | chỉ đọc |
| Dòng | `dh_ln` | số nguyên | chỉ đọc |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |

*Lưới chi tiết `PVCharge`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã chi phí | `ma_cp` | chuỗi(2) | tra cứu: Charge |
| Tên chi phí | `ten_cp` | chuỗi | chỉ đọc |
| Tiền nt | `tien_cp_nt` | số |  |
| Tiền | `tien_cp` | số |  |

*Lưới chi tiết `PVTax`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mẫu báo cáo | `mau_bc` | chuỗi(3) | tra cứu: VATForm, mặc định: '3' |
| Mã tính chất | `ma_tc` | chuỗi(16) | tra cứu: TaxType |
| Mẫu hóa đơn | `ma_mau_ct` | chuỗi(16) | tra cứu: VoucherTemplate |
| Số hóa đơn | `so_ct0` | chuỗi(12) |  |
| Ký hiệu | `so_seri0` | chuỗi(12) |  |
| Ngày hóa đơn | `ngay_ct0` | ngày |  |
| Mã ncc | `ma_kh` | chuỗi(16) | tra cứu: Supplier |
| Tên nhà cung cấp | `ten_kh` | chuỗi(128) |  |
| Địa chỉ | `dia_chi` | chuỗi(256) |  |
| Mã số thuế | `ma_so_thue` | chuỗi(18) |  |
| Điện thoại | `dien_thoai` | chuỗi(32) |  |
| Tên hàng hóa - dịch vụ | `ten_vt` | chuỗi(480) |  |
| Mã kho | `ma_kho` | chuỗi(16) | tra cứu: Site |
| Tiền hàng nt | `t_tien_nt` | số |  |
| Tiền hàng | `t_tien` | số |  |
| Mã thuế | `ma_thue` | chuỗi(8) | tra cứu: Tax |
| Thuế suất | `thue_suat` | số | chỉ đọc |
| Tk thuế | `tk_thue_no` | chuỗi(16) | tra cứu: Account |
| Thuế nt | `t_thue_nt` | số |  |
| Thuế | `t_thue` | số |  |
| Cục thuế | `ma_kh2` | chuỗi(16) | tra cứu: Customer |
| Loại kê khai | `loai_kk` | chuỗi(1) | tra cứu: DeclarationTypelist, mặc định: 1 |
| Mã thanh toán | `ma_tt` | chuỗi(2) | tra cứu: Term |
| Ghi chú | `ghi_chu` | chuỗi(128) |  |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |

### Hóa đơn mua hàng dịch vụ

*Menu:* Mua hàng › Hóa đơn mua hàng dịch vụ — trang `apctpn1`

### Phiếu nhập kho

*Menu:* Tồn kho › Phiếu nhập kho — trang `inctpnd`

**Cột danh sách:** Đơn vị, Ngày, Số, Mã khách, Tên khách, Tiền, Mã nt, Diễn giải

**Form nhập liệu** (phiếu nhập; tab: Chi tiết, Chứng từ gốc)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã khách | `ma_kh` | chuỗi(16) | tra cứu: Customer |
| Tên khách hàng | `ten_kh` | chuỗi | chỉ đọc |
| Người giao | `ong_ba` | chuỗi(128) |  |
| Mã giao dịch | `ma_gd` | chuỗi(2) | tra cứu: TransactionCode, mặc định: 2 |
| — | `ten_gd` | chuỗi | chỉ đọc |
| Diễn giải | `dien_giai` | chuỗi(480) |  |
| — | `ma_nk` | chuỗi(8) | tra cứu: VoucherBook |
| Số phiếu nhập | `so_ct` | chuỗi(12) |  |
| Ngày lập | `ngay_lct` | ngày |  |
| Ngày hạch toán | `ngay_ct` | ngày |  |
| Mã nt | `ma_nt` | chuỗi(3) | tra cứu: Currency |
| — | `ten_nt` | chuỗi | chỉ đọc |
| Tỷ giá | `ty_gia` | số | mặc định: 1 |
| Trạng thái | `status` | chuỗi | chọn: 0=0. Lập chứng từ; 1=1. Nhập kho; 2=2. Chuyển KTTH; 3=3. Chuyển sổ cái |

*Chi tiết*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Chi tiết | `d74` | chuỗi | tra cứu: IRDetail, chọn: ForeignKey=String: stt_rec, stt_rec |

*Chứng từ gốc*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Kèm theo | `so_ct_goc` | số nguyên |  |
| Chứng từ gốc | `dien_giai_ct_goc` | chuỗi(128) |  |

*Phần chân/tổng*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tổng cộng | `t_so_luong` | số |  |
| Tổng tiền nt | `t_tien_nt` | số |  |
| Tổng tiền | `t_tien` | số |  |

*Lưới chi tiết `IRDetail`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã hàng | `ma_vt` | chuỗi(16) | tra cứu: Item |
| Tên mặt hàng | `ten_vt` | chuỗi | chỉ đọc |
| Đvt | `dvt` | chuỗi(32) | tra cứu: UOMItem |
| Mã kho | `ma_kho` | chuỗi(16) | tra cứu: Site |
| Số lượng | `so_luong` | số |  |
| Giá trung bình | `pn_gia_tb` | có/không |  |
| Giá nt | `gia_nt` | số |  |
| Tiền nt | `tien_nt` | số |  |
| Tk nợ | `tk_vt` | chuỗi(16) | tra cứu: Account |
| Mã nx | `ma_nx` | chuỗi(16) | tra cứu: Reason |
| Tk có | `tk_du` | chuỗi(16) | tra cứu: Account |
| Giá | `gia` | số |  |
| Tiền | `tien` | số |  |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |

### Phiếu xuất kho

*Menu:* Tồn kho › Phiếu xuất kho — trang `inctpxa`

**Cột danh sách:** Đơn vị, Ngày, Số, Mã khách, Tên khách, Tiền, Mã nt, Diễn giải

**Form nhập liệu** (phiếu xuất; tab: Chi tiết, Chứng từ gốc)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã khách | `ma_kh` | chuỗi(16) | tra cứu: Customer |
| — | `ten_kh` | chuỗi | chỉ đọc |
| Người nhận | `ong_ba` | chuỗi(128) |  |
| Mã giao dịch | `ma_gd` | chuỗi(2) | tra cứu: TransactionCode, mặc định: 2 |
| — | `ten_gd` | chuỗi | chỉ đọc |
| Diễn giải | `dien_giai` | chuỗi(480) |  |
| — | `ma_nk` | chuỗi(8) | tra cứu: VoucherBook |
| Số phiếu xuất | `so_ct` | chuỗi(12) |  |
| Ngày lập | `ngay_lct` | ngày |  |
| Ngày hạch toán | `ngay_ct` | ngày |  |
| Mã nt | `ma_nt` | chuỗi(3) | tra cứu: Currency |
| — | `ten_nt` | chuỗi | chỉ đọc |
| Tỷ giá | `ty_gia` | số | mặc định: 1 |
| Trạng thái | `status` | chuỗi | chọn: 0=0. Lập chứng từ; 1=1. Xuất kho; 2=2. Chuyển KTTH; 3=3. Chuyển sổ cái |

*Chi tiết*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Chi tiết | `d84` | chuỗi | tra cứu: ISDetail, chọn: ForeignKey=String: stt_rec, stt_rec |

*Chứng từ gốc*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Kèm theo | `so_ct_goc` | số nguyên |  |
| Chứng từ gốc | `dien_giai_ct_goc` | chuỗi(128) |  |

*Phần chân/tổng*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tổng cộng | `t_so_luong` | số |  |

*Lưới chi tiết `ISDetail`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã hàng | `ma_vt` | chuỗi(16) | tra cứu: Item |
| Tên mặt hàng | `ten_vt` | chuỗi | chỉ đọc |
| Đvt | `dvt` | chuỗi(32) | tra cứu: UOMItem |
| Mã kho | `ma_kho` | chuỗi(16) | tra cứu: Site |
| Tồn | `ton13` | số | chỉ đọc |
| Số lượng | `so_luong` | số |  |
| Giá đích danh | `px_gia_dd` | có/không |  |
| Giá nt | `gia_nt` | số |  |
| Tiền nt | `tien_nt` | số |  |
| Mã nx | `ma_nx` | chuỗi(16) | tra cứu: Reason |
| Tk có | `tk_vt` | chuỗi(16) | tra cứu: Account |
| Tk nợ | `tk_du` | chuỗi(16) | tra cứu: Account |
| Giá | `gia` | số |  |
| Tiền | `tien` | số |  |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |

### Phiếu xuất điều chuyển

*Menu:* Tồn kho › Phiếu xuất điều chuyển — trang `inctpxb`

**Cột danh sách:** Đơn vị, Ngày, Số, Mã kho xuất, Mã kho nhập, Diễn giải, Tiền, Mã nt

**Form nhập liệu** (phiếu xuất điều chuyển; tab: Chi tiết)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã kho xuất | `ma_kho` | chuỗi(16) | tra cứu: Site |
| — | `ten_kho` | chuỗi | chỉ đọc |
| Mã kho nhập | `ma_khon` | chuỗi(16) | tra cứu: Site |
| — | `ten_khon` | chuỗi | chỉ đọc |
| Người nhận | `ong_ba` | chuỗi(128) |  |
| Diễn giải | `dien_giai` | chuỗi(480) |  |
| Mã giao dịch | `ma_gd` | chuỗi(2) | tra cứu: TransactionCode, mặc định: 3 |
| — | `ten_gd` | chuỗi | chỉ đọc |
| — | `ma_nk` | chuỗi(8) | tra cứu: VoucherBook |
| Số phiếu xuất | `so_ct` | chuỗi(12) |  |
| Ngày lập | `ngay_lct` | ngày |  |
| Ngày hạch toán | `ngay_ct` | ngày |  |
| Mã nt | `ma_nt` | chuỗi(3) | tra cứu: Currency |
| — | `ten_nt` | chuỗi | chỉ đọc |
| Tỷ giá | `ty_gia` | số | mặc định: 1 |
| Trạng thái | `status` | chuỗi | chọn: 0=0. Lập chứng từ; 1=1. Điều chuyển; 2=2. Chuyển KTTH; 3=3. Chuyển sổ cái |

*Chi tiết*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Chi tiết | `d85` | chuỗi | tra cứu: ITDetail, chọn: ForeignKey=String: stt_rec, stt_rec |

*Phần chân/tổng*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Số bước (1/2) | `so_buoc` | chuỗi(3) |  |
| Tổng cộng | `t_so_luong` | số |  |

*Lưới chi tiết `ITDetail`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã hàng | `ma_vt` | chuỗi(16) | tra cứu: Item |
| Tên mặt hàng | `ten_vt` | chuỗi | chỉ đọc |
| Đvt | `dvt` | chuỗi(32) | tra cứu: UOMItem |
| Tồn | `ton13` | số | chỉ đọc |
| Số lượng | `so_luong` | số |  |
| Giá đích danh | `px_gia_dd` | có/không |  |
| Giá nt | `gia_nt` | số |  |
| Tiền nt | `tien_nt` | số |  |
| Mã nx | `ma_nx` | chuỗi(16) | tra cứu: Reason |
| Tk nợ | `tk_du` | chuỗi(16) | tra cứu: Account |
| Tk có | `tk_vt` | chuỗi(16) | tra cứu: Account |
| Giá | `gia` | số |  |
| Tiền | `tien` | số |  |
| Vụ việc | `ma_vv` | chuỗi(16) | tra cứu: Job |

### Tài sản cố định

*Menu:* Tài sản › Tài sản cố định — trang `factts1`

**Cột danh sách:** Đơn vị, Ngày, Số, Thẻ tài sản, Tên tài sản, Nguyên giá, Giá trị đã khấu hao, Giá trị còn lại, Mã nt

**Form nhập liệu** (tài sản cố định; tab: Chi tiết, Phụ tùng kèm theo, Thông tin chung, Chứng từ gốc, Khác)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Số thẻ tài sản | `so_the_ts` | chuỗi(16) |  |
| Tên tài sản | `ten_ts` | chuỗi(450) |  |
| Loại tài sản | `loai_ts` | chuỗi(8) | tra cứu: FAType |
| — | `ten_loai` | chuỗi | chỉ đọc |
| Mã tăng ts | `ma_tg_ts` | chuỗi(8) | tra cứu: FAAcquisition |
| — | `ten_tg_ts` | chuỗi | chỉ đọc |
| Ngày tăng | `ngay_mua` | ngày |  |
| Số kỳ kh | `so_ky_kh` | số |  |
| Kiểu kh | `kieu_kh` | chuỗi | chọn: 0=0 - Đường thẳng; 1=1 - Sản lượng; 2=2 - Số dư giảm dần có điều chỉnh |
| Số kỳ kh đầu kỳ | `ky_kh00` | số |  |
| Tổng sản lượng | `tong_sl` | số |  |
| Ngày tính kh | `ngay_kh0` | ngày |  |
| Ngày kết thúc kh | `ngay_kh_kt` | ngày |  |
| Tỷ lệ kh nhanh | `tl_kh00` | số |  |
| — | `ma_nk` | chuỗi(8) | tra cứu: VoucherBook |
| Số chứng từ | `so_ct` | chuỗi(12) |  |
| Ngày chứng từ | `ngay_lct` | ngày |  |
| Mã nt | `ma_nt` | chuỗi(3) | tra cứu: Currency |
| — | `ten_nt` | chuỗi | chỉ đọc |
| Tỷ giá | `ty_gia` | số | mặc định: 1 |
| Mã bộ phận | `ma_bp` | chuỗi(16) | tra cứu: FADepartment |
| — | `ten_bp` | chuỗi | chỉ đọc |
| Tk tài sản | `tk_ts` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_ts` | chuỗi | chỉ đọc |
| Tk khấu hao | `tk_kh` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_kh` | chuỗi | chỉ đọc |
| Tk chi phí | `tk_cp` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_cp` | chuỗi | chỉ đọc |
| Mã phí | `ma_phi` | chuỗi(16) | tra cứu: Expense |
| — | `ten_phi` | chuỗi | chỉ đọc |

*Chi tiết*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Chi tiết | `dts` | chuỗi | tra cứu: FADetail, chọn: ForeignKey=String: stt_rec, stt_rec |

*Phụ tùng kèm theo*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Phụ tùng kèm theo | `ats` | chuỗi | tra cứu: FAAttached, chọn: ForeignKey=String: stt_rec, stt_rec |

*Thông tin chung*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tên khác | `ten_ts2` | chuỗi(450) |  |
| Thông số kt | `ts_kt` | chuỗi(128) |  |
| Lý do đình chỉ | `ly_do_dc` | chuỗi(128) |  |
| Ghi chú | `ghi_chu` | chuỗi(128) |  |
| Nhóm 1 | `nh_ts1` | chuỗi(8) | tra cứu: FAGroup |
| Nhóm 2 | `nh_ts2` | chuỗi(8) | tra cứu: FAGroup |
| Nhóm 3 | `nh_ts3` | chuỗi(8) | tra cứu: FAGroup |
| Số kỳ kh quy định | `so_ky_kh_qd` | số |  |
| Tỷ lệ kh vượt mức (%) | `ty_le_kh_vm` | số |  |
| Số hiệu tài sản | `so_hieu_ts` | chuỗi(8) |  |
| Ngày sử dụng | `ngay_dvsd` | ngày |  |
| Ngày đình chỉ | `ngay_dc` | ngày |  |
| Nước sx | `nuoc_sx` | chuỗi(16) |  |
| Năm sản xuất | `nam_sx` | số |  |
| Hs cho vượt mức | `hs_vm` | số |  |
| Ng. giá vượt mức | `nguyen_gia_vm_nt` | số |  |
| Số kỳ kh còn lại | `so_ky_kh_cl` | số |  |

*Chứng từ gốc*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Chứng từ gốc | `gcc` | chuỗi | tra cứu: FADocument, chọn: ForeignKey=String: stt_rec, stt_rec |

*Khác*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Giá trị làm tròn | `tien_cl_nt` | số |  |
| Nguyên giá | `t_nguyen_gia_nt` | số |  |
| Giá trị đã kh | `t_gt_da_kh_nt` | số |  |
| Giá trị còn lại | `t_gt_cl_nt` | số |  |
| Giá trị kh một kỳ | `t_gt_kh_ky_nt` | số |  |
| Giá trị làm tròn | `tien_cl` | số |  |
| Mã vật tư | `ma_vt` | chuỗi(16) | tra cứu: Item |
| — | `ten_vt` | chuỗi | chỉ đọc |

*Lưới chi tiết `FADetail`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã nguồn vốn | `ma_nv` | chuỗi(8) | tra cứu: Capital |
| Tên nguồn vốn | `ten_nv` | chuỗi | chỉ đọc |
| Nguyên giá nt | `nguyen_gia_nt` | số |  |
| Gt đã khấu hao nt | `gt_da_kh_nt` | số |  |
| Gt còn lại nt | `gt_cl_nt` | số | chỉ đọc |
| Gt kh một kỳ nt | `gt_kh_ky_nt` | số |  |
| Gt kh đầu kỳ nt | `gt_da_kh00_nt` | số |  |
| Nguyên giá | `nguyen_gia` | số |  |
| Gt đã khấu hao | `gt_da_kh` | số |  |
| Gt còn lại | `gt_cl` | số | chỉ đọc |
| Gt kh một kỳ | `gt_kh_ky` | số |  |
| Gt kh đầu kỳ | `gt_da_kh00` | số |  |
| Diễn giải | `dien_giai` | chuỗi(480) |  |

*Lưới chi tiết `FAAttached`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tên phụ tùng kèm theo | `ten_ptkt` | chuỗi(128) |  |
| Đvt | `dvt` | chuỗi(32) |  |
| Số lượng | `so_luong` | số |  |
| Giá trị nt | `gia_tri_nt` | số |  |
| Giá trị | `gia_tri` | số |  |

*Lưới chi tiết `FADocument`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Ngày chứng từ | `ngay_ct` | ngày | chỉ đọc |
| Số chứng từ | `so_ct` | chuỗi | chỉ đọc |
| Mã khách | `ma_kh` | chuỗi | chỉ đọc |
| Tên khách | `ten_kh` | chuỗi | chỉ đọc |
| Diễn giải | `dien_giai` | chuỗi | chỉ đọc |

### Công cụ dụng cụ

*Menu:* Công cụ › Công cụ dụng cụ — trang `fxctcc1`

**Cột danh sách:** Đơn vị, Ngày, Số, Mã công cụ, Tên công cụ, Số lượng, Nguyên giá, Giá trị đã phân bổ, Giá trị còn lại, Mã nt

**Form nhập liệu** (công cụ, dụng cụ; tab: Chi tiết, Phụ tùng kèm theo, Thông tin chung, Chứng từ gốc, Khác)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã công cụ | `so_the_ts` | chuỗi(16) |  |
| Tên công cụ | `ten_ts` | chuỗi(450) |  |
| Loại công cụ | `loai_ts` | chuỗi(8) | tra cứu: TSType |
| — | `ten_loai` | chuỗi | chỉ đọc |
| Mã tăng cc | `ma_tg_ts` | chuỗi(8) | tra cứu: TSAcquisition |
| — | `ten_tg_ts` | chuỗi | chỉ đọc |
| Ngày tăng | `ngay_mua` | ngày |  |
| Kiểu phân bổ | `kieu_kh` | chuỗi(1) |  |
| Số kỳ phân bổ | `so_ky_kh` | số |  |
| Số lượng | `so_luong` | số |  |
| Ngày tính pb | `ngay_kh0` | ngày |  |
| Ngày kết thúc pb | `ngay_kh_kt` | ngày |  |
| — | `ma_nk` | chuỗi(8) | tra cứu: VoucherBook |
| Số chứng từ | `so_ct` | chuỗi(12) |  |
| Ngày chứng từ | `ngay_lct` | ngày |  |
| Mã nt | `ma_nt` | chuỗi(3) | tra cứu: Currency |
| — | `ten_nt` | chuỗi | chỉ đọc |
| Tỷ giá | `ty_gia` | số | mặc định: 1 |
| Mã bộ phận | `ma_bp` | chuỗi(16) | tra cứu: TSDepartment |
| — | `ten_bp` | chuỗi | chỉ đọc |
| Tk công cụ | `tk_ts` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_ts` | chuỗi | chỉ đọc |
| Tk chờ phân bổ | `tk_kh` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_kh` | chuỗi | chỉ đọc |
| Tk chi phí | `tk_cp` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_cp` | chuỗi | chỉ đọc |
| Mã phí | `ma_phi` | chuỗi(16) | tra cứu: Expense |
| — | `ten_phi` | chuỗi | chỉ đọc |

*Chi tiết*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Chi tiết | `dcc` | chuỗi | tra cứu: TSDetail, chọn: ForeignKey=String: stt_rec, stt_rec |

*Phụ tùng kèm theo*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Phụ tùng kèm theo | `acc` | chuỗi | tra cứu: TSAttached, chọn: ForeignKey=String: stt_rec, stt_rec |

*Thông tin chung*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tên khác | `ten_ts2` | chuỗi(450) |  |
| Thông số kt | `ts_kt` | chuỗi(128) |  |
| Lý do đình chỉ | `ly_do_dc` | chuỗi(128) |  |
| Ghi chú | `ghi_chu` | chuỗi(128) |  |
| Nhóm 1 | `nh_ts1` | chuỗi(8) | tra cứu: TSGroup |
| Nhóm 2 | `nh_ts2` | chuỗi(8) | tra cứu: TSGroup |
| Nhóm 3 | `nh_ts3` | chuỗi(8) | tra cứu: TSGroup |
| Số hiệu công cụ | `so_hieu_ts` | chuỗi(8) |  |
| Ngày sử dụng | `ngay_dvsd` | ngày |  |
| Ngày đình chỉ | `ngay_dc` | ngày |  |
| Nước sản xuất | `nuoc_sx` | chuỗi(16) |  |
| Năm sản xuất | `nam_sx` | số |  |

*Chứng từ gốc*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Chứng từ gốc | `gcc` | chuỗi | tra cứu: TSDocument, chọn: ForeignKey=String: stt_rec, stt_rec |

*Khác*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Giá trị làm tròn | `tien_cl_nt` | số |  |
| Nguyên giá | `t_nguyen_gia_nt` | số |  |
| Gt đã phân bổ | `t_gt_da_kh_nt` | số |  |
| Gt còn lại | `t_gt_cl_nt` | số |  |
| Gt phân bổ kỳ | `t_gt_kh_ky_nt` | số |  |
| Gt làm tròn | `tien_cl` | số |  |
| Mã vật tư | `ma_vt` | chuỗi(16) | tra cứu: Item |
| — | `ten_vt` | chuỗi | chỉ đọc |

*Lưới chi tiết `TSDetail`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã nguồn vốn | `ma_nv` | chuỗi(8) | tra cứu: Capital |
| Tên nguồn vốn | `ten_nv` | chuỗi | chỉ đọc |
| Nguyên giá nt | `nguyen_gia_nt` | số |  |
| Gt đã pb nt | `gt_da_kh_nt` | số |  |
| Gt còn lại nt | `gt_cl_nt` | số | chỉ đọc |
| Gt pb kỳ nt | `gt_kh_ky_nt` | số |  |
| Diễn giải | `dien_giai` | chuỗi(480) |  |
| Nguyên giá | `nguyen_gia` | số |  |
| Gt đã pb | `gt_da_kh` | số |  |
| Gt còn lại | `gt_cl` | số | chỉ đọc |
| Gt pb kỳ | `gt_kh_ky` | số |  |

*Lưới chi tiết `TSAttached`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tên phụ tùng kèm theo | `ten_ptkt` | chuỗi(128) |  |
| Đvt | `dvt` | chuỗi(32) |  |
| Số lượng | `so_luong` | số |  |
| Giá trị nt | `gia_tri_nt` | số |  |
| Giá trị | `gia_tri` | số |  |

*Lưới chi tiết `TSDocument`*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Ngày chứng từ | `ngay_ct` | ngày | chỉ đọc |
| Số chứng từ | `so_ct` | chuỗi | chỉ đọc |
| Mã khách | `ma_kh` | chuỗi | chỉ đọc |
| Tên khách | `ten_kh` | chuỗi | chỉ đọc |
| Diễn giải | `dien_giai` | chuỗi | chỉ đọc |
