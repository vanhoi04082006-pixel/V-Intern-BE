# GitHub và đánh giá code

## OAuth theo người dùng

Tạo GitHub OAuth App với callback của BE, ví dụ http://localhost:8080/api/v1/github/callback. Cấu hình GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_CALLBACK_URL, FRONTEND_ORIGIN và khóa base64 32bytes GITHUB_TOKEN_ENCRYPTION_KEY trong .env server. Có thể tạo khóa bằng node crypto.randomBytes(32).toString('base64'); không gửi khóa trong chat.

Giảng viên mở /instructor/github; scope read:user public_repo để tạo public repo dưới GitHub của họ. Sinh viên mở /intern/github, scope read:user để chứng minh danh tính khi nộp/invite. Gmail chỉ là email; người dùng cần GitHub account riêng. OAuth state dùng một lần10phút, cookie HttpOnly và PKCE S256; callback revalidate user active + GitHub numericID. Token AES256GCM có AAD userId, không trả/log raw token. Một GitHub numericID chỉ gắn một user ứng dụng.

## Repository mỗi phiên

Lead instructor tạo/manage. Tên deterministic vintern-{sessioncode}-{sessionid8}, description có marker sessionUUID, public:true, auto-init. Lease/idempotency và marker + repoID + numericOwnerID tránh trùng/chiếm repo. Start trigger tự động; mất cấu hình hoặc token không làm fake repo và có retry rõ ở SessionRepositoryCard.

Invite giải quyết user theo numericID (không dùng username cũ có thể bị tái sử dụng), revalidate repoID/owner/public rồi gửi collaborator invitation. Batch tối đa5, progress theo thành viên; sinh viên phải chấp nhận invitation trên GitHub. Reconnect sang tài khoản khác không tự đổi repo của phiên đã gắn owner.

## Bài nộp và evidence

Chỉ HTTPS github.com, URL PR mở/chưa merge, full40SHA commit hoặc repo/ref explicit. Repo phải đúng session; PR author hoặc commit author phải là numericID của sinh viên liên kết. Snapshot head/base/repoId/ref lưu trước chuyển Review.

Evidence lấy compare baseSHA...headSHA cố định và blobSHA, không lấy diff PR đang thay đổi. Giới hạn20files,30KB/file,150KB source, concurrency4; file bí mật/key hoặc dấu hiệu credential bị loại cả content/patch. Thiếu/unsupported/large source trả warnings và complete=false, không tự cho đạt. GitHub checks chỉ supplementary, không tin kết quả do sinh viên tự quản.

AI nhận task spec/DoD/source/diff và trusted runner result; strict rubric/findings chỉ file+line thật. Input/evidence hash, model/run/SHA lưu để truy vết. needs_changes khi lỗi/testfail/điểm thấp; awaiting_instructor chỉ đủ evidence + trusted passed tests + đủ spec + không limitations. Nếu thiếu runner là inconclusive.

Giảng viên xác nhận: kiểm tra quyền manage, pending submission/taskVersion và SHA freshness. Task Done chỉ sau approve theo rubric; review đang chạy không được override. Manual override phải lý do>=30ký tự và audit; không auto merge PR. Branch/PR base hoặc head đổi thì nộp lại; fixedcommit vẫn phải tồn tại/đọc được.

## Webhook và thay đổi sau khi nộp

Migration 27 thêm receipt theo delivery UUID, nhật ký sự kiện theo phiên và trạng thái cấu hình webhook. Đặt `GITHUB_WEBHOOK_URL` thành URL HTTPS công khai kết thúc bằng `/api/v1/github/webhook`, cùng `GITHUB_WEBHOOK_SECRET` ngẫu nhiên ít nhất 32 ký tự ở server. Không dùng encryption key làm webhook secret. URL localhost chưa thể nhận delivery từ GitHub. Khi repository sẵn sàng, server tạo/cập nhật đúng hook của URL ứng dụng; nút cấu hình lại trong phiên chỉ dành cho lead owner. Scope `public_repo` hiện có bao gồm quyền hook repository public.

`POST /api/v1/github/webhook` dùng HMAC SHA256 trên raw bytes, so sánh constant time, giới hạn JSON 1 MiB và không dùng JWT. Payload quá lớn trả 413; JSON sai trả 400 an toàn trước khi Nest chuyển đổi lỗi parser. Không lưu raw payload hoặc chữ ký. Repo numeric ID, owner numeric ID, tài khoản liên kết còn hoạt động và lead owner của phiên phải khớp. Delivery trùng nội dung xử lý một lần; cùng ID với nội dung khác trả 409. Repository lạ hoặc owner đã disconnect bị bỏ qua.

Sự kiện `pull_request`/`push` ghi `observedHeadSha` và gửi thông báo khi source hiện tại khác bài đang nộp; `headSha` đã nộp, điểm và trạng thái task không đổi. Sinh viên/giảng viên thấy cảnh báo cần kiểm tra và nộp/chấm lại. `check_suite`/`workflow_run` chỉ là nhật ký, không thay trusted runner hoặc quyết định giảng viên. `GET /sessions/:id/github/activity` có phân trang và dùng cùng quyền đọc phiên; `POST /sessions/:id/github/webhook` chỉ owner có quyền quản lý.

Kiểm chứng local: 6 test HTTP với SQL Server kiểm tra chữ ký, dung lượng, JSON sai không lộ nội dung, delivery idempotent, SHA bất biến, cách ly phiên, quyền đọc và disconnect. GitHub transport bị chặn trong suite này; đây không phải bằng chứng delivery từ GitHub thật. Unit kiểm tra thêm đăng ký hook, identity và reuse hook. Nguồn: [GitHub signature](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), [hook API](https://docs.github.com/en/rest/repos/webhooks), [OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps).

## Giới hạn nghiệm thu ngoài

Chưa có OAuth App/linked accounts hoặc runner thì không được khẳng định repo/AI execution đã hoạt động thật. Cấu hình thử với repository public dành nghiệm thu, hai danh tính độc lập, một bài đạt/một bài lỗi và kiểm tra teacher final approval. Không dùng dữ liệu/secret thật của lớp cho smoke test.

Nguồn chính thức: [OAuth/PKCE](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [repo API](https://docs.github.com/en/rest/repos/repos), [PR API](https://docs.github.com/en/rest/pulls/pulls), [users API](https://docs.github.com/en/rest/users/users).
