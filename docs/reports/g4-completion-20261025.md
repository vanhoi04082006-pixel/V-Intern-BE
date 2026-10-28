# G4 — Phỏng vấn theo lịch, no-show và hẹn lại

Đã triển khai cổng bắt đầu theo hồ sơ CV/booking, phòng chờ, hạn vào phòng 15 phút, ledger từng lượt và lệnh giảng viên hẹn lại có lý do/audit. [Hướng dẫn người dùng và kỹ thuật](../SCHEDULED-INTERVIEWS.md) giải thích từng trạng thái bằng ví dụ 09:00–09:15.

Mốc kiểm ngày **25/10/2026, UTC+7**. Log và manifest lưu timestamp UTC rõ ràng. Phạm vi local, không triển khai production.

## Kiểm chứng độc lập

| Nhóm | Kết quả | Nguồn dưới workspace |
|---|---|---|
| BE unit | 101 suite / 775 test qua | `.runtime/g4-be-unit-final.log` |
| BE build/lint | Qua; 15 cảnh báo console cũ, 0 lỗi lint | `.runtime/g4-be-build-final.log`, `g4-be-lint-final.log` |
| SQL hồi quy cũ | 34 suite / 318 test qua | `.runtime/g4-shared-sql.log` |
| SQL G3/G4 | 3 suite / 33 test qua | `.runtime/g4-domain-sql-verified.log` |
| Migration G4 | 2 test qua; giữ identity, bảo vệ rollback có lịch sử | `.runtime/g4-migration.log` |
| FE unit | 98 file / 605 test qua | `.runtime/g4-fe-unit-final.log` |
| FE typecheck/lint/build | Qua | `.runtime/g4-fe-typecheck-final.log`, `g4-fe-lint-final.log`, `g4-fe-build-final.log` |
| Chrome | 11 luồng G3/G4 qua, 0 page error, 390/768/1440 không tràn ngang | `.runtime/g4-browser-verified.log`, `manual-runtime/g4-20261025/browser-result.json`, `shots/` |
| Native | Hai API health 200, FE 3001; migration G4 trên hai DB, dữ liệu được bảo vệ giữ nguyên | `.runtime/g4-native-activation.log`, `manual-runtime/g4-20261025/native-activation.json` |

Không cộng các nhóm dùng fixture/database khác nhau thành một lần chạy toàn bộ. Manifest ghi commit code và hash nguồn log; CI remote là một bằng chứng riêng.

## Những điều đã chứng minh

- T+14:59 và T+14:59.999 được vào; T+15:00 chưa bắt đầu thì no-show. HTTP 409 không rollback bản ghi vắng mặt.
- Phiên đã bắt đầu không bị worker đánh vắng; đọc lại bằng service mới vẫn thấy đúng phiên. Hai start chạy đồng thời với worker chỉ có một kết quả vào phòng và không tăng lượt hai lần.
- Lịch mới giữ snapshot cũ; gửi lặp cùng yêu cầu không xếp thêm mail. Giảng viên ngoài đợt không đọc/hẹn lại được; sinh viên không tự hẹn hoặc đổi nghề bằng API.
- Hồ sơ đã hủy không được mở lại ngầm. Worker xử lý riêng từng hồ sơ khi một người có hồ sơ mới ở đợt khác.
- Tài khoản kế thừa vai trò qua nhóm được kiểm đúng: nhóm intern đủ điều kiện; vai trò giảng viên/Admin kế thừa không bị biến thành ứng viên.
- Phiên hết hạn của tài khoản CV được đưa tới lịch mới, không có nút tự tạo lượt bằng lịch cũ. Ranh giới điểm và cơ chế chấm hiện hành được giữ nguyên.
- Chuyển sang nộp đợt khác thu hồi capability theo dõi trong DB và cookie; không xóa CV, tài khoản hoặc lịch sử.

## Sửa lỗi kiểm chứng và vận hành

Rà soát phát hiện queue mail dùng giờ Node để so lease do SQL tạo. Đồng hồ SQL thử nghiệm có lệch nhỏ so với host; ca kiểm lease một giây có thể không ổn định. Worker mặc định đã dùng giờ SQL thống nhất cho availability/lease/expiry; test có thể truyền mốc rõ ràng. Không tăng lease 90 giây, timeout, số lượt gửi hoặc bỏ assertion.

Máy trạng thái bổ sung đường chuẩn bị lịch mới sau phiên hết hạn/hủy. Service vẫn kiểm phiên cũ đã kết thúc và quyền giảng viên trước khi chuyển; ca SQL chứng minh không thể dùng lệnh đó để chen ngang phiên đang chạy.

## Bảo toàn và giới hạn

Native `VIntern_M2_BROWSER` và `VIntern_Test_Learning_20261014` nhận `CreateInterviewAdmissions1763328000000`. Đối chiếu hash identity/credential/authVersion, nhóm/quyền và các bảng nghiệp vụ trước/sau migration không đổi; MDF/LDF nằm trong project. Không reset, không dùng các tài khoản trắng để test.

Browser dùng **model deterministic, SQL/graph/SMTP thật tới sink local**. Clock điều khiển chỉ được nạp trong harness loopback, `NODE_ENV=test`, DB disposable cổng 1437; API native không có các hook đó. G4 kiểm thời gian/retake, không tuyên bố có thêm nghiệm thu provider ngoài hoặc email hộp thư thật.

Tài khoản cũ chưa liên kết CV giữ đường lịch sử. Khôi phục mật khẩu tạm đã hết hạn khi dự tuyển đợt mới được theo dõi riêng ở Q05/G7; hẹn lại hiện không reset mật khẩu ngầm. G5 GitHub, G6 nộp trễ/thay người và nghiệm thu tổng hợp G7 chưa được đánh dấu hoàn tất bởi báo cáo này.
