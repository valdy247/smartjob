import {experimental_startVideo as startVideo,experimental_getVideoStatus as getVideoStatus} from "ai";

// Same provider, dimensions, and image-to-video workflow used by VMV Motion.
// The model distinction maps the existing Pilot Turbo/High/Compare settings.
const MODELS={turbo:"bytedance/seedance-v1.0-pro-fast",high:"bytedance/seedance-v1.0-pro"};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function startMotionClip({db,bucket,imagePath,style,scene,variant}){
 const model=MODELS[variant];if(!model)throw Error("invalid_quality_variant");
 if(!process.env.AI_GATEWAY_API_KEY)throw Error("ai_gateway_key_missing");
 const {data,error}=await db.storage.from(bucket).createSignedUrl(imagePath,7200);
 if(error||!data?.signedUrl)throw Error("pilot_motion_image_missing");
 const direction=[
  "Animate the supplied illustration as one five-second vertical 9:16 clip at 720p.",
  "Preserve the starting character designs, lighting, framing, colors, and visual genre: "+style,
  "ONLY this story moment: "+scene.speech,
  "Visually animate: "+(scene.motionPrompt?.trim()||scene.imagePrompt),
  scene.motionPrompt?.trim()?"Follow the requested movement exactly; keep all unspecified elements still and do not introduce new objects or people.":"Show real character action, body and vehicle movement rather than camera-only zoom.",
  "Do not reveal future characters, repeat previous scenes, add text or narrate."
 ].join(" ").slice(0,1400);
 const started=await startVideo({model,prompt:{image:data.signedUrl,text:direction},
  duration:5,aspectRatio:"9:16",resolution:"1280x720"});
 if(!started?.operation)throw Error("seedance_operation_missing");
 return JSON.parse(JSON.stringify(started.operation));
}

export async function waitMotionClip(operation,variant,shouldStop=()=>false){
 const model=MODELS[variant];if(!model||!operation)throw Error("seedance_operation_missing");
 for(let i=0;i<160;i++){
  if(shouldStop())throw Error("worker_stopping");
  const result=await getVideoStatus(model,{operation});
  if(result.status==="completed"){
   const url=result.videos?.[0]?.url;
   if(typeof url!=="string"||!/^https:\/\//.test(url))throw Error("seedance_result_missing");
   return url;
  }
  if(result.status==="error"||result.status==="failed")throw Error("seedance_generation_failed");
  await sleep(7000);
 }
 throw Error("seedance_wait_timeout");
}
