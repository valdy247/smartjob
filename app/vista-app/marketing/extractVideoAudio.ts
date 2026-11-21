"use client";

// Audio is decoded from a local video using the browser's media pipeline.
// Only the compressed audio Blob leaves the device; no video bytes are uploaded.
export const MAX_SOCIAL_VIDEO_SECONDS=120;
export const MAX_SOCIAL_VIDEO_BYTES=200*1024*1024;
export const MAX_SOCIAL_AUDIO_BYTES=3_300_000; // Below Vercel's function request-body limit.

export async function extractVideoAudio(file:File,signal?:AbortSignal):Promise<Blob>{
 if(typeof window==="undefined"||typeof document==="undefined")throw new Error("unsupported_browser");
 if(!file.type.startsWith("video/"))throw new Error("invalid_video");
 if(file.size<1024||file.size>MAX_SOCIAL_VIDEO_BYTES)throw new Error("video_size");
 if(signal?.aborted)throw new Error("cancelled");
 const AudioCtor=window.AudioContext;
 if(!AudioCtor||!window.MediaRecorder)throw new Error("unsupported_browser");
 const ctx=new AudioCtor();
 const video=document.createElement("video");
 const sourceUrl=URL.createObjectURL(file);
 video.src=sourceUrl;
 video.preload="auto";
 video.playsInline=true;
 video.setAttribute("playsinline","");
 video.controls=false;
 video.style.cssText="position:fixed;width:1px;height:1px;left:-9999px;top:0;opacity:0;pointer-events:none";
 document.body.appendChild(video);
 let recorder:MediaRecorder|undefined;
 try{
  const source=ctx.createMediaElementSource(video);
  const destination=ctx.createMediaStreamDestination();
  source.connect(destination); // No connection to speakers; keep playback private.
  const supported=["audio/webm;codecs=opus","audio/mp4","audio/webm"].find(type=>MediaRecorder.isTypeSupported(type));
  recorder=new MediaRecorder(destination.stream,supported?{mimeType:supported,audioBitsPerSecond:64000}:{audioBitsPerSecond:64000});
 }catch{
  video.pause();video.removeAttribute("src");video.load();video.remove();URL.revokeObjectURL(sourceUrl);
  void ctx.close().catch(()=>{});
  throw new Error("unsupported_browser");
 }
 const activeRecorder=recorder;
 return new Promise<Blob>((resolve,reject)=>{
  let settled=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const chunks:Blob[]=[];
  const dispose=()=>{
   if(timer)clearTimeout(timer);
   signal?.removeEventListener("abort",abort);
   video.pause();video.removeAttribute("src");video.load();video.remove();
   URL.revokeObjectURL(sourceUrl);
   destinationStop();
   void ctx.close().catch(()=>{});
  };
  const destinationStop=()=>{for(const track of activeRecorder.stream.getTracks())track.stop();};
  const fail=(key:string)=>{
   if(settled)return;
   settled=true;
   try{if(activeRecorder.state!=="inactive")activeRecorder.stop();}catch{}
   dispose();
   reject(new Error(key));
  };
  const abort=()=>fail("cancelled");
  if(signal?.aborted){fail("cancelled");return;}
  signal?.addEventListener("abort",abort,{once:true});
  video.addEventListener("loadedmetadata",()=>{
   if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>MAX_SOCIAL_VIDEO_SECONDS)fail("video_duration");
  });
  video.addEventListener("error",()=>fail("invalid_video"));
  activeRecorder.ondataavailable=event=>{
   if(event.data.size>0)chunks.push(event.data);
   if(chunks.reduce((total,chunk)=>total+chunk.size,0)>MAX_SOCIAL_AUDIO_BYTES)fail("audio_size");
  };
  activeRecorder.onerror=()=>fail("audio_capture");
  activeRecorder.onstop=()=>{
   if(settled)return;
   settled=true;
   const blob=new Blob(chunks,{type:activeRecorder.mimeType||"audio/webm"});
   dispose();
   if(blob.size<512)reject(new Error("audio_missing"));
   else if(blob.size>MAX_SOCIAL_AUDIO_BYTES)reject(new Error("audio_size"));
   else resolve(blob);
  };
  video.addEventListener("ended",()=>{if(!settled&&activeRecorder.state!=="inactive")activeRecorder.stop();});
  timer=setTimeout(()=>fail("video_timeout"),(MAX_SOCIAL_VIDEO_SECONDS+15)*1000);
  try{
   activeRecorder.start(1000);
   // Resume/play immediately during the user gesture (mobile Safari).
   void ctx.resume().catch(()=>fail("audio_capture"));
   void video.play().catch(()=>fail("playback_blocked"));
  }catch{fail("audio_capture");}
 });
}
