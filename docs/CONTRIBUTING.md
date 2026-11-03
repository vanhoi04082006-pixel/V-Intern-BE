# Đóng góp

Quy trình này áp dụng cho mọi thay đổi trong `V-INTERN-BE`. Mục tiêu: `main` luôn build được, migration không phá dữ liệu và contract FE ↔ BE không lệch.

## 1. Trước khi bắt đầu

```powershell
git status --short
git branch -vv
git log -1 --oneline
```

- Không reset/clean/checkout đè working tree đang có thay đổi chưa commit.
- Nếu working tree có việc của người khác, hỏi trước khi chạm.
- Đọc chương domain liên quan và test gần service trước khi sửa.
- Với thay đổi API, đọc [api/README](api/README.md) và kiểm tra adapter FE tương ứng.

## 2. Nhánh

```powershell
git switch -c feat/<mô-tả-ngắn>
```

| Tiền tố | Dùng cho |
|---|---|
| `feat/` | Tính năng mới |
| `fix/` | Sửa lỗi |
| `docs/` | Chỉ tài liệu |
| `refactor/` | Đổi cấu trúc, không đổi hành vi |
| `test/` | Bổ sung/sửa test |
| `chore/` | Dependency, cấu hình, vệ sinh |

Quy tắc:

- Không commit trực tiếp lên `main` nếu repo đang yêu cầu PR.
- Không force push lên nhánh dùng chung.
- Không xóa nhánh `archive/*` chỉ vì đã cũ.
- Tên nhánh không chứng minh đã merge; kiểm tra ancestry/PR thực tế.

## 3. Commit

Commit message bằng **tiếng Anh**, ngắn, mô tả hành vi:

```text
feat(tasks): block review transition when dependencies are pending
fix(github): reject stale callback state
docs(api): document submission SHA conflict
test(kpi): cover missing weight normalization
```

Không dùng `update`, `fix bug`, `final`. Mỗi commit nên là một đơn vị logic; không trộn refactor lớn với thay đổi hành vi.

## 4. Thay đổi code

### Quy ước chung

- TypeScript strict; không `any` mới nếu có thể mô tả kiểu.
- Không `@ts-ignore`, `@ts-expect-error`, `eslint-disable` để né lỗi. Nếu buộc phải dùng, ghi lý do, phạm vi hẹp và có review.
- Controller mỏng; policy/công thức nằm ở service/calculator có test độc lập.
- Không đặt logic nghiệp vụ trong `main.ts`, guard toàn cục hoặc entity.
- Không thêm dependency nếu giải pháp hiện có đủ dùng.

### API

- Endpoint mới phải có DTO, validation, authentication, permission và ownership.
- Field lạ bị từ chối; response không lộ secret/PII.
- Lỗi dùng `code` ổn định + `message` cho người dùng + `details` có cấu trúc.
- Khi đổi DTO/route: cập nhật Swagger, `docs/api/`, parser FE và test trong cùng PR.

### Trạng thái và dữ liệu

- Transaction cho thay đổi nhiều bản ghi.
- `expectedVersion` cho ghi đè có kiểm soát.
- `requestId`/ledger key cho thao tác idempotent.
- Snapshot cho dữ liệu phải giữ lịch sử (đề bài, SHA, report, chứng nhận).
- Không sửa trạng thái bằng SQL tay để “đi qua” test.

### AI và tích hợp

- AI chỉ đề xuất; không cấp quyền/chốt điểm/tự Done.
- Structured output phải qua validator; lỗi provider không tạo kết quả giả.
- Prompt/version/provenance phải lưu khi ảnh hưởng kết quả.
- GitHub token mã hóa; webhook xác minh HMAC; runner bind đúng request/suite/SHA.

## 5. Migration

- **Không sửa migration đã chạy.** Thêm migration mới.
- Đặt tên rõ mục đích và giữ rollback hợp lý.
- Kiểm `migration:show` trước khi chạy; xác nhận DB đích.
- Chạy `audit:schema` sau migration.
- Với dữ liệu hiện có, viết migration có thể chạy trên DB đã có bản ghi.
- Không chạy `seed:dev`/reset trên DB bàn giao.

Xem [MIGRATION_POLICY](database/MIGRATION_POLICY.md).

## 6. Test

- Thêm test cho hành vi mới và nhánh lỗi/biên.
- Bug fix phải có test tái hiện lỗi trước khi sửa (nếu khả thi).
- Không sửa test để khớp hành vi sai; sửa code hoặc cập nhật kỳ vọng có lý do.
- Không skip/xóa test hoặc hạ coverage để merge.
- E2E chỉ chạy trên DB riêng; không trỏ DB chính.

```powershell
& .\scripts\Use-ProjectStorage.ps1
npm run lint
npm test
npm run build
git diff --check
```

Với thay đổi contract/schema: chạy thêm E2E và `audit:schema` trên DB disposable.

## 7. Pull request

PR cần:

| Mục | Nội dung |
|---|---|
| Mục tiêu | Vấn đề gì, phạm vi nào |
| Thay đổi chính | Module/route/migration bị ảnh hưởng |
| Bằng chứng | Lệnh đã chạy, test count, log/artifact |
| Rủi ro | Phần chưa kiểm, migration, rollback |
| Liên kết | Issue/tài liệu/PR FE liên quan |

Điều kiện merge:

- `backend-ci` xanh: lint, unit, build, SQL 2019, migration, E2E.
- `grading-runner` xanh nếu chạm runner.
- Không còn conflict; không force push sau review mà không báo.
- Ít nhất một người review (hoặc quy trình review đã thống nhất).
- Không merge khi gate đỏ hoặc chỉ “retry cho xanh”.

## 8. Review checklist

- [ ] Hành vi đúng mô tả, không sửa ngoài phạm vi.
- [ ] Không phá route/API contract/quyền.
- [ ] DTO/validation đầy đủ; response không lộ dữ liệu nhạy cảm.
- [ ] Transaction/version/idempotency đúng chỗ.
- [ ] Migration an toàn, có rollback, không sửa migration cũ.
- [ ] Test đủ và có ý nghĩa; không skip.
- [ ] Tài liệu/OpenAPI liên quan đã cập nhật.
- [ ] Không có file rác (`dist`, `.env`, log, ảnh chứa secret).

## 9. Tài liệu

- Thay đổi kiến trúc → cập nhật [ARCHITECTURE](ARCHITECTURE.md) hoặc thêm ADR.
- Thay đổi API → cập nhật [api/](api/) và [API-CONTRACTS của FE](https://github.com/vanhoi04082006-pixel/V-Intern-FE/blob/main/docs/API-CONTRACTS.md).
- Thay đổi schema → cập nhật [database/](database/).
- Thay đổi quy trình test/gate → cập nhật [TESTING](TESTING.md).
- Kết quả kiểm chứng mới → ghi vào [VERIFICATION](VERIFICATION.md), không sửa số liệu lịch sử.

## 10. An toàn Git

Được phép:

```powershell
git status
git diff
git add <file>
git commit
git switch -c <branch>
```

Không làm nếu chưa kiểm tra/được duyệt:

```powershell
git reset --hard
git clean -fd
git checkout -- <file>
git push --force
```

Không commit `.env`, `manual-runtime/private`, `dist`, log runtime, `node_modules` hoặc ảnh chứa secret. Nếu lỡ commit secret, coi như đã lộ: rotate và xử lý theo quy trình, không chỉ xóa file trong commit sau.
