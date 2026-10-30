# AESP — AI Education Support Platform

Ứng dụng luyện tiếng Anh cho Learner, Mentor và Admin. Dự án chạy local với PostgreSQL, Groq và speech recognition Python.

[Báo cáo sửa đổi đồ án](BAO_CAO_THAY_DOI_DO_AN.md) và [danh sách file thay đổi](DANH_SACH_FILE_THAY_DOI.csv) nằm ngay tại thư mục gốc.

## Cài lần đầu

1. Đọc [REQUIREMENTS.md](REQUIREMENTS.md) và cài phần mềm nền.
2. Chạy `SETUP_AESP.cmd` ngay tại thư mục dự án.
3. Điền DB password và Groq API key trong `backend/.env.local`.
4. Tạo database `aesp` rỗng rồi chạy:

```cmd
npm run db:init
npm run admin:create
npm run doctor
START_AESP.cmd
```

[Hướng dẫn cài đặt và kết nối Groq/FPT](docs/GETTING_STARTED.md) · [Hướng dẫn sử dụng](docs/USER_GUIDE.md) · [Cấu trúc dự án](docs/PROJECT_STRUCTURE.md) · [API](docs/api-spec.md)

Schema cài mới: [backend/db/schema.sql](backend/db/schema.sql). Công cụ khởi tạo từ chối DB đã có bảng. Dependencies Node nằm trong các `package.json` và lockfile; dependencies Python ở [requirements.txt](requirements.txt).

## Chạy hằng ngày

Bật PostgreSQL rồi chạy `START_AESP.cmd`, hoặc `npm run dev`. Mở http://127.0.0.1:5173 và giữ cửa sổ CMD chạy. Ctrl+C dừng các service thuộc phiên đó. `npm run doctor` kiểm tra môi trường; `npm run dev:check` kiểm tra trước khi khởi động.

## Build giao diện

```cmd
npm run build
```

Dự án được sử dụng trực tiếp trong thư mục này. Không cần bản source sao chép hoặc gói export riêng. Giữ cấu hình riêng, backup và file người dùng ngoài bộ source chia sẻ.
