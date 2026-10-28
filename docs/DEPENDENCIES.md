# Dependencies: cài đặt, cập nhật và đọc audit

## Cài ở đâu?

Dùng lockfile và `npm ci` trong repository, sau khi chạy `Use-ProjectStorage.ps1` của workspace. Không cài công cụ project global hoặc đưa cache/download sang ổ C. Node/SQL/Windows có sẵn là prerequisites dùng chung, không di chuyển chúng khi bảo trì dependencies.

## Đọc audit đúng nghĩa

Audit là ảnh chụp một lockfile tại một thời điểm. Phân biệt production dependency với dev tooling và phân biệt số package bị ảnh hưởng với số advisory gốc. Một lỗ hổng có thể xuất hiện qua nhiều đường phụ thuộc.

```powershell
& .\scripts\Use-ProjectStorage.ps1
npm audit --omit=dev
npm audit
```

Lưu log/JSON dưới thư mục dự án nếu cần đối chiếu. Không dùng `npm audit fix --force` để ép đổi major version rồi coi như đã khắc phục mà không kiểm tra hành vi.

## Căn cứ lịch sử, không phải kết quả mới

Audit ngày 16/10/2026 từng ghi nhận đường `mssql → tedious → sprintf-js` và các đường tooling liên quan `braces/micromatch`. Đánh giá khi đó phân biệt format literal của driver với format do người dùng điều khiển, và CI chặn high/critical production. Đây là ghi nhận có ngày; không suy ra lockfile hôm nay vẫn có cùng số lượng hoặc đã sạch.

Nguồn advisory để tra phiên bản/điều kiện hiện hành: [sprintf-js GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), [braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## Khi cập nhật một package

G1 ngày 24/10 có thêm SDK Agent ghim exact và pin vá dependency HTTP/Azure/UUID. Xem [ADR có phiên bản, advisory và phạm vi kiểm](decisions/0001-agent-runtime-sdk.md). Không suy ra số audit từ báo cáo lịch sử; `g1-audit-final.json` ghi production 0 tại thời điểm kiểm local.

Đọc release notes, xác định API bị ảnh hưởng, cập nhật lockfile bằng package manager và chạy checks phù hợp. Driver SQL cần SQL E2E; auth/crypto cần negative/concurrency tests; renderer/export cần kiểm tra file thật; framework FE cần typecheck/build/browser. Không hạ test, tắt lint hoặc downgrade thiếu lý do chỉ để audit đổi màu.

Nguồn phiên bản hiện hành là [package.json](../package.json) và [package-lock.json](../package-lock.json). [VERIFICATION](VERIFICATION.md) ghi những kiểm tra thực sự đã chạy.
