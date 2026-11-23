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

export async function videoStudioWorkerReady(voiceProvider:"openai"|"elevenlabs"|"none"="openai"):Promise<boolean>{
 if(!cloudLaunchEnabled())return false;
 const raw=process.env.VMV_STUDIO_WORKER_READY_URL?.trim();
 if(!raw||raw.length>250)return false;
 let url:URL;
 try{url=new URL(raw);}catch{return false;}
 // Explicit Render-only URL: no arbitrary destination, no localhost, no
 // internal IPs, no credentials, no querystring or redirect following.
 if(url.protocol!=="https:"||!url.hostname.endsWith(".onrender.com")||
  url.hostname===".onrender.com"||url.username||url.password||
  url.port||url.pathname!=="/readyz"||url.search||url.hash)return false;
 // Only the validated configured worker can be probed; never forward user URLs.
 if(voiceProvider==="elevenlabs")url.pathname="/voice-readyz";
 try{
  const response=await fetch(url.toString(),{
   method:"GET",cache:"no-store",redirect:"error",
   signal:AbortSignal.timeout(3500)
  });
  return response.status===200&&(await response.text()).trim()==="ready";
 }catch{return false;}
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
