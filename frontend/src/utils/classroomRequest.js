export function presentClassRequest(request) {
  const cancelled=request.status==='scheduled'&&request.class_status==='cancelled';
  return {
    label:cancelled?'Buổi học đã hủy':({pending:'Chờ xem xét',scheduled:'Đã mở lớp',declined:'Chưa được chấp nhận'}[request.status]||'Chưa xác định'),
    classHint:!request.class_id?null:cancelled?'Buổi học này đã hủy.':'Tìm trong danh sách lớp chung để đăng ký.'
  };
}
