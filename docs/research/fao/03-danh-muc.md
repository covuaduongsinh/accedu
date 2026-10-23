# FAO — Danh mục

> Form khai báo danh mục (mở bằng nút Mới, không lưu).
>
> Nguồn: REA `capture-browser-scenario`, tài khoản ADMIN, chỉ đọc, 23/10/2026. Chỉ ghi cấu trúc; không có số liệu/đối tượng thật.

### Danh mục tài khoản

*Menu:* Tổng hợp › Danh mục tài khoản — trang `gltk`

**Cột danh sách:** Tài khoản, Tên tài khoản, Mã nt, Loại tk, Công nợ, Tk sổ cái, Tk mẹ, Bậc tk

**Form nhập liệu** (tài khoản; tab: —)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tài khoản | `tk` | chuỗi(16) |  |
| Tên tài khoản | `ten_tk` | chuỗi(128) |  |
| Tên khác | `ten_tk2` | chuỗi(128) |  |
| Tên ngắn | `ten_ngan` | chuỗi(64) |  |
| Tên ngắn khác | `ten_ngan2` | chuỗi(64) |  |
| Tài khoản mẹ | `tk_me` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_me` | chuỗi | chỉ đọc |
| Mã nt | `ma_nt` | chuỗi(3) | tra cứu: Currency |
| — | `ten_nt` | chuỗi | chỉ đọc |
| Tk theo dõi công nợ | `tk_cn` | số nguyên |  |
| Tài khoản sổ cái | `tk_sc` | số nguyên | mặc định: 1 |
| Loại tài khoản | `nh_tk0` | chuỗi(4) | tra cứu: AccountType |
| — | `ten_nh_tk0` | chuỗi | chỉ đọc |
| Nhóm tài khoản | `nh_tk2` | chuỗi(8) | tra cứu: AccountGroup |
| — | `ten_nh_tk2` | chuỗi | chỉ đọc |
| Pp tính tggs nợ | `loai_cl_no` | số nguyên | chọn: 0=Không tính chênh lệch; 1=Trung bình tháng; 2=Đích danh; 3=Nhập trước xuất trước; 4=Trung bình di động |
| Pp tính tggs có | `loai_cl_co` | số nguyên | chọn: 0=Không tính chênh lệch; 1=Trung bình tháng; 2=Đích danh; 3=Nhập trước xuất trước; 4=Trung bình di động |
| Trạng thái | `status` | chuỗi(1) |  |

### Danh mục khách hàng

*Menu:* Bán hàng › Danh mục khách hàng — trang `arkh`

**Cột danh sách:** Mã khách, Tên khách hàng, Địa chỉ, Mã số thuế

**Form nhập liệu** (thông tin khách hàng; tab: Thông tin chính, Thanh toán, Khác)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã khách | `ma_kh` | chuỗi(16) |  |
| Tên khách hàng | `ten_kh` | chuỗi(128) |  |
| Địa chỉ | `dia_chi` | chuỗi(256) |  |
| Mã số thuế | `ma_so_thue` | chuỗi(18) |  |

*Thông tin chính*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Đối tác | `doi_tac` | chuỗi(128) |  |
| Tài khoản ngầm định | `tk` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk` | chuỗi | chỉ đọc |
| Khách hàng | `kh_yn` | có/không | mặc định: true |
| Nhà cung cấp | `cc_yn` | có/không | mặc định: true |
| Nhân viên | `nv_yn` | có/không | mặc định: true |
| Nhóm khách hàng 1 | `nh_kh1` | chuỗi(8) | tra cứu: CustomerGroup |
| — | `ten_nh_kh1` | chuỗi | chỉ đọc |
| Nhóm khách hàng 2 | `nh_kh2` | chuỗi(8) | tra cứu: CustomerGroup |
| — | `ten_nh_kh2` | chuỗi | chỉ đọc |
| Nhóm khách hàng 3 | `nh_kh3` | chuỗi(8) | tra cứu: CustomerGroup |
| — | `ten_nh_kh3` | chuỗi | chỉ đọc |
| Điện thoại | `dien_thoai` | chuỗi(32) |  |
| Số gửi bản sao <span class="LabelDescription">(Fax)</span> | `fax` | chuỗi(32) |  |
| Thư <span class="LabelDescription">(Email)</span> | `e_mail` | chuỗi(1024) |  |
| Trang chủ | `home_page` | chuỗi(256) |  |
| Loại khách hàng | `loai_kh` | chuỗi(1) |  |

*Thanh toán*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Nv bán hàng | `ma_nvbh` | chuỗi(8) | tra cứu: SalesEmployee |
| — | `ten_nvbh` | chuỗi | chỉ đọc |
| Mã thanh toán | `ma_tt` | chuỗi(2) | tra cứu: Term |
| — | `ten_tt` | chuỗi | chỉ đọc |
| Tài khoản ngân hàng | `tk_nh` | chuỗi(24) |  |
| Tên người thụ hưởng | `nguoi_thu_huong` | chuỗi(128) |  |
| Tên ngân hàng | `ngan_hang` | chuỗi(64) |  |
| Chi nhánh | `chi_nhanh` | chuỗi(128) |  |
| Tỉnh thành | `tinh_thanh` | chuỗi(24) |  |

*Khác*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tên khác | `ten_kh2` | chuỗi(128) |  |
| Mã số đơn vị mua | `ma_dv_mua` | chuỗi(7) |  |
| Ghi chú | `ghi_chu` | chuỗi |  |
| Không kiểm tra mã số thuế | `khong_kt_mst` | có/không |  |

*Phần chân/tổng*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Trạng thái | `status` | chuỗi(1) |  |

### Danh mục hàng hóa, vật tư

*Menu:* Tồn kho › Danh mục hàng hóa, vật tư — trang `invt`

**Cột danh sách:** Mã vật tư, Tên vật tư, Đvt, Cách tính giá, Tk vật tư

**Form nhập liệu** (vật tư; tab: Thông tin chính, Tài khoản, Khác)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã vật tư | `ma_vt` | chuỗi(16) |  |
| Tên vật tư | `ten_vt` | chuỗi(480) |  |
| Tên khác | `ten_vt2` | chuỗi(480) |  |
| Mã vạch | `ma_vach` | chuỗi(128) |  |
| — | `ten_loai_vt` | chuỗi | chỉ đọc |
| — | `ten_nh_vt1` | chuỗi | chỉ đọc |
| — | `ten_nh_vt2` | chuỗi | chỉ đọc |
| — | `ten_nh_vt3` | chuỗi | chỉ đọc |
| — | `ten_kho` | chuỗi | chỉ đọc |
| — | `ten_thue` | chuỗi | chỉ đọc |
| — | `ten_thue_nk` | chuỗi | chỉ đọc |

*Thông tin chính*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Đơn vị tính | `dvt` | chuỗi(32) | tra cứu: UOM |
| Theo dõi tồn kho | `vt_ton_kho` | có/không | mặc định: true |
| Theo dõi kiểm kê | `kk_yn` | có/không |  |
| Cách tính giá tồn kho | `gia_ton` | số nguyên | chọn: 1=Giá trung bình; 2=Đích danh; 3=Nhập trước xuất trước; 4=Trung bình di động |
| Loại vật tư | `loai_vt` | chuỗi(2) | tra cứu: ItemType |
| Nhóm vật tư 1 | `nh_vt1` | chuỗi(16) | tra cứu: ItemGroup |
| Nhóm vật tư 2 | `nh_vt2` | chuỗi(16) | tra cứu: ItemGroup |
| Nhóm vật tư 3 | `nh_vt3` | chuỗi(16) | tra cứu: ItemGroup |
| Mã kho | `ma_kho` | chuỗi(16) | tra cứu: Site |
| Thuế giá trị gia tăng | `ma_thue` | chuỗi(8) | tra cứu: Tax |
| Thuế nhập khẩu | `ma_thue_nk` | chuỗi(8) | tra cứu: ImportTax |

*Tài khoản*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tk vật tư | `tk_vt` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_vt` | chuỗi | chỉ đọc |
| Sửa tk vật tư | `sua_tk_vt` | có/không |  |
| Tk giá vốn | `tk_gv` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_gv` | chuỗi | chỉ đọc |
| Tk doanh thu | `tk_dt` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_dt` | chuỗi | chỉ đọc |
| Tk doanh thu nội bộ | `tk_dtnb` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_dtnb` | chuỗi | chỉ đọc |
| Tk hàng bán trả lại | `tk_tl` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_tl` | chuỗi | chỉ đọc |
| Tk giảm giá hàng bán | `tk_gghb` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_gg` | chuỗi | chỉ đọc |
| Tk đại lý | `tk_dl` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_dl` | chuỗi | chỉ đọc |
| Tk sản phẩm dở dang | `tk_spdd` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_spdd` | chuỗi | chỉ đọc |
| Tk chênh lệch giá vốn | `tk_cl_vt` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_cl_vt` | chuỗi | chỉ đọc |
| Tk chiết khấu | `tk_ck` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_ck` | chuỗi | chỉ đọc |
| Tk chi phí khuyến mãi | `tk_cpbh` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_cpbh` | chuỗi | chỉ đọc |

*Khác*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| ABC | `abc_code` | chuỗi(1) |  |
| Thể tích | `volume` | số |  |
| Khối lượng | `weight` | số |  |
| Số lượng tồn tối thiểu | `sl_min` | số |  |
| Số lượng tồn tối đa | `sl_max` | số |  |
| Ghi chú | `ghi_chu` | chuỗi |  |
| Trạng thái | `status` | chuỗi(1) |  |
| Phân loại tài sản | `ma_pl_ts` | chuỗi(8) | tra cứu: FACategory |
| — | `ten_pl_ts` | chuỗi | chỉ đọc |
| Phân loại công cụ | `ma_pl_cc` | chuỗi(8) | tra cứu: TSCategory |
| — | `ten_pl_cc` | chuỗi | chỉ đọc |

### Danh mục kho hàng

*Menu:* Tồn kho › Danh mục... › Danh mục kho hàng — trang `inkho`

**Cột danh sách:** Đơn vị, Mã kho, Tên kho

**Form nhập liệu** (kho hàng; tab: —)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Đơn vị | `ma_dvcs` | chuỗi(8) | tra cứu: Unit |
| — | `ten_dvcs` | chuỗi | chỉ đọc |
| Mã kho | `ma_kho` | chuỗi(16) |  |
| Tên kho | `ten_kho` | chuỗi(128) |  |
| Tên khác | `ten_kho2` | chuỗi(128) |  |
| Đại lý | `dai_ly_yn` | có/không |  |
| Nhóm kho | `ma_nh` | chuỗi(16) | tra cứu: SiteGroup |
| — | `ten_nh` | chuỗi | chỉ đọc |
| Địa chỉ | `dia_chi` | chuỗi(256) |  |
| Ghi chú | `ghi_chu` | chuỗi |  |
| Trạng thái | `status` | chuỗi(1) |  |

### Danh mục công trình, vụ việc

*Menu:* Dự án › Danh mục công trình, vụ việc — trang `covv`

**Cột danh sách:** Mã vụ việc, Tên vụ việc

**Form nhập liệu** (vụ việc; tab: Thông tin chính, Khác)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã vụ việc | `ma_vv` | chuỗi(16) |  |
| Tên vụ việc | `ten_vv` | chuỗi(128) |  |
| Tên khác | `ten_vv2` | chuỗi(128) |  |

*Thông tin chính*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Ngày vụ việc | `ngay_vv` | ngày |  |
| Số vụ việc | `so_vv` | chuỗi(16) |  |
| Theo dõi số dư | `vv_sd_pslk` | chuỗi(3) |  |
| Mã nt | `ma_nt` | chuỗi(3) | tra cứu: Currency |
| — | `ten_nt` | chuỗi | chỉ đọc |
| Tiền ngoại tệ | `tien_nt` | số |  |
| Tiền hạch toán | `tien` | số |  |
| Ngày bắt đầu | `ngay_vv1` | ngày |  |
| Ngày kết thúc | `ngay_vv2` | ngày |  |
| Mã vụ việc mẹ | `ma_vv_me` | chuỗi(16) | tra cứu: Job |
| — | `ten_vv_me` | chuỗi | chỉ đọc |
| Khách hàng | `ma_kh` | chuỗi(16) | tra cứu: Customer |
| — | `ten_kh` | chuỗi | chỉ đọc |
| Nhân viên | `ma_nvbh` | chuỗi(8) | tra cứu: SalesEmployee |
| — | `ten_nvbh` | chuỗi | chỉ đọc |
| Bộ phận | `ma_bp` | chuỗi(16) | tra cứu: Department |
| — | `ten_bp` | chuỗi | chỉ đọc |

*Khác*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Nhóm 1 | `nh_vv1` | chuỗi(8) | tra cứu: JobGroup |
| — | `ten_nh_vv1` | chuỗi | chỉ đọc |
| Nhóm 2 | `nh_vv2` | chuỗi(8) | tra cứu: JobGroup |
| — | `ten_nh_vv2` | chuỗi | chỉ đọc |
| Nhóm 3 | `nh_vv3` | chuỗi(8) | tra cứu: JobGroup |
| — | `ten_nh_vv3` | chuỗi | chỉ đọc |
| Ghi chú | `ghi_chu` | chuỗi |  |
| Trạng thái | `status` | chuỗi(1) |  |

### Danh mục tài khoản ngân hàng

*Menu:* Tiền › Danh mục tài khoản ngân hàng — trang `catknh`

**Cột danh sách:** Đơn vị, Tài khoản, Tài khoản ngân hàng, Tên ngân hàng

**Form nhập liệu** (tài khoản ngân hàng; tab: —)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Đơn vị | `ma_dvcs` | chuỗi(8) | tra cứu: Unit |
| — | `ten_dvcs` | chuỗi | chỉ đọc |
| Tài khoản | `tk` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk` | chuỗi | chỉ đọc |
| Tài khoản ngân hàng | `tknh` | chuỗi(32) |  |
| Mã ngân hàng | `ma_nh` | chuỗi(16) | tra cứu: Bank |
| Tên ngân hàng | `ten_nh` | chuỗi(128) |  |
| Tên khác | `ten_nh2` | chuỗi(128) |  |
| Chi nhánh | `chi_nhanh` | chuỗi(128) |  |
| Tỉnh thành | `tinh_thanh` | chuỗi(24) |  |
| Điện thoại | `phone` | chuỗi(32) |  |
| Số gửi bản sao <span class="LabelDescription">(Fax)</span> | `fax` | chuỗi(32) |  |
| Chủ tài khoản | `chu_tk` | chuỗi(128) |  |
| Ghi chú | `ghi_chu` | chuỗi |  |
| Trạng thái | `status` | chuỗi(1) |  |

### Danh mục hợp đồng

*Menu:* Bán hàng › Danh mục... › Danh mục hợp đồng — trang `cohd`

**Cột danh sách:** Mã hợp đồng, Tên hợp đồng, Ngày ký, Ngày bắt đầu, Ngày kết thúc

**Form nhập liệu** (hợp đồng; tab: Thông tin chính, Khác)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã hợp đồng | `ma_hd` | chuỗi(16) |  |
| Tên hợp đồng | `ten_hd` | chuỗi(128) |  |
| Tên khác | `ten_hd2` | chuỗi(128) |  |
| — | `ten_nt` | chuỗi | chỉ đọc |
| — | `ten_kh` | chuỗi | chỉ đọc |
| — | `ten_nvbh` | chuỗi | chỉ đọc |
| — | `ten_bp` | chuỗi | chỉ đọc |
| — | `ten_nh1` | chuỗi | chỉ đọc |
| — | `ten_nh2` | chuỗi | chỉ đọc |
| — | `ten_nh3` | chuỗi | chỉ đọc |

*Thông tin chính*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Ngày ký | `ngay_hd` | ngày |  |
| Số hợp đồng | `so_hd` | chuỗi(16) |  |
| Theo dõi số dư | `hd_sd_pslk` | chuỗi(3) |  |
| Mã nt | `ma_nt` | chuỗi(3) | tra cứu: Currency |
| Tiền ngoại tệ | `tien_nt` | số |  |
| Tiền hạch toán | `tien` | số |  |
| Ngày bắt đầu | `ngay_hd1` | ngày |  |
| Ngày kết thúc | `ngay_hd2` | ngày |  |
| Khách hàng | `ma_kh` | chuỗi(16) | tra cứu: Customer |
| Nhân viên | `ma_nvbh` | chuỗi(8) | tra cứu: SalesEmployee |
| Bộ phận | `ma_bp` | chuỗi(16) | tra cứu: Department |

*Khác*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Nhóm 1 | `nh_hd1` | chuỗi(8) | tra cứu: ContractGroup |
| Nhóm 2 | `nh_hd2` | chuỗi(8) | tra cứu: ContractGroup |
| Nhóm 3 | `nh_hd3` | chuỗi(8) | tra cứu: ContractGroup |
| Ghi chú | `ghi_chu` | chuỗi |  |
| Trạng thái | `status` | chuỗi(1) |  |

### Danh mục thuế suất thuế GTGT

*Menu:* Tổng hợp › Khai báo › Danh mục thuế suất thuế GTGT — trang `arthue`

**Cột danh sách:** Mã thuế, Tên thuế, Thuế suất (%)

**Form nhập liệu** (thuế suất thuế GTGT; tab: —)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã thuế | `ma_thue` | chuỗi(8) |  |
| Tên thuế | `ten_thue` | chuỗi(128) |  |
| Tên khác | `ten_thue2` | chuỗi(128) |  |
| Nhóm thuế | `nhom_thue` | chuỗi(16) | tra cứu: TaxGroup |
| — | `ten_nh` | chuỗi | chỉ đọc |
| Thuế suất (%) | `thue_suat` | số |  |
| Tài khoản thuế đầu ra | `tk_thue_co` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_co` | chuỗi | chỉ đọc |
| Tài khoản thuế đầu ra được giảm | `tk_thue_no` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_no` | chuỗi | chỉ đọc |
| Tài khoản thuế đầu vào | `tk_thue_no3` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_no3` | chuỗi | chỉ đọc |
| Tài khoản thuế đầu vào được giảm | `tk_thue_co3` | chuỗi(16) | tra cứu: Account |
| — | `ten_tk_co3` | chuỗi | chỉ đọc |
| Stt sắp xếp | `stt` | số |  |
| Trạng thái | `status` | chuỗi(1) |  |

### Danh mục quyển chứng từ

*Menu:* Hệ thống › Danh mục quyển chứng từ — trang `smnk`

**Cột danh sách:** Mã quyển, Tên quyển

**Form nhập liệu** (quyển chứng từ; tab: —)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã quyển | `ma_nk` | chuỗi(8) |  |
| Tên quyển | `ten_nk` | chuỗi(128) |  |
| Tên khác | `ten_nk2` | chuỗi(128) |  |
| Đơn vị | `ma_dvcs` | chuỗi(8) | tra cứu: Unit |
| — | `ten_dvcs` | chuỗi | chỉ đọc |
| Mẫu chứng từ | `ky_hieu` | chuỗi(12) | tra cứu: VoucherTemplate |
| — | `ten_mau_ct` | chuỗi | chỉ đọc |
| Ký hiệu chứng từ | `so_seri` | chuỗi(12) |  |
| Số bắt đầu | `so_ct1` | chuỗi(14) |  |
| Số kết thúc | `so_ct2` | chuỗi(14) |  |
| Số hiện tại | `so_ct0` | chuỗi(14) |  |
| Kiểm tra trùng số | `trung_so` | số | chọn: 0=0 - Không kiểm tra; 1=1 - Theo ngày; 2=2 - Theo tháng; 3=3 - Theo quý; 4=4 - Theo năm; 5=5 - Tất, mặc định: '0' |
| Chỉ cảnh báo | `cb_yn` | có/không | mặc định: cast(0 as bit) |
| Ngày phát hành | `ngay_ph` | ngày |  |
| Ngày hiệu lực từ | `ngay_hl_tu` | ngày |  |
| Ngày hiệu lực đến | `ngay_hl_den` | ngày |  |
| Trạng thái | `status` | chuỗi(1) |  |

### Danh mục đơn vị cơ sở

*Menu:* Hệ thống › Danh mục đơn vị cơ sở — trang `gldvcs`

**Cột danh sách:** Mã đơn vị, Tên đơn vị
