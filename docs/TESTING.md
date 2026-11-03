# Kiểm thử Backend

Mỗi lớp test trả lời một câu hỏi khác nhau. Không cộng số test thành một “điểm tin cậy” duy nhất, và không dùng suite xanh để tuyên bố provider thật đã chạy.

## 1. Bốn lớp kiểm chứng

| Lớp | Chứng minh được | Chưa chứng minh được |
|---|---|---|
| **Unit (Jest)** | Công thức, policy, parser, guard, service, nhánh lỗi | SQL/HTTP/provider thật đã hoạt động |
| **SQL/HTTP E2E** | DTO → guard → service → transaction → SQL | Gemini/GitHub thật nếu transport bị override |
| **Runner** | Container cách ly, policy, HMAC, cleanup | Mọi framework/pipeline của sinh viên |
| **Live** | OAuth/provider/PR/Docker thật cho fixture đã thử | Toàn bộ mọi nhánh hoặc production |

Ghi rõ nguồn, thời điểm, commit/dirty state, database và fixture cho mỗi lần chạy.

## 2. Lệnh cơ bản

```powershell
# Tại thư mục gốc repository Backend
& .\scripts\Use-ProjectStorage.ps1
npm run lint
npm test
npm run build
git diff --check
```

| Lệnh | Phạm vi |
|---|---|
| `npm test` | Jest unit, chạy tuần tự (`--runInBand`) |
| `npm run test:coverage` | Unit + coverage |
| `npm run test:e2e` | HTTP/SQL E2E trên DB riêng |
| `npm run test:career-roles:migration` | Migration test chuyên biệt |
| `npm run audit:schema` | Bảng/sequence/index/CHECK/kiểu dữ liệu |
| `cd grading-runner; npm test` | Policy/HMAC của runner |

Chạy một nhóm unit:

```powershell
npm test -- --runTestsByPath src/recruitment/scoring.spec.ts
```

Dùng tên file thật trong source; không tự đoán script không có trong `package.json`.

## 3. Unit test

- Framework: **Jest 29 + ts-jest**, chạy tuần tự.
- Test đặt cạnh code: `src/**/*.spec.ts`.
- Trạng thái hiện hành (02/11/2026): **113 suite / 849 test đạt**.

Nhóm hồi quy quan trọng:

| Nhóm | Phải giữ |
|---|---|
| Tuyển dụng | Ngưỡng 49,9/50/70/70,1; ba lượt; role khác có reason/reference thật; retry không tiêu thụ lượt mới |
| Quyền | own/managed/foreign; user bị khóa; scope theo project/session |
| Kế hoạch | Graph sai, ngày sai, roster sai, confirm/replay, không publish một phần |
| GitHub | PKCE/state, numeric ID/SHA, refresh cạnh tranh, callback/disconnect/reconnect race, webhook HMAC |
| Chấm code | Đúng task/spec/suite, HMAC response, thiếu evidence, manual reason, AI không tự Done |
| Kết quả | Null semantics, trọng số KPI thiếu, ledger idempotency, certificate snapshot, report scope revocation |
| AI | Schema/parse lỗi, timeout hữu hạn, prompt version, provenance |
| Báo cáo | Snapshot, scope, PDF/XLSX nhất quán |

Không skip, xóa assertion hoặc hạ threshold để làm xanh. Khi UI thêm nơi hiển thị cùng dữ liệu, scope selector vào vùng cần kiểm tra thay vì giảm assertion nghiệp vụ.

## 4. SQL/HTTP E2E an toàn

E2E yêu cầu **database riêng** được chỉ định rõ. Đọc setup của suite để biết AppModule và fixture DataSource cùng dùng DB nào.

```powershell
& .\scripts\Use-ProjectStorage.ps1
$env:E2E_DB_NAME = 'VIntern_E2E_YourPreparedDatabase'
$env:DB_NAME = $env:E2E_DB_NAME
# DB_FILES_ROOT đã được Use-ProjectStorage.ps1 đặt trong project.
npm run test:e2e -- --runTestsByPath test/recruitment.e2e-spec.ts
```

Lưu ý:

- Ví dụ đòi hỏi DB đã chuẩn bị và login đủ quyền.
- Không nâng quyền runtime hoặc đổi sang DB chính khi nhận `CREATE DATABASE permission denied`.
- Migration/rollback suite có yêu cầu baseline riêng; đọc suite trước khi chạy cả bộ trên DB đã dùng.
- MDF/LDF test phải nằm dưới dự án; DB chính và tài khoản gốc giữ nguyên.
- CI hiện chạy **34 suite / 316 test** trên SQL Server 2019 disposable.

Provider test chỉ nằm trong test override, trả payload qua **cùng validator**. Runtime không có fallback điểm giả. Test hội thoại phải gọi next/answer theo câu đã gửi; start/questions không được coi là endpoint dump đề tương lai.

## 5. Test runner

Runner là package riêng:

```powershell
cd grading-runner
npm test
```

Kiểm:

- Policy chặn network/filesystem ngoài phạm vi cho phép.
- Kết quả chỉ được nhận khi HMAC đúng, đúng request/task/spec/suite/SHA.
- Response thiếu evidence hoặc `warning/truncated` không được coi là `complete`.
- Cleanup container/workspace sau mỗi lượt.
- Runner offline trả trạng thái rõ; không tự tạo “PASS”.

Live Docker/Ubuntu runner được kiểm riêng, không gộp vào unit.

## 6. CI và quality gate

### `backend-ci.yml`

```text
npm ci → lint → unit tests → build
→ SQL Server 2019 disposable (SQL Server 2019 container)
→ migration:run từ database rỗng
→ migration:show → schema audit
→ bootstrap admin + idempotency
→ boot API thật → /api/v1/health → /api/docs + /api/docs-json
→ seed thư viện (idempotent)
→ E2E: platform, academic, sprint/task, recruitment, evaluation/performance,
        KPI/salary/certificates, concurrency/rollback, AI (TestAIProvider)
→ migration:revert → audit absent → reapply → audit
```

- CI dùng credential ngẫu nhiên, mask và xóa cùng container.
- **Không gọi mạng AI bên ngoài** trong CI; provider deterministic.
- Migration được kiểm cả chiều lên và chiều rollback.

### `grading-runner.yml`

Build và smoke runner trong môi trường cách ly; không thay thế kiểm tra Docker trên máy local.

**Quy tắc merge:** không merge khi gate đỏ; không “retry cho xanh” khi chưa hiểu nguyên nhân; không dùng DB chính để làm xanh.

## 7. Môi trường và dữ liệu test

| Môi trường | API | Database | Dùng cho |
|---|---|---|---|
| Chính | 8080 | `VIntern_M2_BROWSER` | Demo/QA chính; **không** chạy suite phá hủy |
| QA | 8081 | `VIntern_Test_Learning_20261014` | Luồng có mutation |
| E2E | CI | `VIntern_Phase715_*` / DB disposable | Full gate |
| Local E2E | Tùy cấu hình | `E2E_DB_NAME` riêng | Kiểm suite cụ thể |

- Không reset/seed DB chính để chụp giao diện.
- Không dùng mật khẩu thật trong script/ảnh/log.
- Không sửa trạng thái DB thủ công để ép test đi qua.
- Giữ nguyên ba tài khoản trắng gốc.

## 8. Ghi bằng chứng

Mỗi lần kiểm chứng ghi:

- Ngày/giờ và múi giờ.
- Branch, commit, dirty state.
- Lệnh đã chạy, exit code, số suite/test.
- Database, API port, provider thật hay fixture.
- Phần đã kiểm và **phần chưa kiểm**.

Lưu log dưới workspace (`.runtime/...` hoặc `docs/reports/` nếu là bằng chứng được commit). Một lần chạy lỗi rồi sửa phải được phân biệt với lần cuối đạt; không trộn số liệu hai ngày.

## 9. Giới hạn đã biết

- Ma trận SQL E2E không thay kiểm thử provider thật.
- Fixture GitHub/Docker không chứng minh mọi repo/framework.
- Một lần live smoke không chứng minh mọi nhánh OAuth/webhook.
- Chưa có production deployment; không tuyên bố sẵn sàng production.
- Một số suite phụ thuộc RAM/CPU; timeout do tài nguyên phải được ghi rõ, không tăng mù.

Xem [VERIFICATION](VERIFICATION.md) để biết mốc mới nhất và nguồn bằng chứng.
