export function fptSpeechFailure(error) {
  let code='FPT_AUDIO_UNAVAILABLE';
  if(error?.status===429)code='FPT_RATE_LIMITED';
  else if([401,403].includes(error?.status)&&error?.code==='FPT_HTTP_ERROR')code='FPT_AUTH_FAILED';
  else if(['AbortError','TimeoutError'].includes(error?.name)||error?.code==='FPT_TIMEOUT')code='FPT_TIMEOUT';
  else if(error?.code==='FPT_NOT_CONFIGURED')code='FPT_NOT_CONFIGURED';
  return {success:false,fallback:true,requestedProvider:'fpt',code,
    ...(code==='FPT_RATE_LIMITED'?{retryAfterSeconds:error?.retryAfterSeconds||30}:{})};
}

// A rejected request must not trigger repeated synthesis calls from Play/replay.
// This stores only a deadline, never user text, audio, keys or conversations.
export function createFptSpeechGate({synthesize,now=Date.now}={}) {
  let retryAt=0;
  return async function request(...args) {
    const remaining=Math.ceil((retryAt-now())/1000);
    if(remaining>0)return {success:false,fallback:true,requestedProvider:'fpt',code:'FPT_RATE_LIMITED',retryAfterSeconds:remaining};
    const result=await synthesize(...args);
    if(result?.code==='FPT_RATE_LIMITED')retryAt=now()+Math.max(1,Math.min(3600,Number(result.retryAfterSeconds)||30))*1000;
    return result;
  };
}
