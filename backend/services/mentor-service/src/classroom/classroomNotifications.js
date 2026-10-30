// Run inside the same transaction as the classroom state transition.
// Request text, meeting URLs and contact details never enter notification previews.
export async function notifyClassroom(client,{recipients,actorId,type,title,message}) {
  if(!recipients.length)return;
  await client.query(`INSERT INTO notifications(user_id,type,title,message,related_user_id)
    SELECT DISTINCT u.id,$2::varchar,$3::varchar,$4::text,$5::integer FROM users u
    WHERE u.id=ANY($1::integer[]) AND u.status='active' AND u.id<>$5::integer`,
  [recipients,type,title,message,actorId]);
}
