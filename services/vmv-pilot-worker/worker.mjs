import {createClient} from "@supabase/supabase-js";
import {createServer} from "node:http";
import {mkdtemp,readFile,writeFile,stat,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {startMotionClip,waitMotionClip} from "./motion-engine.mjs";
import {speechTimeline} from "./speech-timeline.mjs";

const required=["OPENAI_API_KEY","AI_GATEWAY_API_KEY","VMV_PILOT_OWNER_ID"];
const supabaseUrl=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!supabaseUrl||!supabaseSecret)throw Error("Missing Supabase worker configuration");
for(const key of required)if(!process.env[key]?.trim())throw Error("Missing configuration: "+key);
const db=createClient(supabaseUrl,supabaseSecret,{auth:{persistSession:false,autoRefreshToken:false}});
const WORK="vmv-pilot-working",FINAL="vmv-pilot-renders";
const OPENAI="https://api.openai.com/v1";
const STYLE={
 stickman:"STRICT colorful flat 2D STICKMAN CARTOON. Animals are recognizable as expressive stick-animals with big eyes, bold outlines and articulated limbs. Cars, roads and backgrounds are vividly colored. NEVER photorealistic characters.",
 realistic:"STRICT photorealism, real physics and natural light. No cartoons or illustration.",
 cinematic:"STRICT high-end cinematic live-action film, realistic light, warm grading and depth of field. No cartoons.",
 animated:"STRICT hand-drawn flat colorful 2D animated cartoon, consistent line weight, characters and palette. No live action or 3D.",
 product:"STRICT polished photorealistic product advertisement with studio lights and physically realistic materials. No cartoon."
};
const LANGUAGES={es:"Spanish",en:"English",pt:"Portuguese",fr:"French",de:"German",it:"Italian"};
const STOP=()=>process.env.VMV_PILOT_WORKER_ENABLED!=="true";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const log=(event,details={})=>console.log("[vmv-pilot-worker]",event,JSON.stringify(details));
let closing=false,active=false;
process.on("SIGTERM",()=>{closing=true;});
process.on("SIGINT",()=>{closing=true;});
createServer((req,res)=>{
 const ok=req.url==="/healthz";
 res.writeHead(ok?200:404,{"Content-Type":"text/plain","Cache-Control":"no-store"});
 res.end(ok?"ok":"not found");
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
 const {data,error}=await db.from("vmv_pilot_render_jobs").update({...changes,updated_at:new Date().toISOString()})
  .eq("id",job.id).eq("owner_id",job.owner_id).eq("lease_token",job.lease_token)
  .select("id").maybeSingle();
 if(error||!data)throw Error("job_progress_unavailable");
 Object.assign(job,changes);
}
async function keepAlive(job){
 const {data,error}=await db.from("vmv_pilot_render_jobs")
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
 }else if(job.voice_provider==="openai"&&["alloy","nova","echo"].includes(job.voice_id)){
  const response=await request(OPENAI+"/audio/speech",{
   method:"POST",headers:{...auth("OPENAI_API_KEY"),"Content-Type":"application/json"},
   body:JSON.stringify({model:"tts-1",voice:job.voice_id,input:text,response_format:"mp3",speed:1.0})
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
const timecode=seconds=>{
 const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60);
 const s=Math.floor(seconds%60),ms=Math.floor((seconds%1)*1000);
 return [h,m,s].map(n=>String(n).padStart(2,"0")).join(":")+","+String(ms).padStart(3,"0");
};
async function assemble(job,dir,clips,voices,variant){
 if(variant!=="turbo"&&variant!=="high")throw Error("invalid_quality_variant");
 const concat=path.join(dir,"concat-"+variant+".txt"),raw=path.join(dir,"raw-"+variant+".mp4"),final=path.join(dir,"final-"+variant+".mp4");
 const clipPaths=[];
 for(let i=0;i<clips.length;i++){
  const normalized=path.join(dir,"norm-"+variant+"-"+i+".mp4");
  await shell("ffmpeg",["-hide_banner","-loglevel","error","-y","-i",clips[i],
   "-vf","scale=540:960:force_original_aspect_ratio=increase,crop=540:960,fps=24,format=yuv420p,tpad=stop_mode=clone:stop_duration=5",
   "-t","5","-an","-c:v","libx264","-preset","veryfast","-crf","27","-movflags","+faststart",normalized]);
  clipPaths.push(normalized);
 }
 await writeFile(concat,clipPaths.map(file=>"file '"+file.replace(/'/g,"")+"'").join("\n")+"\n");
 await shell("ffmpeg",["-hide_banner","-loglevel","error","-y","-safe","0","-f","concat","-i",concat,
  "-c","copy","-movflags","+faststart",raw]);
 let audio=null;
 if(job.narration){
  const normalizedVoices=[];
  for(let i=0;i<voices.length;i++){
   const len=await probe(voices[i]),fit=Math.max(1,len/4.85);
   if(fit>1.85)throw Error("voice_too_long_for_five_seconds");
   const output=path.join(dir,"voice-"+i+".m4a");
   await shell("ffmpeg",["-hide_banner","-loglevel","error","-y","-i",voices[i],
    "-af","atempo="+fit.toFixed(4)+",apad,atrim=0:5,asetpts=PTS-STARTPTS",
    "-ac","2","-ar","48000","-c:a","aac","-b:a","128k",output]);
   normalizedVoices.push(output);
  }
  const voicesTxt=path.join(dir,"voices.txt");
  await writeFile(voicesTxt,normalizedVoices.map(f=>"file '"+f.replace(/'/g,"")+"'").join("\n")+"\n");
  audio=path.join(dir,"audio.m4a");
  await shell("ffmpeg",["-hide_banner","-loglevel","error","-y","-safe","0","-f","concat","-i",voicesTxt,
   "-c","copy",audio]);
 }
 let vf=null;
 if(job.subtitles){
  const subtitleFile=path.join(dir,"subtitles.srt");let srt="",index=1;
  for(let i=0;i<job.scenes.length;i++){
   const scene=job.scenes[i],words=scene.speech.split(/\s+/).filter(Boolean);
   const parts=[];for(let j=0;j<words.length;j+=4)parts.push(words.slice(j,j+4).join(" "));
   for(let j=0;j<parts.length;j++){
    const from=i*5+j*5/parts.length,to=i*5+(j+1)*5/parts.length;
    srt+=index+++"\n"+timecode(from)+" --> "+timecode(to)+"\n"+parts[j]+"\n\n";
   }
  }
  await writeFile(subtitleFile,srt);
  vf="subtitles="+subtitleFile+":force_style='FontName=DejaVu Sans,FontSize=25,Alignment=2,MarginV=80,Outline=2,PrimaryColour=&H00FFFFFF'";
 }
 const args=["-hide_banner","-loglevel","error","-y","-i",raw];
 if(audio)args.push("-i",audio);
 if(vf)args.push("-vf",vf);
 args.push("-c:v",vf?"libx264":"copy");
 if(vf)args.push("-preset","veryfast","-crf","27");
 if(audio)args.push("-c:a","aac","-b:a","128k","-map","0:v:0","-map","1:a:0");
 else args.push("-an");
 args.push("-t",String(job.seconds),"-movflags","+faststart",final);
 await shell("ffmpeg",args,300000);
 const output=await stat(final);
 if(output.size<20000||output.size>100*1024*1024)throw Error("render_file_invalid");
 return final;
}
async function processJob(job){
 if(job.owner_id!==process.env.VMV_PILOT_OWNER_ID||job.credit_approved!==true)
  throw Error("render_owner_or_consent_invalid");
 if(![15,30,60].includes(job.seconds)||!STYLE[job.style])throw Error("render_options_invalid");
 const dir=await mkdtemp(path.join(tmpdir(),"vmv-pilot-"));
 const heartbeat=setInterval(()=>{void keepAlive(job);},60000);
 try{
  if(!Array.isArray(job.scenes)||job.scenes.length!==job.seconds/5){
   await patch(job,{status:"planning",phase:"Guion",progress:2});
   await aiScript(job);
  }else{
   // Also validate a resumed script before using more provider credits.
   await verifyScriptLanguage(job,job.scenes);
  }
  const scenes=job.scenes,prefix=job.owner_id+"/"+job.id;
  if(!LANGUAGES[job.language])throw Error("video_language_invalid");
  let narrationFile=null,timing=speechTimeline(scenes,job.seconds);
  if(job.narration){
   if(job.voice_provider==="none"||!job.voice_id)throw Error("voice_invalid");
   narrationFile=path.join(dir,"narration.mp3");
   let alignment=null;
   if(!await restoreAsset(job,"voice_continuous",narrationFile)){
    await patch(job,{status:"working",phase:"Narración continua",progress:8});
    alignment=await generateContinuousSpeech(job,scenes,narrationFile);
    await persistAsset(job,"voice_continuous",narrationFile,"audio/mpeg");
   }
   const duration=await probe(narrationFile);
   const tempo=duration/job.seconds;
   if(tempo<0.78||tempo>1.25)throw Error("voice_length_requires_script_revision");
   if(alignment){
    timing=speechTimeline(scenes,duration,alignment);
    await patch(job,{assets:{...job.assets,voice_timeline:timing}});
   }else if(job.assets?.voice_timeline?.segments?.length===scenes.length){
    timing=job.assets.voice_timeline;
   }else{
    timing=speechTimeline(scenes,duration);
    await patch(job,{assets:{...job.assets,voice_timeline:timing}});
   }
   await verifyAudioLanguage(job,[narrationFile],dir);
   await patch(job,{status:"working",phase:"Narración verificada",progress:14});
  }else if(job.voice_provider!=="none")throw Error("voice_invalid");
  const variants=job.quality_mode==="compare"?["turbo","high"]:
   job.quality_mode==="turbo"?["turbo"]:job.quality_mode==="high"?["high"]:null;
  if(!variants)throw Error("quality_mode_invalid");
  const images=[],clipsByVariant=Object.fromEntries(variants.map(v=>[v,[]]));
  // One common image per scene, identical for both video models.
  let reference=null;
  for(let i=0;i<scenes.length;i++){
   if(closing)throw Error("worker_stopping");
   const image=path.join(dir,"image-"+i+".jpg");
   if(!await restoreAsset(job,"image_"+i,image)){
    const buf=await makeImage(job,scenes[i],
     i>0&&["stickman","animated"].includes(job.style)?reference:null);
    await writeFile(image,buf);
    await persistAsset(job,"image_"+i,image,"image/jpeg");
   }
   if(i===0)reference=image;
   images.push(image);
   await patch(job,{status:"working",phase:"Imágenes "+(i+1)+"/"+scenes.length,
    progress:15+Math.floor(8*(i+1)/scenes.length)});
  }
  let completed=0;
  const total=variants.length*scenes.length;
  for(let i=0;i<scenes.length;i++){
   if(closing)throw Error("worker_stopping");
   const pending=[];
   // Submit BOTH models before waiting, so Seedance can animate in parallel.
   // Identical scene prompt and source JPEG; the only variable is model ID.
   for(const variant of variants){
    const key="clip_"+variant+"_"+i;
    const clip=path.join(dir,key+".mp4");
    if(await restoreAsset(job,key,clip)){
     clipsByVariant[variant].push(clip);
     completed++;
     continue;
    }
    const taskKey="task_"+variant+"_"+i;
    let task=job.assets?.[taskKey];
    if(!task){
     task=await startMotionClip({db,bucket:WORK,imagePath:job.assets?.["image_"+i],
       style:STYLE[job.style],scene:scenes[i],variant});
     await patch(job,{assets:{...job.assets,[taskKey]:task}});
    }
    pending.push({variant,key,clip,task});
   }
   // Both paid video tasks now run concurrently; no per-model regeneration
   // of prompts, source images, audio, captions or script.
   const settled=await Promise.allSettled(pending.map(item=>waitMotionClip(item.task,item.variant,()=>closing)));
   let firstError=null;
   for(let j=0;j<pending.length;j++){
    const item=pending[j],status=settled[j];
    if(status.status!=="fulfilled"){
     firstError=firstError||status.reason;
     continue;
    }
    try{
     const video=await bytes(await request(status.value,{},65000),60*1024*1024);
     await writeFile(item.clip,video);
     await persistAsset(job,item.key,item.clip,"video/mp4");
     clipsByVariant[item.variant].push(item.clip);
     completed++;
     await patch(job,{status:"working",
      phase:"Escena "+(i+1)+"/"+scenes.length+(variants.length>1?" · "+(item.variant==="turbo"?"Turbo":"Alta"):""),
      progress:23+Math.floor(65*completed/total)});
    }catch(e){firstError=firstError||e;}
   }
   if(firstError)throw firstError;
  }
  // Compose every version from the SAME narration and subtitle timeline.
  for(let i=0;i<variants.length;i++){
   const variant=variants[i],pathKey=prefix+"/"+variant+".mp4";
   if(job.outputs?.[variant]===pathKey)continue;
   await patch(job,{status:"assembling",phase:"Montaje "+(variant==="turbo"?"Turbo":"Alta"),
    progress:90+Math.floor(7*i/variants.length)});
   const final=await assemble(job,dir,clipsByVariant[variant],narrationFile,timing,variant);
   await upload(FINAL,pathKey,final,"video/mp4");
   await patch(job,{outputs:{...(job.outputs||{}),[variant]:pathKey},
    progress:90+Math.floor(7*(i+1)/variants.length)});
  }
  const preferred=job.preferred_model&&variants.includes(job.preferred_model)
   ?job.preferred_model:variants[0];
  await patch(job,{status:"completed",phase:"Listo",progress:100,
   output_path:prefix+"/"+preferred+".mp4",
   preferred_model:job.quality_mode==="compare"?null:preferred,
   finished_at:new Date().toISOString(),failure_code:null});
  log("render_completed",{job:job.id,seconds:job.seconds,quality:job.quality_mode,variants:variants.length});
 }finally{
  clearInterval(heartbeat);
  await rm(dir,{recursive:true,force:true});
 }
}
async function claim(){
 const token=randomUUID();
 const {data,error}=await db.rpc("vmv_pilot_render_claim",{p_token:token});
 if(error)throw Error("worker_claim_unavailable");
 return Array.isArray(data)?data[0]||null:null;
}
async function loop(){
 log("service_started",{configured:!STOP()});
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
     await db.from("vmv_pilot_render_jobs").update({
      status:"failed",phase:"Error",failure_code:code,lease_expires_at:null,updated_at:new Date().toISOString()
     }).eq("id",job.id).eq("lease_token",job.lease_token);
    }
   }finally{active=false;}
  }catch(err){log("worker_loop_error",{code:err instanceof Error?err.message:"unknown"});await sleep(12000);}
 }
 log("service_stopped",{active});
}
void loop();
