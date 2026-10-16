# Dependency audit — 16/10/2026

Audit dùng `npm audit --json` trên lockfile hiện hành và kiểm tra riêng `--omit=dev`. Kết quả đầy đủ lưu local trong `manual-runtime/private/ci-*-audit.json`; không diễn giải số package bị ảnh hưởng thành số lỗ hổng độc lập.

| Phạm vi | Backend | Frontend |
|---|---:|---:|
| Toàn bộ cây dependency |29high,7moderate |5high |
| Dependency production |0high/critical,3moderate |0finding |

Hai advisory gốc chưa có bản vá upstream tại thời điểm kiểm tra:

- [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): braces qua micromatch, ảnh hưởng recursive glob pattern. Trên hai lockfile hiện tại, các đường dẫn bị báo thuộc Jest/types hoặc ESLint tooling. Ứng dụng không nhận glob từ request và không import braces/micromatch trong source runtime. Cấu hình/pattern CI do repository quản lý; job PR dùng môi trường dùng một lần và không nạp secret ứng dụng.
- [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c): sprintf-js với precision tùy ý trong format string. Backend có đường runtime mssql11→tedious18→sprintf-js1.1.3. Đã kiểm tra các chỗ gọi trong driver: format là literal cố định ở packet/login metadata; giá trị SQL/người dùng chỉ là đối số, không được dùng làm format. Các đường còn lại thuộc công cụ CLI/test.

Đây là đánh giá reachability của phiên bản hiện tại, không phải bản vá hoặc chứng minh thư viện an toàn cho mọi cách dùng. Không downgrade Next/Jest/SQL driver hoặc sửa lockfile bằng force chỉ để xóa cảnh báo. Khi cập nhật dependency phải chạy lại audit và kiểm tra call sites; khi upstream có bản vá cần cập nhật, chạy test/build/SQL hồi quy. Gate production chặn high/critical, trong khi các finding chưa vá này vẫn được ghi rõ để review phát hành.
