# AESP — yêu cầu chạy lần đầu

Mục tiêu của bộ cài này là chạy local trên Windows 10/11 x64, không cần Docker, Redis hoặc mô hình AI tự huấn luyện.

| Thành phần | Phiên bản/điều kiện |
| --- | --- |
| Node.js + npm | Khuyến nghị Node.js 24 LTS, npm 10 trở lên; code yêu cầu Node >=22 |
| PostgreSQL | Đã kiểm thử PostgreSQL 18; database `aesp`, schema `public`, địa chỉ loopback, cổng `5432` |
| Python | Python **3.12.x**; không dùng Python 3.14 cho môi trường WhisperX này |
| FFmpeg | Cài FFmpeg và thêm thư mục chứa executable vào `PATH` |
| Visual C++ Runtime | Cài Microsoft Visual C++ v14 Redistributable x64 cho các thư viện native trên Windows |
| Trình duyệt | Edge/Chrome và microphone; cho phép tại đúng địa chỉ `http://127.0.0.1:5173` |
| AI | Tài khoản Groq và API key của chính người chạy |
| Giọng Việt | FPT API key là tùy chọn; chỉ dùng giọng nữ `banmai` |
| Tài nguyên | Nên có RAM 8 GB trở lên và chỗ trống cho Python/PyTorch/models; CPU chạy được, GPU là tùy chọn |
| Mạng | Cần khi cài thư viện, tải mô hình lần đầu và gọi Groq/FPT |

`requirements.txt` là danh sách Python. Thư viện Node được khai báo trong từng `package.json`; bộ setup cài tất cả các service, frontend và gói shared. Cả 15 thư mục cài đặt hiện có lockfile; setup dùng `npm ci` để giữ đúng phiên bản. Nếu bạn tự thêm một package mới chưa có lockfile, công cụ mới dùng `npm install` cho package đó. Bộ Python mặc định dùng CPU, không ép cài CUDA trên máy người khác.

Nguồn chính thức: [Node.js LTS](https://nodejs.org/en/about/previous-releases), [PostgreSQL Windows](https://www.postgresql.org/download/windows/), [Python 3.12](https://www.python.org/downloads/), [FFmpeg](https://ffmpeg.org/download.html), [Visual C++ Runtime](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist), [WhisperX 3.8.6](https://pypi.org/project/whisperx/3.8.6/), [bộ phiên bản PyTorch tương ứng](https://pytorch.org/get-started/previous-versions/#v280).

## Trình tự ngắn

1. Cài Node, PostgreSQL, Python 3.12 và FFmpeg. Mở CMD mới sau khi sửa PATH.
2. Chạy `SETUP_AESP.cmd` trong bản source. Chờ cài thư viện và tải các model công khai.
3. Điền `DB_PASSWORD`, `GROQ_API_KEY` trong `backend/.env.local` vừa được tạo.
4. Tạo database `aesp` rỗng; chạy `npm run db:init`.
5. Chạy `npm run admin:create` để tự đặt tài khoản Admin.
6. Chạy `npm run doctor`, sau đó `START_AESP.cmd`.

Chi tiết từng bước, lệnh và cách xử lý lỗi: [GETTING_STARTED](docs/GETTING_STARTED.md). Cách sử dụng ba vai trò: [USER_GUIDE](docs/USER_GUIDE.md).

Bộ setup không cài lại môi trường Python đã tồn tại, không ghi đè `.env.local`, không tạo tài khoản mặc định và không reset database hiện có. Chạy trên máy mới cần hoàn tất các bước cấu hình thủ công trên; API key không được đóng gói sẵn.
