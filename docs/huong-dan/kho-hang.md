# Hướng dẫn quản lý kho hàng (sách, bàn cờ, đồ dùng)

Tài liệu dành cho Thầy và kế toán Dương Sinh. Áp dụng từ đợt P5a.

AccEdu theo dõi từng mặt hàng: **còn bao nhiêu, ở kho nào, giá vốn bao nhiêu**. Số tồn và giá vốn được tính tự động mỗi khi ghi sổ chứng từ kho, và tự khớp với TK 156 trên sổ cái.

## 1. Chuẩn bị (làm một lần)

1. **Danh mục kho** (*Tồn kho › Danh mục kho*). Mỗi đơn vị có sẵn kho **KHO — Kho chính**. Muốn theo dõi riêng tủ sách ở CLB hay kho hiệu sách thì thêm kho mới (ví dụ `KHO-CLB`).
2. **Danh mục hàng hóa** (*Tồn kho › Danh mục hàng hóa, dịch vụ*). Với sách, bàn cờ, đồng hồ cờ, mở từng mã và đánh dấu **Theo dõi tồn kho**. Mã loại *Dịch vụ* (học phí) không theo dõi tồn. Có thể chọn **Kho mặc định** để AccEdu tự điền khi lập phiếu.
3. **Tồn kho đầu kỳ** (*Tổng hợp › Số dư đầu kỳ › tab Tồn kho*):
   - nhập số lượng và giá trị hàng còn tại ngày bắt đầu dùng AccEdu, theo từng kho;
   - nhập trên lưới, hoặc bấm **Nhập từ Excel** (tải tệp mẫu, hoặc lấy báo cáo tồn kho xuất từ FAO);
   - dòng đối chiếu phía trên phải báo **khớp** với số dư đầu kỳ TK 156; lệch thì kiểm tra lại một trong hai bên.

## 2. Nhập hàng

| Trường hợp | Làm ở đâu | Ghi sổ |
|---|---|---|
| Mua sách, bàn cờ có hóa đơn | *Mua hàng › Hóa đơn mua hàng*: chọn mã hàng, cột **Kho** tự điền | Nợ 156 (TT133) / 1561 (TT99) + Nợ 1331 / Có 331, đồng thời nhập kho |
| Hàng về trước, hóa đơn về sau; nhập thừa; nhập lại hàng tặng… | *Tồn kho › Phiếu nhập kho* | Nợ 156 / Có TK đối ứng (mặc định 331, đổi được) |
| Hóa đơn nhập từ tệp XML (*Mua hàng › Hóa đơn đầu vào*) | Mở hóa đơn nháp, chọn mã hàng và kho cho từng dòng rồi ghi sổ | Như hóa đơn mua hàng |

## 3. Xuất hàng

**Phiếu xuất kho** (*Tồn kho › Phiếu xuất kho*): dùng khi xuất sách cho lớp học, xuất tặng, xuất bán lẻ thu tiền mặt…

1. Chọn mã hàng và kho. Cột **Tồn** cho biết còn bao nhiêu; cột **Giá vốn (ước tính)** tính theo giá bình quân hiện tại.
2. Nhập số lượng. Nếu vượt số tồn, AccEdu báo ngay và **không cho ghi sổ** (chặn xuất âm kho).
3. Đổi **TK nợ** nếu cần: 632 khi xuất bán (mặc định), 6422/6427 khi xuất dùng cho quản lý, 6421 khi xuất tặng khuyến mại…
4. **Lưu & ghi sổ.** Giá vốn chính thức được chốt lúc ghi sổ: Nợ 632 / Có 156.

**Phiếu xuất điều chuyển** (*Tồn kho › Phiếu xuất điều chuyển*): chuyển hàng giữa các kho. Chọn **Kho nhập** ở phần đầu và **kho xuất** trên từng dòng. Điều chuyển không làm thay đổi giá vốn và tổng giá trị tồn.

> Hóa đơn bán hàng hiện chưa tự xuất kho; sẽ có trong đợt P5b (khi đó hóa đơn bán sách tự trừ kho và ghi giá vốn). Trong lúc chờ, sau khi bán thì lập thêm phiếu xuất kho cho số sách đã bán.

## 4. Giá vốn

Mở *Tồn kho › Tính giá vốn hàng xuất kho* để chọn phương pháp. Chỉ chủ sở hữu hoặc quản trị được đổi.

- **Bình quân di động** (mặc định):
  - giá xuất = giá trị tồn ÷ số lượng tồn ngay trước lúc xuất;
  - số liệu có ngay khi ghi sổ.
  - Ví dụ: tồn 10 cuốn × 80.000, nhập thêm 10 cuốn × 90.000 thì giá bình quân là 85.000; xuất 5 cuốn, giá vốn là 425.000.
- **Bình quân cả tháng:**
  - giá xuất = (giá trị tồn đầu tháng + giá trị nhập trong tháng) ÷ (số lượng tương ứng);
  - giữa tháng là giá tạm, hết tháng thì chốt đúng.

Lưu ý:
- Nhập lùi ngày, hoặc bỏ ghi sổ một phiếu kho, thì AccEdu **tự tính lại** giá các phiếu xuất sau ngày đó và sửa luôn bút toán.
- Nút **Tính lại giá vốn** dùng sau khi sửa tồn kho đầu kỳ, hoặc khi muốn kiểm tra lại. Kỳ đã khóa sổ luôn giữ nguyên.
- Không bỏ ghi sổ được phiếu nhập mà số hàng đã bị xuất. Phải bỏ ghi sổ phiếu xuất đó trước; AccEdu báo rõ là phiếu nào.

## 5. Báo cáo

- **Tổng hợp nhập – xuất – tồn** (*Tồn kho*):
  - mỗi mặt hàng một dòng: tồn đầu, nhập, xuất, tồn cuối, cả số lượng và giá trị; lọc được theo kho;
  - dòng **Đối chiếu với sổ cái** cuối trang: giá trị tồn kho phải bằng số dư TK 156. Lệch thì thường do số dư đầu kỳ TK 156 khác tồn kho đầu kỳ, hoặc có hóa đơn mua ghi TK 156 mà chưa chọn mã hàng / kho;
  - nhấp đúp một dòng để mở thẻ kho.
- **Thẻ kho / sổ chi tiết vật tư:** từng phiếu nhập, xuất của một mặt hàng, kèm số tồn lũy kế.
- Mọi báo cáo đều có **Xuất Excel**.

## Sắp có (đợt P5b)

- Hóa đơn bán hàng tự xuất kho và ghi giá vốn; báo cáo lãi gộp theo mặt hàng, theo khách hàng.
- Xem tồn kho trên điện thoại.
- Hóa đơn nhập từ XML tự gắn mã hàng và kho.
