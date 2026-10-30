# Cấu trúc dự án

```text
AESP/
├─ README.md                 Bắt đầu cài/chạy
├─ BAO_CAO_THAY_DOI_DO_AN.md  Báo cáo thay đổi hệ thống và sửa chữa
├─ DANH_SACH_FILE_THAY_DOI.csv Danh sách file đối chiếu Git
├─ REQUIREMENTS.md           Phần mềm nền
├─ requirements.txt          Thư viện Python speech
├─ SETUP_AESP.cmd            Cài lần đầu
├─ START_AESP.cmd            Chạy frontend và backend
├─ scripts/
│  ├─ setup.mjs              Cài dependencies, tạo cấu hình nếu chưa có
│  ├─ prepare-speech.py      Chuẩn bị model speech
│  ├─ database.mjs           Khởi tạo DB rỗng / kiểm tra DB
│  ├─ create-admin.mjs       Tạo Admin đầu tiên
│  └─ doctor.mjs             Kiểm tra môi trường để xử lý lỗi cài/chạy
├─ frontend/
│  ├─ src/                   Giao diện và logic client
│  ├─ public/                Asset đang dùng, NPC và khung cảnh
│  └─ scripts/               Kiểm tra binding khi build, tạo catalog ngôn ngữ
├─ backend/
│  ├─ .env.example           Mẫu cấu hình
│  ├─ .env.local             Cấu hình riêng
│  ├─ db/schema.sql          Schema cài mới: 47 bảng và một view
│  ├─ db/create-database.sql Tạo database rỗng
│  ├─ db/migrations/         SQL vòng đời speech còn được backend đọc lúc chạy
│  ├─ services/              11 service và logic dùng chung
│  ├─ ai_models/             Hai worker nhận dạng tiếng nói Python
│  ├─ uploads/               File người dùng
│  └─ outputs/               Kết quả speech tạm theo vòng đời xử lý
└─ docs/
   ├─ GETTING_STARTED.md     Cài đặt, cấu hình Groq/FPT và xử lý lỗi
   ├─ USER_GUIDE.md           Hướng dẫn ba vai trò
   ├─ PROJECT_STRUCTURE.md   Tài liệu này
   └─ api-spec.md            Các API chính
```

Test, fixture, log kiểm thử, ảnh audit, báo cáo tiến độ cũ, công cụ export/kiểm kê và script sửa đổi một lần đã được bỏ khỏi thư mục dự án. Công cụ kiểm tra binding React vẫn được build sử dụng để phát hiện hook hoặc thành phần chưa import; công cụ tạo catalog vẫn dùng cho nội dung giao diện song ngữ.

`node_modules`, `frontend/dist`, `.venv-whisperx` và FFmpeg portable là môi trường hoặc kết quả build local. `.local-backups` chứa bản sao riêng trước khi dọn DB; không xóa cùng tài liệu audit. Cấu hình riêng, upload, kết quả người dùng và môi trường đang dùng được giữ nguyên.

Database đã có dữ liệu không chạy lại schema cài mới. Giữ các bảng/cột còn được API dùng, kể cả dữ liệu tương thích của lịch hoặc kết quả cũ. Xem [hướng dẫn chạy](GETTING_STARTED.md) và [API](api-spec.md).
