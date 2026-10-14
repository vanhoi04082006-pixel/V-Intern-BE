# Kiểm chứng thay đổi ngày14/10/2026

- Unit:53suites/460tests đạt.
- Build đạt; lint0errors,15warning no-console có sẵn.
- SQL E2E:19suites/174tests đạt trong một run trên database dùng một lần, migrate24 và không còn pending. SQL local engine17compat150; native2019 cần CI riêng.
- Provider thật đã qua chat10câu (negative43.5/positive93.3), plan/publish4tasks, mentor theo task và report PDF/XLSX; dữ liệu chỉ trong DB nghiệm thu riêng.
- Consent/expiry/revoke và OAuth state/PKCE/encryption/user-active query qua SQL thật. Transport GitHub được mock trong test; không coi là live GitHub provisioning.

OAuth App/linked accounts và runner/suite cách ly chưa cấu hình, nên repo/PR execution ngoài chưa được nghiệm thu. Runner adapter chỉ chứng minh validation/signature/binding bằng tests; thiếu execution evidence vẫn inconclusive. Không có student code nào chạy trên host BE.

Harness đầy đủ phải đặt DB_NAME=E2E_DB_NAME cùng một database explicit dùng một lần, tắt external provider và dùng test-only providers. FreshDB trước toàn run tránh fixture static-name collision. Không chạy reset trên runtime. Secret/credentials không nằm trong repository.

Chứng cứ/hướng dẫn workspace: docs/VERIFICATION.md ở thư mục cha của hai repository. Khi phát hành, cập nhật FE compatibility pin bằng BEcommit đã review và chạy lại CI nativeSQL2019/OAuth/runner thật.
