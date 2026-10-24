# G5 — Lời mời repository và quyền cộng tác

Ngày kiểm **25/10/2026 (UTC+7)**. Phần local đã triển khai; **nghiệm thu GitHub live và webhook live đang chờ kết nối lại tài khoản chung**. Không đánh dấu checkpoint G5 hoàn tất khi phụ thuộc này chưa giải quyết.

## Kết quả có nguồn

| Nhóm | Kết quả | Nguồn dưới workspace |
|---|---|---|
| BE unit | 102 suite / 788 test | `.runtime/g5-be-unit-final.log` |
| BE build/lint | Qua; 15 cảnh báo console cũ, không có lỗi lint | `.runtime/g5-be-build-final.log`, `g5-be-lint-final.log` |
| SQL GitHub/sharing/webhook | 3 suite / 29 test | `.runtime/g5-domain-sql-final.log` |
| Migration G5 | 2 test | `.runtime/g5-migration.log` |
| FE quality | 100 file / 610 test; typecheck/lint/build qua | `.runtime/g5-fe-unit-final.log`, `g5-fe-typecheck-final.log`, `g5-fe-lint-final.log`, `g5-fe-build-final.log` |
| Chrome hai vai | 3 luồng, 390/768/1440, 0 page error | `manual-runtime/g5-20261025/browser-result.json`, `shots/` |
| Native | Migration cả hai DB; hash tài khoản/quyền/16 bảng nghiệp vụ giữ nguyên; file DB trong project | `.runtime/g5-native-activation.log`, `manual-runtime/g5-20261025/native-activation.json` |
| GitHub thật | `GITHUB_RECONNECT_REQUIRED` | `.runtime/g5-github-live.log` |

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

## Phần chưa thể chốt

Kết nối thực tế của tài khoản chung `hbuivanhoi6-stack` cần được Admin kết nối lại. Chưa có nghiệm thu tạo lời mời mới/nhận/mời lại hoặc delivery webhook GitHub thật ở mốc G5. Script và relay nhận sự kiện giới hạn route đã có sẵn; chưa mở tunnel khi chưa có kết nối hợp lệ. Test ký tay và SMTP local không được dùng thay cho bằng chứng GitHub live.

CI G4 trước đó đã xanh ở [BE #7](https://github.com/vanhoi04082006-pixel/V-Intern-BE/pull/7) và [FE #17](https://github.com/vanhoi04082006-pixel/V-Intern-FE/pull/17). G5 cần gate riêng trên cặp commit mới; không suy diễn từ G4.

Lần CI G5 đầu phát hiện hai suite SMTP cùng dùng một outbox làm worker đọc nhầm fixture của suite khác. Gate G5 đã được tách sang DB disposable riêng (`96`), vẫn chạy bắt buộc cùng pipeline. Nhóm G3/G4/communications giữ nguyên; không bỏ assertion, giảm số test hoặc tăng timeout.

Đọc [hướng dẫn GitHub](../GITHUB-INVITATIONS.md) để thao tác và [kế hoạch G5](../../tasks/g5-execution.md) để xem tiêu chí còn lại.
