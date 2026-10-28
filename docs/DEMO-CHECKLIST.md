# Kịch bản ngắn để bảo vệ V-Intern — 23/10/2026

> Tên đăng nhập trong bản GitHub là tên minh họa. Bộ tài khoản thực tế và mật khẩu được bàn giao riêng, không công bố trong repository.

**Mở ứng dụng:** http://localhost:3001/login. Mật khẩu: thông tin được bàn giao riêng trên máy local. Không trình chiếu mật khẩu.

| Vai trò | Tên đăng nhập | Dùng để làm gì? |
|---|---|---|
| Giảng viên | `giangvien_demo` | Tạo phiên, phân công, duyệt kế hoạch và bài nộp |
| Sinh viên chuẩn bị tốt | `sinhvien_demo` | Phỏng vấn, nhận task và làm/nộp bài |
| Sinh viên chưa chuẩn bị | `sinhvien_chuadat_demo` | Minh họa điểm thấp, phản hồi và giới hạn lượt |

Ba tài khoản đã đăng nhập kiểm tra, chưa có phỏng vấn/dự án/phiên/phân công/task. Tài khoản quay thử trước đây được giữ riêng, không dùng nhầm vào bộ mới.

## Thứ tự trình bày

1. **Giới thiệu:** V-Intern mô phỏng kỳ thực tập; AI hỗ trợ, giảng viên giữ quyền quyết định chính thức.
2. **Sinh viên chưa chuẩn bị:** đăng nhập → chọn role → trả lời như người chưa nắm kiến thức → nộp/chờ AI → giải thích kết quả thực tế. Dưới 50: chưa đạt; 50–70: đề xuất role khác; tối đa 3 lượt tổng cộng. Không sửa điểm.
3. **Sinh viên chuẩn bị tốt:** đăng xuất tài khoản trên → đăng nhập tài khoản còn lại → phỏng vấn bằng kiến thức, ví dụ và lý do → khi trên 70, cho thấy workspace đang chờ phân công.
4. **Giảng viên:** đăng nhập trong cửa sổ/profile khác → Thư viện dự án → Sổ tay học tập cá nhân → khởi tạo phiên tên dễ nhớ, lịch ít nhất phù hợp lộ trình 14 ngày → thiết lập → chọn **Sinh viên Bảo vệ 23/10**, đúng role Frontend → bắt đầu phiên.
5. **Kế hoạch:** sinh nháp AI → đọc task/DoD/phụ thuộc/ngày/người nhận → công bố → kích hoạt Sprint đầu. Có Sprint trong danh sách chưa đồng nghĩa Sprint đã active.
6. **Sinh viên:** tải lại Tổng quan → đọc task → kéo Cần làm sang Đang làm → mở Mentor hỏi theo task. Thẻ có phụ thuộc chưa xong sẽ bị chặn đúng quy tắc.
7. **Nếu đã chuẩn bị GitHub/source/suite:** liên kết danh tính, nhận lời mời repo do tài khoản chung Admin tạo → commit vào nhánh riêng → mở PR → nộp URL PR trong task → đọc runner/AI → giảng viên trả sửa hoặc duyệt. AI không tự Done.
8. **Nếu không đủ thời gian:** nói rõ phần sau là bằng chứng QA đã chạy trước; mở [báo cáo nhập vai](ROLEPLAY-ACCEPTANCE.md), ảnh vòng sửa bài, đánh giá 85,5/KPI 95,7 và chứng nhận. Không gọi đó là điểm vừa sinh từ tài khoản trắng.
9. **Kết thúc:** giới thiệu báo cáo PDF/Excel, truy vết SHA và phân quyền; nêu giới hạn còn lại đúng tài liệu.

## Checklist trước khi lên trình bày

- [ ] FE 3001, health API 8080/database hoạt động; có Internet cho AI/GitHub.
- [ ] Giảng viên và sinh viên dùng hai trình duyệt/profile riêng; hai sinh viên chuyển bằng đăng xuất/đăng nhập.
- [ ] Không dùng các tài khoản này ở cổng QA 3004.
- [ ] Nếu chấm code trực tiếp: kiểm **suite của đúng task**, không chỉ worker online; chuẩn bị code chạy được và quyền GitHub.
- [ ] Mở sẵn [hướng dẫn chi tiết](DEMO-GUIDE.md) và bằng chứng QA để chuyển khi AI chậm hoặc thời gian ngắn.
- [ ] Không seed/reset database; không dùng tài khoản quay thử thay bộ bảo vệ mới.

Tên tài khoản “Chưa đạt” chỉ là nhãn kịch bản. Không có điểm thấp cài sẵn; kết quả được AI chấm từ câu trả lời thực tế.
