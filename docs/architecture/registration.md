# Đăng ký sinh viên

`POST /auth/register` là public endpoint riêng, không dùng `/users` của admin. Body chỉ có fullName, email, password, acceptedTerms=true; DTO từ chối mọi field khác như roleCodes/status/permissions. Họ tên2–128ký tự, email chuẩn hóa trim/lowercase tối đa320, mật khẩu tối thiểu8ký tự/không chỉ khoảng trắng/tối đa72byteUTF-8 trước bcrypt để không bị cắt ngầm. Không trim mật khẩu.

Transaction ghi user active với username UUID do server sinh, đúng một role intern, recruitment profile not_started/0attempt, audit chỉ ghi loại tài khoản/acceptedTerms và thông báo welcome. Thiếu RBAC hoặc lỗi ghi rollback toàn bộ. Unique email/username xử lý cạnh tranh; duplicate409 REGISTRATION_CONFLICT không trả SQL detail. Không nhận role giảng viên/admin từ trình duyệt, không tự pass tuyển dụng hoặc tạo assignment.

Response201 `{registered:true}` không chứa password/hash/refresh token và không đăng nhập tự động. Người dùng đăng nhập qua luồng đã có (HttpOnly refresh, rotation, fresh roles) rồi vào tuyển dụng. Trình duyệt chỉ hiển thị thành công sau khi kiểm tra response; lỗi400/409/429/closed không giả thành công. acceptedTerms phản ánh checkbox, không phải chứng cứ đã xác minh email hoặc quy trình pháp lý.

`AUTH_PUBLIC_REGISTRATION=false` đóng signup (403 REGISTRATION_CLOSED). Mặc định mở theo luồng register→login của nền tảng; tài khoản staff vẫn do admin quản lý. `THROTTLE_REGISTER_PER_MIN` mặc định5/IP/phút, memory theo process như limiter hiện có. Triển khai nhiều instance cần rate limit dùng chung ở gateway/hạ tầng. Signup không gửi email và không đánh dấu email verified; Google login và khôi phục mật khẩu bằng email cần tích hợp riêng, không trả thành công giả.

SQL HTTP4test gồm persist/hash/onboarding/không nâng quyền, concurrent duplicate một201/một409/mộtaudit, validation/consent/UTF-8 bound và đóng signup. Chrome thật kiểm tra form1440/820/390, đăng ký, login và nội dung onboarding qua API/SQL nghiệm thu riêng. Không dùng tài khoản trắng của runtime để tạo fixture.
