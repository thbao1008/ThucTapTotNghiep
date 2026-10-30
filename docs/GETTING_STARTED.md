# Cài đặt và chạy AESP lần đầu

Hướng dẫn này dành cho một bản source mới trên Windows, không phụ thuộc vào thư mục `D:\ThucTapTotNghiep` của máy phát triển.

## 1. Chuẩn bị phần mềm nền

Cài các phần mềm trong [REQUIREMENTS](../REQUIREMENTS.md), gồm Visual C++ Runtime x64 cho thư viện native. Khi cài PostgreSQL, ghi nhớ mật khẩu của tài khoản DB bạn chọn. Bật PostgreSQL local trên cổng 5432. Khi cài Python 3.12, cài cả Python Launcher.

Mở CMD mới, kiểm tra:

```cmd
node --version
npm --version
py -3.12 --version
ffmpeg -version
```

Nếu một lệnh không tồn tại, sửa cài đặt/PATH rồi mở lại CMD. Không cần Docker hoặc Redis. GPU/CUDA không phải điều kiện bắt buộc. Có thể đặt `FFMPEG_BIN` bằng đường dẫn tuyệt đối đến thư mục bin nếu không muốn sửa PATH; worker cũng nhận ra thư mục portable `ffmpeg-*/bin` trong root dự án.

## 2. Cài thư viện của dự án

Đứng tại thư mục chứa `package.json`, chạy:

```cmd
SETUP_AESP.cmd
```

Hoặc dùng lệnh tương đương:

```cmd
node scripts/setup.mjs --install --speech --models
```

Các bước được thực hiện tuần tự; một bước lỗi sẽ dừng, không báo thành công giả. Bộ cài:

- Cài thư viện root, frontend, 11 backend service và gói shared.
- Tạo `backend/.env.local` **chỉ khi chưa có**, sinh ba secret nội bộ khác nhau và không in chúng.
- Tạo `backend/.venv-whisperx` với Python 3.12 nếu chưa tồn tại; cài bộ PyTorch/Torchaudio/Torchvision CPU tương thích và `requirements.txt`.
- Tải model `base` cho nhận dạng tiếng Anh và model alignment tiếng Anh. Đây là model speech công khai, không phải mô hình hội thoại do đồ án huấn luyện.

Mạng chậm có thể khiến lượt tải PyTorch/model đầu tiên lâu. Chạy lại lệnh được nếu bước trước lỗi; `.env.local` được giữ nguyên. Với venv đã có nhưng chưa cài xong, hoàn tất bằng chính executable trong venv; xem phần lỗi bên dưới. Dừng ứng dụng trước khi cài lại dependencies Node.

Chỉ xem kế hoạch, không cài gì:

```cmd
node scripts/setup.mjs --dry-run
```

## 3. Cấu hình backend

Mở `backend/.env.local`. File mẫu có cấu trúc ở `backend/.env.example`. Điền cấu hình của máy bạn:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=aesp
DB_USER=postgres
DB_PASSWORD=<your-local-postgresql-password>
AI_PROVIDER=groq
GROQ_API_KEY=<your-own-groq-key>
GROQ_MODEL=openai/gpt-oss-20b
GROQ_TIMEOUT_MS=45000
GROQ_MAX_OUTPUT_TOKENS=4096
```

Các dấu `<...>` là chỗ bạn tự thay, không giữ nguyên. Nếu mật khẩu DB có dấu # hoặc khoảng trắng, đặt giá trị trong dấu nháy phù hợp với cú pháp dotenv. Giữ ba secret do setup sinh; không đưa key vào `VITE_*`, frontend, ảnh chụp hoặc file hướng dẫn. Shell environment có ưu tiên cao hơn `.env.local`; `backend/.env` chỉ là fallback cho giá trị còn thiếu. Không cần tạo file env cho từng service.

## 4. Tạo database rỗng và schema

Dùng pgAdmin Query Tool, kết nối maintenance DB `postgres`, rồi chạy nội dung `backend/db/create-database.sql`:

```sql
CREATE DATABASE aesp ENCODING 'UTF8' TEMPLATE template0;
```

Hoặc chạy bằng PostgreSQL CLI, lệnh sẽ hỏi mật khẩu:

```cmd
psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -f backend/db/create-database.sql
```

Nếu `psql` không có trong PATH, dùng đường dẫn executable trong thư mục `bin` của PostgreSQL vừa cài. Nếu database `aesp` đã tồn tại, lệnh sẽ báo lỗi thay vì thay thế dữ liệu.

Sau đó, từ root dự án:

```cmd
npm run db:init
npm run db:check
```

`backend/db/schema.sql` là schema thống nhất để cài mới: 47 bảng chức năng, view, index, khóa ngoại và các bảng lịch/chat/Scenario/retention hiện hành. Không cần restore dump cũ hoặc chạy migration thủ công. SQL vòng đời speech còn giữ lại được backend sử dụng lúc khởi động. Không có tài khoản hoặc dữ liệu riêng của người phát triển trong schema.

**DB hiện có:** `db:init` sẽ từ chối nếu public đã có bảng. Không dùng schema mới để cập nhật đè database hiện có. Không có thao tác DROP DATABASE, truncate hoặc tự reset trong quy trình này.

## 5. Tạo Admin đầu tiên

```cmd
npm run admin:create
```

Nhập tên, email, mật khẩu và xác nhận mật khẩu trong CMD. Mật khẩu không hiển thị, không nhận qua tham số dòng lệnh và không được lưu vào file seed. Dùng ít nhất 12 ký tự với chữ hoa, chữ thường, số và ký tự đặc biệt, tối đa 72 byte UTF-8. Nếu đã có Admin, công cụ từ chối ghi đè tài khoản/mật khẩu.

Sau khi đăng nhập Admin, tạo Mentor và Learner tại Users; tạo gói và cấp/gia hạn gói cho Learner; gán Mentor phù hợp. Bản cài mới không cung cấp tài khoản dùng chung hoặc dữ liệu demo của máy khác.

Đăng ký công khai bị khóa; không gửi role qua `/auth/register`. Khi đổi hoặc khôi phục mật khẩu, các phiên cũ hết hiệu lực và người dùng đăng nhập lại bằng mật khẩu mới.

## 6. Kết nối Groq

1. Đăng nhập [Groq Console](https://console.groq.com/) và tạo API key trong tài khoản của bạn.
2. Điền key vào `GROQ_API_KEY` ở backend; chọn model `openai/gpt-oss-20b` theo cấu hình hiện hành của dự án.
3. Kiểm tra model còn được cấp quyền trong tài khoản, xem [Supported Models](https://console.groq.com/docs/models).
4. Khởi động lại AESP sau khi đổi cấu hình.

Dự án gọi API tương thích OpenAI tại `https://api.groq.com/openai/v1` thông qua AI service. Không cần mua ChatGPT Plus/OpenAI API để cấp quyền cho Groq. Xem [Groq Quickstart](https://console.groq.com/docs/quickstart) về key và request. Hạn mức phụ thuộc tài khoản/model, có thể thay đổi; kiểm tra [Rate Limits](https://console.groq.com/docs/rate-limits) và console của chính bạn. Không coi gói miễn phí là không giới hạn.

`npm run doctor` chỉ kiểm tra cấu hình/dependencies/DB; không gọi Groq, không tiêu quota và không khẳng định key được nhà cung cấp chấp nhận. Khi thử chức năng thật, chỉ dùng một lượt văn bản ngắn trước; 401/403 cần kiểm tra key/quyền model, 429 cần chờ hạn mức thay vì gửi lặp. Điểm từ transcript là đối chiếu nội dung/chất lượng ngôn ngữ theo loại kết quả, không tự trở thành điểm phát âm âm học.

## 7. Giọng Việt và microphone

FPT là tùy chọn. Điền `FPT_AI_API_KEY` nếu cần giọng nữ Việt `banmai`; để trống thì dùng giọng trình duyệt. FPT có hạn mức riêng; lỗi 429 không được sửa bằng cách tăng token của Groq. Giọng NPC Scenario là giọng tiếng Anh của trình duyệt.

Mở đúng một địa chỉ `http://127.0.0.1:5173`, cấp microphone cho địa chỉ đó trong Edge/Chrome. Quyền của `localhost` và `127.0.0.1` có thể tách nhau. Rời bài/chuyển tab sẽ dừng mic; cho phép quyền trở lại rồi dùng Resume khi cần.

## 8. Kiểm tra và chạy

```cmd
npm run doctor
npm run dev:check
START_AESP.cmd
```

`doctor` báo trạng thái mà không in password/key. `dev:check` kiểm tra cổng, entry point và target DB; sẽ từ chối nếu một phiên khác đang dùng cổng. Không tự đóng tiến trình lạ.

Trang ứng dụng: [http://127.0.0.1:5173](http://127.0.0.1:5173). Giữ CMD chạy. Dùng Ctrl+C để dừng các tiến trình do chính launcher này mở. Các lần sau chỉ cần bật PostgreSQL và chạy `START_AESP.cmd`.

Các cổng mặc định: frontend5173; gateway4000; notification4001; community4002; package4003; purchase4004; user4005; mentor4006; learner4007; admin4008; ai4010; file4011. Cấu hình cũ có thể chọn cổng khác qua `<SERVICE>_PORT`/`<SERVICE>_URL`; không được đặt hai service cùng cổng. Frontend chỉ gọi gateway.

## 9. Các lỗi thường gặp

| Hiện tượng | Cách xử lý |
| --- | --- |
| Không tìm thấy Node/npm/Python/FFmpeg | Cài đúng phiên bản, thêm PATH, mở CMD mới |
| Venv đã tạo nhưng thiếu package | Dừng app; chạy `backend\.venv-whisperx\Scripts\python.exe -m pip install -r requirements.txt`; cài torch CPU trước nếu bước tải torch đã lỗi |
| WhisperX chưa có model cache | Chạy `backend\.venv-whisperx\Scripts\python.exe scripts/prepare-speech.py --download-models` với FFmpeg trong PATH |
| CUDA/DLL không phù hợp | Kiểm tra Visual C++ Runtime x64; dùng bộ PyTorch/Torchaudio/Torchvision CPU đồng bộ. GPU là nâng cấp riêng, không gỡ venv đang chạy ổn |
| DB refused / missing tables | Kiểm tra aesp/public/loopback5432, mật khẩu và bước `db:init` trên DB rỗng |
| Cổng bận | Dừng đúng phiên AESP cũ bằng Ctrl+C hoặc chọn cấu hình cổng nhất quán |
| Không gọi AI được | Kiểm tra key/quyền model/quota; restart backend sau khi sửa env |
| Learner không vào bài | Admin kiểm tra trạng thái tài khoản, gói còn hiệu lực và Mentor được gán |
| Mic không tự mở | Cấp quyền ở trình duyệt/Windows, quay lại bài, nhấn Resume; trình duyệt không hỗ trợ nhận diện trực tiếp vẫn dùng timer và chấm bản ghi |
| Lượt speech đầu chậm | Model cần nạp vào RAM; CPU và alignment có thể chậm hơn GPU. Không có SLA thời gian cố định cho máy mới |

## 10. Build và sử dụng thư mục dự án

Chạy `npm run build` để kiểm tra binding và build frontend. Các file chạy chính đã nằm ngay trong thư mục dự án; không cần tạo bản source thứ hai.

Khi chuyển sang máy khác, giữ source, asset đang dùng, lockfile, requirements và các hướng dẫn này. Bỏ cấu hình riêng, backup, node_modules, venv, upload, audio và model cache của máy cũ. Người nhận chạy SETUP_AESP.cmd và dùng key/tài khoản riêng.
