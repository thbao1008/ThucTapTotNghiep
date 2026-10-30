import pool from '../config/db.js';

const fail=(status,message)=>Object.assign(new Error(message),{status});
export function communityId(value) {
  if(!/^[1-9]\d*$/.test(String(value??''))||Number(value)>2147483647)throw fail(400,'Invalid community item id');
  return Number(value);
}
export async function readablePost(db,postId,userId,role) {
  const {rows:[post]}=await db.query(`SELECT id,author_id FROM public.community_posts WHERE id=$1 AND is_deleted=false
    AND (status='approved' OR author_id=$2 OR $3='admin')`,[postId,userId,role]);
  if(!post)throw fail(404,'Post not found');
  return post;
}
export async function notifyCommunity(client,{userId,actorId,type,title,message,postId,commentId=null}) {
  if(!userId||userId===actorId)return;
  // The business write and its inbox event commit together. A repeated like
  // does not delete history or flood the recipient with duplicate notices.
  await client.query(`INSERT INTO public.notifications(user_id,type,title,message,related_post_id,related_comment_id,related_user_id)
    SELECT $1::integer,$2::varchar(50),$3::varchar(255),$4::text,$5::integer,$6::integer,$7::integer FROM public.users recipient WHERE recipient.id=$1 AND recipient.status='active'
    AND NOT EXISTS(SELECT 1 FROM public.notifications n WHERE n.user_id=$1 AND n.type=$2::varchar(50)
      AND n.related_post_id=$5 AND n.related_comment_id IS NOT DISTINCT FROM $6::integer AND n.related_user_id=$7)`,
    [userId,type,title,message,postId,commentId,actorId]);
}
export async function communityTransaction(work) {
  const client=await pool.connect();let open=false,broken=false;
  try {
    const {rows:[target]}=await client.query('SELECT current_database() AS db,current_schema() AS schema,inet_server_addr()::text AS address,inet_server_port() AS port');
    if(target.db!=='aesp'||target.schema!=='public'||target.port!==5432||!['127.0.0.1','127.0.0.1/32','::1','::1/128'].includes(target.address))throw fail(503,'Local community database unavailable');
    await client.query('BEGIN');open=true;
    await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='5s'");
    const result=await work(client);
    try{await client.query('COMMIT');}catch(error){broken=true;throw error;}
    open=false;return result;
  }catch(error){if(open)await client.query('ROLLBACK').catch(()=>{broken=true;});throw error;}
  finally{client.release(broken);}
}
export async function toggleCommunityLike({userId,role,postId,commentId}) {
  const hasPost=postId!==undefined&&postId!==null,hasComment=commentId!==undefined&&commentId!==null;
  if(hasPost===hasComment)throw fail(400,'Provide exactly one post or comment');
  const id=communityId(hasPost?postId:commentId),column=hasPost?'post_id':'comment_id';
  return communityTransaction(async client=>{
    let targetPost=id;
    let commentOwner;
    if(!hasPost){const{rows:[comment]}=await client.query('SELECT post_id,author_id FROM public.post_comments WHERE id=$1 AND is_deleted=false',[id]);if(!comment)throw fail(404,'Comment not found');targetPost=comment.post_id;commentOwner=comment.author_id;}
    const post=await readablePost(client,targetPost,userId,role);
    await client.query('SELECT pg_advisory_xact_lock(1380143970,hashtext($1))',[`${userId}:${column}:${id}`]);
    const {rows:[existing]}=await client.query(`SELECT id FROM public.post_likes WHERE user_id=$1 AND ${column}=$2`,[userId,id]);
    if(existing)await client.query('DELETE FROM public.post_likes WHERE id=$1 AND user_id=$2',[existing.id,userId]);
    else {
      await client.query(`INSERT INTO public.post_likes(user_id,${column}) VALUES($1,$2)`,[userId,id]);
      await notifyCommunity(client,{userId:hasPost?post.author_id:commentOwner,actorId:userId,type:hasPost?'post_like':'comment_like',title:hasPost?'New like on your post':'New like on your comment',message:hasPost?'A member liked your Community post.':'A member liked your comment.',postId:targetPost,commentId:hasPost?null:id});
    }
    const {rows:[count]}=await client.query(`SELECT count(*)::int AS likes_count FROM public.post_likes WHERE ${column}=$1`,[id]);
    return {liked:!existing,likes_count:count.likes_count};
  });
}
