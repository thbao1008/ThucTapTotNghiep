const classroomTypes = new Set([
  'classroom_request', 'classroom_scheduled', 'classroom_declined', 'classroom_cancelled'
]);
const communityTypes=new Set(['post_like','comment_like','post_comment','comment_reply','post_submitted','post_approved','post_rejected']);
const communityPrefixes=new Map([['learner','/learn'],['mentor','/mentor'],['admin','/admin']]);

// Routes are local constants. Notification payloads never supply a URL or role.
export function notificationDestination(notification, role) {
  if(typeof role!=='string')return null;
  if(communityTypes.has(notification?.type)){
    const id=notification.related_post_id;
    if(!/^[1-9]\d*$/.test(String(id??''))||Number(id)>2147483647)return null;
    const prefix=communityPrefixes.get(role.toLowerCase());
    return prefix?`${prefix}/communicate?post=${id}`:null;
  }
  if (!classroomTypes.has(notification?.type)) return null;
  switch (role.toLowerCase()) {
    case 'learner': return '/learn/schedules';
    case 'mentor': return '/mentor/schedules';
    default: return null;
  }
}
