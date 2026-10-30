const statuses=new Set(['pending','resolved','dismissed']);
export function reportReplyDraft(report,newStatus=null) {
  const status=newStatus ?? report.status;
  if(!statuses.has(status))throw new Error('Trạng thái báo cáo không hợp lệ');
  const editingExisting=newStatus===null || status===report.status;
  const existing=typeof report.reply==='string'?report.reply.replace(/^\[Admin[^\]]*\]\s*/,''):'';
  const defaults={pending:'',resolved:'Phản hồi được chấp nhận đang tiến hành xử lý',dismissed:'Phản hồi bị từ chối vì chưa đủ căn cứ.'};
  return {report:{...report,status},reply:editingExisting&&existing?existing:defaults[status]};
}
export function replaceReviewedReport(rows,updated,filter='') {
  return rows.map(row=>row.report_id===updated.report_id?updated:row).filter(row=>!filter || row.status===filter);
}
