const sets = [
 ['foundations','Nền tảng',[
  ['A1','Bảng chữ cái và giới thiệu bản thân'],['A1','Số đếm, ngày giờ và lịch sinh hoạt'],['A1','Gia đình, trường học và nghề nghiệp'],
  ['A2','Mua sắm, gọi món và hỏi đường'],['A2','Kể về trải nghiệm và kế hoạch'],['B1','Kể chuyện và miêu tả chi tiết']]],
 ['grammar','Ngữ pháp',[
  ['A1','Thì hiện tại và cấu trúc câu cơ bản'],['A2','Quá khứ, tương lai và động từ khuyết thiếu'],['B1','Các thì hoàn thành và câu điều kiện'],
  ['B2','Mệnh đề quan hệ và câu bị động'],['C1','Đảo ngữ và cấu trúc nâng cao']]],
 ['pronunciation','Phát âm',[
  ['A1','Âm cơ bản và bảng IPA'],['A2','Trọng âm từ và âm cuối'],['B1','Nối âm và ngữ điệu'],['B2','Nhịp điệu và phát âm tự nhiên']]],
 ['conversation','Giao tiếp',[
  ['A2','Giao tiếp hằng ngày và du lịch'],['B1','Thảo luận, nêu ý kiến và giải quyết vấn đề'],['B2','Thuyết trình và tranh biện'],['C1','Giao tiếp học thuật và sắc thái ngôn ngữ']]],
 ['vocabulary','Từ vựng',[
  ['A1','Từ vựng thông dụng theo chủ đề'],['B1','Cụm động từ và kết hợp từ'],['B2','Thành ngữ và diễn đạt tự nhiên'],['C1','Từ vựng chuyên sâu và học thuật']]],
 ['work','Tiếng Anh công việc',[
  ['B1','Email, điện thoại và cuộc họp'],['B2','Phỏng vấn và trình bày dự án'],['C1','Đàm phán và giao tiếp chuyên nghiệp']]],
 ['ielts','Luyện thi IELTS',[
  ['B1','IELTS nền tảng và chiến lược ôn thi'],['B2','IELTS Speaking Part 1, 2, 3'],['B2','IELTS Writing Task 1 và Task 2'],['C1','IELTS nâng cao và chữa bài'],['B2','IELTS Listening và Reading']]],
 ['toeic','Luyện thi TOEIC',[
  ['A2','TOEIC nền tảng và từ vựng'],['B1','TOEIC Listening và Reading'],['B2','TOEIC Speaking và Writing']]],
 ['other-exams','Các kỳ thi khác',[
  ['B2','TOEFL và tiếng Anh học thuật'],['B1','Cambridge B1 Preliminary'],['B2','Cambridge B2 First'],['C1','Cambridge C1 Advanced'],['C2','Cambridge C2 Proficiency'],['B1','Ôn thi tiếng Anh và kỹ năng làm bài']]],
 ['questions','Hỏi đáp theo nhu cầu', [['A1','Hỏi đáp nền tảng theo nhu cầu'],['B1','Gỡ khó khi tự học tiếng Anh'],['C2','Thảo luận chuyên sâu theo yêu cầu']]]
];
export const CLASS_TOPICS = sets.flatMap(([category, categoryLabel, rows]) => rows.map(([level, title], index) => ({
 id: `${category}-${index+1}`, category, categoryLabel, level, title
})));
export const topicById = id => CLASS_TOPICS.find(topic => topic.id === id);
