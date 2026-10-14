# Đánh giá, hiệu suất và KPI

Cập nhật theo implementation ngày14/10/2026.

Evaluation chính thức do giảng viên tạo/finalize theo rubric trong scope của mình; AI chỉ suggestion. Performance tổng hợp facts đã lưu và trả null khi chưa có điểm. UI top10 chỉ xếp người đã có điểm, có search/chi tiết thành viên.

KPI period có lifecycle riêng; calculate dùng công thức deterministic từ dữ liệu persisted, finalize mới khóa kết quả cho các nghiệp vụ tiếp theo. Không coi điểm AI code review chưa được duyệt là task đạt.

Phân trang/filter và ownership áp trên query BE. Report lưu snapshot theo project/session/khoảng thời gian; PDF/XLSX từ cùng snapshot, không dùng dữ liệu mock. Các công thức cụ thể nằm trong calculator cùng regression tests; thay đổi version/threshold phải có migration/policy tương ứng.

Xem [mục lục](../README.md), controller/DTO tương ứng và tests trước khi thay đổi contract.
