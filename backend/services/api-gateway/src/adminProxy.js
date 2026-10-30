import {createProxyMiddleware} from 'http-proxy-middleware';

export function createAdminProxy(target,{timeoutMs=15000,onError=()=>{}}={}){
 return createProxyMiddleware({target,changeOrigin:true,pathRewrite:path=>`/admin${path}`,timeout:timeoutMs+3000,proxyTimeout:timeoutMs,
  on:{
   proxyReq(proxyReq,req){proxyReq.once('timeout',()=>{req.adminProxyTimedOut=true;});proxyReq.setHeader('x-forwarded-host',req.get('host')||'localhost');proxyReq.setHeader('x-forwarded-proto',req.protocol||'http');},
   error(error,req,res){onError(error);if(res.headersSent||res.writableEnded||res.destroyed)return;const timeout=req.adminProxyTimedOut||['ETIMEDOUT','ESOCKETTIMEDOUT','ECONNABORTED'].includes(error.code);res.status(timeout?504:502).json({message:timeout?'Admin Service phản hồi quá chậm. Hãy tải lại hồ sơ để kiểm tra kết quả.':'Không thể kết nối đến Admin Service. Hãy tải lại hồ sơ để kiểm tra kết quả.',code:timeout?'ADMIN_TIMEOUT':'ADMIN_UNAVAILABLE'});}
  }
 });
}
