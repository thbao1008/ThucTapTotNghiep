# Báo cáo sửa chữa và thay đổi đồ án AESP

**Ngày cập nhật:** 30/10/2026, giờ Việt Nam.

**Repository đang sử dụng:** `D:\ThucTapTotNghiep`.

**Danh sách file đối chiếu:** [DANH_SACH_FILE_THAY_DOI.csv](DANH_SACH_FILE_THAY_DOI.csv).

## 1. Phạm vi và cách đọc báo cáo

Báo cáo này tổng hợp những thay đổi đã thực hiện qua các phiên sửa AESP: nghiệp vụ Learner/Mentor/Admin, AI và giọng nói, xác thực, cơ sở dữ liệu, giao diện, cách cài/chạy và việc tinh gọn thư mục. Nội dung được đối chiếu với source hiện tại và kết quả thực hiện đã ghi nhận trong cuộc trò chuyện.

Đây là báo cáo bàn giao cần giữ lại. Các báo cáo audit, log và tài liệu tiến độ cũ đã được bỏ trong đợt dọn thư mục; bản báo cáo cũ cũng bị xóa nhầm cùng nhóm đó. Bản này được viết mới ngay ở thư mục gốc, không tạo bản source thứ hai và không phục hồi các file đã xóa bằng Git.

CSV đi kèm ghi trạng thái từng đường dẫn **so với HEAD hiện tại**. HEAD không được xác lập là mốc trước khi bắt đầu toàn bộ đồ án. Vì vậy, danh sách có cả thay đổi từ trước, file mới chưa được Git theo dõi và file runtime; không thể quy toàn bộ thành công việc của riêng lượt sửa cuối.

Ảnh chụp lúc lập danh sách có **1.179 đường dẫn**: 990 đường dẫn có thay đổi so với HEAD và 189 file chưa được Git theo dõi. Có **756 đường dẫn thuộc uploads/outputs runtime** trong số đó, không tính là 756 file code. Để không công bố tên file ghi âm riêng khi push Git, CSV chỉ giữ **423 đường dẫn source/cấu hình/tài liệu**, loại các dòng runtime khỏi bản công bố. Danh sách không chứa nội dung file, mật khẩu hoặc API key, và không bao gồm hai file báo cáo mới này.

## 2. Hệ thống đã thay đổi như thế nào

| Phần hệ thống | Vấn đề hoặc yêu cầu trước đây | Trạng thái sau sửa |
| --- | --- | --- |
| Cách chạy | Nhiều cách chạy và cấu hình local/Docker dễ gây nhầm | Dùng một repository local, launcher mở frontend và các backend service; kiểm tra cấu hình/cổng/DB trước khi mở |
| AI hội thoại | Phụ thuộc OpenRouter và có phần mô hình hội thoại huấn luyện riêng không còn dùng | Luồng hội thoại và đánh giá transcript dùng Groq; bỏ cấu hình/khung tính năng đã ngừng dùng |
| Nhận dạng tiếng nói | Story chờ nạp mô hình, xử lý và phản hồi lâu | Dùng worker speech có khả năng tái sử dụng; Story dùng đường nhận dạng nhẹ hơn, giảm các bước chờ không cần thiết |
| Luyện đọc | Phải thao tác mic nhiều, chưa theo sát từng từ hoặc mức độ | Chọn Easy/Medium/Hard; độ dài câu và thời gian thay đổi; mic tự bắt đầu, highlight theo từng lần xuất hiện của từ, tự lưu và chuyển vòng |
| Tell me your story | Có thông báo chặn, khôi phục/lưu trùng và mic còn hoạt động khi rời bài | Cải thiện trạng thái xử lý, phục hồi/lưu lại, dừng mic khi rời bài hoặc mất phiên và ràng buộc lịch sử với phiên đăng nhập |
| Scenario | Hội thoại/đáp án thiếu tiến triển, giao diện tách khỏi khu luyện nói | Có NPC, bối cảnh, mục tiêu, lựa chọn và trạng thái tiến triển; hộp thoại trên khung cảnh; mở trong khu AI Speaking Practice |
| Challenge | Cần Mentor tự tạo, mức độ chưa theo chuẩn và dễ tạo bài tương tự | Mentor tạo/sửa theo quyền; phân cấp A1–C2; kiểm tra trùng/gần giống và yêu cầu xem xét bài liên quan |
| Bài nộp và đánh giá | Dễ nhầm trạng thái lưu/xử lý hoặc nguồn điểm; cần bảo đảm ownership | Có hợp đồng lượt nộp/thử lại và nguồn đánh giá; giới hạn truy cập theo chủ bài hoặc Mentor được gán |
| Tiến độ | Hoạt động và điểm số dễ bị gộp sai | Phân biệt lượt hoạt động, kết quả có nguồn, phản hồi Mentor và mục tiêu tuần; không mặc định biến số lượt chọn thành điểm kỹ năng |
| Lịch học | Lịch thông thường chưa đáp ứng lớp trực tuyến công khai | Có lớp công khai, bộ lọc, đăng ký tối đa 20 Learner, chặn giờ chồng nhau, buổi học tối đa hai giờ, yêu cầu mở lớp và điểm danh |
| Chat | Learner và Mentor được gán thiếu kênh trao đổi | Có chat theo cặp đang được gán; quyền đọc/gửi thay đổi theo assignment |
| Community/thông báo | Like, comment, icon, avatar và thông báo có lỗi | Sửa cập nhật tương tác, avatar và thông báo; giữ lịch sử đọc và không tự làm mất dữ liệu chỉ vì một lượt tải lỗi |
| Admin | Lỗi hook, trạng thái tài khoản, gói và các trang vận hành thiếu nhất quán | Sửa các lỗi đã phát hiện; cập nhật luồng cấp tài khoản/gói/đổi Mentor và giao diện Users, Packages, Purchases, Reports, Support |
| Ngôn ngữ/giao diện | Bản dịch chữ nhỏ tràn khắp giao diện, nhãn và icon lệch giữa vai trò | Chọn English/Tiếng Việt cho giao diện; phần bài học có quy tắc dịch riêng; dùng nhãn/icon chung cho chức năng tương đương |
| Cài mới | Thiếu một schema và hướng dẫn thống nhất cho máy khác | Có schema sạch, requirements, bộ setup, hướng dẫn API và công cụ tạo Admin đầu tiên |

Không còn menu Conversation practice riêng theo yêu cầu. Các file có tên conversation vẫn có thể là logic nội bộ của Story/Scenario; tên file đó không đồng nghĩa menu đã bị đưa trở lại.

## 3. File chính và vai trò của thay đổi

Danh sách dưới đây giúp tìm đúng nơi chỉnh sửa chức năng. CSV đi kèm cung cấp chỉ mục đường dẫn rộng hơn; các file liên quan trong cùng thư mục được đọc theo luồng router → controller → service/utils.

| Nhóm | File chính hiện có | Nội dung thay đổi |
| --- | --- | --- |
| Khởi động local | [START_AESP.cmd](START_AESP.cmd), [start-all-services.js](backend/services/start-all-services.js), `backend/services/shared/localServicePlan.js`, `localProcessSupervisor.js`, `localProcessChild.js` | Mở FE/BE, kiểm tra cổng và DB, theo dõi đúng các tiến trình launcher tạo; tránh tự đóng tiến trình khác |
| Cài môi trường | [SETUP_AESP.cmd](SETUP_AESP.cmd), [setup.mjs](scripts/setup.mjs), [requirements.txt](requirements.txt), [REQUIREMENTS.md](REQUIREMENTS.md) | Cài các gói Node, chuẩn bị Python/model, sinh cấu hình riêng khi chưa có; giữ môi trường/cấu hình đã tồn tại |
| Cấu hình backend | [loadBackendEnv.js](backend/services/shared/loadBackendEnv.js), [backend/.env.example](backend/.env.example), `*/src/config/db.js` | Dùng cấu hình backend chung, giữ key phía server; bỏ mật khẩu DB mặc định cũ trong mười service dùng DB |
| Đăng nhập và mật khẩu | [authController.js](backend/services/user-service/src/controllers/authController.js), [sessionService.js](backend/services/user-service/src/services/sessionService.js), [accountCredentials.js](backend/services/user-service/src/utils/accountCredentials.js) | Khóa tự cấp role qua đăng ký công khai; ẩn thông tin xác thực; đổi mật khẩu và thu hồi phiên trong giao dịch; chặn token khôi phục dùng lại; đăng nhập đồng thời chỉ giữ một phiên hoạt động |
| Auth frontend/hồ sơ | [AuthContext.jsx](frontend/src/context/AuthContext.jsx), [Profile.jsx](frontend/src/pages/Profile.jsx), [ProtectedRoute.jsx](frontend/src/components/ProtectedRoute.jsx) | Đồng bộ hết phiên, dọn trạng thái đăng nhập và yêu cầu đăng nhập lại sau đổi mật khẩu |
| Admin tài khoản | [UsersList.jsx](frontend/src/components/admin/UsersList.jsx), [MentorAssignment.jsx](frontend/src/components/admin/MentorAssignment.jsx), [UserForPage.jsx](frontend/src/components/admin/UserForPage.jsx), [accountAdministration.js](backend/services/admin-service/src/services/accountAdministration.js) | Sửa lỗi hook/import, cấp và quản lý tài khoản, kiểm tra quyền, trạng thái và đổi Mentor |
| Admin gói/vận hành | `frontend/src/components/admin/PackagesList.jsx`, `PurchasesList.jsx`, `PurchasesPage.jsx`, `ReportsPage.jsx`, `SupportTickets.jsx`; `frontend/src/styles/admin-*-refresh.css` | Sửa giao diện bảng/bộ lọc/hộp thoại, trạng thái tải và truy vấn; tách trả lời do người dùng nhập khỏi bản nháp tự sinh |
| Gói học | [purchaseLedger.js](backend/services/shared/purchaseLedger.js), `backend/services/admin-service/src/controllers/purchaseController.js` | Tính thời hạn liên tục từ lượt mua; đối chiếu gói đang hiệu lực và điều kiện cấp/gia hạn |
| Groq/từ điển | [aiService.js](backend/services/ai-service/src/services/aiService.js), [dictionaryHandler.js](backend/services/learner-service/src/controllers/dictionaryHandler.js), `dictionaryLookupQuota.js`, `aiServiceClient.js` | Chuẩn hóa lỗi provider, giới hạn đầu ra/thời gian; từ điển dùng JSON gọn, cache, gộp yêu cầu và thử lại có giới hạn khi bị cắt đầu ra |
| Luyện đọc | [SpeakingPractice.jsx](frontend/src/components/learner/SpeakingPractice.jsx), [SpeakingRound.jsx](frontend/src/components/learner/SpeakingRound.jsx), [spokenWordProgress.js](frontend/src/utils/spokenWordProgress.js), `speakingPrompt.js`, `persistSpeakingRound.js`, `speakingPracticeService.js` | Mức độ, timer, mic tự động, từ lặp/out-of-order, lưu có đối chiếu và chặn lượt đã kết thúc |
| Story/speech | [TellMeYourStory.jsx](frontend/src/components/learner/TellMeYourStory.jsx), `backend/services/learner-service/src/utils/storyWhisperWorker.js`, [story_whisper_worker.py](backend/ai_models/story_whisper_worker.py), [transcribe_whisperx.py](backend/ai_models/transcribe_whisperx.py) | Tái sử dụng worker, xử lý transcript và hội thoại, giảm chờ, quản lý lỗi/khôi phục/dừng mic |
| Vòng đời audio | [practiceRetention.js](backend/services/shared/practiceRetention.js), `backend/services/learner-service/src/utils/practiceRetentionRuntime.js`, [009_story_session_lifetimes.sql](backend/db/migrations/009_story_session_lifetimes.sql) | Ràng buộc phiên Story/pronunciation với phiên đăng nhập; dọn media/raw theo vòng đời, giữ kết quả chấm theo hợp đồng |
| FPT | [fptTtsService.js](backend/services/learner-service/src/services/fptTtsService.js), `fptSpeechPolicy.js`, `frontend/src/utils/storySpeech.js` | Giữ giọng nữ Việt banmai, xử lý hạn mức/thời hạn chờ/cache và trường hợp trình duyệt chặn phát tự động |
| Scenario | [ScenarioWorldPreview.jsx](frontend/src/components/learner/ScenarioWorldPreview.jsx), [scenarioWorldStore.js](backend/services/learner-service/src/services/scenarioWorldStore.js), `scenarioWorldDirector.js`, `scenarioWorldMission.js`, `scenarioWorldConversation.js`, [scenarioWorldCatalog.js](backend/services/shared/scenarioWorldCatalog.js) | NPC/scene, hộp thoại, mục tiêu và lựa chọn tiến triển; lưu/khôi phục phiên, revision/request và truy cập được sở hữu |
| Challenge | [ChallengeCreator.jsx](frontend/src/components/mentor/ChallengeCreator.jsx), [challengeLevels.js](backend/services/shared/challengeLevels.js), [challengeAuthoringController.js](backend/services/mentor-service/src/controllers/challengeAuthoringController.js), [challengeAuthoring.js](backend/services/mentor-service/src/services/challengeAuthoring.js), [challengeSimilarity.js](backend/services/mentor-service/src/services/challengeSimilarity.js) | Mentor authoring, CEFR, kiểm tra tương đồng và quyền sửa; bài đã dùng cần sao chép theo điều kiện |
| Bài nộp/điểm | [SubmissionForm.jsx](frontend/src/components/learner/SubmissionForm.jsx), [assessmentContract.js](backend/services/shared/assessmentContract.js), `submissionRetryController.js`, `transcriptAssessmentPersistence.js`, `analyzeSubmissionJob.js` | Nhận diện lượt nộp/thử lại, lưu kết quả và phân biệt loại/nguồn đánh giá |
| Mentor feedback/tiến độ | [LearnerFeedback.jsx](frontend/src/components/learner/LearnerFeedback.jsx), [ProgressAnalytics.jsx](frontend/src/components/learner/ProgressAnalytics.jsx), [WeeklyLearningGoal.jsx](frontend/src/components/learner/WeeklyLearningGoal.jsx), `backend/services/mentor-service/src/services/mentorService.js` | Đọc phản hồi/tiến độ; sửa API reviews dùng bảng thật và chỉ trả Learner còn được gán cho Mentor |
| Lớp trực tuyến/chat | [OnlineClasses.jsx](frontend/src/components/common/OnlineClasses.jsx), [MentorLearnerChat.jsx](frontend/src/components/common/MentorLearnerChat.jsx), [classroomRouter.js](backend/services/mentor-service/src/classroom/classroomRouter.js), [catalog.js](backend/services/mentor-service/src/classroom/catalog.js) | Chủ đề, bộ lọc, đăng ký/chỗ học/giờ trùng/thời lượng; yêu cầu học, roster/điểm danh và chat theo assignment |
| Community/thông báo | [CommunicateCenter.jsx](frontend/src/pages/CommunicateCenter.jsx), [Notifications.jsx](frontend/src/components/common/Notifications.jsx), [communityInteractions.js](backend/services/community-service/src/services/communityInteractions.js), `backend/services/notification-service/src/controllers/notificationHandlers.js` | Like/comment, đếm và cập nhật tương tác; thông báo đúng người, lịch sử đọc và đường dẫn tới nội dung |
| Giao diện chung | [navigationIcons.js](frontend/src/components/common/navigationIcons.js), [UserAvatar.jsx](frontend/src/components/common/UserAvatar.jsx), `frontend/src/i18n/`, `frontend/src/styles/` | Dùng chung nhãn/icon/avatar; ngôn ngữ UI, bản dịch bài và bố cục học tập/admin |

## 4. Các lỗi quan trọng sửa trong lượt review cuối

1. API đăng ký công khai nhận role từ request: nay trả `403 ACCOUNT_PROVISIONING_REQUIRED`; Admin cấp tài khoản.
2. Một số phản hồi tài khoản có thể chứa câu trả lời bảo mật: bộ lọc chung loại password/security_answer trước khi trả client.
3. Token đặt lại mật khẩu dùng lại được và phiên cũ chưa bị thu hồi: nay token gắn với mật khẩu hiện tại, cập nhật mật khẩu/thu hồi phiên trong cùng giao dịch.
4. Đăng nhập đồng thời hoặc lỗi chèn session làm trạng thái phiên sai: nay có khóa theo tài khoản, kiểm tra lại credential và rollback khi thất bại.
5. API hồ sơ tìm theo email cũ trong JWT: nay tìm bằng ID đã xác thực và đọc thông tin mới từ DB.
6. API Mentor reviews truy vấn bảng `mentor_reviews` không tồn tại: đổi sang `feedbacks`, kiểm tra assignment hiện tại và phân trang.
7. Component/route WordLearning không còn dùng nhưng ghi cột `word_meanings` không tồn tại: bỏ đường chết; không thêm cột thừa vào DB.
8. Frontend vẫn giữ trạng thái đăng nhập sau đổi mật khẩu: nay xóa auth local và về Login.
9. Khởi tạo Admin chấp nhận mật khẩu vượt giới hạn bcrypt: chặn quá 72 byte UTF-8 trước khi ghi.
10. Manifest JSON có BOM và tài liệu trỏ tới đường dẫn cũ: sửa encoding và liên kết; đồng bộ lệnh npm với file còn tồn tại.

## 5. Cơ sở dữ liệu và dữ liệu được giữ

- [backend/db/schema.sql](backend/db/schema.sql) là schema cài mới thống nhất: **47 bảng chức năng và một view**. Có các nhóm tài khoản/phiên, gói, bài học/bài nộp/feedback, speech, Scenario, lớp, chat, Community/thông báo và vận hành.
- Schema không kèm tài khoản cá nhân, API key hoặc dữ liệu demo riêng; từ chối public schema đã có bảng. DB đang dùng không được thay bằng schema cài mới.
- Đã loại năm bảng tính năng bỏ dùng sau khi xác minh rỗng, không còn tham chiếu runtime/khóa ngoại bên ngoài và có backup: `ai_learning_context`, `assistant_ai_training`, `assistant_ai_models`, `challenge_creator_training`, `mentor_blocklist`.
- Thao tác loại năm bảng đã xác minh `aesp.public`, loopback, cổng 5432; không dùng CASCADE. Backup riêng còn trong `.local-backups`.
- Không xóa cột/bảng còn được API đọc chỉ vì giao diện không còn dùng tên đó; các cấu trúc tương thích vẫn được giữ khi cần.
- SQL `009_story_session_lifetimes.sql` vẫn được backend đọc lúc chạy nên được giữ, dù các script/migration cũ không còn cần đã bị dọn.
- Trong đợt dọn 1.321 file, `.env.local`, `backend/uploads`, `backend/outputs`, `.local-backups`, venv và dependencies đang dùng không nằm trong phạm vi xóa. Điều này mô tả phạm vi lượt dọn, không khẳng định mọi file upload từng tồn tại ở HEAD cũ vẫn còn; Số liệu runtime chỉ được tổng hợp ở trên; tên file runtime đã được loại khỏi CSV công bố.

## 6. Dọn file và cấu trúc cuối

| Đợt | Kết quả ghi nhận |
| --- | --- |
| Dọn ban đầu | Loại 45 file cũ đã xác minh không dùng, khoảng 3,21 MB; bỏ khung Docker/monolith, ảnh không tham chiếu, script DB/seed/restore cũ và component WordLearning chết |
| Công cụ tạm của lượt sửa | Xóa mười công cụ tạo riêng để kiểm kê/sửa một lần sau khi dùng xong |
| Dọn trực tiếp theo yêu cầu điều chỉnh | Xóa **1.321 file**, khoảng **32,06 MB**, và **158 thư mục rỗng**; trong đó có test/fixture/log/ảnh bằng chứng, tài liệu cũ, script một lần, cùng bản source sao chép/ZIP phụ |

Các số trên là các nhóm thao tác được ghi nhận theo phiên, không phải số file code đang chạy và không cộng với tổng trạng thái Git để tính tiến độ.

Hiện không còn thư mục `artifacts` hoặc bộ test của dự án. Đã bỏ các lệnh npm trỏ tới test/export/audit bị xóa và lệnh Docker cũ. Không sinh thêm bộ source thay thế; sửa trực tiếp repository đang dùng.

Thư mục `scripts` còn năm file có nhiệm vụ rõ ràng: `setup.mjs`, `prepare-speech.py`, `database.mjs`, `create-admin.mjs`, `doctor.mjs`. Frontend giữ `check-react-bindings.mjs` vì build thực sự gọi nó và `build-ui-copy.mjs` để tạo catalog ngôn ngữ. Chúng không phải script audit dùng một lần.

Tài liệu dùng hằng ngày: [README](README.md), [REQUIREMENTS](REQUIREMENTS.md), [GETTING_STARTED](docs/GETTING_STARTED.md), [USER_GUIDE](docs/USER_GUIDE.md), [PROJECT_STRUCTURE](docs/PROJECT_STRUCTURE.md), [API](docs/api-spec.md). Báo cáo hiện tại và CSV là tài liệu bàn giao mới được người dùng yêu cầu giữ riêng tại thư mục gốc.

## 7. Kiểm thử và bằng chứng: trước và sau khi xóa test

**Trước đợt xóa bộ test**, kết quả cuối trong phiên sửa/review đã ghi nhận:

| Kiểm tra | Kết quả |
| --- | --- |
| Frontend | 239 test đạt |
| Backend | 437 test tổng: 391 đạt, 46 integration opt-in được bỏ qua có chủ đích |
| Setup/export | Mười test đạt |
| PostgreSQL thực chạy riêng | Năm integration đạt, dùng fixture tổng hợp có cleanup hoặc giao dịch rollback |
| SQL tĩnh | 438/438 câu PREPARE thành công trong giao dịch chỉ đọc; không thực thi DML đã chuẩn bị |
| Schema cài mới | DDL trong namespace tạm, tạo Admin/hash, từ chối cài trùng và rollback đạt; 480 cột tính cả view, không thiếu cột so với nhóm hiện hành |
| Lockfile | 15/15 bộ dependencies qua kiểm tra cài dry-run |

Các test, log và ảnh bằng chứng đó đã được xóa theo yêu cầu dọn. Các con số là kết quả đã ghi nhận trong phiên, **không phải khẳng định bộ test còn trong source hoặc đã chạy lại sau khi xóa**.

**Sau đợt dọn trực tiếp**, đã kiểm tra lại mà không tạo file audit/script mới:

- `npm run build` và kiểm tra binding React thành công.
- Parse 340 file JavaScript/JSX và đối chiếu 875 import tương đối: không lỗi cú pháp hoặc import trỏ tới file thiếu; JSON hiện có hợp lệ.
- Kiểm tra 35 entry point Node trong npm scripts: không trỏ tới file đã xóa.
- 14 liên kết tài liệu lúc kiểm tra không bị gãy; bộ setup chạy dry-run được.
- `doctor`: 23 mục đạt, bao gồm dependencies, cấu hình được che giá trị, FFmpeg, Python speech và schema PostgreSQL.
- Frontend và 11 backend service trả health HTTP 200 sau khi khởi động lại repository đã dọn.
- Còn cảnh báo bundle lớn/mixed imports của build; build vẫn hoàn tất.

Các liên kết trong chính báo cáo mới này được kiểm tra riêng lúc bàn giao. Không đưa lại các file test đã xóa để trình bày như bằng chứng còn tồn tại.

## 8. Phần đã bỏ, giới hạn và việc còn phải nghiệm thu

**Đã bỏ theo quyết định:** OpenRouter, mô hình hội thoại huấn luyện riêng, blocklist Mentor, giọng nam Việt, menu Conversation practice riêng, lối chạy Docker và bộ export source phụ. Không đồng nghĩa bỏ WhisperX/faster-whisper: đó là nhận dạng tiếng nói còn phục vụ ứng dụng.

**Chưa thể coi hoàn tất chỉ bằng test/build:**

1. Lỗi quota/rate limit FPT trước đây chưa có lượt xác nhận giọng thật thành công trong đợt cleanup. Code xử lý lỗi/hạn chờ đã sửa; quyền/hạn mức của nhà cung cấp vẫn là yếu tố bên ngoài.
2. Không gọi Groq/FPT thật hoặc dùng mic vật lý trong đợt cleanup/review vừa rồi; không suy ra mọi key/model/audio đều hoạt động chỉ từ doctor hoặc health 200.
3. Chưa chạy trọn bộ cài trên một máy Windows trắng khác. Máy mới cần phần mềm nền, download model, DB password và key của người chạy.
4. Điểm dựa trên transcript không tự trở thành thước đo phát âm âm học; cần trình bày đúng nguồn/loại kết quả khi demo và viết báo cáo đồ án.
5. Chưa kiểm chứng toàn bộ thao tác browser/thiết bị/đồng thời trong mọi tình huống. Kết quả kiểm thử chỉ chứng minh các luồng đã thực chạy.
6. Bộ test tự động đã bị xóa theo yêu cầu; sau này thay đổi nghiệp vụ cần kiểm thử lại phù hợp, không dùng các con số cũ làm kết quả mới.
7. SRS/WBS và mẫu báo cáo nhà trường chưa được người dùng chốt. Báo cáo kỹ thuật này không tự xác nhận toàn bộ đồ án đạt 100% hoặc thay cho nghiệm thu.

**Ưu tiên nghiệm thu tiếp theo:** chạy demo ba vai trò trên repository hiện tại; kiểm tra một vòng bài học → nộp bài → Mentor phản hồi → tiến độ/thông báo, lớp/chat và các trang Admin; thử audio thật với hạn mức hợp lệ; sau đó xác nhận cài mới trên máy khác và cập nhật tài liệu đồ án theo phạm vi đã chốt.

## 9. Cách mở và sử dụng bản hiện tại

Chạy [START_AESP.cmd](START_AESP.cmd), mở `http://127.0.0.1:5173`. Cài mới dùng [SETUP_AESP.cmd](SETUP_AESP.cmd) và [GETTING_STARTED](docs/GETTING_STARTED.md). Công cụ `db:init` chỉ dành cho DB rỗng, không dùng để sửa DB đang có dữ liệu.

Báo cáo và CSV này nằm ngay cạnh launcher ở thư mục gốc. Khi đối chiếu file, đọc cột trạng thái Git trước; không diễn giải mọi dòng `XOA` là một lần xóa vừa thực hiện, và không phục hồi các file đã bỏ bằng reset/restore.
