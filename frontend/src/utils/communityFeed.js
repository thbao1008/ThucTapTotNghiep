export function communityPostRequest(tab,status='all',page=1) {
  if(!Number.isSafeInteger(page)||page<1)throw new Error('Trang bài đăng không hợp lệ');
  const params={page,limit:20};
  if(tab==='my-posts')return{url:'/community/posts/my-posts',params:{...params,status:status==='all'?null:status}};
  if(tab==='liked')return{url:'/community/posts/liked',params};
  return{url:'/community/posts',params};
}

// Keep the clicked item in place; refreshing the whole feed can move it under the pointer.
export function applyCommunityLike(rows,id,result,likedOnly=false) {
  if(typeof result?.liked!=='boolean')throw Error('Unconfirmed community reaction');
  return rows.flatMap(row=>{
    if(row.id!==id)return [row];
    if(likedOnly&&!result.liked)return [];
    const count=Number(result.likes_count);
    return [{...row,is_liked:result.liked,likes_count:Number.isInteger(count)&&count>=0?count:
      Math.max(0,Number(row.likes_count||0)+(Number(result.liked)-Number(Boolean(row.is_liked))))}];
  });
}
