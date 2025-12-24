

### Các bước cơ bản:
1. **Clone source code về máy**
2. **Cấu hình file .env nếu cần (tham khảo .env.example hoặc README)**
3. **Chạy lệnh khởi động toàn bộ hệ thống:**
	 ```sh
	 docker compose up --build
	 ```
	 hoặc (tùy hệ điều hành)
	 ```sh
	 docker-compose up --build
	 ```
4. **Truy cập frontend:**
	 - Mở trình duyệt và vào địa chỉ: http://localhost:5173 (hoặc port được cấu hình)
5. **Truy cập backend/API:**
	 - API Gateway thường chạy ở http://localhost:4000

### Một số lệnh Docker hữu ích:
- Dừng toàn bộ hệ thống:
	```sh
	docker compose down
	```
- Xem log các service:
	```sh
	docker compose logs -f
	```
- Chạy lại một service cụ thể (ví dụ backend):
	```sh
	docker compose restart backend
	```

### Lưu ý:
- Đảm bảo các port cần thiết (5173, 4000, 5432, ...) không bị chiếm dụng.
- Nếu lần đầu chạy, hệ thống sẽ tự động migrate database và khởi tạo dữ liệu mẫu (nếu có script đi kèm).
- Có thể cần chỉnh sửa file docker-compose.yaml hoặc .env cho phù hợp môi trường thực tế.


# TỔNG QUAN TÍNH NĂNG, AI & CÔNG NGHỆ DỰ ÁN AESP


## 1. PHÂN TÍCH CHI TIẾT TÍNH NĂNG THEO VAI TRÒ NGƯỜI DÙNG

### 1.1. Học viên (Learner)
- Đăng ký, đăng nhập, xác thực đa phương thức (email, mạng xã hội).
- Luyện nói tiếng Anh với AI: 10 vòng, đề bài tự động, phản hồi chi tiết từng câu trả lời.
- Luyện giao tiếp theo tình huống thực tế: chọn kịch bản, đối thoại với AI, nhận góp ý.
- Luyện kể chuyện, làm bài theo chủ đề: tự do sáng tạo, AI chấm điểm, nhận xét, gợi ý cải thiện.
- Dịch giọng nói, văn bản: hỗ trợ dịch nhanh, tăng khả năng hiểu và phản xạ.
- Tra cứu từ điển, phát âm mẫu, ví dụ sử dụng thực tế.
- Lưu lịch sử luyện tập, điểm số, tiến trình học tập, cá nhân hóa lộ trình.
- Tham gia bảng xếp hạng, nhận huy hiệu, thử thách hàng ngày.
- Giao tiếp, trao đổi, hỏi đáp với mentor, học viên khác qua Communicate Center.
- Nhận thông báo, nhắc nhở luyện tập, phản hồi từ hệ thống.

### 1.2. Mentor (Người hướng dẫn)
- Đăng nhập, xác thực bảo mật.
- Quản lý danh sách học viên, theo dõi tiến trình, điểm số, lịch sử luyện tập.
- Đánh giá, chấm điểm, nhận xét bài luyện tập của học viên (nói, viết, kể chuyện).
- Tạo mới, chỉnh sửa, duyệt các tình huống giao tiếp, chủ đề luyện tập.
- Giao tiếp, trả lời câu hỏi, hỗ trợ học viên qua Communicate Center.
- Tổng hợp báo cáo, phát hiện học viên cần hỗ trợ thêm (AI gợi ý).
- Quản lý lịch trình, tài nguyên học tập, đề xuất cải tiến nội dung.

### 1.3. Quản trị viên (Admin)
- Đăng nhập, xác thực đa lớp, phân quyền chi tiết.
- Quản lý người dùng (học viên, mentor), duyệt đăng ký, phân quyền, khóa/mở tài khoản.
- Quản lý nội dung: chủ đề, tình huống, thử thách, từ điển, tài nguyên học tập.
- Quản lý gói học, giao dịch, hóa đơn, lịch sử thanh toán.
- Theo dõi, thống kê hoạt động hệ thống, xuất báo cáo tổng hợp.
- Quản lý, giám sát các service, kiểm tra trạng thái hệ thống, log lỗi.
- Thiết lập, cấu hình hệ thống, backup/restore dữ liệu, bảo mật.

### 1.4. AI & Hệ thống phụ trợ
- OpenRouter: Phân phối truy vấn tới nhiều AI model, tối ưu chi phí, dự phòng khi một AI bị giới hạn.
- OpenAI GPT: Sinh đề bài, câu hỏi, chủ đề, chấm điểm, nhận xét, phản hồi cá nhân hóa.
- WhisperX/Whisper: Nhận diện giọng nói, chuyển đổi audio thành text, hỗ trợ dịch tự động, phân tích phát âm.
- Custom AI: Chấm điểm phát âm chuyên sâu, phân tích lỗi, gợi ý cải thiện, cá nhân hóa lộ trình học, hỗ trợ mentor tổng hợp báo cáo.
- AI hỗ trợ phát hiện học viên yếu, đề xuất lộ trình, chủ đề phù hợp, tự động hóa báo cáo cho mentor/admin.

---

---

## 2. PHÂN TÍCH VAI TRÒ & GIÁ TRỊ CỦA AI TRONG DỰ ÁN

- **Sinh đề bài, câu hỏi, tình huống luyện tập:**
	- Sử dụng OpenAI GPT để tạo đề bài, câu hỏi, chủ đề luyện nói phù hợp trình độ từng học viên.
- **Chấm điểm, nhận xét, góp ý:**
	- AI tự động chấm điểm phát âm, nội dung, ngữ pháp, đưa ra nhận xét, gợi ý cải thiện chi tiết.
- **Nhận diện giọng nói, chuyển đổi audio thành text:**
	- Sử dụng WhisperX/Whisper để chuyển giọng nói thành văn bản, hỗ trợ dịch tự động, phân tích phát âm.
- **Dịch tự động giọng nói hoặc văn bản:**
	- AI hỗ trợ dịch nhanh giúp học viên hiểu bài, phản xạ tốt hơn, học tập đa ngữ.
- **Phát hiện lỗi, gợi ý sửa lỗi, phân tích điểm mạnh/yếu:**
	- AI phân tích bài làm, phát hiện lỗi, gợi ý sửa, cá nhân hóa lộ trình học.
- **Cá nhân hóa trải nghiệm học tập:**
	- AI theo dõi tiến trình, đề xuất lộ trình, chủ đề, bài tập phù hợp từng học viên.
- **Tự động hóa quản trị, hỗ trợ mentor:**
	- AI hỗ trợ mentor trong việc đánh giá, tổng hợp báo cáo, phát hiện học viên cần hỗ trợ thêm.

---

## 3. CÔNG NGHỆ, NGÔN NGỮ LẬP TRÌNH & KIẾN TRÚC HỆ THỐNG

### 3.1. Ngôn ngữ lập trình chính
- **JavaScript/TypeScript:**
	- Xây dựng toàn bộ frontend (ReactJS, Vite, các scripts, giao tiếp API)
	- Logic frontend, gọi API, xử lý sự kiện, validate dữ liệu
	- Các script hỗ trợ frontend/backend
- **Python:**
	- Xử lý AI, các mô hình AI (WhisperX, GPT, custom AI), các script backend AI
- **SQL:**
	- Truy vấn, quản lý dữ liệu trong PostgreSQL, migration, backup/restore
- **Shell Script / PowerShell:**
	- Tự động hóa khởi tạo, migrate, quản lý hạ tầng
- **YAML:**
	- Định nghĩa cấu hình Docker Compose, CI/CD, Nginx

### 3.2. Ứng dụng từng ngôn ngữ & công nghệ
- **ReactJS, Vite, React Router, Context API, TailwindCSS/CSS modules, React Icons:**
	- Xây dựng giao diện người dùng hiện đại, tối ưu trải nghiệm, SPA, responsive.
- **Axios:**
	- Giao tiếp API, xử lý dữ liệu bất đồng bộ.
- **Web Speech API, MediaRecorder API:**
	- Nhận diện giọng nói, ghi âm, phát âm mẫu trên trình duyệt.
- **Node.js, Express.js:**
	- Xây dựng REST API, xử lý logic backend, xác thực, phân quyền.
- **PostgreSQL, Sequelize/Prisma:**
	- Lưu trữ, truy vấn dữ liệu, ORM, migration, backup.
- **Socket.io:**
	- Hỗ trợ realtime (chat, thông báo, ... nếu có).
- **JWT, Bcrypt:**
	- Xác thực, bảo mật, mã hóa dữ liệu người dùng.
- **Docker, Docker Compose, Nginx:**
	- Đóng gói, triển khai, reverse proxy, load balancing, đảm bảo mở rộng, bảo mật.
- **OpenRouter (Proxy AI đa mô hình):**
	- Là cổng trung gian kết nối, phân phối truy vấn tới nhiều AI model (OpenAI GPT, Claude, v.v.), tối ưu chi phí, tăng độ linh hoạt, dự phòng khi một AI bị giới hạn.
- **OpenAI GPT:**
	- Sinh đề bài, câu hỏi, chủ đề luyện nói, chấm điểm, nhận xét, phản hồi AI cho học viên.
- **WhisperX/Whisper:**
	- Nhận diện giọng nói, chuyển đổi audio thành text, hỗ trợ dịch tự động, phân tích phát âm.
- **Custom AI models (AI phụ trợ):**
	- Chấm điểm phát âm chuyên sâu, phân tích lỗi, gợi ý cải thiện, cá nhân hóa lộ trình học, hỗ trợ mentor tổng hợp báo cáo.
- **CI/CD (GitHub Actions, ...):**
	- Tự động build, test, deploy, đảm bảo chất lượng và tốc độ phát triển.
- **Swagger/OpenAPI, Markdown:**
	- Tài liệu hóa API, tài liệu dự án, hỗ trợ phát triển và bảo trì.

### 3.3. Kiến trúc hệ thống & DevOps
- **Microservices**: Backend chia thành nhiều service nhỏ (user, ai, gateway, ...), dễ mở rộng, bảo trì.
- **Docker hóa toàn bộ hệ thống**: Dễ dàng triển khai, đồng nhất môi trường dev/prod.
- **CI/CD**: Tự động kiểm thử, build, deploy, rollback khi cần.
- **Giám sát, logging, bảo mật**: Đảm bảo hệ thống ổn định, an toàn, dễ mở rộng.

---

## 4. HƯỚNG DẪN CHẠY HỆ THỐNG BẰNG DOCKER

### Yêu cầu:
- Đã cài đặt Docker và Docker Compose

### Các bước cơ bản:
1. **Clone source code về máy**
2. **Cấu hình file .env nếu cần (tham khảo .env.example hoặc README)**
3. **Chạy lệnh khởi động toàn bộ hệ thống:**
	 ```sh
	 docker compose up --build
	 ```
	 hoặc (tùy hệ điều hành)
	 ```sh
	 docker-compose up --build
	 ```
4. **Truy cập frontend:**
	 - Mở trình duyệt và vào địa chỉ: http://localhost:5173 (hoặc port được cấu hình)
5. **Truy cập backend/API:**
	 - API Gateway thường chạy ở http://localhost:4000

### Một số lệnh Docker hữu ích:
- Dừng toàn bộ hệ thống:
	```sh
	docker compose down
	```
- Xem log các service:
	```sh
	docker compose logs -f
	```
- Chạy lại một service cụ thể (ví dụ backend):
	```sh
	docker compose restart backend
	```

### Lưu ý:
- Đảm bảo các port cần thiết (5173, 4000, 5432, ...) không bị chiếm dụng.
- Nếu lần đầu chạy, hệ thống sẽ tự động migrate database và khởi tạo dữ liệu mẫu (nếu có script đi kèm).
- Có thể cần chỉnh sửa file docker-compose.yaml hoặc .env cho phù hợp môi trường thực tế.

---

*Tài liệu này tổng hợp đầy đủ các tính năng, công nghệ, kiến trúc, vai trò AI và hướng dẫn triển khai dự án AESP. Có thể bổ sung chi tiết hơn theo từng module hoặc yêu cầu thực tế.*



## 2. Công nghệ & Ngôn ngữ sử dụng

### Ngôn ngữ lập trình chính
- **JavaScript: Toàn bộ frontend (ReactJS, Vite, các scripts, giao tiếp API)
- **Python**: Xử lý AI, các mô hình AI (WhisperX, GPT, custom AI), các script backend AI
- **SQL**: Truy vấn, quản lý dữ liệu trong PostgreSQL
- **Shell Script / PowerShell**: Tự động hóa khởi tạo, migrate, quản lý hạ tầng
- **YAML**: Định nghĩa cấu hình Docker Compose, CI/CD, Nginx

### Ứng dụng từng ngôn ngữ
- **JavaScript:
	- Xây dựng giao diện người dùng (ReactJS)
	- Logic frontend, gọi API, xử lý sự kiện, validate dữ liệu
	- Các script hỗ trợ frontend/backend
- **Python**:
	- Xử lý AI: nhận diện giọng nói, sinh đề bài, chấm điểm, phân tích phát âm
	- Các mô hình AI: WhisperX, GPT, custom AI
	- Script backend AI, xử lý dữ liệu âm thanh
- **SQL**:
	- Thiết kế, truy vấn, quản lý dữ liệu trong PostgreSQL
	- Tạo bảng, migration, backup/restore dữ liệu
- **Shell Script / PowerShell**:
	- Tự động hóa khởi tạo, migrate database, start/stop service
	- Quản lý môi trường phát triển và production
- **YAML**:
	- Định nghĩa cấu hình Docker Compose, CI/CD pipeline, Nginx reverse proxy


### Frontend
- **ReactJS**: Xây dựng giao diện người dùng
- **Vite**: Công cụ build, hot reload
- **React Router**: Điều hướng SPA
- **Axios**: Giao tiếp API
- **Context API**: Quản lý trạng thái xác thực
- **TailwindCSS/CSS modules**: Style giao diện
- **React Icons**: Icon UI
- **Web Speech API**: Nhận diện giọng nói, phát âm mẫu
- **MediaRecorder API**: Ghi âm audio trên trình duyệt

### Backend
- **Node.js**: Nền tảng server
- **Express.js**: Xây dựng REST API
- **PostgreSQL**: Cơ sở dữ liệu chính
- **Sequelize/Prisma**: ORM quản lý DB
- **Socket.io**: Realtime (nếu có)
- **JWT**: Xác thực người dùng
- **Bcrypt**: Mã hóa mật khẩu
- **Docker**: Đóng gói, triển khai dịch vụ
- **Nginx**: Reverse proxy, load balancing

### AI & Xử lý âm thanh
- **OpenAI GPT**: Sinh đề bài, chấm điểm, phản hồi AI
- **WhisperX/Whisper**: Nhận diện giọng nói, chuyển đổi audio thành text
- **Custom AI models**: Chấm điểm, phân tích phát âm, gợi ý cải thiện

### DevOps & Hạ tầng
- **Docker Compose**: Quản lý multi-service
- **Shell/PowerShell scripts**: Tự động hóa khởi tạo, migrate DB
- **CI/CD (GitHub Actions, v.v.)**: Tự động build/deploy

### Khác
- **Swagger/OpenAPI**: Tài liệu hóa API
- **Markdown**: Tài liệu dự án

---
*File này tổng hợp các tính năng và công nghệ chính của dự án AESP. Có thể bổ sung chi tiết hơn theo từng module hoặc yêu cầu thực tế.*
