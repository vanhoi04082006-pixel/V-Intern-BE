# Thư viện blueprint dự án

`templates/learning-library.ts` cung cấp sáu mẫu nhỏ: Task Management, Mini Shop, Notes, Student Management, Room Booking và Blog CMS. `learning-blueprints.ts` giữ nội dung nghiệp vụ theo từng miền; thông tin chung chỉ dùng cho quy trình bàn giao. Notes là offline frontend, không giả định có API server.

Mỗi definition có slug, duration, team size, role responsibilities/skills, phạm vi, functional/nonfunctional requirements và business rules. Architecture ghi overview, entities, API suggestions và frontend pages. Hai sprint có task key, dependencies, priority, complexity, estimatedHours, skillTags, recommendedOrder, expectedOutput và DoD; milestone tham chiếu đúng task keys. Đây là đầu vào lập kế hoạch, không phải lời khẳng định các dự án mẫu đã được code sẵn.

DTO giới hạn kích thước input. `validateBlueprint` kiểm tra slug, tổng thời lượng, sức chứa đội, key duy nhất, dependency tồn tại/không vòng/không đi ngược sprint và milestone phù hợp ngày hoàn thành. Metadata mới optional để đọc được definition lịch sử; khi gửi metadata thì phải nhất quán. Tạo và cập nhật dùng cùng validation. UI đọc task qua disclosure, hiển thị quy tắc, kiến trúc, milestone và hướng dẫn, không in JSON thô.

`npm run seed:library` chỉ dùng database development local. Seed thêm mẫu thiếu; nâng phiên bản chỉ khi nội dung V1 giống hoàn toàn bản bundled cũ và còn active/version1. Template đã sửa hoặc archived được giữ nguyên. Seed chạy lại không tăng version tiếp. `template_runs.snapshotJson` không bị seed sửa: phiên đã tạo tiếp tục dùng blueprint/version lúc tạo; phiên mới dùng bản hiện hành. Không cần migration schema cho các field JSON này.

Start Template tạo session upcoming, project và role slots trong transaction, pin snapshot; requestId chống tạo trùng. Một mẫu tạo nhiều phiên độc lập. AI Planner đọc snapshot đầy đủ, tạo draft để giảng viên chỉnh và publish. Dependency của blueprint là key; plan publish chuyển key sang task UUID thật. Chỉ task được giảng viên duyệt Done mới mở điều kiện task phụ thuộc.

Kiểm chứng: DTO/domain/seed unit, SQL HTTP template-library kiểm tra tạo/cập nhật, graph sai, snapshot bất biến, nhiều phiên, request đồng thời và quyền truy cập. Frontend có kiểm thử detail/disclosure, nội dung cũ và tạo phiên. Seed không xóa dữ liệu hoặc ghi đè template tùy chỉnh.
