# Lương ảo

Cập nhật theo implementation ngày14/10/2026.

Virtual salary là mô phỏng kết quả học tập, không phải thanh toán thật. Calculator deterministic dùng KPI đã finalize và rate policy. Ledger lưu kết quả/provenance để replay không trả trùng.

Sinh viên chỉ xem ledger của mình; quản lý cần quyền/phạm vi. Dữ liệu chưa có hiện empty, không tạo lương từ0 hoặc điểm model tự công bố.

Không tích hợp ngân hàng, payment gateway hoặc cam kết chi trả. Khi thay đổi công thức, viết regression test và ghi policy/version; không sửa ledger lịch sử để giả kết quả mới.

Xem [mục lục](../README.md), controller/DTO tương ứng và tests trước khi thay đổi contract.
