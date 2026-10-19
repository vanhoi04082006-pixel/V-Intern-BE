# ADR0002: Admin cung cấp tài khoản tạo repository chung

Accepted, 19/10/2026, theo yêu cầu mới của người dùng. Thay thế phần ownership repository của ADR0001; các quy tắc AI/evidence/quyết định giảng viên giữ nguyên.

Admin liên kết GitHub bằng OAuth tại Cài đặt, rồi chọn chính kết nối đã xác minh của mình làm tài khoản tạo repo chung. Không nhận/lưu mật khẩu GitHub trong V-INTERN. Bảng `github_repository_account` lưu userId và GitHub numeric ID, không chứa token. Token vẫn mã hóa theo user trong github_connections; chọn tài khoản được audit và chỉ Admin thực hiện. Các OAuth mới của giảng viên/sinh viên chỉ xin read:user; Admin xin read:user public_repo.

Start tự tạo public repo bằng quyền tài khoản chung. Worker mỗi60giây duyệt tối đa3phiên active, theo vòng để không bỏ đói phiên sau; mỗi phiên mời tối đa5thành viên. Bao gồm chủ trì, giảng viên được phân và sinh viên trong đội hình/phân công. Liên kết GitHub muộn được lần đồng bộ tiếp theo xử lý. GitHub REST mời theo username được giải từ immutable numeric ID; GitHub gửi thông báo/email đến tài khoản đó. Không suy đoán tài khoản từ email ứng dụng. Người được mời phải chấp nhận trước khi push.

Tên mới: `vintern-{tên-dự-án-tối-đa24}-{tên-phiên-tối-đa28}-{YYYYMMDD}-{8-ký-tự-ID-phiên}`; chuyển chữ thường, bỏ dấu tiếng Việt và ký tự đặc biệt. Mã phiên cuối tránh trùng; lưu tên một lần để đổi tên phiên không đổi URL. Description marker, repo ID và GitHub owner ID vẫn được đối chiếu trước khi cấp quyền. Ví dụ: `vintern-quan-ly-thu-vien-lop-se01-20261019-a1b2c3d4`.

Repo cũ không tự chuyển chủ, đổi tên hoặc tạo bản sao. ownerUserId tiếp tục là nguồn credential của repo đã ghi, tách với leadInstructorId. Đổi tài khoản chung chỉ áp dụng cho repo mới. Reconnect không được âm thầm đổi GitHub numeric ID của tài khoản đang được chọn; disconnect bị từ chối cho tới khi Admin chọn tài khoản khác.

Webhook chấp nhận owner là chủ trì cũ hoặc Admin còn hoạt động; thông báo bài nộp vẫn đến giảng viên chủ trì. Sinh viên nộp PR/branch/commit vào đúng repo phiên, xác minh danh tính riêng, khóa SHA và chấm AI/runner như trước. Quyền repository không cho phép tự duyệt task trong V-INTERN.

Nguồn: [Create repository](https://docs.github.com/en/rest/repos/repos#create-a-repository-for-the-authenticated-user), [Collaborator API](https://docs.github.com/en/rest/collaborators/collaborators#add-a-repository-collaborator), [OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps).
