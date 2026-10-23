# Kiểm chứng: đọc kết quả cùng phạm vi và nguồn

Phiên cập nhật bắt đầu ngày **21/10/2026**, tập trung local, giao diện hai vai trò, chính sách phỏng vấn mới và tài liệu. Các con số dưới đây đến từ log chạy thực tế trong workspace; không trộn với tổng số của báo cáo 17/10 hoặc CI lịch sử.

## Bộ kiểm tra hiện tại

| Hạng mục | Kết quả | Nguồn trong thư mục bằng chứng |
|---|---|---|
| BE unit | 76 suites, **608 tests đạt** | `be-unit-final.log` |
| BE lint | 0 lỗi, 15 cảnh báo console ở các script hiện hữu | `be-lint.log` |
| BE build | Đạt | `be-build-final.log` |
| FE full unit | 80 files, **534 tests đạt** | `fe-polish-tests.log` |
| FE sửa cuối empty-state báo cáo | 2 tests đạt | `reports-final.log` |
| FE lint/typecheck/build | Đạt sau lần sửa cuối | `fe-final-gates.log` |
| Recruitment SQL HTTP E2E | **18/18 đạt** trên DB E2E riêng | `interview-sql.log` |
| Gemini contract thật | Hợp lệ, 6 tiêu chí, nhóm 50–70 có role khác/lý do/reference | `live-recruitment-contract.json` |
| Tài liệu | 44 tệp, 209 local links, 20 Mermaid diagrams; 0 link hỏng/fence chưa đóng | `docs-check.json` |
| Browser | 31 route × 5 viewport = 155 kiểm tra; 165 UI state checks và 5/5 tương tác | `browser-check.json`, `screens/` |
| Runtime cuối | FE 3001, API 8080/8081 trả HTTP 200 | `runtime-health-final.json` |

Thư mục bằng chứng local là `manual-runtime/workspace-visual-polish-20261021/` tính từ **workspace chứa hai repository**, không phải từ thư mục BE. Đây là dữ liệu nghiệm thu local, không chứa credential để commit công khai.

## Điều các kiểm tra phỏng vấn đã chứng minh

- Các biên 49,9 / 50 / 70 / 70,1 đi đúng ba nhánh mới.
- BE vẫn giữ pass/fail eligibility; nhóm được gợi ý chưa được tạo assignment.
- Đề xuất phải khác role đã thi, có lý do và reference câu trả lời đã nộp; null/role trùng/câu hỏi bịa bị từ chối.
- UI không tự chọn role hoặc start bài; người dùng phải xác nhận. Hết lượt bị chặn, đổi role không reset ngân sách.
- Lỗi provider giữ bài để chấm lại; submit đồng thời không tạo hai kết quả.

SQL E2E dùng test provider qua cùng validator, không phải Gemini thật. Kiểm tra Gemini riêng dùng **câu trả lời tổng hợp**, không ghi điểm/kết quả vào user hoặc database. Lần ghi bằng chứng cuối có technical 48, soft 65, overall 53,1; đề xuất QA với 6 tiêu chí hợp lệ và feedback tiếng Việt. Đây là một mẫu kiểm tra contract, không đo độ chính xác chấm mọi sinh viên. Điểm model có thể biến thiên giữa các lần gọi; phép tính BE là xác định với cùng điểm đầu vào.

Nguồn test: [scoring](../src/recruitment/scoring.spec.ts), [role guidance](../src/recruitment/recommendation-policy.spec.ts), [attempt gate](../src/recruitment/attempt-policy.spec.ts), [prompt](../src/recruitment/recruitment-prompt.spec.ts), [SQL E2E](../test/recruitment.e2e-spec.ts).

## Bảo toàn dữ liệu và runtime

Đã đọc `sys.database_files` của DB chính, QA và E2E: MDF/LDF nằm dưới workspace `.runtime/sql`. Hai DB runtime là `VIntern_M2_BROWSER` và `VIntern_Test_Learning_20261014`; không reset hoặc seed lại. E2E dùng `VIntern_E2E_StorageFresh_20261019122026`, thêm fixture có tên riêng, không chạy trên DB chính.

Lần thử tạo DB E2E mới ban đầu bị từ chối do runtime login không có CREATE DATABASE; không nâng quyền hoặc chuyển sang DB chính. Sau đó dùng DB E2E đã chuẩn bị và kiểm tra đường dẫn trước khi chạy lại đạt.

API 8080/8081 được khởi động lại bằng launcher sở hữu đúng DB/cổng; FE 3001 dùng bản build mới. Trong khi rebuild từng xuất hiện ChunkLoadError ở tab giữ asset cũ; đã restart FE/reload và kiểm tra lại route. Không tính màn hình lỗi tạm đó là bằng chứng trang chi tiết đã đạt.

## Cách hiểu phần browser và phần chưa chứng minh

Ma trận kiểm tra các trang có thể mở bằng dữ liệu hiện có ở 1440/1280/1024/768/390px, không có document overflow hoặc loading/alert lỗi còn sót trong bản ghi cuối. Drawer, modal, focus/Escape, validation trống, chọn biểu đồ và CTA báo cáo được thử trực tiếp. Task/Sprint/evaluation có test hồi quy, nhưng không nộp bài, chấm điểm hoặc tạo kỳ/chứng nhận mới trên DB chính chỉ để chụp ảnh.

Một số trang chi tiết cần bản evaluation/KPI/certificate/sharing tương ứng chưa có trong dữ liệu local. Chúng được bao phủ bởi component/API tests và shell chung; không tuyên bố đã nghiệm thu browser mọi record/state chỉ dựa trên empty state. Browser viewport không thay cho audit WCAG/performance đầy đủ.

## Lịch sử và giới hạn phát hành

Hồ sơ GitHub/runner ngày trước nằm ở [LIVE-GITHUB](LIVE-GITHUB.md); các phase/handoff dưới `archive/` là lịch sử. Không diễn giải fixture một task hoặc native SQL CI trước đây thành kết quả mới của lượt này. Không chạy lại toàn bộ live OAuth/PR/runner cho mọi contract trong lượt UI/tài liệu này.

Chưa push/merge hoặc xóa nhánh; working tree giữ cả phần việc đã có. Xem [GIT-WORKFLOW](GIT-WORKFLOW.md). Không triển khai production trong phạm vi hiện tại.
