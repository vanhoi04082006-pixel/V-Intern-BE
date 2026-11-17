# Số dư lương ảo và phạm vi kỳ

`GET /virtual-salary/users/{userId}/balance` dành cho Admin có quyền xem; `GET /intern/me/virtual-salary` lấy người dùng từ principal. `balance` luôn là tổng toàn bộ sổ của đúng người đó, gồm thu nhập KPI, thưởng, phạt, điều chỉnh và dòng bù trừ. Không có số dư lưu sẵn và không sửa lịch sử giao dịch.

Tham số tùy chọn `kpiPeriodId` chỉ giới hạn `earnedThisPeriod` theo các dòng thuộc kỳ đó. Nó không lọc `balance` hoặc `latestEntries`. Chọn kỳ không có giao dịch trả thu nhập kỳ 0 nhưng vẫn giữ tổng số dư hiện tại. Nếu không chọn kỳ, giữ hợp đồng hiện hữu: `earnedThisPeriod` là tổng các dòng kpi_earning của mọi kỳ.

Lỗi tái hiện trên Admin: tổng sổ QA 948000 nhưng chọn kỳ rỗng làm số dư hiện tại về 0. Hai test SQL Admin/Intern thất bại trước sửa (số dư lọc kỳ8380000 thay vì tổng8180000), bao gồm kỳ hiện hữu và kỳ rỗng; sau sửa kiểm lại cả nguồn thu kỳ và latestEntries toàn sổ. Bộ lọc không thay danh tính hoặc quyền truy cập dữ liệu.
