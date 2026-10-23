# K03 — kho tri thức đã có UI, CI và runtime · 24/10/2026

**K01–K03 đạt; K04 retrieval và bộ nội dung P02 chưa nghiệm thu.** Kho tác giả có tìm/lọc, biên soạn có cấu trúc, preview, kiểm xuất bản, lịch sử và khôi phục. Không gọi đây là hoàn thành hệ Agent: các lượt AI hiện tại chưa lấy context từ kho mới.

## Code và bằng chứng

| Thành phần | Revision / kết quả |
|---|---|
| BE có publication-check chỉ đọc | `bf3118693c782c145a87d4348212344396ce3526` |
| FE UI | `276e807`, `6604fcf`, `17f4370` |
| FE gate + hướng dẫn | `70d5e97d1dd38590045b375843db5c7e71a493a3`, pin đúng BE ở trên |
| BE unit | 80 suite / 669 test đạt |
| BE SQL/HTTP | 23/23 đạt; endpoint mới không yêu cầu manage, không thêm revision |
| FE unit / Node contracts | 88 file / 579 test và 22/22 contracts đạt |
| FE lint/typecheck/build | Đạt; native build thực hiện sau khi dừng đúng process |
| Browser thật trên SQL riêng | 5 nhóm tình huống, 24 viewport checks, Tab/Escape/focus và sáu revision có hash cũ giữ nguyên |

CI BE: [backend](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/40021504108), [acceptance](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/40021504546). CI FE `70d5e97`: [quality](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/40025607601), [SQL full-stack](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/40025607650). Full-stack giữ 14 bước nghiệp vụ cũ, thêm career và knowledge; mọi bước đạt. Hoàn tất 23/10 21:27:31 UTC = **24/10 04:27:31 Asia/Bangkok**.

[Hướng dẫn UI cho người tiếp nhận](https://github.com/vanhoi04082006-pixel/V-Intern-FE/blob/feat/ui-ux-overhaul/docs/KNOWLEDGE-LIBRARY.md). [Báo cáo browser và ảnh](https://github.com/vanhoi04082006-pixel/V-Intern-FE/blob/feat/ui-ux-overhaul/docs/reports/knowledge-library-20261024.md). [Endpoint và quyền backend](../KNOWLEDGE-LIBRARY.md).

## Runtime được cập nhật, dữ liệu giữ nguyên

FE 3001 được build từ source UI đã nghiệm thu; API 8080/8081 được restart từ build BE tương thích. Không thêm migration, không seed/reset. Launcher poll ban đầu chưa kịp đợi SQL kết nối, API retry rồi healthy; readiness độc lập sau đó đạt. Không giảm assertion hoặc chỉnh timeout CI vì tình huống khởi động local này.

Số liệu snapshot trước/sau restart bằng nhau:

| Database | Users | Hồ sơ | Buổi PV | Trả lời | Câu hỏi | Phân công | Template | Chứng nhận | Lượt PV | Kho / revision |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `VIntern_M2_BROWSER` | 9 | 4 | 4 | 34 | 185 | 2 | 6 | 0 | 4 | 0 / 0 |
| `VIntern_Test_Learning_20261014` | 16 | 10 | 10 | 59 | 70 | 5 | 7 | 2 | 11 | 0 / 0 |

MDF/LDF cả hai DB được xác minh qua `sys.database_files` và realpath nằm dưới workspace. Không pending migration. Sáu nghề đang lưu, năm nghề mở tuyển. Bảy tài khoản gốc/demo/defense kiểm đăng nhập, ID/vai trò và catalog đúng; non-admin vẫn bị chặn kho tác giả. Không tiêu hao lượt hoặc tạo kiến thức trên DB chính.

Browser native dùng Admin đã lưu, mở list/editor/preview thật tại 3001, sáu độ rộng không tràn ngang, không page error và không ghi dữ liệu. Hai API có 10 method/path knowledge trên 8 path OpenAPI; toàn API hiện **262 operations / 43 nhóm / 85 schemas**, snapshot lúc 23/10 21:35:13 UTC (24/10 04:35:13 local). [Tra cứu endpoint](../api/ROUTES.md) và [DTO](../api/SCHEMAS.md) được sinh từ cùng snapshot này.

Evidence project-local: `workspace/manual-runtime/knowledge-library-20261024/`, gồm `native-before.json`, `native-after.json`, `native-readiness.json`, `native-browser.json`, `native-fe-build.log`, `native-openapi-docs.json` và các log unit/browser đã ghi ở báo cáo FE. Tài liệu công khai không chép password/token/private config.

## Giới hạn và tiếp nối

- Preview là Markdown subset inert, không HTML/ảnh nhúng; không tự tải nguồn bên ngoài.
- Import chỉ dry-run; không bulk mutation. Không autosave. Guard chưa lưu áp dụng refresh/đóng tab và link quay về kho trong editor; chưa chặn mọi lối SPA/Back.
- Publish chứng minh đủ cấu trúc và xác nhận của người duyệt; không bảo đảm chân lý chuyên môn hoặc chứng minh Agent đã tiêu thụ nội dung.
- K04 phải lọc đúng scope/quyền trước ranking, chỉ dùng current published, trả citation/version/hash và không đưa lời giải/rubric vào context hỗ trợ sinh viên. P02 biên soạn nội dung chuyên môn/dự án mẫu riêng.
