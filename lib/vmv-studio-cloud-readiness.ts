/**
 * Server-side activation guard for Video Studio V1.
 * The customer may only reserve credits when the Preview worker is alive.
 * Keep the launch flags disabled until the worker and its database are verified.
 */
export function cloudLaunchEnabled():boolean{
 return process.env.VERCEL_ENV==="preview"&&
  process.env.VMV_STUDIO_GENERATION_ENABLED==="true"&&
  process.env.VMV_STUDIO_WORKER_READY==="true";
}

export async function videoStudioWorkerProbe(voiceProvider:"openai"|"elevenlabs"|"none"="openai"):Promise<{ready:boolean;reason:string;status?:number}>{
 if(!cloudLaunchEnabled())return {ready:false,reason:"preview_disabled"};
 const raw=process.env.VMV_STUDIO_WORKER_READY_URL?.trim();
 if(!raw||raw.length>250)return {ready:false,reason:"url_missing"};
 let url:URL;
 try{url=new URL(raw);}catch{return {ready:false,reason:"url_invalid"};}
 if(url.protocol!=="https:"||!url.hostname.endsWith(".onrender.com")||
  url.hostname===".onrender.com"||url.username||url.password||
  url.port||url.pathname!=="/readyz"||url.search||url.hash)return {ready:false,reason:"url_invalid"};
 if(voiceProvider==="elevenlabs")url.pathname="/voice-readyz";
 let result:{ready:boolean;reason:string;status?:number}={ready:false,reason:"network_error"};
 for(const timeout of [6500,4500]){
  try{
   const response=await fetch(url.toString(),{method:"GET",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(timeout)});
   if(response.status===200&&(await response.text()).trim()==="ready")return {ready:true,reason:"ready",status:200};
   result={ready:false,reason:"worker_not_ready",status:response.status};
   if(response.status<500)return result;
  }catch(error){result={ready:false,reason:error instanceof Error&&/timeout|abort/i.test(error.name+" "+error.message)?"timeout":"network_error"};}
 }
 console.warn("[vmv-studio] worker readiness",result.reason,result.status??"");
 return result;
}
export async function videoStudioWorkerReady(voiceProvider:"openai"|"elevenlabs"|"none"="openai"):Promise<boolean>{
 return (await videoStudioWorkerProbe(voiceProvider)).ready;
}

/** Prevent a new variable-length job from reaching an older five-second worker.
 * The legacy /readyz remains unchanged for other clients.
 */
export async function videoStudioSemanticWorkerReady():Promise<boolean>{
 if(!cloudLaunchEnabled())return false;
 const raw=process.env.VMV_STUDIO_WORKER_READY_URL?.trim();
 if(!raw||raw.length>250)return false;
 let url:URL;
 try{url=new URL(raw);}catch{return false;}
 if(url.protocol!=="https:"||!url.hostname.endsWith(".onrender.com")||
  url.hostname===".onrender.com"||url.username||url.password||
  url.port||url.pathname!=="/readyz"||url.search||url.hash)return false;
 url.pathname="/semantic-readyz";
 try{
  const response=await fetch(url.toString(),{
   method:"GET",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(3500)
  });
  return response.status===200&&(await response.text()).trim()==="semantic-v2";
 }catch{return false;}
}
