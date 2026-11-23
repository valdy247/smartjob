import {createClient} from "@supabase/supabase-js";
import {createServer} from "node:http";
import {mkdtemp,readFile,writeFile,stat,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {startMotionClip,waitMotionClip} from "./motion-engine.mjs";
import {speechTimeline} from "./speech-timeline.mjs";

const required=["OPENAI_API_KEY","AI_GATEWAY_API_KEY"];
const supabaseUrl=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
// Deploy safely before credentials are configured. In standby the worker claims
// no jobs, spends no credits, and its readiness endpoint stays unavailable.
const db=supabaseUrl&&supabaseSecret?
 createClient(supabaseUrl,supabaseSecret,{auth:{persistSession:false,autoRefreshToken:false}}):null;
const missingConfig=()=>[
 ...(!db?["SUPABASE_URL or SUPABASE_SECRET_KEY"]:[]),
 ...required.filter(key=>!process.env[key]?.trim())
];
const WORK="vmv-studio-assets",FINAL="vmv-studio-assets";
const OPENAI="https://api.openai.com/v1";
const STYLE={
 stickman:"STRICT 2D stickman animation, white circular heads, black expressive stick limbs, vivid flat colors and clean outlines.",
 cartoon2d:"STRICT original 2D hand-drawn cartoons, colorful animated characters, stable silhouettes and cel shading.",
 cartoon3d:"STRICT polished stylized 3D cartoon animation, soft cinematic lighting, expressive original characters.",
 clay:"STRICT handcrafted claymation stop motion, miniature clay sets, visible handmade textures and natural shadows.",
 illustrated:"STRICT animated storybook illustration, painterly watercolor and ink, animated layers and paper textures."
};
const LANGUAGES={es:"Spanish",en:"English",pt:"Portuguese",fr:"French",de:"German",it:"Italian"};
const STOP=()=>process.env.VMV_STUDIO_WORKER_ENABLED!=="true"||missingConfig().length>0;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const log=(event,details={})=>console.log("[vmv-studio-worker]",event,JSON.stringify(details));
let closing=false,active=false;
process.on("SIGTERM",()=>{closing=true;});
process.on("SIGINT",()=>{closing=true;});
createServer(async(req,res)=>{
 const health=req.url==="/healthz",ready=req.url==="/readyz";
 if(health){res.writeHead(200,{"Content-Type":"text/plain","Cache-Control":"no-store"});res.end("ok");return;}
 if(!ready){res.writeHead(404,{"Content-Type":"text/plain","Cache-Control":"no-store"});res.end("not found");return;}
 let connected=false;
 if(!STOP()){
  try{
   // A ready worker must have the database job queue available, not merely
   // an environment flag. A read-only HEAD query never claims a job.
   const {error}=await db.from("vmv_studio_jobs").select("id",{head:true}).limit(1);
   connected=!error;
  }catch{connected=false;}
 }
 const enabled=!STOP()&&connected;
 res.writeHead(enabled?200:503,{"Content-Type":"text/plain","Cache-Control":"no-store"});
 res.end(enabled?"ready":"standby");
}).listen(Number(process.env.PORT||10000),"0.0.0.0");
const auth=k=>({Authorization:"Bearer "+process.env[k]});
async function request(url,options={},ms=80000){
 return fetch(url,{...options,cache:"no-store",signal:AbortSignal.timeout(ms)});
}
async function bytes(response,limit){
 if(!response.ok)throw Error("download_http_"+response.status);
 if(Number(response.headers.get("content-length")||0)>limit)throw Error("asset_too_large");
 if(!response.body)throw Error("asset_empty");
 const reader=response.body.getReader(),parts=[];let size=0;
 while(true){
  const {done,value}=await reader.read();if(done)break;
  size+=value.byteLength;
  if(size>limit){await reader.cancel();throw Error("asset_too_large");}
  parts.push(Buffer.from(value));
 }
 if(size<512)throw Error("asset_too_small");
 return Buffer.concat(parts,size);
}
async function shell(command,args,timeoutMs=240000){
 await new Promise((resolve,reject)=>{
  const child=spawn(command,args,{stdio:["ignore","ignore","pipe"]});
  let stderr="",closed=false;
  child.stderr.on("data",chunk=>{stderr=(stderr+chunk.toString()).slice(-3000);});
  const timer=setTimeout(()=>{child.kill("SIGKILL");},timeoutMs);
  child.on("error",error=>{if(!closed){closed=true;clearTimeout(timer);reject(error);}});
  child.on("close",code=>{
   if(closed)return;closed=true;clearTimeout(timer);
   if(code===0)resolve();else reject(Error(command+"_failed_"+code+" "+stderr.slice(-160)));
  });
 });
}
async function probe(file){
 return new Promise((resolve,reject)=>{
  const child=spawn("ffprobe",["-v","error","-show_entries","format=duration","-of","default=nw=1:nk=1",file]);
  let output="";child.stdout.on("data",v=>output+=v.toString());
  child.on("error",reject);child.on("close",code=>{
   const duration=Number(output.trim());if(code!==0||!Number.isFinite(duration)||duration<=0)reject(Error("invalid_duration"));
   else resolve(duration);
  });
 });
}
async function patch(job,changes){
 const {data,error}=await db.from("vmv_studio_jobs").update({...changes,updated_at:new Date().toISOString()})
  .eq("id",job.id).eq("owner_id",job.owner_id).eq("lease_token",job.lease_token)
  .select("id").maybeSingle();
 if(error||!data)throw Error("job_progress_unavailable");
 Object.assign(job,changes);
}
async function keepAlive(job){
 const {data,error}=await db.from("vmv_studio_jobs")
  .update({lease_expires_at:new Date(Date.now()+15*60000).toISOString()})
  .eq("id",job.id).eq("lease_token",job.lease_token).select("id").maybeSingle();
 if(error||!data)log("heartbeat_failed",{job:job.id});
}
async function upload(bucket,remote,local,mime){
 const buffer=await readFile(local);
 const {error}=await db.storage.from(bucket).upload(remote,buffer,{contentType:mime,upsert:true,cacheControl:"60"});
 if(error)throw Error("media_upload_unavailable");
}
async function download(bucket,remote,local){
 const {data,error}=await db.storage.from(bucket).download(remote);
 if(error||!data)throw Error("media_download_unavailable");
 await writeFile(local,Buffer.from(await data.arrayBuffer()));
}
async function persistAsset(job,key,local,mime){
 const prefix=job.owner_id+"/"+job.id+"/",suffix=key+(mime==="audio/mpeg"?".mp3":mime==="image/jpeg"?".jpg":".mp4");
 const dest=prefix+suffix;
 await upload(WORK,dest,local,mime);
 const assets={...job.assets,[key]:dest};
 await patch(job,{assets});
 return dest;
}
async function restoreAsset(job,key,local){
 const remote=job.assets?.[key];
 if(typeof remote!=="string"||!remote.startsWith(job.owner_id+"/"+job.id+"/"))return false;
 await download(WORK,remote,local);
 return true;
}
async function aiScript(job){
 const n=job.seconds/5;
 for(let attempt=0;attempt<3;attempt++){
 const system=[
  "You are an original short video director creating a "+job.seconds+"-second vertical video.",
  "Return JSON with title and scenes array. EXACTLY "+n+" scenes, five seconds each.",
  "Each scene has speech (7-11 words, max 13), imagePrompt in English (a visually exact action that represents those words), caption (3-8 words).",
  "STRICT narration AND captions language: "+LANGUAGES[job.language]+". NEVER use a different language for any spoken or displayed words.",
  "STRICT immutable visual bible for EVERY scene: "+STYLE[job.style],
  "Stickman characters and visual palette must be CONSISTENT across the entire story.",
  "Narration must align exactly to visuals scene-by-scene. Never show a character or future surprise before the narration reveals it.",
  "Use original, factually accurate claims, no copied third-party scripts or protected characters.",
  "Open with a compelling hook without spoiling the reveal; finish coherently. Every scene advances the same continuous story.",
  "Output valid JSON only: {\"title\":\"...\",\"scenes\":[{\"speech\":\"...\",\"imagePrompt\":\"...\",\"caption\":\"...\"}]}"
 ].join(" ");
 const response=await request(OPENAI+"/chat/completions",{
  method:"POST",headers:{...auth("OPENAI_API_KEY"),"Content-Type":"application/json"},
  body:JSON.stringify({model:"gpt-4.1-mini",temperature:0.35,max_tokens:4800,
   response_format:{type:"json_object"},messages:[{role:"system",content:system},
    {role:"user",content:JSON.stringify({topic:job.topic,audience:job.audience,goal:job.goal})}]})
 },90000);
 if(!response.ok)throw Error("script_provider_"+response.status);
 const data=await response.json();
 const raw=data?.choices?.[0]?.message?.content;
 if(typeof raw!=="string")throw Error("script_empty");
 const parsed=JSON.parse(raw);
 if(!Array.isArray(parsed.scenes)||parsed.scenes.length!==n)throw Error("script_scene_count");
 const scenes=parsed.scenes.map((s,i)=>({
  index:i,start:i*5,end:i*5+5,
  speech:String(s.speech||"").trim().slice(0,180),
  imagePrompt:String(s.imagePrompt||"").trim().slice(0,650),
  caption:String(s.caption||"").trim().slice(0,100)
 }));
 if(scenes.some(s=>s.speech.length<10||s.imagePrompt.length<30||
  s.speech.split(/\s+/).length>13))throw Error("script_timing_invalid");
 try{
  await verifyScriptLanguage(job,scenes);
 }catch(error){
  if(error instanceof Error&&error.message==="script_language_mismatch"&&attempt<2)continue;
  throw error;
 }
 await patch(job,{title:String(parsed.title||job.topic).slice(0,140),
  scenes,status:"working",phase:"Voz",progress:7});
 return scenes;
 }
 throw Error("script_language_mismatch");
}
async function verifyScriptLanguage(job,scenes){
 if(!LANGUAGES[job.language])throw Error("video_language_invalid");
 const response=await request(OPENAI+"/chat/completions",{
  method:"POST",headers:{...auth("OPENAI_API_KEY"),"Content-Type":"application/json"},
  body:JSON.stringify({model:"gpt-4.1-mini",temperature:0,max_tokens:350,
   response_format:{type:"json_object"},
   messages:[{role:"system",content:"Detect the language of EACH speech and caption. Respond ONLY JSON {languages:[ISO 639-1 code per scene]}. Do not translate, do not assume the requested language. Use one code per scene."},
    {role:"user",content:JSON.stringify(scenes.map(x=>({speech:x.speech,caption:x.caption})))}]})
 },45000);
 if(!response.ok)throw Error("script_language_check_unavailable");
 const data=await response.json();
 let parsed;
 try{parsed=JSON.parse(data.choices[0].message.content);}catch{throw Error("script_language_unverified");}
 if(!Array.isArray(parsed.languages)||parsed.languages.length!==scenes.length||
   parsed.languages.some(code=>code!==job.language))throw Error("script_language_mismatch");
}
async function verifyAudioLanguage(job,voices,dir){
 const manifest=path.join(dir,"language-voices.txt"),joined=path.join(dir,"language-check.mp3");
 await writeFile(manifest,voices.map(file=>"file '"+file.replace(/'/g,"")+"'").join("\n")+"\n");
 await shell("ffmpeg",["-hide_banner","-loglevel","error","-y","-safe","0",
  "-f","concat","-i",manifest,"-c","copy",joined]);
 const body=new FormData();
 body.set("model","whisper-1");body.set("response_format","verbose_json");
 body.set("file",new Blob([await readFile(joined)],{type:"audio/mpeg"}),"speech.mp3");
 const response=await request(OPENAI+"/audio/transcriptions",{
  method:"POST",headers:auth("OPENAI_API_KEY"),body
 },100000);
 if(!response.ok)throw Error("audio_language_check_unavailable");
 const data=await response.json();
 const detected=String(data.language||"").trim().toLowerCase();
 const names={es:["es","spanish","español"],en:["en","english"],
  pt:["pt","portuguese","português"],fr:["fr","french","français"],
  de:["de","german","deutsch"],it:["it","italian","italiano"]};
 if(!names[job.language]?.includes(detected))throw Error("audio_language_mismatch");
}
async function generateSpeech(job,text,file){
 if(job.voice_provider==="elevenlabs"){
  if(!process.env.ELEVENLABS_API_KEY)throw Error("elevenlabs_key_missing");
  if(!/^[A-Za-z0-9]{15,32}$/.test(job.voice_id))throw Error("voice_invalid");
  const response=await request("https://api.elevenlabs.io/v1/text-to-speech/"+
   encodeURIComponent(job.voice_id)+"?output_format=mp3_44100_128",{
    method:"POST",headers:{"xi-api-key":process.env.ELEVENLABS_API_KEY,
     "Content-Type":"application/json",Accept:"audio/mpeg"},
    body:JSON.stringify({text,model_id:"eleven_multilingual_v2"})
   },90000);
  await writeFile(file,await bytes(response,1500000));
 }else if(job.voice_provider==="openai"&&["alloy","ash","ballad","coral","echo","fable","nova","onyx","sage","shimmer","verse","marin","cedar"].includes(job.voice_id)){
  const response=await request(OPENAI+"/audio/speech",{
   method:"POST",headers:{...auth("OPENAI_API_KEY"),"Content-Type":"application/json"},
   body:JSON.stringify({model:"gpt-4o-mini-tts",voice:job.voice_id,input:text,response_format:"mp3",speed:1.0})
  },90000);
  await writeFile(file,await bytes(response,1500000));
 }else throw Error("voice_invalid");
}
async function generateContinuousSpeech(job,scenes,file){
 const text=scenes.map(scene=>scene.speech.trim()).join(" ");
 if(job.voice_provider!=="elevenlabs"){
  await generateSpeech(job,text,file);
  return null;
 }
 if(!process.env.ELEVENLABS_API_KEY)throw Error("elevenlabs_key_missing");
 const response=await request("https://api.elevenlabs.io/v1/text-to-speech/"+
  encodeURIComponent(job.voice_id)+"/with-timestamps?output_format=mp3_44100_128",{
   method:"POST",headers:{"xi-api-key":process.env.ELEVENLABS_API_KEY,"Content-Type":"application/json"},
   body:JSON.stringify({text,model_id:"eleven_multilingual_v2"})
  },120000);
 if(!response.ok){
  const status=response.status;
  const err=await response.json().catch(()=>null);
  const reason=String(err?.detail?.status||"unknown").replace(/[^a-z0-9_-]/gi,"").slice(0,48);
  throw Error("elevenlabs_narration_"+status+"_"+reason);
 }
 const body=await response.json();
 const base64=body?.audio_base64;
 if(typeof base64!=="string"||base64.length<3000||base64.length>10000000)
  throw Error("elevenlabs_audio_invalid");
 const alignment=body?.alignment;
 if(!alignment||!Array.isArray(alignment.characters)||
  !Array.isArray(alignment.character_start_times_seconds)||
  !Array.isArray(alignment.character_end_times_seconds))
  throw Error("elevenlabs_alignment_unavailable");
 await writeFile(file,Buffer.from(base64,"base64"));
 return alignment;
}
async function makeImage(job,scene,reference){
 const prompt=[
  "Portrait 9:16 image to animate as a five-second real video clip.",
  "LOCKED STYLE: "+STYLE[job.style],
  "Visual must show the action in: "+scene.speech,
  "Illustration: "+scene.imagePrompt,
  "Preserve the same characters, proportions, clothes, and palette as reference if provided.",
  "Compose an action-ready dynamic shot. No writing, subtitles, text, logos or watermarks."
 ].join(" ");
 let response;
 if(reference){
  const form=new FormData();
  form.set("model","gpt-image-1-mini");form.set("size","1024x1536");
  form.set("quality","medium");form.set("output_format","jpeg");
  form.set("prompt",prompt.slice(0,3500));
  form.append("image",new Blob([await readFile(reference)],{type:"image/jpeg"}),"reference.jpg");
  response=await request(OPENAI+"/images/edits",{method:"POST",headers:auth("OPENAI_API_KEY"),body:form},180000);
 }else{
  response=await request(OPENAI+"/images/generations",{
   method:"POST",headers:{...auth("OPENAI_API_KEY"),"Content-Type":"application/json"},
   body:JSON.stringify({model:"gpt-image-1-mini",size:"1024x1536",quality:"medium",
    output_format:"jpeg",n:1,prompt:prompt.slice(0,3500)})
  },180000);
 }
 if(!response.ok)throw Error("image_provider_"+response.status);
 const data=await response.json();
 const image=data?.data?.[0]?.b64_json;
 if(typeof image!=="string"||image.length<5000||image.length>13000000)throw Error("image_invalid");
 return Buffer.from(image,"base64");
}
async function validateSceneImage(job,scene,buffer){
 const b64=buffer.toString("base64");
 const response=await request(OPENAI+"/chat/completions",{
  method:"POST",headers:{...auth("OPENAI_API_KEY"),"Content-Type":"application/json"},
  body:JSON.stringify({model:"gpt-4.1-mini",temperature:0,max_tokens:180,
   response_format:{type:"json_object"},
   messages:[{role:"system",content:[
    "You review one storyboard frame for a short video.",
    "Confirm its main character, action and location match the scene's narration and visual description.",
    "Reject frames that reveal a future subject, feature the wrong animal or contradict the narration.",
    "Accept reasonable symbolic visuals, text-free cinematic staging and minor incidental artistic details.",
    'Return JSON only: {"valid":true} or {"valid":false}. Do not infer unseen events.'
   ].join(" ")},
   {role:"user",content:[
    {type:"text",text:JSON.stringify({speech:scene.speech,imagePrompt:scene.imagePrompt,
     artStyle:STYLE[job.style]})},
    {type:"image_url",image_url:{url:"data:image/jpeg;base64,"+b64,detail:"low"}}
   ]}]})
 },45000);
 if(!response.ok)throw Error("scene_visual_check_unavailable");
 const data=await response.json();
 let result;try{result=JSON.parse(data.choices[0].message.content);}catch{
  throw Error("scene_visual_check_unavailable");
 }
 if(typeof result.valid!=="boolean")throw Error("scene_visual_check_unavailable");
 return result.valid;
}
const timecode=seconds=>{
 const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60);
 const s=Math.floor(seconds%60),ms=Math.floor((seconds%1)*1000);
 return [h,m,s].map(n=>String(n).padStart(2,"0")).join(":")+","+String(ms).padStart(3,"0");
};
async function assemble(job,dir,clips,narrationFile,timing,variant){
 if(!["turbo","high"].includes(variant)||clips.length!==job.seconds/5)
  throw Error("invalid_montage_request");
 const concat=path.join(dir,"concat-"+variant+".txt"),
  raw=path.join(dir,"raw-"+variant+".mp4"),
  final=path.join(dir,"final-"+variant+".mp4");
 const originalDuration=Number(timing?.duration)||job.seconds;
 const speed=originalDuration/job.seconds;
 if(narrationFile&&(speed<0.78||speed>1.25))throw Error("voice_length_requires_script_revision");
 const segments=timing?.segments;
 if(!Array.isArray(segments)||segments.length!==clips.length)throw Error("scene_timing_invalid");
 const clipPaths=[];
 for(let i=0;i<clips.length;i++){
  const segment=segments[i];
  const sceneSeconds=segment.duration/speed;
  if(!Number.isFinite(sceneSeconds)||sceneSeconds<0.2||sceneSeconds>20)throw Error("scene_timing_invalid");
  const normalized=path.join(dir,"norm-"+variant+"-"+i+".mp4");
  const scale=(sceneSeconds/5).toFixed(6);
  const vf="scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,"+
   "setpts=(PTS-STARTPTS)*"+scale+",fps=24,format=yuv420p,tpad=stop_mode=clone:stop_duration=12";
  await shell("ffmpeg",["-hide_banner","-loglevel","error","-y","-i",clips[i],
   "-vf",vf,"-t",sceneSeconds.toFixed(4),"-an","-c:v","libx264",
   "-preset","veryfast","-crf","26","-movflags","+faststart",normalized],240000);
  clipPaths.push(normalized);
 }
 await writeFile(concat,clipPaths.map(file=>"file '"+file.replace(/'/g,"")+"'").join("\n")+"\n");
 await shell("ffmpeg",["-hide_banner","-loglevel","error","-y",
  "-safe","0","-f","concat","-i",concat,
  "-c","copy","-movflags","+faststart",raw],240000);
 let vf=null;
 if(job.subtitles&&Array.isArray(timing.cues)&&timing.cues.length){
  const subs=path.join(dir,"subtitles-"+variant+".srt");
  const lines=timing.cues.map((cue,index)=>
   String(index+1)+"\n"+timecode(cue.start/speed)+" --> "+
    timecode(Math.max(cue.start/speed+.08,cue.end/speed))+"\n"+
    String(cue.text).replace(/[\r\n]/g," ")+"\n\n").join("");
  await writeFile(subs,lines);
  vf="subtitles="+subs+
   ":force_style='FontName=DejaVu Sans,FontSize=24,Alignment=2,MarginV=80,Outline=2,PrimaryColour=&H00FFFFFF'";
 }
 const args=["-hide_banner","-loglevel","error","-y","-i",raw];
 if(narrationFile)args.push("-i",narrationFile);
 if(vf)args.push("-vf",vf);
 args.push("-c:v",vf?"libx264":"copy");
 if(vf)args.push("-preset","veryfast","-crf","26");
 if(narrationFile){
  args.push("-map","0:v:0","-map","1:a:0","-af","atempo="+speed.toFixed(5),
   "-c:a","aac","-b:a","128k");
 }else args.push("-an");
 args.push("-t",String(job.seconds),"-movflags","+faststart",final);
 await shell("ffmpeg",args,300000);
 const output=await stat(final);
 if(output.size<20000||output.size>150*1024*1024)throw Error("render_file_invalid");
 return final;
}
async function processJob(job){
 if(!Array.isArray(job.scenes)||job.scenes.length!==job.seconds/5||
  !STYLE[job.style]||!LANGUAGES[job.language]||job.credits_settled||
  !["turbo","high"].includes(job.quality_mode))throw Error("studio_job_invalid");
 const dir=await mkdtemp(path.join(tmpdir(),"vmv-studio-"));
 const heartbeat=setInterval(()=>{void keepAlive(job).catch(err=>log("heartbeat_failed",{id:job.id,reason:String(err.message).slice(0,50)}));},60000);
 try{
  const scenes=job.scenes.map(s=>({...s})),n=scenes.length,prefix=job.owner_id+"/"+job.id+"/";
  if(job.status==="generating_images"){
   for(let i=0;i<n;i++){
    if(closing)throw Error("worker_stopping");
    if(typeof scenes[i].imagePath==="string"&&scenes[i].imagePath.startsWith(prefix)&&scenes[i].imagePath.endsWith(".jpg"))continue;
    const image=path.join(dir,"image-"+i+".jpg");
    let accepted=null;
    for(let attempt=0;attempt<2;attempt++){
     const buffer=await makeImage(job,scenes[i],null);
     if(await validateSceneImage(job,scenes[i],buffer)){accepted=buffer;break;}
     log("frame_rejected",{id:job.id,scene:i+1,attempt:attempt+1});
    }
    if(!accepted)throw Error("scene_visual_mismatch");
    await writeFile(image,accepted);
    await persistAsset(job,"image_"+i,image,"image/jpeg");
    scenes[i]={...scenes[i],imagePath:job.assets["image_"+i],approved:false};
    await patch(job,{scenes:scenes.map(s=>({...s})),phase:"Creando fotograma "+(i+1)+"/"+n,
     progress:5+Math.floor(25*(i+1)/n),eta_seconds:Math.max(30,(n-i-1)*35)});
   }
   await patch(job,{status:"awaiting_image_approval",phase:"Revisa tus imágenes",
    progress:30,eta_seconds:null,lease_token:null,lease_expires_at:null});
   log("images_awaiting_approval",{id:job.id,count:n});
   return;
  }
  if(job.status!=="animating")throw Error("studio_job_not_claimed");
  if(scenes.some(s=>s.approved!==true||typeof s.imagePath!=="string"||
    !s.imagePath.startsWith(prefix)||!s.imagePath.endsWith(".jpg")))throw Error("studio_images_not_approved");
  await verifyScriptLanguage(job,scenes);
  const variant=job.quality_mode,clips=[];
  for(let i=0;i<n;i++){
   if(closing)throw Error("worker_stopping");
   const key="clip_"+variant+"_"+i,clip=path.join(dir,key+".mp4");
   if(!await restoreAsset(job,key,clip)){
    const taskKey="task_"+variant+"_"+i;
    let task=job.assets?.[taskKey];
    if(!task){
     task=await startMotionClip({db,bucket:WORK,imagePath:scenes[i].imagePath,
      style:STYLE[job.style],scene:scenes[i],variant});
     await patch(job,{assets:{...job.assets,[taskKey]:task}});
    }
    const url=await waitMotionClip(task,variant,()=>closing);
    const content=await bytes(await request(url,{},65000),60*1024*1024);
    await writeFile(clip,content);
    await persistAsset(job,key,clip,"video/mp4");
   }
   clips.push(clip);
   await patch(job,{status:"animating",phase:"Animando escena "+(i+1)+"/"+n,
    progress:30+Math.floor(55*(i+1)/n),eta_seconds:Math.max(45,(n-i-1)*90+75)});
  }
  await patch(job,{status:"voice",phase:"Generando narración",progress:88,eta_seconds:60});
  const narration=path.join(dir,"narration.mp3");
  let timing=speechTimeline(scenes,job.seconds),alignment=null;
  if(!await restoreAsset(job,"voice_continuous",narration)){
   alignment=await generateContinuousSpeech(job,scenes,narration);
   await persistAsset(job,"voice_continuous",narration,"audio/mpeg");
  }
  const duration=await probe(narration);
  if(duration/job.seconds<0.78||duration/job.seconds>1.25)throw Error("voice_length_requires_script_revision");
  if(alignment){
   timing=speechTimeline(scenes,duration,alignment);
   await patch(job,{assets:{...job.assets,voice_timeline:timing}});
  }else if(job.assets?.voice_timeline?.segments?.length===n)timing=job.assets.voice_timeline;
  else{
   timing=speechTimeline(scenes,duration);
   await patch(job,{assets:{...job.assets,voice_timeline:timing}});
  }
  await verifyAudioLanguage(job,[narration],dir);
  await patch(job,{status:"assembling",phase:"Uniendo clips y sincronizando voz",
   progress:94,eta_seconds:60});
  const final=await assemble(job,dir,clips,narration,timing,variant);
  if(Math.abs((await probe(final))-job.seconds)>1.7)throw Error("studio_duration_mismatch");
  const output=prefix+"final.mp4";
  await upload(FINAL,output,final,"video/mp4");
  await patch(job,{status:"verifying",phase:"Guardando video en tu historial",
   progress:99,eta_seconds:15,output_path:output});
  const finished=await db.rpc("vmv_studio_finish",{
   p_id:job.id,p_token:job.lease_token,p_success:true,p_output:output,p_failure:null
  });
  if(finished.error||finished.data!==true)throw Error("studio_credit_finalize_failed");
  log("video_completed",{id:job.id,scenes:n,seconds:job.seconds,quality:variant});
 }finally{
  clearInterval(heartbeat);
  await rm(dir,{recursive:true,force:true});
 }
}
async function claim(){
 const token=randomUUID();
 const {data,error}=await db.rpc("vmv_studio_claim",{p_token:token});
 if(error)throw Error("worker_claim_unavailable");
 return Array.isArray(data)?data[0]||null:null;
}
async function loop(){
 log("service_started",{configured:!STOP(),enabled:process.env.VMV_STUDIO_WORKER_ENABLED==="true",missing:missingConfig()});
 while(!closing){
  if(STOP()){await sleep(15000);continue;}
  try{
   const job=await claim();
   if(!job){await sleep(6000);continue;}
   active=true;
   try{await processJob(job);}
   catch(err){
    const code=String(err instanceof Error?err.message:"unknown").split(/\s/)[0].slice(0,100);
    log("render_failed",{job:job.id,code});
    if(!closing){
     const result=await db.rpc("vmv_studio_finish",{p_id:job.id,p_token:job.lease_token,
      p_success:false,p_output:null,p_failure:code});
     if(result.error)log("credit_release_error",{id:job.id,code:result.error.code});
    }
   }finally{active=false;}
  }catch(err){log("worker_loop_error",{code:err instanceof Error?err.message:"unknown"});await sleep(12000);}
 }
 log("service_stopped",{active});
}
void loop();
