# Demo V-Intern

Kịch bản demo trước giảng viên/hội đồng, chạy trên môi trường local thật. Có hai chế độ: **15–20 phút** (trọng tâm) và **45–90 phút** (thực hành đầy đủ).

> Đây là repository Backend. Giao diện và route chi tiết nằm ở `V-Intern FE`; tài liệu này tập trung vào hành vi API, bằng chứng và các điểm cần giải thích đúng.

> Tên đăng nhập dưới đây là minh họa. Bộ tài khoản và mật khẩu thực tế bàn giao qua kênh riêng; không chiếu mật khẩu, không đưa vào repo.

## 1. Chuẩn bị

### 1.1 Tài khoản

| Vai trò | Tên minh họa | Dùng để |
|---|---|---|
| Giảng viên | `giangvien_demo` | Tạo phiên, phân công, duyệt kế hoạch/bài nộp |
| Sinh viên — kịch bản đạt | `sinhvien_demo` | Phỏng vấn tốt, nhận task, nộp bài |
| Sinh viên — kịch bản chưa đạt | `sinhvien_chuadat_demo` | Minh họa điểm thấp/phản hồi/giới hạn lượt |

Ba tài khoản này là tài khoản trắng tại thời điểm bàn giao: 0 dự án, 0 phiên, 0 assignment, 0 bài phỏng vấn, 0 task. Có thể có thông báo chào mừng; không phải dữ liệu học tập.

**Không dùng các tài khoản này để tập trước** nếu muốn giữ trạng thái trắng cho buổi bảo vệ. Tập bằng tài khoản QA ở cổng 3004/API 8081.

### 1.2 Hai phiên trình duyệt

- Cửa sổ A: Chrome thường → Giảng viên.
- Cửa sổ B: Edge hoặc profile khác → Sinh viên.
- Không dùng hai tab chung profile: phiên có thể bị chia sẻ.
- Trước mỗi thao tác, nhìn tên/vai trò trên thanh đầu trang.

### 1.3 Dịch vụ

```powershell
# Từ workspace chứa FE và BE
& .\V-INTERN-BE\scripts\Use-ProjectStorage.ps1
& .\manual-runtime\start-owned-services.ps1 -Backend -Frontend
& .\manual-runtime\start-grader.ps1   # nếu demo chấm code
```

Kiểm tra:

1. `http://localhost:3001/login`
2. `http://localhost:8080/api/v1/health` → `status: ok`, `checks.database: ok`
3. Swagger `http://localhost:8080/api/docs` mở được.
4. Có Internet cho AI/GitHub; SQL local không đồng nghĩa provider hoạt động.
5. Không seed/reset DB trước buổi demo.

### 1.4 GitHub và chấm code (nếu demo phần nộp bài)

| Cần có | Kiểm tra |
|---|---|
| Tài khoản repo chung của Admin | Admin → GitHub settings → configured/connected/ready |
| GitHub sinh viên | Đã liên kết đúng danh tính, nhận lời mời repo |
| Source chạy được | Repo có README, cài được, test chạy |
| Suite đúng task | Runner online **chưa đủ**; phải có suite của đúng task/spec |
| Quyền KPI/chứng nhận | Admin đã cấu hình kỳ/chính sách phù hợp |

Không nhập token/mật khẩu/2FA vào task, PR hay chat. AI review source **không** đồng nghĩa code đã chạy test.

## 2. Chọn phạm vi

| Phương án | Thời lượng | Nội dung |
|---|---|---|
| Trọng tâm | 15–20 phút | Tài khoản trắng → tuyển dụng → phân công/kế hoạch → Sprint/task; dùng bằng chứng QA cho nộp/chấm/kết quả |
| Đầy đủ | 45–90 phút | Thêm nộp PR, trả sửa, duyệt, đánh giá, KPI, chứng nhận |

Thời gian là ước lượng. Phỏng vấn thật, viết source và chờ provider có thể lâu hơn. Nếu sinh viên chưa đạt hoặc dịch vụ lỗi, nói đúng trạng thái; không sửa DB/giả điểm để tiếp tục.

## 3. Kịch bản 15–20 phút

### Bước 1 — Giới thiệu (1 phút)

Mở trang chủ, sau đó hai cửa sổ đăng nhập.

> “V-Intern mô phỏng một kỳ thực tập. Sinh viên được tuyển, nhận việc theo Sprint và nộp bài qua GitHub. AI hỗ trợ lập kế hoạch, hướng dẫn và phân tích; giảng viên giữ quyền đánh giá chính thức.”

Cho thấy hai vai trò có menu/phạm vi khác nhau; không cần đọc mọi menu.

### Bước 2 — Sinh viên phỏng vấn

**Cửa sổ Sinh viên:** đăng nhập → onboarding → chọn role → phỏng vấn.

1. Đọc giới thiệu, chọn vai trò có thể trả lời (ví dụ Frontend).
2. Trả lời đúng câu hệ thống đưa ra; câu tiếng Anh trả lời bằng tiếng Anh.
3. Nộp/chấm khi hoàn thành; đọc kết quả và phản hồi.

| Điểm | Ý nghĩa |
|---|---|
| Dưới 50 | Chưa đạt; xem phản hồi, còn lượt thì có thể thử lại sau thời gian chờ |
| 50–70 (gồm hai đầu) | Gợi ý role khác dựa trên câu trả lời; người học tự chọn |
| Trên 70 | Đạt; chờ giảng viên phân công |

Tối đa **3 lượt tổng cộng**, không phải 1 + 3. Đổi role không thêm lượt. Provider lỗi thì chấm lại bài hiện có theo UI, không tạo lượt mới liên tục.

**Điểm dừng:** sinh viên đạt và thấy trạng thái chờ phân công. Chưa có task là đúng nghiệp vụ.

### Bước 3 — Giảng viên tạo phiên

**Cửa sổ Giảng viên:** Tổng quan → Thư viện dự án (`/instructor/projects`).

1. Mở mẫu phù hợp role, ưu tiên “Sổ tay học tập cá nhân”.
2. Đọc mục tiêu/công nghệ/lộ trình/tiêu chí.
3. Đặt tên dễ nhận biết, chọn ngày đủ dài cho các Sprint.
4. Khởi tạo phiên → Thiết lập phiên.
5. Chọn đúng sinh viên vào role còn chỗ → xác nhận → bắt đầu phiên.

> “Mẫu dự án là khung; mỗi phiên có đội hình và thời gian riêng. Chỉ sinh viên đủ điều kiện, đúng role và chưa có assignment active khác mới được nhận.”

**Điểm dừng:** giảng viên thấy sinh viên trong đội hình; sinh viên tải lại Tổng quan thấy dự án.

### Bước 4 — Duyệt kế hoạch, kích hoạt Sprint

**Giảng viên:** mở phiên → kế hoạch AI.

1. Tạo nháp khi phiên/đội hình đủ điều kiện.
2. Đọc ít nhất một Sprint và một task: người nhận, ngày, đầu ra, DoD, phụ thuộc.
3. Sửa nếu cần → công bố/xuất bản.
4. Mở Sprint đầu → Kích hoạt.
5. **Sinh viên:** tải lại Sprint Board/Công việc.

> “Nháp AI chưa phải công việc chính thức. Sprint có trong danh sách nhưng còn planned thì chưa chạy.”

**Điểm dừng:** hai bên thấy cùng Sprint/task đã công bố.

### Bước 5 — Sinh viên làm việc

**Sinh viên:** `/intern/work`, `/intern/sprint`, `/intern/mentor`.

1. Mở task, đọc yêu cầu/tiêu chí.
2. Ưu tiên task không có phụ thuộc chưa xong.
3. Kéo **Cần làm → Đang làm** (hoặc dùng nút/bàn phím).
4. Mở Mentor, hỏi một vấn đề cụ thể của task.
5. Tải lại, xác nhận trạng thái được giữ.

> “Kanban ghi trạng thái thật qua API. Backend chặn nhảy bước và task còn phụ thuộc. Mentor hỗ trợ, không tự hoàn thành bài.”

Không kéo thẳng sang Hoàn thành. Chuyển sang Review có thể mở hộp nộp bài; kéo thẻ không thay thế bằng chứng.

### Bước 6 — Kết thúc bằng bằng chứng QA

Nếu không đủ thời gian nộp PR thật:

> “Phần vừa rồi chạy bằng tài khoản mới. Phần sau là bằng chứng từ lượt nghiệm thu hoàn chỉnh trên môi trường QA riêng, không phải số liệu vừa sinh ở tài khoản trắng.”

Mở [báo cáo nhập vai](ROLEPLAY-ACCEPTANCE.md) và ảnh:

| Nội dung | Kết quả đã nghiệm thu |
|---|---|
| Bài thực hành | 2 Sprint, 4 nhiệm vụ, 4 PR GitHub thật |
| Vòng sửa | Runner 1/2 → trả sửa → sửa → runner 2/2 → duyệt |
| Đánh giá | 85,5/100 |
| KPI | 95,7/100 |
| Lương ảo | 9.570.000 đồng ảo; sinh lại không tạo giao dịch trùng |
| Chứng nhận | VINT-2026-00000002, xác minh hợp lệ |

Ảnh: [Sprint active](demo-assets/qa-instructor-sprint-active.png) · [Bài sai + phản hồi](demo-assets/qa-student-broken-review.png) · [Bài sửa chờ duyệt](demo-assets/qa-student-fixed-awaiting-instructor.png) · [Đánh giá đã chốt](demo-assets/qa-instructor-evaluation-finalized.png) · [KPI/lương](demo-assets/qa-student-kpi-salary.png) · [Chứng nhận PDF](demo-assets/qa-certificate-fixed.png)

Các số này là dữ liệu QA đã nghiệm thu, **không phải** số mặc định của hệ thống.

## 4. Kịch bản đầy đủ (nếu đủ thời gian)

### 4.1 Nộp PR thật

1. Sinh viên liên kết GitHub tại `/intern/github`; nhận lời mời repo nếu đang chờ.
2. Đọc README/TaskSpec; clone/cài dưới workspace, chạy `Use-ProjectStorage.ps1` trước khi cài/build/test.
3. Tạo nhánh riêng (`demo/<task-code>`), không sửa trực tiếp `main`.
4. Viết phần chức năng, chạy test, commit/push.
5. Mở PR về nhánh đích; tên PR chứa mã task.
6. Sao chép URL `https://github.com/OWNER/REPO/pull/123`.
7. Quay lại task → Nộp bài → dán URL + tóm tắt → xác nhận.
8. Đọc trạng thái runner, số test, findings, điểm AI.

> “Bài nộp gắn đúng PR + commit SHA. Hệ thống phân biệt phân tích source với kết quả chạy test. Điểm AI là đề xuất; task vẫn chờ giảng viên.”

**Điểm dừng:** task ở Review/chờ duyệt, có URL PR + SHA. Runner chưa cấu hình/provider lỗi thì trình bày đúng thông báo, không gọi là “đã đạt”.

### 4.2 Giảng viên trả sửa/duyệt

1. Đối chiếu yêu cầu với diff, runner, nhận xét AI.
2. Nhập phản hồi cụ thể → yêu cầu làm lại.
3. Sinh viên sửa trên nhánh, nộp lại.
4. Giảng viên mở bài mới nhất, đọc evidence, nhập rubric.
5. Duyệt khi đủ điều kiện; sinh viên thấy task hoàn thành + phản hồi chính thức.

> “AI không tự chuyển Done. Code đổi sau khi nộp thì SHA cũ không được duyệt như bài hiện tại.”

Một task xong chưa đủ kết luận cả phiên xong; task phụ thuộc/Sprint/đầu ra còn lại vẫn phải đạt.

### 4.3 Kết quả cuối

| Vai trò | Thao tác | Điều cần thấy |
|---|---|---|
| Giảng viên | `/instructor/evaluations` → chấm rubric | Gợi ý AI khác điểm tự nhập; nháp khác đã chốt |
| Giảng viên | Gửi/chốt đánh giá | Sinh viên chỉ đọc điểm chính thức khi đã chốt |
| Giảng viên | Kết thúc phiên/assignment theo điều kiện | Assignment cũ không còn active |
| Admin | Tính/chốt KPI, sinh lương, cấp chứng nhận | Có quyền riêng; không dùng tài khoản mới để giả quyền |
| Sinh viên | `/intern/evaluations`, `/kpi`, `/certificates`, `/performance` | Điểm có nguồn, ledger, PDF, xác minh công khai |
| Giảng viên | `/instructor/reports` → tạo → tải | Report là snapshot, có PDF/Excel |

> “Đánh giá, KPI và lương ảo là các lớp khác nhau. KPI có trọng số/nguồn; lương ảo chỉ mô phỏng; chứng nhận chỉ cấp khi đủ chính sách.”

## 5. Câu hỏi thường gặp

**AI có chấm thay giảng viên không?**
Không. AI sinh đề xuất + evidence; giảng viên đối chiếu và chốt. Task không tự Done chỉ vì AI điểm cao.

**Làm sao biết đúng bài sinh viên?**
Kiểm danh tính GitHub, repository của phiên, PR và SHA snapshot. URL repo chung không thay thế URL PR hợp lệ.

**Code có thực sự chạy không?**
Chỉ khẳng định khi có kết quả trusted runner của đúng task/suite. Source review, runner lỗi và test fail là ba trạng thái khác nhau.

**Đã kiểm thử gì?**
Mốc 02/11: BE **849** unit test (113 suite); BE SQL/HTTP E2E **316** test (34 suite); FE **672** unit test. Đây là các lớp khác nhau, không phải tất cả đều gọi Gemini thật.

**Webhook GitHub đã live chưa?**
Chưa nghiệm thu delivery webhook live cho repo QA. PR/SHA đã kiểm qua GitHub API; hợp đồng webhook kiểm riêng bằng E2E.

**Đã chạy production chưa?**
Chưa. Phạm vi hiện tại là local/CI.

## 6. Xử lý sự cố khi đang demo

| Hiện tượng | Cách xử lý |
|---|---|
| Không đăng nhập | Đúng cổng 3001? Đúng username? Health 8080? Không dùng tài khoản QA ở 3004 |
| Sinh viên chưa thấy task | Đúng sinh viên/phiên? Đã phân công? Kế hoạch đã công bố? Sprint active? |
| Không kéo thẻ | Đọc thông báo phụ thuộc/trạng thái/version; tải lại nếu dữ liệu cũ |
| AI chờ/lỗi | Giữ draft, đọc mã lỗi, retry theo UI; quá thời gian thì chuyển bằng chứng |
| Không nhận lời mời GitHub | Đúng tài khoản GitHub đã liên kết? Kiểm invitations; email local không phải hộp thư thật |
| Runner chưa cấu hình | Kiểm suite của task, không chỉ worker; chỉ trình bày AI source review đúng phạm vi |
| PR/SHA đổi | Mở bài nộp hiện tại, rút/nộp lại theo UI; không ép duyệt snapshot cũ |
| Có điểm chưa có KPI/chứng nhận | Kiểm finalized + điều kiện/kỳ/policy; giảng viên không thay quyền Admin |
| Lỗi asset sau build | Restart đúng FE, tải lại; không reset DB |

## 7. Checklist một phút

- [ ] FE 3001, health 8080/database ổn.
- [ ] Hai cửa sổ/profile riêng, đúng vai trò.
- [ ] Mật khẩu để riêng, không chiếu lên màn hình.
- [ ] Chọn sẵn mẫu dự án + role.
- [ ] Biết phần nào demo trực tiếp, phần nào dùng bằng chứng QA.
- [ ] Nếu nộp code: GitHub/repo/source/suite đã chuẩn bị.
- [ ] Mở sẵn báo cáo/ảnh; biết cách chuyển khi provider chậm.
- [ ] Không seed/reset, không sửa điểm bằng SQL, không hứa hoàn tất mọi bước trong 15 phút.

Kết thúc:

> “Luồng chính được kiểm soát từ tuyển dụng tới bằng chứng công việc và kết quả chính thức; AI hỗ trợ từng bước, còn quyền và trạng thái do hệ thống cùng giảng viên quyết định.”
