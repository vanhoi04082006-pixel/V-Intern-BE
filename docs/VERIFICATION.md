# Kiểm chứng Backend

Trang này là **chỉ mục bằng chứng hiện hành**. Số liệu lịch sử nằm trong [`reports/`](reports/) và [`archive/`](archive/); không sửa chúng để khớp hiện tại.

## 1. Mốc hiện hành — 02/11/2026

| Hạng mục | Kết quả | Ghi chú |
|---|---|---|
| Branch / commit | `main` / `ca60e16` | Working tree sạch tại thời điểm ghi |
| ESLint | Đạt, 0 lỗi | `npm run lint` |
| Jest unit | **113 suite / 849 test đạt** | `npm test`, chạy tuần tự |
| Nest production build | Đạt | `npm run build` |
| SQL/HTTP E2E | **34 suite / 316 test** | CI `backend-ci`, SQL Server 2019 disposable |
| Schema audit | Đạt | Bảng, sequence, unique index, CHECK, kiểu dữ liệu |
| Migration | Lên + revert + reapply đạt | Từ database rỗng trong CI |
| API surface | **302 operation / 48 nhóm** | Sau khi gỡ classes/sharing |
| Health/Swagger | Đạt | `/api/v1/health`, `/api/docs`, `/api/docs-json` |

Lệnh tái lập local:

```powershell
& .\scripts\Use-ProjectStorage.ps1
npm run lint
npm test
npm run build
git diff --check
```

E2E cần DB riêng; xem [TESTING](TESTING.md). Số E2E ở trên là kết quả CI trên database disposable, không phải một lượt chạy local trên DB chính.

## 2. Thay đổi contract gần nhất

Đợt gỡ quản lý lớp và chia sẻ phiên:

- `/api/v1/classes` → **404**.
- `/api/v1/session-sharing` → **404**.
- Không còn bảng/entity/quyền tương ứng trong schema hiện hành.
- FE `/instructor/classes` chỉ còn redirect tương thích sang `/instructor/projects`.

Đây là thay đổi **có chủ đích**, không phải route bị hỏng. Khi đối chiếu tài liệu cũ, bỏ qua các mô tả về classes/sharing.

## 3. Phạm vi đã kiểm

| Lớp | Đã kiểm | Chưa kiểm |
|---|---|---|
| Unit | Công thức, policy, guard, parser, service, nhánh lỗi | SQL/provider thật |
| SQL/HTTP E2E | DTO → guard → service → transaction → SQL | Gemini/GitHub thật khi transport bị override |
| Migration | Rỗng → chạy → audit → revert → reapply | Mọi dữ liệu production |
| Runner | Policy, HMAC, request/suite/SHA binding | Mọi framework/pipeline của sinh viên |
| Live (lịch sử) | OAuth, PR/SHA, Gemini, Docker cho fixture QA | Mọi nhánh, mọi repo, production |

## 4. Bằng chứng lịch sử

| Mốc | Nội dung | Nguồn |
|---|---|---|
| 26/10/2026 | Checkpoint QA: 4/4 task, đánh giá 96,1, KPI 98,8 | [ACCEPTANCE-CHECKPOINT-20261026](ACCEPTANCE-CHECKPOINT-20261026.md) |
| 27/10/2026 | 117 ca SQL/HTTP, ba vai, nhánh ngoại lệ | [BUSINESS-ACCEPTANCE-20261027](BUSINESS-ACCEPTANCE-20261027.md) |
| 28/10/2026 | Sáu kịch bản UI ba vai, lỗi tuyển dụng, gate local | [BUSINESS-ACCEPTANCE-20261028](BUSINESS-ACCEPTANCE-20261028.md) |
| G2/P02 | 90 suite / 734 unit; 4 suite / 39 SQL/HTTP local; CI 33 suite / 313 | [reports/mini-project-content-20261024](reports/mini-project-content-20261024.md) |
| G2/P01 | 725 unit; 30 SQL regression + 4 migration local; CI 304 SQL/HTTP | [reports/small-project-foundation-20261024](reports/small-project-foundation-20261024.md) |
| G1 | 709 unit, 32 SQL G1/K04; 11 ca Gemini thật, 65/65 trace | [reports/agent-foundation-20261024](reports/agent-foundation-20261024.md) |
| K01/K02 | 80 suite / 669 unit; 22 test tri thức + 47 hồi quy M01 | [reports/knowledge-library-20261023](reports/knowledge-library-20261023.md) |
| Aurora | 625 unit; 237 SQL E2E theo ma trận; 190 lượt browser | [archive/verification-before-aurora-20261023](archive/verification-before-aurora-20261023.md) |

Quy tắc đọc:

- **Không cộng** test của nhiều mốc.
- Không coi ảnh/log cũ là bằng chứng của commit hiện tại.
- Không coi suite deterministic là provider thật.
- Một lần chạy lỗi rồi sửa phải giữ cả log lỗi và log đạt.

## 5. CI hiện hành

### `backend-ci.yml`

```text
npm ci → lint → unit → build
→ SQL Server 2019 disposable
→ migration từ DB rỗng → schema audit
→ bootstrap admin + idempotency
→ boot API → health → Swagger/OpenAPI
→ seed thư viện idempotent
→ E2E (platform, academic, sprint/task, recruitment, evaluation,
        KPI/salary/certificates, concurrency, AI deterministic)
→ migration revert/reapply → audit
```

CI **không gọi mạng AI bên ngoài**; dùng `TestAIProvider`. Credential được tạo ngẫu nhiên, mask và xóa cùng container.

### `grading-runner.yml`

Build/smoke runner trong môi trường cách ly. Kết quả runner CI không thay thế kiểm tra Docker/provider trên máy local.

## 6. Phần chưa được chứng minh

- Chưa có production deployment; không tuyên bố sẵn sàng production.
- Webhook GitHub chưa nghiệm thu **delivery live** cho repo QA; hợp đồng được kiểm bằng E2E.
- Live OAuth/PR/Gemini/Docker mới kiểm cho fixture cụ thể, không phủ mọi repo/framework.
- Rate limiter theo process chưa được kiểm ở mô hình nhiều instance.
- Timeout SQL từng gặp trong kiểm chứng local; restart phục hồi nhưng chưa xác định nguyên nhân gốc.
- Audit dependency là ảnh chụp lockfile tại thời điểm chạy, không phải bảo đảm vĩnh viễn.

## 7. Cách ghi một mốc mới

1. Tạo mục “Mốc … — ngày”.
2. Ghi branch, commit, dirty state.
3. Ghi lệnh + exit code + số suite/test.
4. Ghi môi trường: API port, database, provider thật/fixture.
5. Ghi rõ đã kiểm gì và **chưa** kiểm gì.
6. Lưu log/JSON dưới `docs/reports/` nếu là bằng chứng được commit; lọc PII/secret trước khi commit.
