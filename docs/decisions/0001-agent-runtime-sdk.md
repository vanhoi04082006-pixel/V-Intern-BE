# ADR 0001 — LangGraph trên NestJS và checkpoint SQL Server

Ngày: 24/10/2026. Trạng thái: chọn SDK sau spike local; runtime/durable/live trace chưa được coi là đạt chỉ từ ADR này.

## Bối cảnh và lựa chọn

BE hiện là NestJS 11, TypeScript strict, module CommonJS, Node 22; dữ liệu nghiệp vụ chạy SQL Server. G1 cần tool có schema, workflow hữu hạn, checkpoint qua restart và trace đã bỏ dữ liệu riêng tư. Không dùng MemorySaver làm lưu trữ cuối hoặc tự thêm PostgreSQL/vector DB.

Ghim `@langchain/langgraph 1.5.2`, `@langchain/langgraph-checkpoint 1.2.1`, `@langchain/core 1.3.0`, `langchain 1.5.19`, `langsmith 0.11.1`, `zod 4.6.7` theo metadata npm và type declarations đã cài tại project. Node hiện kiểm là 22.23.2. Spike CommonJS thực sự import được các package, gọi LangChain tool có schema strict từ LangGraph, kiểm output qua RunnableLambda/Zod và đọc checkpoint hoàn tất. Hai case trong `sdk-compatibility.spec.ts` đạt. MemorySaver trong spike chỉ kiểm tương thích, không chứng minh persistence.

LangGraph dùng StateGraph quyết định → tool → quyết định, với quyền/budget nằm ở server. Giữ provider Gemini và structured-output transport đã có qua adapter; không đưa vendor HTTP vào domain service. Structured decision được validate trước khi chọn tool. Không cần thêm SDK model/vendor mới chỉ để thay transport đang hoạt động.

Checkpoint adapter sẽ theo BaseCheckpointSaver của đúng package đã ghim, gồm checkpoint, metadata, parent và pending writes có thứ tự. SQL Server lưu trạng thái; lease/fencing và tool receipt phải được kiểm bằng SQL/restart test riêng. Chưa tuyên bố exactly-once cho HTTP/service ngoài không hỗ trợ idempotency. Không cấp arbitrary mutation tool trong Agent nghiệm thu G1.

## Trace và dữ liệu riêng tư

Không bật auto tracing trên graph có raw query/context. Spike xác minh AsyncLocalStorage context `tracingEnabled:false` có hiệu lực mà không đổi env toàn cục. Runtime sẽ gửi payload allowlist qua LangSmith adapter riêng: correlation/version, số lượng, độ trễ, token, code lỗi và hash tham chiếu; không gửi password/key/raw CV/câu hỏi nguyên văn. Trace local tồn tại độc lập; cloud lỗi không làm mất run.

Key/service workspace phải có quyền ingest ở đúng vùng. Probe hiện trả 403, kể cả gửi một trace cấu hình không có dữ liệu riêng tư. Đây là giới hạn live cần giải quyết, không phải bằng chứng tracing đã hoạt động. Credential chỉ nằm trong project-private storage; script cấu hình dùng secure prompt, không chứa key trong source.

## Advisory và lockfile

Audit mới phát hiện high trong dependency HTTP/Azure đã có, không nằm trong SDK Agent mới. Body-parser được ghim 2.4.0, multer 2.5.0. Azure identity 4.13.3 kéo MSAL 6 thuộc advisory auth-code; 4.13.0 còn dùng MSAL 3, nên tạm ghim phiên bản cuối của nhánh tương thích không bị advisory high này. UUID được override 11.1.1 để vá bounds check trong dependency cũ. Đây là pin có lý do bảo mật, không downgrade để bỏ audit. Cần bỏ pin Azure khi upstream tích hợp MSAL đã vá mà vẫn giữ API hỗ trợ.

Ứng dụng hiện dùng SQL username/password; không cung cấp Azure interactive sign-in qua driver. Dù vậy vẫn giữ audit high/critical nguyên vẹn và chạy SQL/HTTP regression với driver sau đổi lock. Sau reify lại UUID, audit production có **0 vulnerability** tại log `g1-audit-final.json`; dev audit được báo riêng. Không dùng `npm audit fix --force`.

## Nguồn chính thức

- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence) và [checkpointers](https://docs.langchain.com/oss/javascript/langgraph/checkpointers): checkpoint/thread và giới hạn MemorySaver.
- [LangChain tools](https://docs.langchain.com/oss/javascript/langchain/tools): schema tool và context server.
- [LangSmith cấu hình tracing](https://docs.langchain.com/langsmith/trace-without-env-vars), [API keys/workspaces/regions](https://docs.langchain.com/langsmith/create-account-api-key).
- Advisory: [MSAL auth-code](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5), [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828), [multer](https://github.com/advisories/GHSA-q7qp-rjg7-q26m). Metadata/version lấy từ registry npm, không từ trí nhớ hoặc bài viết bên thứ ba.

Evidence project-local: `manual-runtime/knowledge-library-20261024/g1-{install,sdk-spike,audit-final,increment-unit}.*`, cùng các log retrieval SQL. 684 unit hiện đạt trong working tree (669 nền + 13 retrieval + 2 spike); các phép thử runtime tiếp theo sẽ tăng số liệu. CI cuối G1 phải ghi đúng SHA tương thích và số liệu mới.
