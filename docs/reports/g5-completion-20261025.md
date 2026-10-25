# G5 — Lời mời repository và quyền cộng tác

Ngày kiểm **25/10/2026 (UTC+7)**. Tài khoản chung **hbuivanhoi6-stack** đã kết nối lại. GitHub thật đã chứng minh pending/accepted và webhook ping/dedup. **Chưa nghiệm thu chu trình nhận lời mời mới rồi hết hạn/mời lại trên GitHub thật.** SMTP nghiệm thu local theo phạm vi đã duyệt.

## Kết quả có nguồn

| Nhóm | Kết quả | Nguồn dưới workspace |
|---|---|---|
| BE unit | 104 suite / 791 test | `.runtime/g5-be-unit-reconnected.log` |
| BE build/lint | Qua; 15 cảnh báo console cũ, không có lỗi lint | `.runtime/g5-be-build-reconnected.log`, `g5-be-lint-reconnected.log` |
| SQL GitHub/sharing/webhook | 3 suite / 30 test | `.runtime/g5-worker-cooldown-green.log` |
| Migration G5 | 2 test | `.runtime/g5-migration.log` |
| FE quality | 100 file / 610 test; typecheck/lint/build qua | `.runtime/g5-fe-unit-final.log`, `g5-fe-typecheck-final.log`, `g5-fe-lint-final.log`, `g5-fe-build-final.log` |
| Chrome hai vai | 3 luồng, 390/768/1440, 0 page error | `manual-runtime/g5-20261025/browser-result.json`, `shots/` |
| Native | Migration cả hai DB; hash tài khoản/quyền/16 bảng nghiệp vụ giữ nguyên; file DB trong project | `.runtime/g5-native-activation.log`, `manual-runtime/g5-20261025/native-activation.json` |
| Native hotfix | Migration bổ sung cả hai DB; hash dữ liệu được bảo vệ giữ nguyên | `manual-runtime/g5-20261025/native-activation-cooldown.json` |
| GitHub thật | 1 pending, 1 accepted; sync xử lý 2, bỏ qua 0; 0 collaborator write | `manual-runtime/g5-20261025/members-live-result.json` |
| Webhook thật | Ping HTTP 200; redelivery cùng GUID dedup; chỉ 1 receipt | `manual-runtime/g5-20261025/webhook-live-result.json` |

Các nhóm là những lần chạy độc lập, không cộng thành một lần kiểm tổng hợp. Manifest ghi commit code, timestamp UTC và hash nguồn. SMTP đã đi qua giao thức thật tới server loopback do ca SQL mở; không tuyên bố giao thư tới hộp thư ngoài.

## Đã chứng minh

- Phân biệt 201 pending và 204 accepted; numeric ID và repo ID được kiểm; 403/429 không tạo quyền.
- Không gửi trùng pending/accepted; SQL lease chặn lệnh đồng thời; cooldown một phút; batch tối đa năm người.
- Giữ ID và hạn lời mời; expired chỉ được tạo lại khi staff yêu cầu, sau khi đối chiếu và xóa đúng lời mời cũ đã hết hạn.
- Giữ identity cũ khi ngắt kết nối; đổi numeric ID không tự chuyển quyền. Đổi username vẫn theo numeric ID.
- Audit có actor/nguồn/trạng thái. Thông báo và thư V-Intern chống trùng, có phục hồi queue và tôn trọng tùy chọn thông báo trong app.
- Sinh viên chỉ đọc bản ghi của mình và không mời thành viên khác. Thành viên phiên chưa có assignment vẫn mở được lời mời; người ngoài phiên bị chặn.
- HMAC/dedup/repository scope của webhook và regression sharing tiếp tục qua.
- Phát hiện expiry sharing dùng giờ Node đối chiếu hạn SQL; đã chuyển kiểm quyền đọc sang giờ SQL, giữ nguyên assertion/timeout của test.

## Lỗi phát hiện và sửa khi nghiệm thu

Worker mỗi phút cập nhật `lastCheckedAt`, làm nút kiểm tra thủ công gần như luôn gặp cooldown. Migration bổ sung `lastRequestedAt` tách hai nhịp; lease vẫn bảo vệ lệnh đồng thời. SQL chứng minh kiểm tra thủ công đầu sau worker được phép và bấm lặp bị chặn.

DB mới bị `RESOURCE_SEMAPHORE` tại `UNION` trên chuỗi JSON không giới hạn. Chuyển sang `UNION ALL` và khử trùng ở ứng dụng; giữ kiểm tra mã quá 32 ký tự và timeout 15 giây. Migration cũ chỉ đổi truy vấn tương đương cho cài mới; DB đã áp dụng không chạy lại hoặc viết lại dữ liệu.

## Phạm vi live và giới hạn

Repo QA ID `1430503264`, owner numeric ID `308232306` được kiểm trước thao tác. `bvhtesst-stack` đang pending, `cherrytale983-hash` là collaborator accepted; sync không gửi PUT trùng. Token sinh viên trả HTTP 404 khi liệt kê lời mời, nên chưa nhận lời mời mới bằng token đó; accepted có sẵn không thay bằng chứng cho hành động nhận mới.

Webhook dùng relay tạm giới hạn QA repo, kiểm HMAC; route khác 404, unsigned 401, repo khác 403. Hook remote đã tắt và tunnel/relay đã dừng sau nghiệm thu. Chưa có endpoint public lâu dài. SMTP local không chứng minh gửi thư tới hộp thư ngoài.

G5 remote CI đã xanh trước hotfix ở [BE run 40142280613](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/40142280613). Gate cuối phải đọc theo commit trong manifest; không suy diễn từ lần trước.

CI phát hiện hai suite SMTP chung outbox và tên DB bị trùng. G5 nay dùng DB riêng suffix `105`/`106`; unit test kiểm uniqueness của toàn workflow. Nhóm G3/G4/communications giữ nguyên; không bỏ assertion, giảm số test hoặc tăng timeout.

Đọc [hướng dẫn GitHub](../GITHUB-INVITATIONS.md) để thao tác và [kế hoạch G5](../../tasks/g5-execution.md) để xem tiêu chí còn lại.
