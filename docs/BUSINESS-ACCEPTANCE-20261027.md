# Các G và kiểm thử nghiệp vụ — 27/10/2026

Người dùng yêu cầu tạm gác giao diện để ưu tiên nghiệp vụ. Lượt này đã kiểm lại các nhánh CV/lịch/phỏng vấn, lời mời GitHub, kỷ luật/thay người và thao tác của ba vai. Có một lượt Mentor chạy bằng Gemini thật và trace LangSmith được đọc lại.

**Kết quả:** 117 ca SQL/HTTP duy nhất đạt theo ma trận kết quả mới nhất. Đây là kết quả tổng hợp: nhóm kỷ luật ban đầu đạt 51/52; ba ca Agent tư vấn thay người sau đó đạt khi chạy riêng trên DB mới. Giữ nguyên timeout 5 giây, assertion và log thất bại. Không gọi đây là một lượt full-suite xanh duy nhất.

Nguồn máy đọc: [receipt JSON đã lược metadata riêng](reports/business-acceptance-20261027.json). Bằng chứng thô, tài khoản, email, định danh resource/trace và cấu hình vận hành giữ riêng trong folder dự án. Source BE là `254cabd8e5097d86bc6971f03419944b40b2f592`; không sửa code nghiệp vụ trong lượt này. UI chạy ở FE local dựa trên `305737850151c20607b26a755003059d5b002587` cùng thay đổi chưa commit của lần redesign. CI của nhánh đã push không chứng minh cho phần UI local đó.

## 1. Các G hiện ở đâu?

| G | Phần đã có | Kiểm trong lượt này | Giới hạn cần giữ rõ |
|---|---|---|---|
| G0 | CI và cấu trúc bàn giao | Đọc lại bốn workflow và các step đã thực thi | Các PR vẫn mở; chưa merge |
| G1 | Runtime, quyền tool, checkpoint, trace và tri thức có nguồn | Mentor thật: một tool receipt, sáu checkpoint, trace cloud đọc lại | Một Agent không thay thế eval mọi Agent |
| G2 | Sáu bài nhỏ và bảy Agent nghiệp vụ | CI runner hiện hành đã chạy đúng/sai trong container | Không chạy lại toàn thư viện local trong lượt này |
| G3 | CV, xác minh liên hệ, role, lịch và outbox | Nhóm G3/G4/Q05: 48/48 SQL/HTTP; đọc hộp thư QA qua IMAP | Không gửi CV hoặc email mới trong lượt này |
| G4 | Giờ vào, mốc 15 phút, ba lượt, hẹn lại có audit | SQL kiểm sớm, T+14:59/T+15, resume, race, role và retake | Đây là ca đồng hồ kiểm thử, không gọi là no-show ngoài đời |
| G5 | Lifecycle lời mời, numeric ID, cooldown và provenance | 17/17 SQL/HTTP; GitHub thật xác minh đúng tài khoản chung | Không gửi lời mời mới; hook HTTPS tạm trước đây đã tắt |
| G6 | Policy, điểm phạt, miễn trừ/gia hạn, tư vấn và thay người | 52 ca duy nhất theo kết quả mới nhất; policy sai/đúng và persistence qua UI | Có một timeout trong nhóm ban đầu; chưa xác định chắc nguyên nhân |
| G7 | Hành trình dịch vụ thật và bàn giao có nguồn | Báo cáo, audit, KPI, chứng nhận, kiểm quyền và Mentor trên UI | Chưa click mọi nhánh hoặc chạy lại toàn hành trình mới liên tục |

Hành trình thật trước đó từ CV đến chứng nhận vẫn có nguồn riêng ở [checkpoint 26/10](ACCEPTANCE-CHECKPOINT-20261026.md). Không gộp lượt kiểm hiện tại thành một hành trình chưa thực hiện.

## 2. Các ca vừa kiểm

| Nhóm | Kết quả | Điều được kiểm |
|---|---|---|
| CV/mail/lịch/phỏng vấn/credential | 4 suite, 48/48 đạt | Lịch thuộc server; không tiêu thụ lượt khi vào sớm; resume không tăng lượt; giữ lịch sử; credential recovery có điều kiện |
| Participation/replacement/access/Sprint | Lần đầu 7 suite, 51/52; advisor chạy riêng 3/3 | Incident không phạt lặp; quyền staff; bảo toàn bài đã chốt; queue quyền GitHub; planned Sprint và assignment isolation |
| Lời mời và grant ledger | 2 suite, 17/17 đạt | Remote pending/accepted/lỗi, numeric identity và quyền có nguồn |

Mỗi nhóm dùng DB disposable mới dưới thư mục dự án. Hai DB ứng dụng không bị reset. Provider kiểm thử được khai báo rõ; không có model thật hoặc remote trace do nhóm SQL này tạo.

Lượt Agent tư vấn bị timeout đã hoàn thành khi kiểm riêng với cùng source và timeout. Các Agent run trong DB đều có trạng thái cuối; trace ngoài đã tắt trong nhóm fixture. Kết quả này chưa đủ để khẳng định nguyên nhân timeout là RAM, CPU hay SQL; không sửa sản phẩm dựa trên phỏng đoán đó.

## 3. Những thao tác click thật

| Vai | Thao tác | Kết quả quan sát |
|---|---|---|
| Giảng viên | Từ phiên QA mở Báo cáo, nhập tên, lưu, tải lại và mở lịch sử | Bản chụp còn nguyên; 4/4 task, điểm 96,1 |
| Giảng viên | Nhập ngưỡng cảnh báo 3, trừ điểm 2 | Bị chặn, giải thích thứ tự ngưỡng |
| Giảng viên | Sửa về 1/2/3 rồi lưu chính sách | Phiên bản 1 hiện sau acknowledgement và sau tải lại; không cấu hình điểm trừ |
| Sinh viên đã hoàn tất | Mở KPI và nguồn tính | KPI 98,8; chất lượng 96,1 × 30%, đúng hạn 100 × 20%, bàn giao 100 × 50% |
| Sinh viên đã hoàn tất | Xem sổ giao dịch | Một giao dịch, 9.880.000 đồng ảo; không sinh thêm giao dịch khi xem |
| Sinh viên đã hoàn tất | Mở chứng nhận và xác minh công khai | Chứng nhận hợp lệ; nhập mã sai thì kết quả hợp lệ cũ bị xóa và hiện lỗi |
| Sinh viên đang làm | Thử mở KPI của tài khoản QA khác | Không nhận dữ liệu KPI đó; UI hiện lỗi có thể thử lại, chỉ giữ sổ giao dịch của chính mình |
| Sinh viên đang làm | Tạo hội thoại Mentor, chọn task, gửi câu hỏi, tải lại | Có phản hồi thật; cả câu hỏi và câu trả lời được lưu |
| Admin | Kiểm tra JSON chấm điểm sai | Có lỗi JSON cụ thể; không lưu/kích hoạt cấu hình |
| Admin | Lọc audit theo `report.created` | Có thao tác tạo báo cáo tương ứng với báo cáo QA vừa tạo |

Chỉ tạo một báo cáo, một policy trên phiên QA đã hoàn tất và một hội thoại QA. Không chấm lại bài, không thay điểm, không dùng ba tài khoản trắng và không tạo phạt hồi tố.

## 4. Dịch vụ ngoài và runtime

- Hai API local trả 200. Cả hai DB không còn migration chờ; bốn file data/log được đọc lại và nằm trong folder dự án.
- GitHub xác nhận danh tính tài khoản chung, numeric ID khớp cấu hình; thông tin định danh vận hành giữ trong bằng chứng riêng.
- Gmail IMAP TLS truy cập đúng hộp thư QA và tìm thấy sáu thư gửi tới alias của hành trình cũ. Không gửi thư mới trong lượt này.
- Mentor dùng `gemini-3.5-flash-lite`: hai lần quyết định, một lần trả lời, một tool receipt và sáu checkpoint. Lượt hoàn tất mất khoảng 74 giây; UI giữ trạng thái đang chờ rồi hiện kết quả thật.
- Trace của lượt mới đọc lại được trên LangSmith, có end time và ID khớp; không công bố ID hoặc URL trace. Câu hỏi QA nguyên văn không xuất hiện trong input/output của root trace đã kiểm.
- Trusted runner đã được khởi động lại. POST không có chữ ký trả 401. Đây là kiểm kết nối/xác thực; bằng chứng chấm container nằm ở CI và hành trình trước đó.

## 5. CI đã đối chiếu

| Source | Workflow | Kết quả |
|---|---|---|
| BE `254cabd` | [Backend + SQL Server 2019](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/40271056243) | Completed/success, các step G3–G6, migration và rollback đã chạy |
| BE `254cabd` | [Isolated runner](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/40271056260) | Completed/success, bài đúng/sai chạy trong container |
| FE `3057378` | [Quality](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/40275146767) | Completed/success, lint/typecheck/test/audit/build |
| FE `3057378` | [Full-stack](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/40275146765) | Completed/success, 14 nhóm nghiệp vụ cùng tuyển dụng/thư viện/quyền/UI |

Đây là nguồn CI theo đúng commit đã push, không phải CI của thay đổi UI chưa commit. Sau khi công bố tài liệu mới, kiểm CI của commit tài liệu riêng; không ghi đè receipt source cũ.

## 6. Phần tiếp tục

1. Giữ timeout local vừa gặp là finding có log; nếu lặp lại, profile riêng bước capture/SQL/graph trước khi thay code.
2. Các nhánh điều kiện đã có SQL/HTTP; toàn bộ ma trận click UI liên tục của ba vai vẫn cần hoàn thiện. Không gọi 117 ca SQL là 117 ca UI.
3. Review và tích hợp chuỗi PR theo dependency khi đủ gate. Lượt này không merge hoặc xóa nhánh.
4. Redesign và nghiệm thu thị giác tạm dừng theo chỉ đạo người dùng. Webhook thường trực/production không thuộc phạm vi local hiện tại.
