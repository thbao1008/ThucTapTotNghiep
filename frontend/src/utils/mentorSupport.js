const kinds = new Set(['analysis_failed','inactive_7_days','expiring_package','expired_package']);
const id = value => {
  if (!['number','string'].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid support identity');
  return String(value);
};
const date = value => value === null || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const integer = value => Number.isSafeInteger(value) && value >= 0;

// Labels and destinations are product constants, never text/URLs from an alert payload.
export function supportSignalText(signal) {
  switch(signal.kind) {
    case 'analysis_failed': return `Có ${signal.count ?? 1} lượt xử lý bài gặp lỗi; xem trạng thái trước khi hướng dẫn thử lại.`;
    case 'inactive_7_days': return 'Chưa ghi nhận hoạt động học trong 7 ngày qua; có thể hỏi thăm nhịp học.';
    case 'expiring_package': return 'Gói học còn tối đa 7 ngày; trao đổi kế hoạch học tiếp nếu học viên có nhu cầu.';
    case 'expired_package': return 'Gói học đã hết hạn; hướng dẫn liên hệ hỗ trợ nếu muốn tiếp tục học.';
    default: throw new Error('Unknown support signal');
  }
}

export function parseMentorSupport(data) {
  if (!data || data.source !== 'recorded_activity_rules' || !date(data.generated_at) || data.generated_at === null
    || !Array.isArray(data.learners) || data.learners.length > 100) throw new Error('Invalid support overview');
  const seen=new Set();
  return data.learners.map(row=>{
    const learnerId=id(row?.learner_id),userId=id(row?.user_id),pkg=row.package;
    if (seen.has(learnerId) || typeof row.name!=='string' || !row.name.trim() || row.name.length>500
      || /[\u0000-\u001f]/.test(row.name) || !date(row.last_activity_at)
      || !Array.isArray(row.signals) || row.signals.length<1 || row.signals.length>4
      || !pkg || typeof pkg.is_active!=='boolean' || !['active','expired','unavailable','no-package'].includes(pkg.status)
      || !date(pkg.expiry_date) || !(pkg.days_left===null || integer(pkg.days_left))) throw new Error('Invalid support learner');
    seen.add(learnerId);
    const signalKinds=new Set();
    const signals=row.signals.map(signal=>{
      if (!signal || !kinds.has(signal.kind) || signalKinds.has(signal.kind)
        || signal.count!==undefined && (!integer(signal.count) || signal.count===0)
        || signal.at!==undefined && !date(signal.at)) throw new Error('Invalid support signal');
      signalKinds.add(signal.kind);
      return {kind:signal.kind,...(signal.count===undefined?{}:{count:signal.count}),...(signal.at===undefined?{}:{at:signal.at})};
    });
    return {learner_id:learnerId,user_id:userId,name:row.name.trim(),last_activity_at:row.last_activity_at,
      package:{purchase_id:pkg.purchase_id===null?null:id(pkg.purchase_id),status:pkg.status,expiry_date:pkg.expiry_date,days_left:pkg.days_left,is_active:pkg.is_active},
      signals,progress_path:`/mentor/learners?learner=${learnerId}`,chat_path:`/mentor/chat?learner=${learnerId}`};
  });
}

export async function loadMentorSupport(client,mentorId,{signal}={}) {
  const check=()=>{if(signal?.aborted)throw new DOMException('Request aborted','AbortError');};
  check();const response=await client.get(`/mentors/${id(mentorId)}/dashboard/support`,{signal,timeout:12000});check();
  return parseMentorSupport(response.data);
}

// A deep link never selects a peer absent from this account's authoritative contacts.
export function selectAssignedChatContact(contacts,search='') {
  const requested=new URLSearchParams(search).getAll('learner');
  if(!requested.length)return contacts[0]?.learner_id ?? '';
  if(requested.length!==1)return '';
  let learnerId;try{learnerId=id(requested[0]);}catch{return '';}
  return contacts.some(row=>String(row.learner_id)===learnerId)?learnerId:'';
}
