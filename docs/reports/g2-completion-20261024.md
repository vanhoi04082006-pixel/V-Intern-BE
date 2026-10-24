# Nghiệm thu G2 — bài thực hành nhỏ và bảy Agent nghiệp vụ

**G2 đạt trên cặp code BE `bb67573` / FE `958691a`, ngày 24/10/2026, UTC+7.** JSON bằng chứng ghi thời gian UTC. Phạm vi gồm P02–P04 và G01–G07, cùng các lát kỹ thuật A01–A04 của kế hoạch nối tiếp; đây không phải tuyên bố hoàn thành các module CV, lịch/email, lời mời GitHub hoặc xử lý vi phạm của G3–G6.

Nguồn máy đọc được: [g2-completion-20261024-evidence.json](g2-completion-20261024-evidence.json). File chứa source SHA, kết quả, mốc giờ và SHA-256 log local; không chứa credential, dữ liệu người dùng hoặc output CV thật. Các file `manual-runtime/...` là bằng chứng local dưới workspace, không phải đường dẫn tải từ GitHub. Test/script và kết quả tóm tắt đã được đưa lên hai repository.

## Kết quả có thể sử dụng

| Hạng mục | Đầu ra | Nghiệm thu |
|---|---|---|
| P03a | Sáu lời giải tham khảo, hidden behavioral checks, hai biến thể sai/bài | Sáu reference pass; 12 faulty và sáu starter đều fail đúng check trong Docker |
| P03b | Adapter module Node trong sandbox; catalog seal theo repo/task/spec/image | 24 trường hợp chạy Docker thật; image digest được ghi; CI runner riêng |
| P04a | Parser public/private/version; text preview và ZIP public | Parser chặn path/collision/budget/schema lỗi; không thực thi file |
| P04b | Admin soạn field; staff đọc riêng; sinh viên tải bản ghim | Browser thật, SQL/HTTP thật; conflict 409 giữ form; v3 không thay gói v2 |
| A01 | Registry bảy Agent và mapping các feature cũ | Model chọn query cho tool giới hạn; không cấp quyền qua dữ liệu |
| A02 | LangGraph, scope, SQL checkpoint/receipt/replay | Restart, transient retry, thu hồi quyền, IDOR, tool budget và HTTP isolation đạt |
| A03 | Luồng cũ đi qua runtime; validator và quyết định domain giữ nguyên | Hồi quy phỏng vấn, Planner, Mentor, tư vấn, hỗ trợ chấm và nộp/review qua SQL |
| A04 | 18 tài liệu curated đã xuất bản, retrieval có version/hash | Cả bảy consumer có nguồn đúng policy; Gemini và LangSmith đọc lại thật |
| G07 | Admin thấy registry, Agent/version/prompt/run/model, usage và trạng thái | SQL metadata-only, Admin-only, filter/pagination; browser với lượt Agent thật qua provider test |
| Local | Cài nội dung và chạy code mới trên hai API, FE 3001 | Sáu mẫu/assessment và 18 tài liệu mỗi DB; dữ liệu cũ/tài khoản được bảo toàn |

## Source được kiểm

| Repository | Source code |
|---|---|
| BE | `bb67573a38880239d13cea6d0b8dfdb662fa2891` — Agent `cb90735`, package/content activation `bfca7c0` |
| FE | `958691a803f66d636e4e279ba584604c7070dded` — UI/package/CI và monitor G07; `f1b3fb3` chặn submit đăng nhập trước hydration |
| Runner P03 | `b03866921185b2037017515f41ceccc7b0796e85`; các commit G2 sau không thay runner |

Các commit bàn giao sau mốc code này chỉ cập nhật Markdown/JSON bằng chứng. FE full-stack ghim đúng BE `bb67573`; không checkout một nhánh trôi. CI và log được đối chiếu với source code, không suy từ ngày tạo tài liệu.

## Ma trận kiểm chứng local

| Lệnh / lớp | Kết quả | Bằng chứng trong `manual-runtime/g2-completion-20261024/` |
|---|---|---|
| BE `npm test` | **93 suite / 750 test** | `be-unit-seal.log` |
| BE lint/build/audit production | Đạt; 15 cảnh báo console có sẵn, không có lỗi; audit 0 lỗ hổng | `be-lint-complete.log`, `be-build-final.log`, `be-audit.log` |
| SQL shared regression | **33 suite / 315 test** trong một DB disposable đã migrate | `be-sql-prepared.log` |
| Business Agent + knowledge HTTP | **12 test**, DB riêng | `g07-monitor-green.log` |
| Retrieval | **8 test**, DB riêng | `retrieval-isolated-retry.log` |
| FE `npm test` | **92 file / 591 test** | `g07-fe-full.log` |
| FE typecheck/lint/build/audit production | Đạt; audit 0 lỗ hổng | `fe-typecheck-seal.log`, `fe-lint-seal.log`, `g07-fe-build.log`, `fe-audit-seal.log` |
| Browser G2 | **30 viewport checks**, ba nhóm hành trình, không pageerror/overflow | `browser/result.json`, ảnh authoring/private-preview/teacher-history/learner-pinned |
| Docker P03 | **24 trường hợp**: sáu reference đúng và 18 negative | `p03-docker-evidence.json` |
| Gemini + LangSmith | **Bảy feature có lượt thành công**, model thực và root trace đã đọc lại | `live-third-result.json`, `live-result.json` |
| Runtime chính | Hai API + năm route HTTP; **bảy danh tính gốc/demo** đăng nhập và scope đúng | `native-activation.json`, `native-readiness.json` |

315 SQL shared gồm hai test knowledge HTTP cũ. Lượt 11 riêng kiểm thêm ca cô lập HTTP mới và tám business Agent; không cộng các dòng trên thành một lượt full-suite. CI current shared chạy cả ca HTTP mới. Unit, SQL dùng provider test, browser, Docker và Gemini là các loại bằng chứng khác nhau.

## CI theo đúng code

- [BE release gate SQL Server 2019](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/40090651194), source `bb67573`.
- [Runner Docker CI](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/40090652907), source `bb67573`.
- [FE quality](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/40090910817), source `958691a`.
- [FE full-stack SQL Server 2019](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/40090910820), source `958691a`, BE ghim `bb67573`.

**Cả bốn gate đều completed/success** trên đúng source ở bảng. Các liên kết Actions là nguồn kết luận và step-by-step log. Full-stack giữ 14 bước nghiệp vụ cũ, career và knowledge acceptance, đồng thời thêm scenario G2; không bỏ bước cũ để lấy kết quả xanh. Không gọi test provider là Gemini thật.

## Những thao tác browser đã thực hiện

Admin nhân bản mẫu MINI, sửa nội dung README public, soạn lời giải/hidden file/rubric/mapping bằng biểu mẫu và lưu qua API. ZIP được tải thật và giải nén để kiểm chỉ có public files. Người có quyền mở riêng lời giải; phần này không nằm trong ZIP.

Một update đồng thời làm version thay đổi; lần lưu từ form cũ nhận 409 và giữ text chưa lưu. Giảng viên tạo phiên từ v2; Admin sửa mẫu lên v3. Sinh viên mới được gán cho phiên tải ZIP vẫn chứa marker v2, đọc qua endpoint chính chủ. API private trả 403 cho sinh viên, project lạ trả 404. Staff đọc lại public history v2 được.

Mỗi nhóm màn hình authoring/private preview/teacher history/learner pinned được kiểm ở **320, 390, 768, 1024, 1280 và 1440 px**. Nội dung được render như text; script/HTML trong file không thực thi. Fixture chỉ nằm trong SQL test disposable, không dùng ba tài khoản trắng của người dùng.

Nhóm thứ năm kiểm **Agent & lượt chạy**: sinh viên gọi Mentor qua API với provider test tường minh, tạo run SQL thật; Admin lọc và thấy Agent/version/run/model, không thấy nội dung câu hỏi hoặc output. Năm nhóm màn hình × sáu kích thước = 30 viewport checks. Gemini/LangSmith được kiểm độc lập ở phần dưới.

## Chất lượng model thật và giới hạn

Các holdout đi qua registry, scope, model/tool/model, SQL receipt và provider Gemini thực. Chúng dùng câu hỏi riêng theo từng Agent và output probe có schema để kiểm hành vi; **không thay thế bài nghiệm thu end-to-end mọi nghiệp vụ với model thật**. Public domain validators và side effect được kiểm riêng bằng regression SQL/provider fixture.

| Agent | Quan sát từ câu trả lời thật |
|---|---|
| Conversation | Hỏi mở về input/output và bằng chứng, không đưa rubric/đáp án |
| Evaluator | Chỉ ra sai khi tin giá client; nói thiếu toàn bộ bài nên chưa kết luận điểm |
| Planner | Chia bốn bước cho bài nhỏ, không thêm SQL/cloud/auth |
| Reviewer | Nêu rủi ro giá client; không tuyên bố đã chạy test khi thiếu receipt |
| Mentor | Hướng dẫn kiểm đầu vào, không đưa hidden tests hoặc toàn bộ lời giải |
| Advisor | Không bịa KPI/task khi chưa có lịch sử |
| Instructor assistant | Đòi bằng chứng bàn giao và giữ quyền quyết định cho giảng viên |

Model trả về `gemini-3.5-flash-lite`; latency/token trong JSON lấy từ kết quả provider/state. Không bịa chi phí khi chưa có nguồn giá. Cả bảy trường hợp có source code thực trong receipt và trace root LangSmith đọc lại được.

Đây là **ma trận tổng hợp từ hai lượt cuối**: sáu ca thành công ở lượt toàn bộ thứ ba, cộng lượt Planner riêng sau lỗi provider 503. Các lượt trước có thiếu trích nguồn, trích sai mã, HTTP 429 và HTTP 503; log/JSON cũ được giữ. Bổ sung `sourceManifest` để model thấy rõ mã/version/hash được đọc, không nới assertion kiểm nguồn. Không mô tả kết quả này thành một lần gọi bảy ca đều xanh từ đầu.

## Bảo toàn local và các lỗi đã sửa

Cả `VIntern_M2_BROWSER` và `VIntern_Test_Learning_20261014` có sáu mini template, sáu assessment và 18 knowledge entries published. Lượt seed thứ hai không tạo thêm version. Counts người dùng, hồ sơ, buổi/câu trả lời, phân công, template_runs và chứng nhận khớp trước/sau; digest danh tính/mật khẩu/trạng thái, template cũ và snapshot phiên không đổi. MDF/LDF được resolve và nằm dưới workspace. Không reset database.

- Endpoint learner ban đầu dùng tên quyền không tồn tại, gây 403; sửa sang `intern.workspace.view`, vẫn kiểm intern/chính chủ/phân công.
- Knowledge-runs G1 có thể nhận ID business run cùng actor; khóa theo loại Agent trước read/cancel/resume, có SQL test đỏ/xanh.
- Form tài liệu chấm nâng cao có thể crash khi hàng JSON là null; giữ nguyên text và báo lỗi cấu trúc thay vì crash.
- Form login trước hydration có thể submit GET theo trình duyệt; dùng POST và khóa nút đến khi client sẵn sàng, có test SSR đỏ/xanh.
- Blob jsdom và Response của Node khác realm khiến ba test tải PDF/XLSX sai; đồng bộ Blob trong môi trường test với native Fetch, giữ nguyên các assertion download.
- Lượt local full SQL đầu chưa migrate DB trước các suite legacy, nên fail schema. Chạy lại đúng bước chuẩn bị đạt 315. Lượt ghép business/retrieval cùng DB làm fixture giao nhau; giữ cách ly DB như CI, không sửa assertion để né lỗi.

## Hạn chế còn lại trong phạm vi kỹ thuật

Retrieval vẫn là lexical SQL, chưa có vector search. Bảy holdout không chứng minh chất lượng với mọi nghề/ngôn ngữ. Cần đánh giá chuyên gia nội dung trước khi mở rộng bank quy mô lớn. Bộ G2 có 18 tài liệu, trong đó sáu Q&A nhiều hướng trả lời; không được gọi đó là bộ 144 Q&A hoặc 10 lượt model/Agent được đề xuất cho đợt mở rộng ban đầu. Seed không ghi đè nội dung đã được tác giả sửa.

Runner mới được chứng minh cho sáu hợp đồng module Node của G2 và các profile đã có; không tự chấm mọi framework/repository. Seal theo repo/task/spec/image vẫn cần operator. Lời giải và checks bundled nằm trong source repository; hidden test cho kỳ thi thật cần được quản lý ngoài repository công khai. API private không biến nội dung đã public trên GitHub thành bí mật. Trace cloud best effort chưa có outbox replay; retention/purge và UI điều khiển retry/cancel mọi business run chưa được thêm. Màn Admin hiện chỉ đọc metadata. Không có tuyên bố production readiness từ bộ local này.

Hướng dẫn sử dụng: BE [AGENTS-AND-MINI-PROJECTS](../AGENTS-AND-MINI-PROJECTS.md); FE [MINI-PROJECTS](https://github.com/vanhoi04082006-pixel/V-Intern-FE/blob/feat/ui-ux-overhaul/docs/MINI-PROJECTS.md).
