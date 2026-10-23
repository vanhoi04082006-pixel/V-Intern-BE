# M00 — ci-recovery

Phạm vi được duyệt trong [kế hoạch liên repo](tasks/plan.md). Theo dõi C01–C03 ở [checklist](tasks/todo.md).

## Mục tiêu

FE quality và 14 bước tích hợp Next/Nest/SQL Server 2019 cùng thành công trên một commit FE, với BE SHA được ghim chính xác. Xác định lỗi ở test hay ứng dụng bằng source và runtime trước khi sửa.

## Ràng buộc

- Không sửa backend/API để chiều locator; chỉ sửa ứng dụng khi tái hiện được lỗi nghiệp vụ.
- Giữ các assertion SQL/API/UI, concurrency 409/refetch/retry, RBAC, không tự duyệt bài và SHA snapshot.
- Không skip, hạ ngưỡng audit, bỏ bước hoặc tăng timeout để che nguyên nhân.
- Test local chỉ trên database `VIntern_Phase715_CI_Recovery_20261023`, cổng 8082/3006. Không thay dữ liệu/cổng demo chính.
- Các provider bên ngoài trong harness là fixture rõ ràng; không được báo chúng là AI/GitHub live. SQL local không thay bằng chứng SQL Server 2019 trên GitHub.
- Caches, helper, evidence và MDF/LDF nằm trong workspace theo AGENTS.

## Lát cắt và tiêu chí

1. C01: tái hiện timeout tại bước 03; ghi DOM/locator/API đúng trên môi trường dùng riêng.
2. C02: sửa nguyên nhân; chứng minh task update 409 rồi refetch/retry 200, comment/submission persisted và chặn tự Done.
3. C03: chạy lần lượt 14 bước; lỗi tiếp theo được xử lý theo cùng quy trình, sau đó push và đối chiếu cả hai job GitHub cùng SHA.

Không đánh dấu C03 đạt chỉ vì step 03 đã qua. Mọi hạn chế môi trường và bằng chứng cũ được ghi riêng.
