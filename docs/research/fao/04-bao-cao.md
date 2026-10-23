# FAO — Báo cáo — điều kiện lọc

> Màn hình điều kiện lọc của các báo cáo chính (không chạy báo cáo, không lấy số liệu).
>
> Nguồn: REA `capture-browser-scenario`, tài khoản ADMIN, chỉ đọc, 23/10/2026. Chỉ ghi cấu trúc; không có số liệu/đối tượng thật.

### Bảng cân đối phát sinh các tài khoản

*Menu:* Tổng hợp › Báo cáo tài chính › Bảng cân đối phát sinh các tài khoản — trang `rpt_glcd1d`

**Điều kiện lọc** (Điều kiện lọc; tab: Thông tin chung, Khác, In)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Từ ngày | `ngay1` | ngày | mặc định: new Date() |
| Đến ngày | `ngay2` | ngày | mặc định: new Date() |
| — | `ten_tk` | chuỗi | chỉ đọc |

*Thông tin chung*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Bù trừ số dư | `bu_tru` | có/không |  |
| Đơn vị | `ma_dvcs` | chuỗi | tra cứu: Unit |
| Mẫu báo cáo | `mau_bc` | chuỗi | chọn: 001=Mẫu chuẩn; 002=Mẫu ngoại tệ |

*Khác*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Xem tài khoản | `tk` | có/không |  |
| — | `tk_1` | chuỗi | tra cứu: Account |
| Xem tk có bậc <= | `tk_bac` | có/không |  |
| Xem tất | `xem_tat` | có/không |  |
| Chỉ xem tài khoản chi tiết | `tk_chi_tiet` | có/không |  |

*In*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Ngày ký | `ngay_ky` | ngày |  |
| Người lập | `nguoi_lap` | chuỗi(128) |  |
| Kiểu lề trái | `rpt_margin_left` | chuỗi | chọn: 0=Ngầm định; 114=Lề trái tăng 2 mm; 170=Lề trái tăng 3 mm; 284=Lề trái tăng 5 mm |

### Báo cáo tình hình tài chính

*Menu:* Tổng hợp › Báo cáo tài chính › Báo cáo tình hình tài chính — trang `rpt_gltc1`

**Điều kiện lọc** (Điều kiện lọc; tab: Thông tin chung, In)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Đến ngày | `den_ngay` | ngày | mặc định: new Date() |
| Quý/năm | `ky` | chuỗi(1) | mặc định: 1 |
| Năm | `nam` | số(4) | mặc định: (new Date()).getFullYear(); |

*Thông tin chung*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Kiểu in | `kieu_in` | chuỗi(1) | mặc định: 1 |
| Đơn vị | `ma_dvcs` | chuỗi | tra cứu: Unit |
| Chọn báo cáo | `form` | chuỗi | chọn: = |
| Mẫu báo cáo | `mau_bc` | chuỗi | chọn: 10=Mẫu chuẩn - năm; 20=Mẫu chuẩn - giữa niên độ; 30=Mẫu chuẩn - bán niên; 40=Mẫu ngoại tệ - năm; 50=Mẫu ngoại tệ - giữa niên độ; 60=Mẫu ngoại tệ - bán niên |

*In*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Ngày ký | `ngay_ky` | ngày |  |
| Người lập | `nguoi_lap` | chuỗi(128) |  |
| Kiểu lề trái | `rpt_margin_left` | chuỗi | chọn: 0=Ngầm định; 114=Lề trái tăng 2 mm; 170=Lề trái tăng 3 mm; 284=Lề trái tăng 5 mm |

### Báo cáo kết quả sản xuất kinh doanh

*Menu:* Tổng hợp › Báo cáo tài chính › Báo cáo kết quả sản xuất kinh doanh — trang `rpt_gltc2`

**Điều kiện lọc** (Điều kiện lọc; tab: Thông tin chung, In)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Kỳ này từ ngày | `ky_nay_tu` | ngày | mặc định: new Date() |
| Kỳ này đến ngày | `ky_nay_den` | ngày | mặc định: new Date() |
| Kỳ trước từ ngày | `ky_truoc_tu` | ngày |  |
| Kỳ trước đến ngày | `ky_truoc_den` | ngày |  |

*Thông tin chung*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Đơn vị | `ma_dvcs` | chuỗi | tra cứu: Unit |
| Chọn báo cáo | `form` | chuỗi | chọn: = |
| Mẫu báo cáo | `mau_bc` | chuỗi | chọn: 10=Mẫu chuẩn - năm; 20=Mẫu chuẩn - giữa niên độ; 30=Mẫu chuẩn - bán niên; 40=Mẫu ngoại tệ - năm; 50=Mẫu ngoại tệ - giữa niên độ; 60=Mẫu ngoại tệ - bán niên |

*In*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Ngày ký | `ngay_ky` | ngày |  |
| Người lập | `nguoi_lap` | chuỗi(128) |  |
| Kiểu lề trái | `rpt_margin_left` | chuỗi | chọn: 0=Ngầm định; 114=Lề trái tăng 2 mm; 170=Lề trái tăng 3 mm; 284=Lề trái tăng 5 mm |

### Sổ nhật ký chung

*Menu:* Tổng hợp › Sổ sách nhật ký chung › Sổ nhật ký chung — trang `rpt_glso2`

**Điều kiện lọc** (Điều kiện lọc; tab: Thông tin chung, In)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Từ ngày | `ngay1` | ngày | mặc định: new Date() |
| Đến ngày | `ngay2` | ngày | mặc định: new Date() |
| Ngày mở sổ | `ngay3` | ngày |  |

*Thông tin chung*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| In chứng từ thuộc nhật ký đặc biệt | `in_ct` | có/không |  |
| Hiển thị theo diễn giải chi tiết | `ht_yn` | có/không |  |
| Nhóm theo tài khoản | `gr_yn` | có/không |  |
| Đơn vị | `ma_dvcs` | chuỗi | tra cứu: Unit |
| Mẫu báo cáo | `mau_bc` | chuỗi | chọn: 10=Mẫu chuẩn; 20=Mẫu ngoại tệ |

*In*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Ngày ký | `ngay_ky` | ngày |  |
| Người lập | `nguoi_lap` | chuỗi(128) |  |
| Kiểu lề trái | `rpt_margin_left` | chuỗi | chọn: 0=Ngầm định; 114=Lề trái tăng 2 mm; 170=Lề trái tăng 3 mm; 284=Lề trái tăng 5 mm |

### Sổ quỹ

*Menu:* Tiền › Sổ quỹ — trang `rpt_glso4`

**Điều kiện lọc** (Điều kiện lọc; tab: Thông tin chung, In)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tài khoản | `tk` | chuỗi | tra cứu: Account |
| — | `ten_tk` | chuỗi | chỉ đọc |
| Từ ngày | `tu_ngay` | ngày | mặc định: new Date() |
| Đến ngày | `den_ngay` | ngày | mặc định: new Date() |

*Thông tin chung*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Phân loại | `phan_loai` | chuỗi |  |
| Ngày mở sổ | `date_open` | ngày |  |
| Kiểu báo cáo | `chon_tt` | chuỗi | chọn: 1=Kiểu chuẩn; 2=Thông tư số 99 hoặc 200; 3=Thông tư số 133 |
| Đơn vị | `ma_dvcs` | chuỗi | tra cứu: Unit |
| Mẫu báo cáo | `mau_bc` | chuỗi | chọn: 10=Mẫu chuẩn; 20=Mẫu ngoại tệ |

*In*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Ngày ký | `ngay_ky` | ngày |  |
| Người lập | `nguoi_lap` | chuỗi(128) |  |
| Kiểu lề trái | `rpt_margin_left` | chuỗi | chọn: 0=Ngầm định; 114=Lề trái tăng 2 mm; 170=Lề trái tăng 3 mm; 284=Lề trái tăng 5 mm |

### Tờ khai thuế GTGT

*Menu:* Tổng hợp › Thuế › Tờ khai thuế GTGT — trang `rpt_glthue3`

**Điều kiện lọc** (Điều kiện lọc; tab: —)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Từ tháng | `ky1` | số |  |
| Đến tháng | `ky2` | số |  |
| Năm | `nam` | số |  |
| Bổ sung lần | `bo_sung` | số |  |
| Đơn vị | `ma_dvcs` | chuỗi | tra cứu: Unit |
| Chọn báo cáo | `form` | chuỗi | chọn: = |
| Mẫu báo cáo | `mau_bc` | chuỗi | chọn: 10=Mẫu chuẩn; 20=Mẫu ngoại tệ |

*Tab 1*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Chọn thông tư | `chon_tt` | chuỗi | chọn: 1=Thông tư số 28; 2=Thông tư số 156; 3=Thông tư số 119; 4=Thông tư số 26; 5=Thông tư số 80; 6=Thông tư số 89 |

### Bảng kê hóa đơn, chứng từ hàng hóa, dịch vụ mua vào

*Menu:* Tổng hợp › Thuế › Bảng kê hóa đơn, chứng từ hàng hóa, dịch vụ mua vào — trang `rpt_glthue1`

**Điều kiện lọc** (Điều kiện lọc; tab: Thông tin chung, Khác)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Từ tháng | `ky1` | số |  |
| Từ năm | `nam1` | số |  |
| Đến tháng | `ky2` | số |  |
| Đến năm | `nam2` | số |  |
| Ngày hạch toán từ | `tu_ngay` | ngày |  |
| Ngày hạch toán đến | `den_ngay` | ngày |  |
| Hóa đơn từ ngày | `ngay_hd1` | ngày |  |
| Hóa đơn đến ngày | `ngay_hd2` | ngày |  |

*Thông tin chung*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tài khoản thuế | `tk_thue` | chuỗi | tra cứu: Account |
| Mã khách | `ma_kh` | chuỗi | tra cứu: Customer |
| — | `ten_kh` | chuỗi | chỉ đọc |
| Loại báo cáo | `loai_bc` | chuỗi | tra cứu: ReportForm3 |
| Tính chất thuế | `tc_thue` | chuỗi | tra cứu: TaxType |
| Loại kê khai | `loai_kk` | chuỗi | tra cứu: DeclarationTypelist |
| Kèm chứng từ gốc | `ct_goc` | chuỗi |  |
| Đơn vị | `ma_dvcs` | chuỗi | tra cứu: Unit |
| Chọn thông tư | `chon_tt` | chuỗi | chọn: 1=Thông tư số 28; 2=Thông tư số 156; 3=Thông tư số 119 |
| Mẫu báo cáo | `mau_bc` | chuỗi | chọn: 10=Mẫu chuẩn; 20=Mẫu ngoại tệ |

*Khác*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tài khoản đối ứng | `tk_du` | chuỗi | tra cứu: Account |
| Mã thuế | `ma_thue` | chuỗi | tra cứu: Tax |
| — | `ten_thue` | chuỗi | chỉ đọc |
| Cục thuế | `ma_kh2` | chuỗi | tra cứu: Customer |
| — | `ten_kh2` | chuỗi | chỉ đọc |
| Mã kho | `ma_kho` | chuỗi | tra cứu: Site |
| — | `ten_kho` | chuỗi | chỉ đọc |
| Sắp xếp theo | `sap_xep` | chuỗi |  |
| Nhóm theo | `phan_loai` | chuỗi |  |

### Sổ chi tiết công nợ của một khách hàng

*Menu:* Bán hàng › Báo cáo công nợ khách hàng › Sổ chi tiết công nợ của một khách hàng — trang `rpt_arso1a`

**Điều kiện lọc** (Điều kiện lọc; tab: Thông tin chung, In)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Tài khoản | `tk` | chuỗi | tra cứu: Account |
| — | `ten_tk` | chuỗi | chỉ đọc |
| Mã khách | `ma_kh` | chuỗi | tra cứu: Customer |
| — | `ten_kh` | chuỗi | chỉ đọc |
| Từ ngày | `tu_ngay` | ngày | mặc định: new Date() |
| Đến ngày | `den_ngay` | ngày | mặc định: new Date() |
| Ngày mở sổ | `date_open` | ngày |  |

*Thông tin chung*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Chi tiết theo mặt hàng | `isdetail` | chuỗi |  |
| Tính số dư | `isbalance` | chuỗi |  |
| Đơn vị | `ma_dvcs` | chuỗi | tra cứu: Unit |
| Kiểu báo cáo | `chon_tt` | chuỗi | chọn: 1=Kiểu chuẩn; 2=Thông tư số 99 hoặc 200; 3=Thông tư số 133 |
| Mẫu báo cáo | `mau_bc` | chuỗi | chọn: 10=Mẫu chuẩn; 20=Mẫu ngoại tệ |

*In*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Ngày ký | `ngay_ky` | ngày |  |
| Người lập | `nguoi_lap` | chuỗi(128) |  |
| Kiểu lề trái | `rpt_margin_left` | chuỗi | chọn: 0=Ngầm định; 114=Lề trái tăng 2 mm; 170=Lề trái tăng 3 mm; 284=Lề trái tăng 5 mm |

### Tổng hợp nhập xuất tồn

*Menu:* Tồn kho › Báo cáo hàng tồn › Tổng hợp nhập xuất tồn — trang `rpt_incd1`

**Điều kiện lọc** (Điều kiện lọc; tab: Thông tin chung, Khác, In)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Từ ngày | `tu_ngay` | ngày | mặc định: new Date() |
| Đến ngày | `den_ngay` | ngày | mặc định: new Date() |
| Mã kho | `ma_kho` | chuỗi | tra cứu: Site |
| — | `ten_kho` | chuỗi | chỉ đọc |

*Thông tin chung*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Mã vật tư | `ma_vt` | chuỗi | tra cứu: Item |
| — | `ten_vt` | chuỗi | chỉ đọc |
| Nhóm vật tư | `nh_vt1` | chuỗi | tra cứu: ItemGroup |
| — | `nh_vt2` | chuỗi | tra cứu: ItemGroup |
| — | `nh_vt3` | chuỗi | tra cứu: ItemGroup |
| Loại vật tư | `loai_vt` | chuỗi | tra cứu: ItemType |
| — | `ten_loai_vt` | chuỗi | chỉ đọc |
| Đơn vị | `ma_dvcs` | chuỗi | tra cứu: Unit |
| Mẫu báo cáo | `mau_bc` | chuỗi | chọn: 10=Mẫu in chỉ có số lượng; 20=Mẫu in số lượng và giá trị; 30=Mẫu in số lượng và giá trị ngoại tệ |
| Loại dữ liệu | `loai_du_lieu` | chuỗi | chọn: 2=Theo hóa đơn |

*Khác*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Nhóm theo | `nh_theo` | chuỗi | chọn: =Không phân nhóm; 0=Loại vật tư; 1=Nhóm vật tư; 2=Tài khoản vật tư |
| Tính ps điều chuyển | `tinh_ps` | chuỗi | chọn: 0=Không tính phát sinh điều chuyển kho; 1=Tính phát sinh điều chuyển kho |
| In các vật tư | `in_theo` | chuỗi | chọn: 1=Chỉ in vật tư còn tồn kho; 2=Chỉ in các vật tư không còn tồn kho; 3=In tất cả |
| Cột số lượng | `in_sl` | chuỗi | chọn: 0=Không in tổng số lượng; 1=In tổng số lượng |
| Thứ tự sắp xếp nhóm | `tt_sx1` | chuỗi |  |

*In*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Ngày ký | `ngay_ky` | ngày |  |
| Người lập | `nguoi_lap` | chuỗi(128) |  |
| Kiểu lề trái | `rpt_margin_left` | chuỗi | chọn: 0=Ngầm định; 114=Lề trái tăng 2 mm; 170=Lề trái tăng 3 mm; 284=Lề trái tăng 5 mm |

### Bảng tính khấu hao TSCĐ

*Menu:* Tài sản › Báo cáo khấu hao TSCĐ › Bảng tính khấu hao TSCĐ — trang `rpt_fabckh`

**Điều kiện lọc** (Điều kiện lọc; tab: Thông tin chung, In)

*Phần đầu*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Từ kỳ | `tu_ky` | số | mặc định: (new Date()).getMonth() + 1; |
| Đến kỳ | `den_ky` | số | mặc định: (new Date()).getMonth() + 1; |
| Từ năm | `tu_nam` | số |  |
| Đến năm | `den_nam` | số |  |

*Thông tin chung*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Loại tài sản | `ma_loai` | chuỗi | tra cứu: FAType |
| — | `ten_loai` | chuỗi | chỉ đọc |
| Bộ phận sử dụng | `ma_bp` | chuỗi | tra cứu: FADepartment |
| — | `ten_bp` | chuỗi | chỉ đọc |
| Nhóm tài sản 1 | `nhom_1` | chuỗi | tra cứu: FAGroup |
| — | `ten_nh_1` | chuỗi | chỉ đọc |
| Nhóm tài sản 2 | `nhom_2` | chuỗi | tra cứu: FAGroup |
| — | `ten_nh_2` | chuỗi | chỉ đọc |
| Nhóm tài sản 3 | `nhom_3` | chuỗi | tra cứu: FAGroup |
| — | `ten_nh_3` | chuỗi | chỉ đọc |
| Kiểu hiện | `kieu_hien` | chuỗi |  |
| Đơn vị | `ma_dvcs` | chuỗi | tra cứu: Unit |
| Mẫu báo cáo | `mau_bc` | chuỗi | chọn: 10=Mẫu chuẩn; 20=Mẫu ngoại tệ |
| Nhóm theo | `nhom_theo` | chuỗi | chọn: =Không nhóm; 1=Loại tài sản; 2=Bộ phận sử dụng; 3=Bộ phận sử dụng - Loại tài sản |

*In*

| Nhãn | Mã trường | Kiểu | Ghi chú |
|---|---|---|---|
| Ngày ký | `ngay_ky` | ngày |  |
| Người lập | `nguoi_lap` | chuỗi(128) |  |
| Kiểu lề trái | `rpt_margin_left` | chuỗi | chọn: 0=Ngầm định; 114=Lề trái tăng 2 mm; 170=Lề trái tăng 3 mm; 284=Lề trái tăng 5 mm |
