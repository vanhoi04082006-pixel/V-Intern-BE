# Dependencies: cài đặt, cập nhật và đọc audit

Tài liệu này giải thích dependency của Backend được chọn như thế nào, cài ở đâu, audit đọc ra sao và cần kiểm gì sau khi nâng cấp.

## 1. Nguyên tắc

| Nguyên tắc | Lý do |
|---|---|
| Cài bằng `npm ci` theo `package-lock.json` | Tái lập đúng cây dependency đã kiểm |
| Dependency và cache nằm trong workspace | Không làm đầy ổ C, không phụ thuộc bản global |
| Không sửa `package-lock.json` bằng tay | Lockfile do npm sinh; sửa tay dễ lệch integrity |
| Không `npm audit fix --force` để đổi major | Có thể phá API mà không có test tương ứng |
| Production audit high/critical là gate CI | Lỗi nghiêm trọng không được lọt vào `main` |

Node.js 22, SQL Server 2019 và Windows là **prerequisite dùng chung** của máy, không phải dependency của repo. Không di chuyển hay gỡ chúng khi bảo trì dự án.

## 2. Các nhóm dependency chính

| Nhóm | Package tiêu biểu | Vai trò |
|---|---|---|
| Framework | `@nestjs/*`, `reflect-metadata`, `rxjs` | HTTP, DI, module, guard, Swagger |
| Dữ liệu | `typeorm`, `mssql` | Entity, migration, transaction tới SQL Server |
| Auth | `@nestjs/jwt`, `bcryptjs`, `cookie-parser` | Access token, hash mật khẩu, refresh cookie |
| Validation | `class-validator`, `class-transformer`, `zod` | DTO whitelist và schema output của AI |
| AI | `langchain`, `@langchain/langgraph`, `@langchain/core`, `langsmith` | Agent runtime, structured output, trace |
| GitHub | `fast-xml-parser`, `yauzl` | Đọc dữ liệu XML/zip từ repository khi cần |
| Tài liệu | `pdfkit`, `pdfjs-dist`, `exceljs`, `dejavu-fonts-ttf` | PDF/Excel, font nhúng, đọc PDF |
| Mail | `nodemailer` | SMTP và thư mời |
| Bảo vệ | `helmet`, `@nestjs/throttler` | Header an toàn, rate limit |
| Tooling | `typescript`, `jest`, `ts-jest`, `eslint`, `@nestjs/cli` | Build, test, lint |

Một số package được **ghim exact** (`1.3.0`, `1.5.2`, `npm` lockfile) vì hành vi runtime hoặc tính tương thích schema quan trọng hơn việc tự động nhận minor mới. Lý do và phạm vi kiểm của nhóm AI nằm trong [ADR 0005](decisions/0005-agent-runtime-sdk.md).

## 3. Cài và tái lập

Trong mỗi cửa sổ PowerShell, trước khi cài/build/test:

```powershell
& .\scripts\Use-ProjectStorage.ps1
npm ci
```

Script đặt `TEMP`, `TMP`, cache npm/Node và thư mục file DB vào `.runtime` của dự án. Không cài `nest`, `jest`, `typescript` global để thay cho dependency trong lockfile.

| Việc | Lệnh |
|---|---|
| Cài đúng lockfile | `npm ci` |
| Thêm dependency runtime | `npm install <package>` |
| Thêm dev tool | `npm install --save-dev <package>` |
| Kiểm cây dependency | `npm ls --depth=0` |
| Kiểm package lỗi thời | `npm outdated` (chỉ để tham khảo) |

`npm install` cập nhật cả `package.json` và `package-lock.json`; commit hai file cùng nhau.

## 4. Đọc audit đúng nghĩa

Audit là **ảnh chụp lockfile tại một thời điểm**, không phải trạng thái vĩnh viễn.

```powershell
& .\scripts\Use-ProjectStorage.ps1
npm audit --omit=dev
npm audit
```

| Lệnh | Phạm vi | Dùng khi |
|---|---|---|
| `npm audit --omit=dev` | Chỉ production dependency | Gate release/CI |
| `npm audit` | Cả dev tooling | Dọn dẹp định kỳ |

Cách đọc:

- Phân biệt **số advisory gốc** với **số package bị ảnh hưởng**: một advisory có thể đi qua nhiều đường phụ thuộc.
- Đọc `via`, `range`, `fixAvailable` trước khi kết luận.
- Đường qua dev tooling không giống production dependency, nhưng vẫn phải xử lý nếu chạy trong CI hoặc trên máy có quyền cao.
- Audit sạch **không** chứng minh ứng dụng an toàn; nó chỉ nói lockfile không khớp advisory đã biết tại thời điểm chạy.

CI chạy:

```text
npm audit --omit=dev --audit-level=high
```

High hoặc critical trong production dependency **chặn** pipeline. Không hạ `--audit-level`, không thêm `|| true` để pipeline xanh.

## 5. Ghi nhận lịch sử

| Mốc | Nội dung | Cách đọc |
|---|---|---|
| 16/10/2026 | Đường `mssql → tedious → sprintf-js`; nhóm tooling `braces`/`micromatch` | Đánh giá khi đó phân biệt format literal của driver với format do người dùng kiểm soát |
| 24/10/2026 | G1 thêm SDK Agent ghim exact, vá dependency HTTP/Azure/UUID | `g1-audit-final.json` ghi production 0 tại thời điểm kiểm local |

Đây là **bằng chứng có ngày**, không phải kết quả của lockfile hôm nay. Muốn biết hiện trạng, chạy lại lệnh audit; muốn biết phạm vi đã kiểm, đọc [VERIFICATION](VERIFICATION.md).

Nguồn advisory để tra điều kiện ảnh hưởng: [sprintf-js GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), [braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## 6. Quy trình cập nhật một package

1. **Xác định lý do** — advisory, bug, tính năng, hay chỉ vì `npm outdated`.
2. **Đọc release notes/changelog** của đúng khoảng version sẽ nhảy.
3. **Tìm chỗ dùng** trong source và test hiện có (grep/ast-grep theo API bị đổi).
4. **Cập nhật** bằng `npm install <package>@<version>`; không sửa lockfile tay.
5. **Chạy kiểm phù hợp** theo bảng dưới.
6. **Ghi bằng chứng**: lệnh, kết quả, phiên bản trước/sau, phần chưa kiểm.
7. **Commit** `package.json` + `package-lock.json` cùng thay đổi code liên quan.

| Loại package | Kiểm tối thiểu |
|---|---|
| Framework HTTP/Nest | `lint`, `test`, `build`, boot API + health |
| TypeORM/mssql | Unit + SQL/HTTP E2E trên DB riêng, `audit:schema` |
| Auth/crypto/cookie | Test negative, rotation/replay, đăng nhập thật trên local |
| AI/LangChain | Structured output, timeout, schema lỗi, trace |
| PDF/Excel/font | Mở file thật, kiểm font nhúng và nội dung tiếng Việt |
| Mail | Gửi tới hộp thư test; không dùng địa chỉ thật trong CI |
| Build/test tooling | Chạy lại toàn bộ gate; không chấp nhận test bị skip |

Không hạ threshold, tắt lint, `@ts-ignore` hoặc xóa assertion chỉ để dependency mới “đi qua”.

## 7. Runner là package riêng

`grading-runner/` có `package.json` độc lập, ESM và chạy `node --test`:

```powershell
cd grading-runner
npm ci --ignore-scripts
npm test
```

- Không trộn dependency của runner vào API.
- Runner chạy code không tin cậy trong container cách ly; không cài thêm package lạ trong lúc chấm.
- Thay đổi policy/HMAC của runner cần test riêng và cập nhật [grading-runner](architecture/grading-runner.md).

## 8. File không commit

| Không commit | Vì sao |
|---|---|
| `node_modules/` | Sinh lại bằng `npm ci` |
| `dist/` | Sinh lại bằng `npm run build` |
| `.env`, `.env.*` (trừ `.env.example`) | Chứa secret/cấu hình máy |
| Log, file DB, artifact test | Dữ liệu runtime, có thể chứa PII |
| `.npmrc` có token/đường dẫn máy | Cấu hình riêng của host |

Nếu lỡ commit secret, coi như đã lộ: rotate, kiểm lịch sử, và xử lý theo [SECURITY](SECURITY.md). Xóa file trong commit sau **không** đủ.

## 9. Câu hỏi thường gặp

**`npm ci` báo lệch lockfile?** Lockfile và `package.json` không khớp. Sửa bằng `npm install` có kiểm soát rồi commit cả hai; không xóa lockfile.

**Audit báo lỗi nhưng không có bản vá?** Ghi rõ advisory, đường phụ thuộc, khả năng khai thác thực tế và biện pháp giảm thiểu; không im lặng bỏ qua.

**Có nên nâng major ngay?** Chỉ khi có lý do và đủ thời gian kiểm. Nâng major không có test tương ứng là rủi ro cao hơn lợi ích.

**Vì sao không dùng bản global cho `nest`/`jest`?** Version global khác lockfile sẽ tạo kết quả không tái lập và che lỗi môi trường.

Nguồn phiên bản hiện hành: [package.json](../package.json) và [package-lock.json](../package-lock.json). Kết quả kiểm thực tế: [VERIFICATION](VERIFICATION.md).
