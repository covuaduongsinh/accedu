# Hướng dẫn vụ việc & hợp đồng — lãi lỗ theo lớp, giải đấu, hợp đồng

Tài liệu dành cho Thầy và kế toán Dương Sinh. Áp dụng từ đợt P7b.

Đầu tháng 11, Thầy ký với Trường Tiểu học Kim Đồng hợp đồng dạy cờ vua ngoại khóa cả năm học. Giá trị hợp đồng là 120 triệu đồng, thanh toán theo từng đợt.

Cô kế toán Lan mở **Dự án › Hợp đồng**, bấm **Mới** và nhập:
- mã `HD-KIMDONG`;
- số hợp đồng 15/2026/HĐ-DS;
- đối tác `TH-KD`;
- giá trị 120.000.000.

AccEdu tạo luôn một vụ việc cùng mã. Từ đó, chứng từ nào thuộc hợp đồng chỉ cần ghi mã `HD-KIMDONG` ở cột **Vụ việc**:
- **ngày 5:** hóa đơn dịch vụ đợt 1, 40 triệu;
- **ngày 10:** phiếu thu 25 triệu theo hóa đơn;
- **ngày 12:** phiếu chi 2 triệu mua bàn cờ cho lớp ở trường.

Cuối tháng, Thầy hỏi: *"Hợp đồng Kim Đồng giờ thế nào?"*. Cô Lan mở lại trang Hợp đồng, dòng `HD-KIMDONG` trả lời ngay:

| Cột | Số tiền (đ) |
|---|---|
| Đã xuất hóa đơn | 40.000.000 |
| Đã thu | 25.000.000 |
| **Còn phải thu** | **15.000.000** |
| Chưa xuất hóa đơn | 80.000.000 |
| Lãi tạm tính | 38.000.000 |

Sang **Lãi lỗ theo vụ việc**, Thầy thấy cùng lúc:
- **các lớp ở CLB:** lớp Tốt K12 lãi 900 nghìn, lớp Mã K3 lỗ 200 nghìn (ít học viên mà vẫn trả đủ lương HLV);
- **giải cờ tháng 10:** lỗ 500 nghìn sau khi trừ tài trợ;
- **hợp đồng Kim Đồng:** lãi 38 triệu.

## 1. Vụ việc là gì, gắn vào chứng từ thế nào

**Vụ việc** (*Dự án › Công trình, vụ việc*) là đối tượng gom doanh thu, chi phí. Ở Dương Sinh có các loại:

| Loại | Ví dụ | Tạo ở đâu |
|---|---|---|
| Lớp học | TOT-K12, MA-K3 | *Đào tạo › Lớp học* (mỗi lớp tự là một vụ việc) |
| Khóa học | KHOA-HE-2026 | *Công trình, vụ việc* |
| Sự kiện / giải đấu | GIAI-T10 | *Công trình, vụ việc* |
| Hợp đồng | HD-KIMDONG | *Dự án › Hợp đồng* (tự tạo vụ việc cùng mã) |
| Dự án | APP-HOC-CO | *Công trình, vụ việc* |

**Gắn vụ việc** bằng cột **Vụ việc** trên từng dòng của:
- hóa đơn bán, mua (HDB, HDV, HDM, HMV);
- **từ đợt này:** phiếu thu, phiếu chi, giấy báo có, giấy báo nợ, phiếu kế toán.

Gõ mã hoặc chọn trong danh sách gợi ý. Mã không có trong danh mục thì AccEdu báo lỗi khi lưu.

**Không cần gắn tay:**
- học phí, phân bổ doanh thu 3387 → 5113 và lương HLV đã tự mang mã lớp;
- khấu hao, phân bổ CCDC, kết chuyển cuối kỳ không gắn vụ việc. Các khoản này nằm ở dòng *(Không gắn vụ việc)*.

**Ngân sách:** ở *Công trình, vụ việc*, ô **Ngân sách** ghi chi phí dự kiến (ví dụ ngân sách giải đấu 15 triệu) để so với chi phí thực tế.

## 2. Lãi lỗ theo vụ việc

Vào *Dự án › Lãi lỗ theo vụ việc*, chọn kỳ và loại vụ việc.

| Cột | Cách tính |
|---|---|
| Doanh thu | Có − Nợ các TK doanh thu: 511x (học phí, bán sách), 515, 711 (tài trợ, thu khác) |
| Giảm trừ | Nợ − Có TK 521x (TT99) |
| Chi phí | Nợ − Có các TK chi phí: 632 (gồm lương HLV), 635, 641x, 642x, 811, 821x |
| Lãi (lỗ) | Doanh thu − giảm trừ − chi phí; tỷ suất tính trên doanh thu thuần |
| Học phí chưa ghi nhận (3387) | Học phí đã lập nhưng chưa phân bổ vào doanh thu, còn lại đến cuối kỳ |
| Ngân sách | Lấy từ danh mục vụ việc |

**Những điều cần biết:**
- **Dòng tổng khớp toàn đơn vị.** Dòng *(Không gắn vụ việc)* gom mọi doanh thu, chi phí không ghi mã: thuê văn phòng, lương quản lý, lãi tiền gửi, khấu hao… Nhờ vậy **Tổng cộng toàn đơn vị** đúng bằng lãi lỗ của kỳ, cũng là số kết chuyển 911 ở trang Cuối kỳ.
- **Không bị kết chuyển làm sai số.** Báo cáo tự bỏ qua phiếu kết chuyển 911. Xem trước hay sau khi kết chuyển, số liệu vẫn như nhau.
- **Xem chi tiết.** Bấm đúp một dòng để mở sổ chi tiết của vụ việc đó.
- **Xuất Excel** để gửi Thầy hoặc họp giao ban.

> Muốn lãi lỗ từng lớp sát thực tế hơn thì gắn mã lớp cho cả các khoản chi riêng của lớp: tài liệu, bàn cờ, thuê phòng. Phần chi phí chung chưa chia cho lớp sẽ nằm ở dòng *Không gắn vụ việc*.

## 3. Sổ chi tiết vụ việc

Vào *Dự án › Sổ chi tiết vụ việc*, chọn vụ việc và kỳ. Sổ gồm:
- **Lũy kế trước kỳ:** doanh thu, chi phí, lãi lỗ từ khi bắt đầu vụ việc đến trước kỳ. Hợp đồng kéo dài cả năm học vẫn thấy được lãi lỗ từ đầu.
- **Từng bút toán trong kỳ:** ngày, số chứng từ, tài khoản, tài khoản đối ứng, đối tượng, doanh thu / chi phí, **lãi lỗ lũy kế**.
- **Cộng trong kỳ** và **Lũy kế đến cuối kỳ**.

Thêm vài thao tác:
- Đánh dấu **Xem cả bút toán công nợ, tiền, 3387** để thấy luôn các dòng Nợ 131, Có 3387… của vụ việc. Các dòng này không tính vào lãi lỗ.
- Chọn **(Không gắn vụ việc)** để soát các khoản chưa gắn mã.
- Bấm đúp một dòng để mở chứng từ gốc.

## 4. Hợp đồng

### Khai báo

Vào *Dự án › Hợp đồng › Mới*:

| Ô | Ghi chú |
|---|---|
| Mã hợp đồng | Cũng là mã vụ việc, không đổi được sau khi lưu.<br>- Mã chưa có: AccEdu tạo vụ việc loại *Hợp đồng*.<br>- Mã là vụ việc có sẵn (ví dụ giải đấu GIAI-T10 có nhà tài trợ): AccEdu gắn hợp đồng vào vụ việc đó.<br>- Không gắn được vào lớp học. |
| Loại | **Bán**: dạy học ở trường, tổ chức giải, bán sách số lượng lớn. **Mua**: in sách, thuê địa điểm… |
| Số hợp đồng, ngày ký, bắt đầu, kết thúc | Hết ngày kết thúc mà hợp đồng vẫn *Đang thực hiện* thì hiện nhãn **Quá hạn** |
| Đối tác | Mã khách hàng / nhà cung cấp |
| Giá trị | Gồm thuế GTGT |
| Trạng thái | Đang thỏa thuận → Đang thực hiện → Đã thanh lý (hoặc Đã hủy) |

### Theo dõi

| Cột | Hợp đồng bán | Hợp đồng mua |
|---|---|---|
| Đã xuất HĐ | Dòng hóa đơn HDB / HDV đã ghi sổ có mã vụ việc của hợp đồng (tiền hàng + thuế) | Dòng HDM / HMV |
| Đã thu / trả | - Phần đã thu của các hóa đơn đó (phiếu thu theo hóa đơn).<br>- Cộng khoản **thu trước** không theo hóa đơn: dòng Có 131 có mã hợp đồng. | Phần đã trả theo hóa đơn, cộng khoản trả trước: dòng Nợ 331 có mã hợp đồng |
| Còn phải thu / trả | Đã xuất HĐ − đã thu. Số âm: trường đã ứng trước | |
| Chưa xuất HĐ | Giá trị − đã xuất HĐ: phần còn phải xuất hóa đơn trong các đợt sau | |
| Lãi (lỗ) | Doanh thu − chi phí lũy kế của vụ việc | |

**Thao tác:**
- Bấm đúp một hợp đồng (hoặc nút **Chứng từ**) để xem từng hóa đơn và khoản thu trước. Bấm đúp tiếp để mở chứng từ.
- Nút **Sổ vụ việc** mở sổ chi tiết của hợp đồng.
- **Số liệu đến ngày:** xem hợp đồng tại một thời điểm, ví dụ để đối chiếu cuối quý.

**Lưu ý:**
- **Hóa đơn có nhiều dòng, chỉ một phần thuộc hợp đồng** (ví dụ thêm dòng sách bán lẻ): phần đã thu được chia theo tỷ lệ tiền của các dòng hợp đồng trong hóa đơn.
- **Xóa hợp đồng:**
  - vụ việc chưa có chứng từ thì xóa luôn;
  - đã có chứng từ thì giữ vụ việc để sổ sách không mất mã. Có thể khai báo lại hợp đồng vào đúng mã đó.

## 5. Hỏi AccEdu

Có thể hỏi:
- *"Lớp Tốt K12 tháng này lãi bao nhiêu?"*
- *"Giải đấu tháng 10 lỗ hay lãi, chi những gì?"*
- *"Hợp đồng nào còn phải thu tiền?"*
- *"Hợp đồng Kim Đồng còn bao nhiêu chưa xuất hóa đơn?"*

AI đọc báo cáo lãi lỗ theo vụ việc (kèm từng bút toán khi hỏi một mã cụ thể) và báo cáo hợp đồng, bằng quyền của người hỏi. HLV không xem được các báo cáo này.

## 6. Sửa lỗi lãi gộp

Từ P7a, sau khi kết chuyển 911, báo cáo **Lãi gộp theo mặt hàng, khách hàng** hiện dòng *Không gắn mã hàng* với doanh thu âm bằng toàn bộ doanh thu tháng, do tính cả phiếu kết chuyển. Đợt này đã sửa: lãi gộp không tính phiếu kết chuyển cuối kỳ.
