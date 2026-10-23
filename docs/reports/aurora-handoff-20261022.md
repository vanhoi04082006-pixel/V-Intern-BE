# Aurora Glass và bàn giao V-Intern — 22/10/2026

## Phạm vi đã xác nhận

Nâng cấp cả Sinh viên và Giảng viên, giữ trang chủ và Admin. Bảo toàn API, phân quyền, dữ liệu, điểm và tài khoản. Viết bộ tài liệu bàn giao FE/BE theo hành trình sử dụng, vận hành và bảo trì; kiểm tra các nhánh Git trước khi tích hợp.

## Audit và định hướng

- FE dùng Next.js 16.3.8 / React 19, Tailwind 4, CSS riêng theo vai trò, Lucide và Framer Motion. Không cần thư viện mới.
- Hai shell có cơ chế menu, guard và lifecycle khác nhau; giữ hành vi này, chia sẻ cùng token/bề mặt.
- `workspace.css` đang ép nhiều thành phần về border-radius 0, nền trắng và đường kẻ; cùng với viewbar, heading, breadcrumb gây nhiều chữ ở đầu trang.
- NihongoGo dùng tím indigo, hình nhân vật có chủ đích, lời dẫn ngắn, và nội dung chia theo hành trình. Chỉ tham khảo; không thay đổi repo đó.
- luyennguphap.com dùng khoảng trắng, khối giới thiệu ngắn và ảnh sản phẩm. Không sao chép tài sản bên ngoài.
- Ảnh Aurora Glass do người dùng gửi là tham chiếu chính: nền lavender/mint, sidebar nổi, bề mặt trắng mờ, nhấn violet. Dữ liệu minh họa trong ảnh không được đưa vào ứng dụng.

## Thiết kế

Palette: ink #20243c, muted #626b83, primary #5847df, lavender #eeeaff, mint #e0f4ee, rose #ffe8ee. Giữ Geist đã có. Radius 10px cho control, 16px cho object, 24px cho shell/hero. Blur chỉ ở navigation, không phủ text/table. Chuyển động 180–220ms, tôn trọng reduced motion. Số 0 khác với chưa có dữ liệu.

Layout desktop: sidebar nổi → thanh điều hướng gọn → tiêu đề + hành động → số liệu/ưu tiên → nội dung chính. Mobile: drawer, tab cuộn trong vùng riêng, bảng có vùng cuộn, nút đủ lớn. Không card lồng card chỉ để chia nội dung.

## Các bước

- [x] Đọc cấu trúc, kỹ thuật và tham chiếu thiết kế.
- [x] Triển khai theme và bố cục cho hai vai trò.
- [x] Kiểm tra responsive, keyboard và hồi quy.
- [x] Viết tài liệu bàn giao FE/BE và chỉ mục.
- [x] Đối chiếu nhánh, bảo toàn công việc chưa merge.
- [x] Ghi số liệu kiểm chứng có nguồn, ảnh và giới hạn.
- [x] Nhập vai, thực sự viết/nộp PR, chạy Docker/AI, trả sửa/nộp lại/duyệt và chốt kết quả trên QA riêng.

## Kết quả bàn giao — 23/10/2026

[Chỉ mục bàn giao](../WORKSPACE-HANDOVER.md) · [Báo cáo nhập vai đầy đủ](../ROLEPLAY-ACCEPTANCE.md) · [FE Verification](https://github.com/vanhoi04082006-pixel/V-Intern-FE/blob/feat/ui-ux-overhaul/docs/VERIFICATION.md) · [BE Verification](../VERIFICATION.md).

Theme chung áp dụng qua shell và CSS có scope: navigation, typography, bề mặt Aurora, nút/input/tab, bảng/list, trạng thái, biểu đồ và responsive cho hai vai trò. Giữ hình minh họa hiện có và motion tôn trọng reduced-motion. Không thêm thư viện hoặc thay API contract cho mục đích trang trí.

Kiểm tra cuối: FE **82 file/541 test**, BE **78 suite/625 test**, SQL E2E **25 suite/237 test theo ma trận tổng hợp**. FE lint/typecheck/build và BE lint/build đạt; BE còn 15 cảnh báo console ở script hiện hữu. Ma trận browser và log có timestamp riêng tại `manual-runtime/aurora-handoff-20261022/`. Không gọi các lần rerun là một lệnh full-suite xanh duy nhất.

Kết quả nhập vai: hai Sprint, bốn nhiệm vụ, bốn PR thật; bài sai bị trả sửa rồi nộp lại; SHA thay đổi bị chặn. Điểm chính thức **85,5**, KPI **95,7**, lương **9.570.000 đồng ảo**, chứng nhận xác minh hợp lệ và báo cáo PDF/Excel đọc được. AI không tự chốt điểm hoặc Done. Đã sửa footer PDF tràn, URL xác minh QA và quyền đọc gợi ý sau khi kết thúc phiên bằng test hồi quy và kiểm tra runtime.

Đã xóa 5 tên nhánh local chỉ sau khi xác nhận các commit đã nằm trong HEAD; SHA khôi phục ghi trong GIT-WORKFLOW từng repo. Giữ main, nhánh đang làm và archive. Tại mốc nghiệm thu trước công bố, working tree có công việc kế thừa chưa commit và ứng dụng chưa push/merge. Lần công bố 23/10 được ghi trong Git workflow; không xóa nhánh remote. Bốn PR được merge thuộc repository bài thực hành.

Giới hạn: webhook QA chưa cấu hình endpoint public nên chưa kiểm delivery live; test xuất JSON kiểm preview, chưa đối chiếu byte tải xuống từ browser. Chưa đo đầy đủ WCAG/Core Web Vitals; production ngoài phạm vi. Dữ liệu chính và ba tài khoản gốc được bảo toàn. Các mục này được ghi rõ để người tiếp nhận không nhầm với phần đã nghiệm thu.
