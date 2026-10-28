# G2/P02 — sáu bài nhỏ và bộ tri thức dùng chung

P01 đã có version/public/private. Lát cắt này bổ sung nội dung có thể đọc và chạy starter; không đổi sáu mẫu 14 ngày, không sửa run hoặc tự xuất bản tri thức thay người duyệt. P03 nghiệm thu lời giải, biến thể sai và trusted runner; P04 xây UI gói nhỏ.

| Hạng mục | Hoàn thành khi | Bằng chứng bắt buộc |
|---|---|---|
| Sáu đề độc lập | Notes, Tasks, Cart, Roster, Booking, Blog; mã MINI-*; 3–7 ngày, 3–6 task có key/dependencies, scope/đầu ra/demo rõ | DTO, blueprint và package validator đều đạt; mã không trùng mẫu cũ |
| Starter học tập | Node 22+, không dependency/network/secret; README, dữ liệu giả, module TODO, demo và public acceptance test | Node syntax và demo chạy thật; test ban đầu đỏ vì TODO có chủ đích, được ghi rõ |
| Tri thức nhiều Agent | Đề bài public, Q&A có nhiều đáp án/rubric riêng, hướng dẫn lập kế hoạch/review/CV/giao tiếp | Đúng schema publish; chín purpose có nội dung; qa luôn grading_only; không nhập đáp án vào guide public |
| Seed có chủ đích | Lệnh mới chỉ thêm mã MINI còn thiếu; không sửa cả mẫu MINI đã có, bản archive, run, identity | SQL disposable: seed hai lượt, custom/archive còn nguyên, start tạo snapshot đúng |
| Bàn giao | Có lệnh export/import, bảng bài, demo từng bài, khác biệt giữa starter và bài giải | Unit/build/lint/SQL đạt, ghi nguồn và thời điểm; không nói P03/Agent migration đã xong |

Mọi file/đầu ra trên máy local nằm dưới workspace. Starter trong repo là mã do dự án biên soạn và được smoke-test riêng; API không chạy file do người dùng gửi. Export bundle chỉ chứa tri thức để Admin kiểm nguồn và duyệt bằng workflow hiện hành, không cấp quyền mới cho Agent.
