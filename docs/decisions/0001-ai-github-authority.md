# ADR0001: Phân tách AI, evidence và quyết định chính thức

## Trạng thái

Accepted,14/10/2026; theo yêu cầu người dùng đã duyệt.

Phần ownership repository dưới đây là quyết định lịch sử, được thay bởi [ADR0002](0002-admin-repository-account.md) ngày19/10/2026: Admin cung cấp tài khoản chung để tạo repo. Các ràng buộc AI/evidence/giảng viên duyệt vẫn áp dụng.

## Bối cảnh

Sinh viên nộp code/PR và trò chuyện với AI. Model/source/checks đều có thể sai hoặc bị thao túng. Repository phải thuộc GitHub của giảng viên; việc tạo dưới một service account chung làm sai ownership. Chạy code sinh viên trong BE làm lộ DB/API keys và host.

## Quyết định

OAuth theo principal, encrypted token/numericID, repository riêng theo session. Chụp base/head SHA, collect immutable blobs/diff và giới hạn context; không đưa credential cho model. AI proposal strict schema và provenance, không pass/merge/Done trực tiếp. Trusted execution từ runner cách ly có HMAC bind toàn request+suite; teacher final approval/audit. Sharing dùng consent snapshot đọc riêng, không biến requester thành co-owner.

## Phương án khác

Một PAT chung đơn giản hơn nhưng repo sai chủ và blast radius lớn. Tin PRchecks/student tests rẻ hơn nhưng sinh viên có thể tự đặt checksuccess. Clone/install/run trực tiếp BE tiện hơn nhưng untrusted hooks/code chạm secret/SQL. Autoapprove theo model nhanh hơn nhưng không đủ evidence và bỏ bước teacher đã yêu cầu.

## Hệ quả

OAuth App và runner/suites cần vận hành riêng. Thiếu cấu hình/evidence trả unavailable/inconclusive. Quyết định có manual override reason rõ và audit; không im lặng hạ chuẩn. Thêm GitHubprivate/organization ở tương lai phải cập nhật scopes/owner policy và tests, không thay publicaccount ownership hiện tại.
