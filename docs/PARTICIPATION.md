# Thời hạn, điểm phạt và bằng chứng

Tài liệu này mô tả phần **D01–D03 của G6**. T01–T02 đã được kiểm trên QA: Agent tư vấn, giảng viên xem trước/phê duyệt, sinh viên đọc lịch sử. Xem [hướng dẫn thay thành viên](REPLACEMENT.md). [T03 đối chiếu quyền GitHub](REPOSITORY-ACCESS-RECOVERY.md) đã đạt SQL/Chrome QA và live pending lifecycle; hai database native đã chạy ba migration G6 và giữ nguyên dữ liệu cũ.

## Hiểu quy tắc qua một ví dụ

Giảng viên đặt: cảnh báo từ lần 1, trừ 5 điểm từ lần 2, đề xuất thay từ lần 3, tổng điểm phạt tối đa 20 trong một phiên.

| Lần quá hạn | Ghi nhận | Khi chấm bài |
|---|---|---|
| 1 | Cảnh báo, 0 điểm phạt | Giữ điểm rubric |
| 2 | 5 điểm phạt | Rubric 90 → giảng viên xác nhận trừ 5 → lưu 85 |
| 3 | 5 điểm phạt và đánh dấu cần xem xét thay | Giảng viên tiếp tục quyết định; không tự kick |

Để trống mức trừ nghĩa là chưa bật trừ điểm. Số 0 là một mức cấu hình hợp lệ, khác với để trống. Điểm không âm; tổng cap tính theo sinh viên trong phiên. Không trừ vào tiền thật.

## Khi nào một bài được xem là trễ?

So sánh **thời điểm bài nộp hợp lệ đầu tiên đã được API lưu** với hạn hiệu lực. Thời gian giảng viên chấm không làm sinh viên thành nộp trễ. Một nhiệm vụ/một sinh viên có tối đa một ghi nhận; việc yêu cầu sửa, rút hoặc nộp lại không tự tạo lần vi phạm thứ hai.

Hạn hiệu lực gồm hạn nhiệm vụ và gia hạn được giảng viên lưu. Lần kích hoạt chính sách đầu chỉ áp dụng các hạn đến sau thời điểm đó. Không tự tạo vi phạm cho hạn đã qua từ trước. Mỗi ghi nhận giữ phiên bản chính sách/hạn và bằng chứng; thay đổi mức phạt không tự tăng mức cũ.

## Giảng viên thao tác như thế nào?

1. Mở **Thời hạn & kỷ luật**, chọn phiên mình phụ trách.
2. Chọn **Cấu hình chính sách**, nhập ngưỡng theo thứ tự cảnh báo ≤ trừ điểm ≤ đề xuất thay, mức/cap và lý do cụ thể.
3. Xem danh sách bằng chứng: nhiệm vụ, sinh viên, hạn, lần nộp đầu, lần vi phạm và điểm ghi nhận.
4. Cần ngoại lệ thì chọn **Gia hạn**, **Miễn trừ** hoặc **Hoàn tác**, luôn ghi lý do. Phiên bản được kiểm để tránh hai người xử lý đè nhau.
5. Khi chấm bài có phạt, xem điểm rubric, phần trừ và điểm sau trừ rồi xác nhận trước khi lưu.

**Đối chiếu ngay** xử lý một lô có giới hạn, không hứa xử lý toàn bộ phiên lớn trong một request. Worker nền tiếp tục theo vòng.

## Sinh viên đọc gì?

Trang **Thời hạn & ghi nhận** chỉ trả dữ liệu của tài khoản đang đăng nhập, kể cả lịch sử khi không còn assignment hiện hành. Sinh viên thấy hạn, bằng chứng nộp và lý do xử lý. Khi đã chấm, hệ thống hiển thị rõ điểm rubric − phần trừ = điểm chính thức.

“Điểm phạt ghi nhận” trong thống kê là căn cứ xem xét, không phải tổng điểm đã trừ ở các bài được duyệt. Miễn trừ/hoàn tác sau khi chốt giữ lịch sử và đảo sổ phạt; không tự sửa điểm bài, đánh giá hoặc KPI đã duyệt. Nếu cần sửa kết quả đã chốt phải đi qua quy trình đánh giá có quyền tương ứng.

## API và nơi đọc code

| API dưới `/api/v1` | Tác dụng |
|---|---|
| `GET /participation/me` | Bằng chứng của chính caller, phân trang |
| `GET /sessions/:id/participation` | Báo cáo phiên cho chủ trì/Admin |
| `POST /sessions/:id/participation/policy` | Lưu policy với expectedVersion và lý do |
| `POST /sessions/:id/participation/refresh` | Đối chiếu có giới hạn và throttle |
| `POST /sessions/:id/participation/incidents/:id/resolve` | Miễn trừ/hoàn tác có kiểm phiên bản |
| `POST /sessions/:id/participation/tasks/:id/extend` | Gia hạn sau hạn cũ và giờ server |
| `POST /sessions/:id/participation/incidents/:id/replacement-advice` | Chủ trì/Admin có thêm quyền xem tuyển dụng yêu cầu Agent tư vấn; chưa thay người |

`src/participation/participation-policy.ts` chứa quy tắc thuần. `participation-ledger.service.ts` chịu trách nhiệm khóa, snapshot, ledger và sự kiện. `participation.service.ts` kiểm phạm vi và xử lý lệnh. `SubmissionsService.review` lưu điểm gốc/phạt/cuối sau xác nhận. FE dùng `src/components/participation` và API parser riêng; không quyết định điểm hoặc quyền từ browser.

Migration `CreateParticipation1763500800000` chỉ bổ sung bảng/cột nullable. Rollback bị chặn khi có policy, hạn, sự kiện, incident, ledger hoặc nguồn gốc điểm đã lưu, để không xóa lịch sử.

## Agent đề xuất thay thế đọc gì?

`replacement-advisor` chạy trong runtime Agent chung: model chọn tool đọc tri thức, kiểm quyền lại, đọc tri thức đã phát hành rồi sinh output có schema và căn cứ. Mỗi yêu cầu chủ động tạo run mới để đọc tri thức hiện tại; checkpoint, tool receipt và trace SQL vẫn lưu theo run.

Server chỉ đưa các ứng viên đã đạt đúng vai trò, còn hoạt động, có vai trò sinh viên, chưa có assignment hoặc công việc đang mở. Lượt đối chiếu tối đa 60 hồ sơ và đưa tối đa 20 ứng viên vào model; nếu chưa xét hết sẽ báo giới hạn đó. Không đưa email ứng viên vào prompt. Khi không có ứng viên hợp lệ, hệ thống trả rõ không có, không bịa người hoặc chạy model thay thế.

Output chỉ được chọn ID đã được server đưa vào và phải dẫn đúng bằng chứng ứng viên. ID/căn cứ bịa, trường yêu cầu tự kick hoặc cấp quyền bị chặn. Server đối chiếu lại sau khi model trả; nếu bằng chứng hoặc danh sách đã đổi, yêu cầu đề xuất mới. Sự kiện tư vấn lưu riêng cùng `aiRunId` (mã lượt gọi model), dấu vân tay dữ liệu và phiên bản bằng chứng. **Tư vấn chưa phải thao tác thay người.**

T01 đã qua 3 ca SQL dùng runtime LangGraph/checkpoint thật với model fixture được khai báo rõ; chưa gọi đây là nghiệm thu Gemini/LangSmith ngoài. Nguồn: `.runtime/g6-t01-domain-sql.log`; 817 unit/107 suite tại `.runtime/g6-t01-full-unit.log`.

## Phạm vi đã kiểm

SQL thật: 17 ca về hạn, cap, đồng thời, miễn trừ, gia hạn, giữ điểm duyệt và xác nhận phạt; thêm 3 ca migration bảo vệ dữ liệu. Chrome QA: 2 vai × 5 độ rộng 390/768/1024/1280/1440; policy validation/lưu, miễn trừ, gia hạn, Escape/trả focus, sinh viên đọc kết quả và giảng viên ngoài phạm vi nhận 403. Nguồn: `.runtime/g6-d03-sql-recovered.log`, `g6-migration-green.log`, `manual-runtime/g6-20261025/participation-browser.json`. Không dùng test model hoặc SMTP local để tuyên bố đã gửi email ngoài hay Agent thay người đã hoàn thiện.
