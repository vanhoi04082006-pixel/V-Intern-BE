# Kiểm thử: chọn đúng bằng chứng cho điều cần chứng minh

## Bốn lớp kiểm chứng

| Lớp | Chứng minh được | Chưa chứng minh được |
|---|---|---|
| Unit | Công thức, policy, parser, các nhánh lỗi | SQL/HTTP/provider thật đã hoạt động |
| SQL E2E | DTO/guard/service/transaction qua HTTP và SQL | Gemini/GitHub thật nếu transport bị override |
| Browser | Layout, điều hướng, focus, responsive và luồng UI | Mọi nhánh backend nếu chưa kích hoạt |
| Tích hợp thật | OAuth, provider, PR, Docker cho fixture đã thử | Tất cả bài nộp/framework hoặc production |

Không cộng bốn loại thành một số test rồi coi như cùng độ tin cậy. Ghi rõ nguồn, thời điểm, commit/dirty state và fixture.

## Các lệnh cơ bản

```powershell
# Chạy tại thư mục gốc repository Backend
& .\scripts\Use-ProjectStorage.ps1
npm run lint
npm test
npm run build
```

Một nhóm unit: `npm test -- --runTestsByPath src/recruitment/scoring.spec.ts`. Dùng tên file thật trong source, không tự đoán một script không có trong package.json.

## SQL E2E an toàn

E2E yêu cầu DB riêng được chỉ định rõ. Kiểm tra setup của suite để biết DB nào AppModule và fixture DataSource cùng dùng. Trong workspace, MDF/LDF test phải ở dưới dự án và DB chính/tài khoản gốc được giữ nguyên.

```powershell
& .\scripts\Use-ProjectStorage.ps1
$env:E2E_DB_NAME = 'VIntern_E2E_YourPreparedDatabase'
$env:DB_NAME = $env:E2E_DB_NAME
# DB_FILES_ROOT đã được scripts/Use-ProjectStorage.ps1 đặt trong project.
npm run test:e2e -- --runTestsByPath test/recruitment.e2e-spec.ts
```

Ví dụ đòi hỏi DB đã chuẩn bị/login đủ quyền. Không nâng quyền runtime hoặc đổi sang DB chính khi nhận CREATE DATABASE permission denied. Migration/rollback suites có yêu cầu baseline riêng; đọc suite trước khi chạy cả bộ trên một DB đã dùng.

Provider test chỉ nằm trong test override, trả payload qua cùng validator. Runtime không có fallback điểm giả. Test hội thoại phải gọi next/answer theo câu đã được gửi; start/questions không được coi là endpoint dump đề tương lai.

## Hồi quy quan trọng

- Phỏng vấn: các mốc 49,9/50/70/70,1, ba lượt, role khác có reason/reference thật, không phân công khi chưa passed, retry không tiêu thụ lượt mới.
- Quyền: own/managed/foreign, user bị khóa, sharing hết hạn/thu hồi.
- Kế hoạch: graph sai, ngày sai, roster sai, confirm/replay và không tạo task một phần.
- GitHub: PKCE/state, immutable ID/SHA, refresh cạnh tranh, callback/disconnect/reconnect race, webhook HMAC.
- Chấm code: đúng task/spec/suite, response HMAC, chưa đủ evidence, manual reason và AI không tự Done.
- Kết quả: null semantics, trọng số KPI thiếu, ledger idempotency, certificate snapshot và report scope revocation.
- UI: desktop/mobile, keyboard, modal focus/Escape, loading/error/empty và Kanban có guard.

Không bỏ test/assertion hoặc hạ threshold để đạt green. Khi UI thêm nơi hiển thị cùng dữ liệu, scope selector vào vùng mà test cần kiểm tra thay vì giảm số assertion về nghiệp vụ.

## Ghi kết quả

Lưu log dưới thư mục bằng chứng của dự án. Một lần chạy có lỗi rồi sửa phải được phân biệt với lần cuối đạt; không trộn số liệu từ hai ngày. [VERIFICATION](VERIFICATION.md) là bảng chỉ dẫn đến các nguồn kiểm chứng hiện hành và lịch sử.
