import { Router } from 'express';
import { createLearnerAccessGuards } from '../middleware/learnerAccess.js';
import { createScenePreviewer } from '../utils/scenarioWorldDirector.js';
import { createWorldConversation } from '../utils/scenarioWorldConversation.js';
import { createScenarioWorldStore, validateWorldArchiveCursor } from '../services/scenarioWorldStore.js';

export function createScenarioWorldRouter({ pool, callAI, persistent = false }) {
  const router = Router(), store = persistent ? createScenarioWorldStore({pool,callAI}) : null;
  const preview = store?.preview ?? createScenePreviewer({ callAI });
  const { selfLearner } = createLearnerAccessGuards({ pool });
  const conversation = store ?? createWorldConversation({getScene:preview.getScene,callAI});
  const conversationError = (res,error) => {
    const status=[400,409,410,429,502,503,504].includes(error.status)?error.status:503;
    const messages={400:'Lượt trò chuyện chưa hợp lệ.',409:'Hội thoại đã thay đổi. Hãy tải lại hội thoại trước khi gửi tiếp.',410:'Phân cảnh thử đã hết hạn. Hãy tạo phân cảnh mới.',429:'Đã đạt giới hạn hội thoại thử. Hãy tạo cảnh mới.',502:'AI chưa trả về lời thoại hợp lệ.',503:'Chưa nhận được phản hồi. Hãy kiểm tra lại đúng lượt đã gửi.',504:'AI phản hồi quá thời gian chờ. Hãy kiểm tra lại đúng lượt đã gửi.'};
    return res.status(status).json({message:messages[status],code:'WORLD_CONVERSATION_UNAVAILABLE'});
  };
  router.get('/scenario-world/current',selfLearner(),async(req,res)=>{
    try {res.json({session:store?await store.latest(req.learnerId):null,transient:!store,archive_available:Boolean(store)});}catch(error){conversationError(res,error);}
  });
  router.get('/scenario-world/sessions',selfLearner(),async(req,res)=>{
    try {
      if(Object.keys(req.query).some(key=>key!=='cursor'))throw Object.assign(Error('query'),{status:400});
      validateWorldArchiveCursor(req.query.cursor);
      res.json(store?await store.list(req.learnerId,req.query.cursor):{sessions:[],next_cursor:null,transient:true});
    }catch(error){
      const status=error.status===400?400:503;
      res.status(status).json({message:status===400?'Yêu cầu xem các phiên đã lưu chưa hợp lệ.':'Chưa tải được các phiên đã lưu. Hãy thử lại.',code:'WORLD_ARCHIVE_UNAVAILABLE'});
    }
  });
  router.post('/scenario-world/finish',selfLearner(),async(req,res)=>{
    try {if(!store)throw Object.assign(Error('preview'),{status:409});res.json(await store.finish(req.learnerId,req.body));}catch(error){conversationError(res,error);}
  });
  router.get('/scenario-world/conversation/:sceneId',selfLearner(),async(req,res)=>{
    try {res.json(await conversation.read(req.learnerId,req.params.sceneId));}catch(error){conversationError(res,error);}
  });
  router.post('/scenario-world/reply',selfLearner(),async(req,res)=>{
    try {res.json(await conversation.reply(req.learnerId,req.body));}catch(error){conversationError(res,error);}
  });
  router.post('/scenario-world/preview', selfLearner(), async (req,res) => {
    try { res.json(await preview(req.learnerId, req.body)); }
    catch (error) {
      const status = [400,409,429,502,503,504].includes(error.status) ? error.status : 503;
      const messages = { 400: 'Chọn trình độ, chủ đề và mã yêu cầu hợp lệ.', 409: 'Mã tạo cảnh đã được dùng với lựa chọn khác.',
        429: 'Bạn đang tạo cảnh hoặc vừa tạo nhiều cảnh. Hãy đợi trước khi tạo cảnh mới.',
        502: 'AI chưa trả về phân cảnh hợp lệ. Không có phân cảnh giả được thay thế.',
        503: 'Chưa thể dựng cảnh bằng AI. Hãy thử kiểm tra lại yêu cầu đã gửi.', 504: 'AI chưa phản hồi trong thời gian cho phép.' };
      res.status(status).json({ message: messages[status], code: 'SCENE_PREVIEW_UNAVAILABLE' });
    }
  });
  return router;
}
