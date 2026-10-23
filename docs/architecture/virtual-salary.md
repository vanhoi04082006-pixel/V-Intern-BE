# Lương ảo và sổ giao dịch

## Đây là dữ liệu mô phỏng học tập

Lương ảo cho người học nhìn thấy kết quả KPI theo một đơn vị quy đổi. Hệ thống không chuyển tiền, không tích hợp ngân hàng và không cam kết trả lương thật. Mã `VND_VIRTUAL` phải được hiểu theo nghĩa đó.

## Từ KPI đến một dòng ledger

Kỳ KPI phải finalized và có cấu hình base amount hợp lệ. Calculator tính:

`earned = roundHalfUp(baseAmount × finalScore / 100)`.

Ví dụ base 10.000.000 và KPI 83,8 cho 8.380.000 đơn vị ảo. Đây là ví dụ công thức, không phải số tiền đang có trong một tài khoản.

Idempotency key gắn period/user/rule, nên bấm sinh lại cùng khoản không tạo khoản thu nhập thứ hai. Balance được cộng từ các dòng ledger, không phải một ô số dư có thể sửa tùy ý.

## Điều chỉnh và hoàn tác

| Loại | Quy tắc số tiền |
|---|---|
| Bonus | Nhập số dương, lưu khoản cộng |
| Penalty | Nhập số dương, lưu khoản trừ |
| Adjustment | Có dấu, khác 0 |
| Reversal | Tham chiếu dòng gốc, số tiền được suy ra từ dòng đó |

Không sửa/xóa lịch sử để làm balance trông đúng. Một reversal có nguồn và chống đảo lại nhiều lần. Permission/scope vẫn áp dụng khi quản lý ledger; sinh viên chỉ đọc ledger của mình.

## Khi chưa có số liệu

Chưa có KPI finalized hoặc cấu hình thiếu phải có lỗi/trạng thái trống rõ ràng. Không tạo thu nhập từ một điểm AI chưa chốt. Đổi công thức cần version và regression tests, không viết lại các khoản đã ghi trong quá khứ.

Nguồn: [calculator](../../src/salary/salary-calculator.ts), [salary module](../../src/salary), [KPI](evaluation-performance-kpi.md).
