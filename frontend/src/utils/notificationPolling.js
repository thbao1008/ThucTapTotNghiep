// One bounded refresh at a time; no scheduled work while the document is hidden.
// The controller's poll() also fences interactive reads/writes and session expiry.
export function createNotificationPolling(controller, {
  isVisible=()=>true, schedule=setTimeout, cancel=clearTimeout, intervalMs=30000
}={}) {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error('Invalid notification refresh interval');
  let disposed=false, timer=null, inFlight=null;
  const clear=()=>{if(timer!==null){cancel(timer);timer=null;}};
  const eligible=()=>!disposed&&isVisible()&&!controller.snapshot().disabled;
  function arm(){
    if(eligible())timer=schedule(()=>{timer=null;return refresh();},intervalMs);
  }
  async function refresh(){
    clear();
    if(!eligible()||inFlight)return false;
    const operation={};inFlight=operation;
    try{return await controller.poll();}
    catch{return false;}
    finally{if(inFlight===operation){inFlight=null;arm();}}
  }
  return {refresh,dispose(){disposed=true;clear();}};
}
