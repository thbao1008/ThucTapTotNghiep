import {createHash} from 'node:crypto';
import {normalizeChallengeLevel} from '../../../shared/challengeLevels.js';

const stop=new Set('a an the and or of to in on at for with from by your you about please describe discuss explain tell include give what why how when where which who speaking speak minutes minute seconds second task challenge'.split(' '));
const synonyms={journey:'travel',trip:'travel',trips:'travel',travelling:'travel',traveling:'travel',vacation:'holiday',vacations:'holiday',holidays:'holiday',occupation:'job',career:'job',employment:'job',workplace:'work',routine:'daily',routines:'daily',breakfast:'food',lunch:'food',dinner:'food',meal:'food',meals:'food',hometown:'city',town:'city',shopping:'shop',purchasing:'shop'};
export function challengePlainText(html) {
  return String(html??'').replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{
    const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);
    return code>0&&code<=0x10ffff?String.fromCodePoint(code):' ';
  }).replace(/&(amp|lt|gt|quot|apos|nbsp);/gi,(_,entity)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[entity.toLowerCase()]);
}
const canonical = value => challengePlainText(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function tokens(value) {
  return new Set(canonical(value).split(' ').filter(word=>word.length>2&&!stop.has(word)).map(word=>synonyms[word]||word));
}
function overlap(a,b) {
  if(!a.size||!b.size)return 0;
  let count=0;for(const word of a)if(b.has(word))count++;
  return count/(a.size+b.size-count);
}
export function compareChallenge(draft,row) {
  const title=overlap(tokens(draft.title),tokens(row.title));
  const content=overlap(tokens(draft.content),tokens(row.description));
  const all=overlap(tokens(draft.title+' '+draft.content),tokens(row.title+' '+row.description));
  const sameContent=canonical(draft.content)===canonical(row.description);
  const duplicate=sameContent || (content>=.9&&tokens(draft.content).size>=5&&tokens(row.description).size>=5);
  const similar=duplicate||title>=.45||all>=.3||(content>=.45&&tokens(draft.content).size>=4);
  return {similar,duplicate,score:Math.round(Math.max(all,title*.9,content)*100)};
}
export async function inspectChallengeSimilarity(client,draft,excludeId=null) {
  const {rows}=await client.query(`SELECT c.id,c.title,c.description,c.level,c.mentor_id,c.updated_at,u.name AS mentor_name
    FROM public.challenges c LEFT JOIN public.mentors m ON m.id=c.mentor_id LEFT JOIN public.users u ON u.id=m.user_id
    WHERE ($1::integer IS NULL OR c.id<>$1) ORDER BY c.id`,[excludeId]);
  const matches=rows.map(row=>({row,...compareChallenge(draft,row)})).filter(match=>match.similar)
    .sort((a,b)=>Number(b.duplicate)-Number(a.duplicate)||b.score-a.score||b.row.id-a.row.id);
  const review_key=createHash('sha256').update(JSON.stringify({draft:{title:canonical(draft.title),content:canonical(draft.content),level:draft.level},
    matches:matches.map(({row,duplicate})=>[row.id,row.updated_at,duplicate])})).digest('hex');
  return {review_key,duplicate:matches.some(match=>match.duplicate),total:matches.length,
    matches:matches.slice(0,6).map(({row,duplicate,score})=>({id:row.id,title:row.title,level:normalizeChallengeLevel(row.level),
      mentor_id:row.mentor_id,mentor_name:row.mentor_name,excerpt:challengePlainText(row.description).replace(/\s+/g,' ').trim().slice(0,320),duplicate,score}))};
}
export async function requireSimilarityReview(client,draft,excludeId=null) {
  const check=await inspectChallengeSimilarity(client,draft,excludeId);
  if(check.duplicate||check.total&&draft.review_key!==check.review_key)throw Object.assign(new Error(check.duplicate
    ?'This content already exists. Change the task before publishing.'
    :'Similar challenges exist. Review them before publishing.'),{
      status:409,code:check.duplicate?'CHALLENGE_DUPLICATE':'CHALLENGE_SIMILAR',similarity:check});
}
