# Hướng dẫn Hỏi AccEdu — hỏi số liệu bằng tiếng Việt

Tài liệu dành cho Thầy, kế toán và huấn luyện viên Dương Sinh. Áp dụng từ đợt P9c-2.

Cuối tháng, cô kế toán Lan cần biết ngay *"tháng này còn bao nhiêu học viên chưa đóng học phí?"* để gọi điện cho phụ huynh. Trước đây cô phải mở báo cáo *Tình hình học phí*, lọc kỳ, lọc còn nợ rồi đếm. Giờ cô bấm nút vàng **Hỏi AccEdu** ở góc trên, gõ câu hỏi như nói chuyện, và vài giây sau có câu trả lời: số học viên, tổng tiền còn phải thu, danh sách từng em, kèm dòng *Nguồn: Tình hình học phí, tháng 10/2026*.

AI **chỉ đọc** số liệu, không lập, sửa hay xóa chứng từ nào. Mỗi câu trả lời đều ghi rõ AI đã tra báo cáo nào, để người hỏi mở đúng báo cáo đó kiểm tra lại khi cần.

## 1. Bật AI hỏi đáp (quản trị, làm một lần)

1. **Khóa Anthropic API.** Thầy tạo khóa tại [console.anthropic.com](https://console.anthropic.com) (*API Keys › Create Key*), nạp trước một khoản tín dụng nhỏ.
2. **Thêm vào GitHub:** *Settings › Environments › SUPABASE_URL › Secrets* → secret `ANTHROPIC_API_KEY`.
3. Chạy lại workflow **Supabase deploy (VPS)**. Khóa được ghi vào kho bí mật (Vault) trên máy chủ.

Khóa **không** nằm trong mã nguồn, file cấu hình hay trình duyệt. Chưa có khóa thì khung hỏi báo *"Chưa cấu hình AI hỏi đáp"*, các chức năng khác vẫn dùng bình thường.

## 2. Hỏi thế nào

Bấm **Hỏi AccEdu** (nút vàng trên thanh đầu trang; trên điện thoại ở màn hình chính) rồi:
- chọn một **câu hỏi gợi ý**, hoặc
- gõ câu hỏi, nhấn **Enter** (Shift+Enter để xuống dòng).

Câu hỏi càng cụ thể càng nhanh và chính xác: nêu **kỳ** (tháng 10, quý 3), **lớp** (TOT-K15), **tài khoản** (111, 131).

**Ví dụ cho kế toán, quản lý:**
- Tháng này còn bao nhiêu học viên chưa đóng học phí?
- Doanh thu học phí tháng 10 theo từng lớp?
- Lớp nào có học viên sắp hết khóa (còn 2 buổi trở xuống)?
- Học phí đã thu trước còn chờ phân bổ (3387) bao nhiêu?
- Tiền mặt và tiền gửi ngân hàng hiện còn bao nhiêu?
- Lương HLV tháng này dự kiến bao nhiêu, ai bị khấu trừ thuế TNCN?
- Khách hàng nào nợ quá hạn trên 30 ngày?
- Sách nào bán lãi nhất quý này?

**Ví dụ cho huấn luyện viên:**
- Tháng này tôi đã dạy bao nhiêu buổi?
- Điểm danh tháng này lớp TOT-K15 thế nào, em nào vắng nhiều?

Câu trả lời hiển thị:
- số liệu định dạng Việt Nam, danh sách gạch đầu dòng;
- dòng **Nguồn** (báo cáo và kỳ AI đã dùng);
- dòng **Đã tra** (các báo cáo AccEdu đã mở để trả lời).

AI có thể mất 10–40 giây với câu hỏi cần tra nhiều báo cáo. Trong lúc chờ, Thầy/Cô cứ làm việc khác; câu trả lời được lưu trong **Lịch sử** của khung hỏi.

## 3. AI được xem gì

AI tra cứu **bằng chính quyền của người hỏi**:
- kế toán, quản lý: cân đối phát sinh, sổ chi tiết tài khoản, công nợ, tuổi nợ, tình hình học phí, học phí chờ phân bổ, số buổi còn lại, điểm danh, lương HLV (xem trước), lãi gộp, nhập – xuất – tồn, danh sách học viên và lớp;
- người *chỉ xem* không lập lương được thì AI cũng không xem được lương HLV;
- **huấn luyện viên** chỉ hỏi được về lớp mình phụ trách, điểm danh và số buổi mình dạy; không xem được tiền, học phí hay sổ sách.

**Dữ liệu gửi tới dịch vụ AI** gồm câu hỏi và các dòng báo cáo cần thiết (mã, tên, số tiền, ngày). AccEdu **không** gửi số điện thoại, email, địa chỉ của học viên và phụ huynh. Mỗi lần tra tối đa 200 dòng; AI tra tối đa 8 lần cho một câu hỏi.

## 4. Hạn mức và chi phí

*Hệ thống › Thông tin đơn vị › AI hỏi đáp (Hỏi AccEdu)*:
- **Số câu hỏi tối đa mỗi ngày** cho cả đơn vị (mặc định 100; đặt **0** để tắt AI). Câu hỏi bị lỗi kỹ thuật không tính vào hạn mức.
- **Hôm nay:** đã hỏi bao nhiêu câu.
- **Tháng này:** số câu và **chi phí ước tính** (USD). Chủ sở hữu, quản trị thấy cả đơn vị; người khác thấy của mình.

Chi phí tham khảo: một câu hỏi thường dùng 5.000–20.000 token, khoảng **0,03–0,15 USD** (khoảng 800–4.000 đ).
- 10 câu mỗi ngày làm việc (khoảng 220 câu / tháng) ≈ **7–33 USD / tháng**.
- Hạn mức 100 câu / ngày là mức **trần** để chặn chi phí bất thường, không phải mức dùng thường ngày.
- AccEdu dùng bộ nhớ đệm (prompt caching) để các lượt tra cứu liên tiếp rẻ hơn.

## 5. Khi AI trả lời chưa đúng ý

- **Hỏi lại cụ thể hơn:** thêm kỳ, mã lớp, số tài khoản.
- **Đối chiếu nguồn:** mở báo cáo ghi ở dòng *Nguồn* để kiểm tra. Số liệu trong báo cáo luôn là căn cứ chính thức; AI chỉ đọc và tóm tắt lại.
- **"Câu hỏi cần tra cứu quá nhiều báo cáo":** tách thành vài câu nhỏ.
- **"Đã hết N câu hỏi AI của hôm nay":** chờ ngày mai, hoặc nhờ quản trị tăng hạn mức.
- **"Dịch vụ AI đang quá tải":** thử lại sau ít phút (không trừ hạn mức).
- **"Khóa Anthropic API không hợp lệ":** quản trị kiểm tra lại khóa và tín dụng trên console.anthropic.com, cập nhật secret rồi chạy lại workflow triển khai.

## 6. Kỹ thuật (cho người quản trị hệ thống)

- **Edge Function `ai-ask`** gọi Claude (model `claude-opus-5-5`, effort `medium`, tự chuyển model dự phòng khi bị từ chối). Hàm trả lời ngay rồi xử lý nền; ứng dụng đọc kết quả từ bảng `ai_usage`, nên không bị giới hạn thời gian chờ của proxy.
- **Tool chỉ đọc** gọi các hàm báo cáo bằng JWT của người hỏi (RLS giữ nguyên). Mã nguồn ở `supabase/functions/_shared/ai-agent.ts`.
- **Nhật ký `ai_usage`:** câu hỏi, câu trả lời, báo cáo đã tra, token vào / ra / cache, chi phí ước tính.
- **Hạn mức:** `tenants.ai_daily_limit`, kiểm tra trong `ai_begin`; chỉ service role ghi kết quả (`ai_finish`).
