# AESP — chỉ mục API nghiệp vụ chính

Cập nhật 30/10/2026. Các đường bên dưới đi qua API Gateway với tiền tố `/api`. Payload và trạng thái cụ thể được định nghĩa trong router/controller tương ứng.

## Xác thực và hồ sơ

| Method | Đường dẫn | Mục đích |
|---|---|---|
| POST | `/api/auth/login` | Đăng nhập và cấp session/JWT sau kiểm tra tài khoản/gói. |
| POST | `/api/auth/logout` | Thu hồi phiên hiện tại. |
| POST | `/api/auth/register` | Từ chối 403; tài khoản được cấp qua Admin, không nhận role tự đăng ký. |
| POST | `/api/auth/change-password` | Đổi mật khẩu và thu hồi các phiên; client phải đăng nhập lại. |
| POST | `/api/auth/verify-security-answer` | Cấp token khôi phục gắn với mật khẩu hiện tại. |
| POST | `/api/auth/reset-password` | Dùng token khôi phục một lần; đổi mật khẩu và thu hồi phiên cũ. |
| GET | `/api/auth/profile` | Hồ sơ người đang đăng nhập. |
| GET | `/api/users/me/package` | Gói hiện hành của Learner. |
| GET | `/api/learners/by-user/:userId` | Ánh xạ tài khoản thành Learner trong phạm vi quyền. |

## Học và phản hồi

| Method | Đường dẫn | Mục đích |
|---|---|---|
| GET | `/api/learners/:learnerId/submissions` | Lịch sử phân trang của Learner. |
| GET | `/api/learners/submissions/:id` | Chi tiết bài nộp được sở hữu, AI contract và nhận xét Mentor nếu có. |
| GET | `/api/learners/submissions/:id/analysis` | Phân tích bài nộp được sở hữu. |
| GET | `/api/learners/:learnerId/progress-analytics` | Hoạt động, kết quả có nguồn và gợi ý AI/fallback. |
| GET | `/api/learners/:learnerId/mentor/feedback-status` | Mentor được gán và trạng thái được gửi đánh giá. |
| GET | `/api/learners/scenario-world/current` | Khôi phục Scenario hiện hành của Learner. |
| GET | `/api/learners/speaking-practice/story/active-session` | Tìm Story để học tiếp. |
| GET | `/api/learners/speaking-practice/story/sessions/:session_id/history` | Hội thoại Story được sở hữu. |
| POST | `/api/learners/tts/generate` | Tạo giọng được hỗ trợ; có thể gọi FPT và tiêu hạn mức. |

Góp ý lặp được tổng hợp từ các detail đã xác minh ở frontend. Các thao tác audio, retry, mục tiêu tuần, Speaking và Scenario mutation nằm ở `learner-service/src/routes/`; đọc hợp đồng UUID/revision/attempt trước khi viết client.

## Mentor, lớp và chat

| Method | Đường dẫn | Mục đích |
|---|---|---|
| GET | `/api/mentors/:id/learners` | Danh sách Learner thuộc phạm vi Mentor. |
| GET | `/api/mentors/:mentorId/dashboard/support` | Tín hiệu hỗ trợ từ hoạt động/xử lý/hạn gói. |
| GET | `/api/mentors/learners/:learnerId/progress` | Tiến độ Learner hiện được gán. |
| PUT | `/api/mentors/learners/:learnerId/note` | Ghi chú có kiểm tra assignment tại câu ghi. |
| GET | `/api/mentors/classroom/classes` | Lớp công khai, có bộ lọc/phân trang. |
| POST | `/api/mentors/classroom/classes` | Mentor tạo lớp, có kiểm tra thời gian và idempotency. |
| POST | `/api/mentors/classroom/classes/:id/registration` | Đăng ký/hủy theo payload của router; kiểm tra chỗ và chồng giờ. |
| GET | `/api/mentors/classroom/messages/:learnerId` | Lịch sử chat của cặp Learner–Mentor đang được gán. |
| POST | `/api/mentors/classroom/messages/:learnerId` | Tin nhắn có client UUID để đối chiếu thử lại. |

API yêu cầu mở lớp, join, roster và điểm danh nằm trong `mentor-service/src/classroom/classroomRouter.js`; quyền chủ lớp và vai trò được kiểm tra riêng theo hành động.

## Admin và thông báo

| Method | Đường dẫn | Mục đích |
|---|---|---|
| GET / POST | `/api/admin/users` | Danh sách/cấp tài khoản qua luồng Admin. |
| POST | `/api/admin/users/learners/change-mentor` | Chọn Mentor mới cho Learner. |
| GET / POST | `/api/admin/packages` | Đọc/tạo gói. |
| GET | `/api/admin/purchases/:learnerId` | Lịch sử lượt mua của Learner. |
| PATCH | `/api/admin/purchases/:id/renew` | Gia hạn lượt mua; chặn lặp khi gói đang hiệu lực. |
| GET | `/api/notifications/unread-count` | Số thông báo chưa đọc của tài khoản hiện tại. |

Report/Support/moderation nằm trong router Admin/Community; kết quả lưu được trả lại để UI đối chiếu.

## Quy tắc client

- Gửi session/JWT qua client API hiện hành; hủy request và thu hồi dữ liệu riêng tư khi đổi tài khoản/mất quyền.
- Phân biệt401 mất phiên,403 bị từ chối,404 không có tài nguyên trong phạm vi sở hữu,409 xung đột và503 dịch vụ lỗi; chi tiết tùy endpoint.
- Khi chưa rõ thao tác đã lưu hay chưa, đọc lại trạng thái hoặc thử lại cùng UUID/revision/attempt theo hợp đồng endpoint.
- Giữ key ở backend; đọc lịch sử/khôi phục không tự tạo yêu cầu AI mới.

Nguồn: các router User/Learner/Mentor/Admin/Notification ở `backend/services/`. Xem [cấu trúc hiện tại](PROJECT_STRUCTURE.md) và [hướng dẫn chạy](GETTING_STARTED.md).
