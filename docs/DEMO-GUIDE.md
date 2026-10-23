# Hướng dẫn demo V-Intern trước giảng viên

> Tên đăng nhập trong bản GitHub là tên minh họa. Bộ tài khoản thực tế và mật khẩu được bàn giao riêng, không công bố trong repository.

**Ngày chuẩn bị: 23/10/2026.** Tài liệu này dùng cho bản local đang chạy. Đọc từ mục 1 đến mục 3 trước buổi demo, sau đó dùng mục 4 làm kịch bản thao tác.

## 1. Ba tài khoản dành riêng cho buổi demo

| Vai trò | Tên đăng nhập | Địa chỉ sử dụng |
|---|---|---|
| Giảng viên | `giangvien_demo` | http://localhost:3001/login |
| Sinh viên — kịch bản đạt | `sinhvien_demo` | http://localhost:3001/login |
| Sinh viên — kịch bản chưa đạt | `sinhvien_chuadat_demo` | http://localhost:3001/login |

Mật khẩu nằm trong thông tin được bàn giao riêng trên máy local. Mở tệp đó riêng để đăng nhập; không chiếu tệp mật khẩu trước lớp.

Ba tài khoản đã được kiểm tra đăng nhập đúng vai trò. Tại lúc bàn giao, cả ba có **0 dự án, 0 phiên phụ trách, 0 phân công, 0 bài phỏng vấn, 0 nhiệm vụ**. Có thể có thông báo chào mừng tự động; điều này không có nghĩa đã phát sinh dữ liệu học tập. Những tài khoản cũ được giữ nguyên.

**Dùng cổng 3001 cho ba tài khoản này.** Cổng 3004 là môi trường QA riêng, dùng database và tài khoản khác. Không đổi qua lại hai cổng trong cùng kịch bản rồi cho rằng dữ liệu sẽ giống nhau.

### Mở đồng thời hai vai trò

- Cửa sổ A: Chrome thông thường, đăng nhập **Giảng viên**.
- Cửa sổ B: Edge hoặc một profile trình duyệt khác, đăng nhập **Sinh viên**.
- Nếu chỉ dùng một trình duyệt, dùng một cửa sổ thường và một cửa sổ ẩn danh.

Không chỉ mở hai tab chung profile rồi đăng nhập hai người: phiên đăng nhập có thể được chia sẻ, khiến tab đang đóng vai sinh viên chuyển sang giảng viên hoặc ngược lại. Khi đổi cửa sổ, nhìn tên/vai trò trên thanh đầu trang trước khi bấm.

### Hai tình huống phỏng vấn riêng biệt

Dùng **Sinh viên Chưa đạt 23/10** để đóng vai ứng viên chưa chuẩn bị: trả lời đúng tình huống là chưa hiểu/chưa biết áp dụng khái niệm khi được hỏi, không dùng phần trả lời kỹ thuật đầy đủ của tài khoản còn lại. Nộp bài qua UI rồi đọc điểm và phản hồi. Chỉ gọi là rớt khi điểm thực tế **dưới 50**; nhóm **50–70** là gợi ý role khác. Điểm AI không được cài sẵn và có thể thay đổi.

Sau đó đăng xuất, dùng **Sinh viên Bảo vệ 23/10** để trình bày tình huống đã chuẩn bị: giải thích khái niệm, ví dụ, cách kiểm thử và giới hạn; trả lời bằng tiếng Anh cho câu tiếng Anh. Chỉ tiếp tục phân công khi kết quả thực tế **trên 70**.

Cả hai sinh viên đều trắng, còn đủ lượt lúc bàn giao; không phỏng vấn thử bằng các tài khoản này trước buổi bảo vệ nếu muốn giữ trạng thái ban đầu.

## 2. Chọn phạm vi phù hợp với thời gian được trình bày

| Phương án | Phù hợp | Nội dung |
|---|---|---|
| **Demo trọng tâm 15–20 phút** | Buổi bảo vệ cần trình bày rõ luồng và kiến trúc | Tài khoản trắng → tuyển dụng → phân công/kế hoạch → Sprint/đầu việc; dùng bằng chứng nghiệm thu có sẵn để trình bày nộp/chấm/kết quả cuối |
| **Thực hành đầy đủ 45–90 phút hoặc hơn** | Có đủ thời gian viết bài, chờ AI và GitHub | Đi tiếp toàn bộ nộp PR, trả sửa, nộp lại, duyệt, đánh giá, KPI và chứng nhận; cần chuẩn bị mục 3 |

Thời gian là ước lượng, không phải cam kết. Một cuộc phỏng vấn thật, việc viết source và chờ provider có thể dài hơn. Nếu sinh viên chưa đạt hoặc dịch vụ lỗi, hãy giải thích trạng thái thật; không sửa database hoặc giả điểm để tiếp tục demo.

Nếu muốn giữ nguyên các tài khoản trắng cho buổi bảo vệ, **đừng hoàn thành phỏng vấn hoặc tạo phiên bằng ba tài khoản này khi tập trước**. Tập bằng tài khoản QA đã có. Các thao tác tạo/nộp/chấm đều lưu thật; tải lại trang không làm tài khoản trắng trở lại.

## 3. Chuẩn bị trước buổi demo

### 3.1. Kiểm tra dịch vụ

1. Mở http://localhost:3001/login và http://localhost:8080/api/v1/health.
2. Health cần có `status: ok` và `checks.database: ok`.
3. Kiểm tra có Internet để gọi AI/GitHub. Dữ liệu SQL và giao diện chạy local không có nghĩa AI/GitHub hoạt động offline.
4. Nếu cần khởi động dịch vụ trên máy bàn giao đã có bộ launcher local, dùng PowerShell từ repository. Các launcher trong manual-runtime thuộc bộ vận hành riêng của máy; khi clone trên máy mới, làm theo hướng dẫn local của Backend:

```powershell
Set-Location .. # Từ repository, trở về workspace chứa FE và BE
& .\V-INTERN-BE\scripts\Use-ProjectStorage.ps1
& .\manual-runtime\start-owned-services.ps1 -Backend -Frontend
& .\manual-runtime\start-grader.ps1
```

`start-owned-services.ps1` bỏ qua cổng đã có process, không tự thay một bản server cũ. Chỉ khi vừa thay source/build và cần khởi động lại process đúng sở hữu, dùng:

```powershell
& .\manual-runtime\restart-owned-apps.ps1 -Backend -Frontend
```

Không chạy seed/reset database. Không cần cài lại dependency hoặc build/test toàn bộ ngay trước khi thuyết trình. SQL Server là prerequisite riêng; nếu SQL chưa chạy thì các launcher API không tự biến nó thành sẵn sàng.

### 3.2. Chuẩn bị cho phần GitHub và chấm code

| Cần có | Cách kiểm tra | Khi chưa có |
|---|---|---|
| Tài khoản repository dùng chung của Admin | Admin → cấu hình GitHub, xem trạng thái kết nối | Hoàn tất cấu hình trước buổi demo; giảng viên/sinh viên không phải tự cung cấp tài khoản tạo repo |
| GitHub sinh viên thực sự dùng được | Sinh viên → GitHub, liên kết đúng danh tính và nhận lời mời repository | Chuẩn bị đăng nhập/2FA của chính bạn; email `@vintern.local` chỉ dùng đăng nhập ứng dụng, không phải hộp thư nhận lời mời |
| Danh tính chưa bị liên kết với người khác trong cùng môi trường | Khi liên kết không gặp lỗi tài khoản đã được sử dụng | Dùng danh tính GitHub phù hợp hoặc demo phần PR bằng tài khoản QA đã liên kết; không tự tháo kết nối tài khoản gốc |
| Repository có source chạy được | Đọc README, chạy ứng dụng và test theo công nghệ đã chọn | Repo mới chỉ có README không phải bài đã làm; cần viết source/cấu hình chạy |
| Bộ kiểm thử tin cậy đúng TaskSpec | Kiểm tra trạng thái runner/bộ test của chính task sẽ trình bày | Worker online chưa đủ. Task mới sinh bởi AI có thể chưa có suite tương ứng; chuẩn bị suite hợp lệ trước hoặc giải thích giới hạn này |
| Quyền và thời gian cho các bước cuối | Admin có kỳ KPI/cấu hình lương ảo/chính sách chứng nhận phù hợp | Dừng ở điểm giảng viên duyệt hoặc trình bày kết quả QA có sẵn |

Không nhập token, mật khẩu GitHub hoặc mã 2FA vào nội dung task/PR. Nếu OAuth yêu cầu xác thực lại, tự hoàn tất trong trình duyệt trước khi tiếp tục.

**Đặc biệt:** Có AI chấm source không đồng nghĩa code đã chạy test. Nếu UI báo runner chưa cấu hình/không đủ bằng chứng, không trình bày đó là “test đã đạt”. Bộ suite niêm phong của lượt QA cũ không tự áp dụng cho mọi task mới.

## 4. Kịch bản thao tác trực tiếp

### Bước 1 — Giới thiệu sản phẩm, 1 phút

Mở trang chủ http://localhost:3001/, sau đó chuyển tới hai cửa sổ đăng nhập.

**Có thể nói:**

> “V-Intern mô phỏng một kỳ thực tập. Sinh viên được tuyển dụng, nhận công việc theo Sprint và nộp bài qua GitHub. AI hỗ trợ tạo kế hoạch, hướng dẫn và phân tích bài nộp; giảng viên vẫn giữ quyền đánh giá chính thức.”

**Cho giáo viên thấy:** Hai vai trò khác nhau, menu và phạm vi thao tác khác nhau. Không cần đọc lần lượt mọi menu.

### Bước 2 — Sinh viên bắt đầu từ tài khoản trắng

**Cửa sổ Sinh viên:** đăng nhập → vào quy trình tuyển dụng theo nút trên giao diện.

1. Đọc phần giới thiệu.
2. Chọn vai trò bạn có thể trả lời, ví dụ Frontend Developer.
3. Bắt đầu phỏng vấn và trả lời theo câu hỏi hệ thống thực sự đưa ra.
4. Với câu chuyên môn, nêu cách làm, lý do, ví dụ và giới hạn; câu tiếng Anh nên trả lời bằng tiếng Anh theo yêu cầu.
5. Nộp/chấm khi đã hoàn thành câu hỏi và đọc kết quả.

**Có thể nói:**

> “Phỏng vấn là hội thoại có lưu tiến độ. Điểm do backend xử lý theo chính sách; giao diện không tự cấp kết quả đạt.”

| Điểm tổng | Giải thích và bước tiếp theo |
|---|---|
| Dưới 50 | Chưa đạt; xem phản hồi, phỏng vấn lại nếu còn lượt và hết thời gian chờ |
| Từ 50 đến 70, gồm cả 50 và 70 | AI gợi ý role khác dựa trên câu trả lời; người học tự xem lý do rồi quyết định |
| Trên 70 | Đạt vị trí; vào trạng thái chờ giảng viên phân công |

Tối đa **3 lượt tổng cộng**, không phải một lượt đầu cộng ba lần thi lại. Đổi role không làm mới ngân sách lượt. Nếu provider lỗi khi chấm, dùng chấm lại bài hiện có theo UI; không bấm tạo lượt mới liên tục.

**Điểm dừng:** Sinh viên đạt và thấy trạng thái chờ phân công. Việc chưa có task ở đây là đúng nghiệp vụ. Không thể bảo đảm một câu trả lời mẫu sẽ luôn nhận điểm trên 70.

### Bước 3 — Giảng viên tạo phiên thực tập

**Cửa sổ Giảng viên:** Tổng quan → **Thư viện dự án** (`/instructor/projects`).

1. Mở một mẫu phù hợp với role sinh viên đã đạt, ưu tiên **Sổ tay học tập cá nhân** nếu có trong thư viện.
2. Đọc mục tiêu, công nghệ, lộ trình và tiêu chí hoàn thành.
3. Tại vùng khởi tạo, đặt tên dễ nhận biết, ví dụ `DEMO 23-10 - So tay hoc tap`.
4. Chọn ngày bắt đầu/kết thúc phù hợp với lộ trình mẫu, đủ để chứa các Sprint.
5. Khởi tạo phiên → vào **Thiết lập phiên**.
6. Chọn **Sinh viên Bảo vệ 23/10** vào đúng role còn chỗ; xác nhận phân công.
7. Bắt đầu phiên theo thao tác giao diện.

**Có thể nói:**

> “Mẫu dự án định nghĩa khung đầu ra, còn mỗi phiên có đội hình và thời gian riêng. Chỉ sinh viên đủ điều kiện, đúng role và chưa có phân công active khác mới được nhận vào phiên.”

**Điểm dừng:** Giảng viên thấy sinh viên trong đội hình; Sinh viên mở lại Tổng quan và thấy dự án được phân công. Nếu danh sách không có sinh viên, kiểm tra kết quả tuyển dụng/role trước khi nghĩ rằng ứng dụng mất dữ liệu.

### Bước 4 — Duyệt kế hoạch AI và kích hoạt Sprint

**Cửa sổ Giảng viên:** mở phiên vừa tạo → phần kế hoạch AI.

1. Yêu cầu tạo kế hoạch khi phiên/đội hình đáp ứng điều kiện hiển thị trên trang.
2. Khi AI trả nháp, đọc ít nhất một Sprint và một nhiệm vụ: người nhận, ngày, đầu ra, DoD, phụ thuộc.
3. Điều chỉnh nếu cần và xác nhận **công bố/xuất bản** theo nút hiện trên UI.
4. Mở Sprint đầu tiên và bấm **Kích hoạt**.
5. Chuyển cửa sổ Sinh viên → **Sprint Board** hoặc **Công việc của tôi** → tải lại dữ liệu.

**Có thể nói:**

> “Nháp AI chưa phải công việc chính thức. Sau khi giảng viên duyệt công bố, các task mới xuất hiện cho người nhận. Một Sprint có trong danh sách nhưng còn planned thì chưa phải Sprint đang chạy.”

**Điểm dừng:** Hai bên cùng thấy Sprint/task đã công bố; sinh viên không còn thông báo “giảng viên chưa kích hoạt Sprint”. Nếu vẫn thấy, kiểm tra đúng phiên, đúng project và status active.

### Bước 5 — Sinh viên đọc việc và dùng Kanban/Mentor

**Cửa sổ Sinh viên:** `/intern/work`, `/intern/sprint`, `/intern/mentor`.

1. Mở một task được giao, đọc yêu cầu và tiêu chí hoàn thành.
2. Ưu tiên task không có phụ thuộc chưa xong.
3. Kéo **Cần làm → Đang làm**; có thể dùng điều khiển bàn phím/nút trên giao diện.
4. Mở AI Mentor, hỏi một vấn đề cụ thể liên quan task, ví dụ cách kiểm tra tiêu đề rỗng sau khi trim hoặc cách lưu dữ liệu an toàn.
5. Quay lại task và cho thấy trạng thái được giữ sau khi tải lại.

**Có thể nói:**

> “Kanban ghi trạng thái thật qua API. Backend chặn nhảy bước và task còn phụ thuộc; Mentor là kênh hỗ trợ, không tự hoàn thành bài thay sinh viên.”

Không kéo thẳng sang Hoàn thành để minh họa tiến độ. Thao tác chuyển sang Review có thể mở hộp nộp bài; việc kéo thẻ không thay thế bằng chứng bài nộp.

### Bước 6 — Làm bài và nộp PR thật

Chỉ đi tiếp phần này khi đã chuẩn bị mục 3.2. Nếu buổi demo ngắn, chuyển sang mục 5 và nói rõ đây là kết quả của lượt nghiệm thu trước.

1. Sinh viên liên kết GitHub tại `/intern/github`, mở repository của đúng phiên và chấp nhận lời mời collaborator nếu đang chờ.
2. Đọc README/TaskSpec. Nếu cần clone/cài dependency, đặt mọi thứ dưới `<WORKSPACE>\demo-workspaces` và chạy `Use-ProjectStorage.ps1` trong PowerShell đó trước lệnh cài/build/test.
3. Tạo nhánh riêng, ví dụ `demo/LEARNNOTES-task-code`; không chỉ sửa trực tiếp main rồi gửi URL repo.
4. Viết phần chức năng đáp ứng task, chạy test theo README và commit/push.
5. Mở Pull Request về nhánh đích phù hợp; tên PR nên chứa mã task.
6. Sao chép URL dạng `https://github.com/OWNER/REPO/pull/123`.
7. Quay lại task → **Nộp bài** → dán URL PR, viết tóm tắt thực hiện → xác nhận.
8. Chờ kết quả, mở phần code review và đọc trạng thái runner, số test, findings, điểm AI.

**Có thể nói:**

> “Bài nộp gắn với đúng PR và commit SHA. Hệ thống phân biệt phân tích source với kết quả chạy test. Điểm AI là đề xuất, nên lúc này task vẫn chờ giảng viên.”

**Điểm dừng:** Task ở trạng thái Review/chờ duyệt, có URL PR và SHA. Nếu test chưa cấu hình hoặc provider lỗi, trình bày đúng thông báo và cách khắc phục; không gọi đó là bài đã đạt.

### Bước 7 — Giảng viên trả sửa và duyệt

**Cửa sổ Giảng viên:** mở đúng task/bài nộp trong phiên.

1. Đối chiếu yêu cầu task với diff, kết quả runner và nhận xét AI.
2. Nếu minh họa sửa bài, nhập phản hồi cụ thể rồi chọn yêu cầu làm lại.
3. Sinh viên mở phản hồi, sửa code trên nhánh PR và nộp lại bằng thao tác ứng dụng.
4. Giảng viên mở **bài nộp mới nhất**, đọc lại evidence và nhập đánh giá/rubric của mình.
5. Duyệt khi đủ điều kiện. Quay lại Sinh viên để thấy task hoàn thành và phản hồi chính thức.

**Có thể nói:**

> “AI không tự chuyển Done. Nếu code đổi sau khi nộp, SHA cũ không được duyệt như thể đó vẫn là bài hiện tại; sinh viên phải cập nhật bài nộp theo luồng hệ thống.”

Chỉ hoàn thành một task chưa đủ để khẳng định cả phiên đã xong. Các task phụ thuộc, Sprint và đầu ra còn lại vẫn phải đáp ứng điều kiện. Không merge PR trước rồi mới lấy việc đã merge làm bằng chứng giảng viên đã duyệt.

### Bước 8 — Kết quả cuối và báo cáo

Phần này cần toàn bộ điều kiện hoàn thành thực sự. Hai tài khoản demo không có sẵn dữ liệu để bỏ qua các bước trước.

| Vai trò | Thao tác | Điều cho giáo viên thấy |
|---|---|---|
| Giảng viên | Hoàn thành các task/Sprint; vào `/instructor/evaluations`, tạo/chọn kỳ và chấm rubric trong phạm vi được quản lý | Gợi ý AI khác điểm giảng viên tự nhập; bản nháp khác bản đã chốt |
| Giảng viên | Gửi/chốt đánh giá theo các trạng thái trên trang | Sinh viên chỉ đọc điểm chính thức khi đã chốt |
| Giảng viên | Kết thúc phiên/phân công theo điều kiện của hệ thống | Không tiếp tục coi assignment cũ là active |
| Admin đã có | Tính/chốt kỳ KPI, sinh lương ảo và cấp chứng nhận khi đủ chính sách | Đây là chức năng có quyền riêng; không dùng các tài khoản mới để giả quyền Admin |
| Sinh viên | `/intern/evaluations`, `/intern/kpi`, `/intern/certificates`, `/intern/performance` | Điểm có nguồn, ledger, PDF và xác minh công khai; vẫn xem được kết quả sau khi kết thúc |
| Giảng viên | `/instructor/reports` → chọn đúng phiên/sinh viên/bộ lọc → tạo báo cáo → tải | Báo cáo lưu snapshot, có PDF/Excel, không chỉ số liệu trên màn hình |

**Có thể nói:**

> “Đánh giá, KPI và lương ảo là các lớp khác nhau. KPI có trọng số và nguồn; lương ảo chỉ mô phỏng học tập, không phải tiền thanh toán. Chứng nhận chỉ được cấp khi chính sách hoàn thành thỏa mãn.”

## 5. Dùng kết quả nghiệm thu đã có khi thời gian ngắn

Nếu không đủ thời gian làm trọn kỳ trong buổi trình bày, nói rõ:

> “Phần vừa rồi chạy bằng các tài khoản mới. Phần sau là bằng chứng từ lượt nghiệm thu hoàn chỉnh đã thực hiện trên môi trường QA riêng, không phải số liệu vừa phát sinh ở tài khoản trắng.”

Mở [báo cáo nhập vai](ROLEPLAY-ACCEPTANCE.md). Các kết quả đã có:

| Nội dung | Kết quả đã nghiệm thu |
|---|---|
| Bài thực hành | Hai Sprint, bốn nhiệm vụ, bốn PR GitHub thật |
| Vòng sửa bài | Runner 1/2 → giảng viên trả sửa → sinh viên sửa → runner 2/2 → giảng viên duyệt |
| Điểm đánh giá | 85,5/100 |
| KPI | 95,7/100 |
| Lương mô phỏng | 9.570.000 đồng ảo; sinh lại không tạo giao dịch trùng |
| Chứng nhận | VINT-2026-00000002, xác minh hợp lệ |

Ảnh và tệp để mở khi trình bày:

- [Kế hoạch/Sprint được giảng viên kích hoạt](demo-assets/qa-instructor-sprint-active.png).
- [Bài sai và phản hồi](demo-assets/qa-student-broken-review.png).
- [Bài sửa đã qua AI, vẫn chờ giảng viên](demo-assets/qa-student-fixed-awaiting-instructor.png).
- [Giảng viên chốt đánh giá](demo-assets/qa-instructor-evaluation-finalized.png).
- [KPI và lương ảo](demo-assets/qa-student-kpi-salary.png).
- [PDF chứng nhận đã kiểm bố cục](demo-assets/qa-certificate-fixed.png).
- [Repository bài thực hành](https://github.com/hbuivanhoi6-stack/vintern-so-tay-hoc-tap-ca-nhan-qa-aurora-thuc-hanh-va-ban-g-20261022-db9f98e8).

Mở sẵn các ảnh trước buổi demo để không mất thời gian tìm file. Các con số này là dữ liệu QA đã nghiệm thu, không phải số liệu mặc định của hệ thống.

## 6. Xử lý nhanh nếu gặp vấn đề khi trình bày

| Hiện tượng | Cách xử lý đúng |
|---|---|
| Đăng nhập không được | Kiểm tra đang ở **3001**, đúng username/mật khẩu; kiểm health 8080. Không dùng tài khoản mới ở 3004 |
| Sinh viên chưa thấy task | Kiểm tra đúng sinh viên/phiên, đã phân công, kế hoạch đã công bố và Sprint đã active |
| Không kéo được thẻ | Đọc task phụ thuộc/trạng thái/version trong thông báo; tải lại nếu dữ liệu cũ. Không coi mọi lần bị chặn là lỗi kéo thả |
| AI đang chờ/lỗi | Giữ trang/draft và đọc mã lỗi; retry theo nút UI. Nếu quá thời gian, chuyển sang bằng chứng có sẵn, không nói AI đã trả kết quả |
| Không nhận lời mời GitHub | Mở đúng tài khoản GitHub đã liên kết; kiểm repository/invitations. Email local không phải hộp thư thật |
| GitHub yêu cầu 2FA/xác thực lại | Tự hoàn tất xác thực hợp lệ rồi tiếp tục; chuẩn bị trước buổi demo |
| Runner chưa cấu hình | Kiểm suite của task, không chỉ service worker. Chỉ trình bày AI source review đúng phạm vi; chưa được gọi là test đạt |
| PR/SHA thay đổi | Mở bài nộp hiện tại, rút/nộp lại theo UI khi cần; không ép duyệt snapshot cũ |
| Có điểm nhưng chưa thấy KPI/chứng nhận | Kiểm trạng thái finalized và điều kiện/kỳ/policy; giảng viên không thay quyền của Admin |
| Màn hình lỗi asset sau build | Khởi động lại đúng FE nếu vừa build, tải lại trang; không reset database |

## 7. Các câu hỏi giáo viên có thể hỏi

**“AI có chấm thay giảng viên không?”** AI sinh đề xuất và evidence. Giảng viên phải đối chiếu bài và chốt theo quyền; task không tự Done chỉ vì AI cho điểm cao.

**“Làm sao biết đúng bài sinh viên?”** Hệ thống kiểm danh tính GitHub, repository của phiên, PR và SHA snapshot. Một URL repository chung không thay thế URL PR hợp lệ.

**“Code có thực sự chạy không?”** Chỉ khẳng định đã chạy khi có kết quả trusted runner của đúng task/suite. Source review, runner lỗi và test đã chạy nhưng thất bại là ba trạng thái khác nhau.

**“Có kiểm thử gì?”** Mốc nghiệm thu trước buổi demo: FE 541 test, BE 625 test; SQL E2E 237 test theo ma trận tổng hợp các lượt chạy, có ghi log retry; browser 190 lượt ở năm kích thước. Xem [FE Verification](https://github.com/vanhoi04082006-pixel/V-Intern-FE/blob/feat/ui-ux-overhaul/docs/VERIFICATION.md) và [BE Verification](VERIFICATION.md), không nói tất cả đều là test gọi Gemini thật.

**“GitHub webhook đã chạy live chưa?”** Chưa nghiệm thu delivery webhook live cho repository QA. Lượt nghiệm thu đã kiểm PR/SHA qua GitHub API; hợp đồng webhook được kiểm riêng bằng E2E. Đây là giới hạn cần nói đúng.

**“Có chạy production chưa?”** Phạm vi hiện tại là local. Không gọi việc chạy local thành đã triển khai production.

## 8. Checklist một phút trước khi bắt đầu

- [ ] Mở đúng FE 3001; health 8080/database ổn.
- [ ] Hai cửa sổ/profile riêng, đúng vai trò và đúng tài khoản mới.
- [ ] Mật khẩu đã chuẩn bị riêng, không nằm trên màn hình trình chiếu.
- [ ] Chọn sẵn mẫu dự án và role phù hợp.
- [ ] Đã xác định phần nào demo trực tiếp, phần nào dùng bằng chứng QA.
- [ ] Nếu nộp code trực tiếp: GitHub, repository, source và suite đã chuẩn bị đúng.
- [ ] Mở sẵn báo cáo/ảnh kết quả và biết cách chuyển khi provider chậm.
- [ ] Không seed/reset, không sửa điểm bằng SQL, không hứa hoàn tất mọi bước trong 15 phút.

Kết thúc bằng câu: **“Luồng chính được kiểm soát từ tuyển dụng tới bằng chứng công việc và kết quả chính thức; AI hỗ trợ ở từng bước, còn quyền và trạng thái do hệ thống cùng giảng viên kiểm soát.”**
