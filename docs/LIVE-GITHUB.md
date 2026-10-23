<!-- historical-acceptance -->
# Hồ sơ nghiệm thu GitHub đã lưu

> Đây là bằng chứng theo các ngày ghi trong hồ sơ bên dưới, không phải lần kiểm tra live hôm nay. Đọc [hướng dẫn hiện hành](architecture/github-code-review.md) để cấu hình/sử dụng; đọc [VERIFICATION](VERIFICATION.md) để phân biệt phạm vi kiểm chứng. Không dùng fixture một task để khẳng định mọi contract đã chạy đạt.

# GitHub, Docker và AI — nghiệm thu 16/10/2026

Luồng chạy trên API nghiệm thu8081, Next.js3004 và SQL `VIntern_Test_Learning_20261014`. Hai database runtime và ba tài khoản trắng không dùng làm fixture. Đây là bài tổng hợp do nhóm sở hữu để kiểm tra tích hợp, không phải quyết định đánh giá một sinh viên thật.

## Danh tính và repository

OAuth App “V-Intern Local” có callback chính8080 và nghiệm thu8081, token expiration bật. Giảng viên `vanhoi04082006-pixel` cấp `read:user public_repo`; sinh viên `buivanhoi12345678` cấp `read:user`. Access/refresh tokens mã hóa trong SQL. Secret ứng dụng chỉ nằm trong `.env` bị Git ignore; mật khẩu GitHub người dùng không lưu trong helper/tài liệu.

Repository do V-Intern tạo dưới tài khoản giảng viên: [vintern-learn-notes-v1-s2-840404b2](https://github.com/vanhoi04082006-pixel/vintern-learn-notes-v1-s2-840404b2). Provision lặp lại trả cùng repo. Giảng viên gửi invite qua API ứng dụng, tài khoản sinh viên nhận lời mời và tạo [PR #1](https://github.com/vanhoi04082006-pixel/vintern-learn-notes-v1-s2-840404b2/pull/1) trên GitHub. PR giữ mở, không tự merge.

## Chuỗi kiểm chứng

Ngày16/10 còn kiểm tra refresh thật sau khi access token giảng viên hết hạn tự nhiên: hai request provision đồng thời chỉ rotate một lần, tokenVersion1→2, ciphertext access/refresh đều đổi, identity/scopes giữ nguyên và lease được nhả. Repo và task Done không thay đổi. Không chỉnh expiresAt để tạo tình huống giả; bằng chứng `naturalTokenRefresh` trong báo cáo JSON.

| Bước | Kết quả thực tế |
|---|---|
| Commit lỗi `33405b2c347dd784825b8a3b290ac929f92f50c8` | Bỏ validation tiêu đề trống |
| Codeload và Docker service | 1/2 trusted checks, điểm50 |
| Gemini | 57.5, needs_changes; task vẫn Review |
| Rút bài, sửa và nộp lại | API giữ SHA của bài cũ, tạo bài nộp mới |
| Commit sửa `1612f550fbb84758d9323003cf8776ad6fea60d8` | Khôi phục validation, maxlength và phản hồi accessible |
| Docker service | 2/2, điểm100; lần review cuối đo5.85giây |
| Gemini code-review-v2 | 98, awaiting_instructor; source đủ trong phạm vi task, không limitation |
| Giảng viên trên UI | Rubric95/85/85/90/90/95, điểm90.5; có nhận xét, không manual override |
| Sau duyệt | Submission approved, task Done/progress100; PR vẫn chưa merge |

Lần review sửa đầu tiên có điểm99 nhưng limitations chứa câu “không có giới hạn”, nên backend giữ inconclusive theo policy. Prompt v2 làm rõ ngữ nghĩa của mảng này, không thêm heuristic xóa limitation hay giảm điều kiện đạt. Retry thật sau đó trả98 và mảng rỗng; lịch sử lần trước vẫn giữ.

Notification thật đến giảng viên khi nộp/AI chấm và đến sinh viên khi AI/human review. Đã thao tác mark-read và mở đúng task từ cả hai vai trò. Regression frontend bao gồm GUID viết hoa từ SQL và chuyển liên kết legacy sang trang task đúng vai trò. Không thay đổi trạng thái task khi đọc notification.

## Runner và contract

Suite `qa-notes-foundation-840404b2-v1` chỉ gắn task `b2d1f16a-d64e-48ba-853e-82bf28854ff4`. Kiểm tra tiêu đề trống và tạo/chỉnh đúng ghi chú bằng bàn phím. Lưu trữ bền vững, lọc và xuất dữ liệu thuộc task tiếp theo; không dùng suite này để chứng minh toàn dự án.

- Task-spec hash: `621e96b1e651061358535410bb41a06ef407b5d049e4a3984aa9d7f821683a00`.
- Suite digest: `a55845241f5317b9eb23ebe8aeb0cedcf08d47e1fdea6bc6d0f6c5021550856d`.
- Runtime image: `sha256:3bbac01aa406e28c545b0390f56ec87461a285d2bf516dcffec4541558c053c9`.
- Tester image: `sha256:3b13ce66cd235ae41b5d0010ba1566a7ba8ac228a773f8a4e276d3e30a804b6e`.

API `/tasks/:id/spec/source` xuất snapshot raw có kiểm tra quyền, dùng để seal. API `/spec` phục vụ UI có trạng thái phụ thuộc động, không dùng làm input hash. Lỗi UMask0077 của service được tái hiện và sửa bằng chmod0444 archive công khai sau khi ghi; thư mục tạm0700, mount read-only và hai container cách ly vẫn giữ nguyên.16/16 unit trên Windows và16/16 trên WSL đạt.

## Webhook thật và dọn môi trường

Receiver HTTPS tạm chỉ nhận POST webhook của đúng repository QA, xác minh raw HMAC rồi chuyển nguyên body vào backend. Public health/API khác trả404, unsigned401, repo khác403. Không đưa API nghiệp vụ, SQL hay runner lên Internet.

GitHub gửi `pull_request.edited` thành công200. Delivery GUID `4b4a34f0-c8bb-11f1-8fbb-0a3a576f15d6` khớp event SQL/head SHA. Yêu cầu GitHub redeliver trả202; receiver trả200/deduped và SQL vẫn đúng một event, task Done giữ nguyên. Đây là delivery từ GitHub thật, không phải tự gửi payload giả.

Sau kiểm tra đã tắt hook `698645695`, dừng tunnel/relay và khôi phục status local `not_configured`. Giữ repo/PR/event làm bằng chứng. Dịch vụ lâu dài cần endpoint HTTPS ổn định; không dùng URL tunnel đã đóng làm cấu hình production.

## Artifacts và giới hạn

Báo cáo máy đọc: github-live-verification.json (`manual-runtime/github-live-verification.json` trong workspace local). Ảnh: giảng viên duyệt (`manual-runtime/github-instructor-approved.png` trong workspace local), student evidence (`manual-runtime/github-student-review-evidence.png` trong workspace local), student mobile (`manual-runtime/github-student-review-mobile.png` trong workspace local), thông báo (`manual-runtime/github-student-notifications.png` trong workspace local). Các artifact local không chứa OAuth secret hoặc mật khẩu và không stage vào hai repository.

Đã nghiệm thu một contract React cụ thể với hai danh tính thật. Không suy ra độ chính xác AI, độ phủ mọi framework, native SQL2019, remote CI hoặc production deployment. Contract mới phải được review/seal đúng task/spec/images/checks; thiếu suite thì không tự đề xuất đạt.
