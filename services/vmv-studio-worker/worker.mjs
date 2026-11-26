import {createClient} from "@supabase/supabase-js";
import {createServer} from "node:http";
import {mkdtemp,readFile,writeFile,stat,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {startMotionClip,waitMotionClip} from "./motion-engine.mjs";
import {speechTimeline,silentTimeline,manualTimeline} from "./speech-timeline.mjs";
import {recordedVoiceRuntime} from "./voice-runtime.mjs";
import {prepareRevisionAssets} from "./revision-assets.mjs";
import {buildZoomMotion} from "./zoom-motion.mjs";
import {sceneVisualDirection,imageUsesCharacterReference,validVisualPlan} from "./visual-director.mjs";
import {planVisualIdentity,generateCharacterMaster,reviewVisualSequence} from "./visual-quality.mjs";

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
 const health=req.url==="/healthz",voiceReady=req.url==="/voice-readyz",semanticReady=req.url==="/semantic-readyz",singleReady=req.url==="/single-image-readyz",ready=req.url==="/readyz"||voiceReady||semanticReady||singleReady;
 if(health){res.writeHead(200,{"Content-Type":"text/plain","Cache-Control":"no-store"});res.end("ok");return;}
 if(!ready){res.writeHead(404,{"Content-Type":"text/plain","Cache-Control":"no-store"});res.end("not found");return;}
 let connected=false;
 if(!STOP()){
  try{
   // A ready worker must have the database job queue available, not merely
   // an environment flag. A read-only HEAD query never claims a job.
   const {error}=await db.from("vmv_studio_jobs").select("id",{head:true}).limit(1);
   connected=!error;
   if(connected&&singleReady){const result=await db.rpc("vmv_studio_single_image_schema_ready");connected=!result.error&&result.data===true;}
  }catch{connected=false;}
 }
 const enabled=!STOP()&&connected&&(!voiceReady||Boolean(process.env.ELEVENLABS_API_KEY?.trim()));
 res.writeHead(enabled?200:503,{"Content-Type":"text/plain","Cache-Control":"no-store"});
 res.end(enabled?(singleReady?"single-image-v1":semanticReady?"semantic-v2":"ready"):"standby");
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
async function verifyScriptLanguage(job,scenes){
 if(!LANGUAGES[job.language])throw Error("video_language_invalid");
 // Scene excerpts are NOT independent sentences: evaluate the whole narration.
 const narration=scenes.map(x=>x.speech.trim()).join(" ");
 const response=await request(OPENAI+"/chat/completions",{
  method:"POST",headers:{...auth("OPENAI_API_KEY"),"Content-Type":"application/json"},
  body:JSON.stringify({model:"gpt-4.1-mini",temperature:0,max_tokens:120,
   response_format:{type:"json_object"},
   messages:[{role:"system",content:"Identify the dominant spoken language of this ONE continuous voiceover. Ignore brand names and occasional borrowed terms. Return only JSON {language: ISO-639-1 code}. Do not translate."},
    {role:"user",content:narration}]})
 },45000);
 if(!response.ok)throw Error("script_language_check_unavailable");
 const data=await response.json();
 let parsed;try{parsed=JSON.parse(data.choices[0].message.content);}catch{
  throw Error("script_language_unverified");
 }
 if(parsed.language!==job.language)throw Error("script_language_mismatch");
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
   body:JSON.stringify({model:"gpt-4o-mini-tts",voice:job.voice_id,input:text,response_format:"mp3",speed:1.0,
    instructions:"Narrate as one seamless, expressive, human-sounding story in "+LANGUAGES[job.language]+". Speak at a comfortable conversational pace with natural phrasing and emphasis. Never insert pauses at five-second visual scene boundaries; the text is one continuous narration."})
  },90000);
  await writeFile(file,await bytes(response,1500000));
 }else throw Error("voice_invalid");
}
async function transcribeWordTimings(job,file){
 const form=new FormData();
 form.append("file",new Blob([await readFile(file)],{type:"audio/mpeg"}),"narration.mp3");
 form.append("model","whisper-1");
 form.append("response_format","verbose_json");
 form.append("timestamp_granularities[]","word");
 form.append("language",job.language);
 const response=await request(OPENAI+"/audio/transcriptions",{
  method:"POST",headers:auth("OPENAI_API_KEY"),body:form
 },90000);
 if(!response.ok)throw Error("voice_alignment_unavailable_"+response.status);
 const data=await response.json();
 if(!Array.isArray(data.words)||!data.words.length)throw Error("voice_alignment_unavailable");
 return {words:data.words};
}
async function generateContinuousSpeech(job,scenes,file){
 const text=scenes.map(scene=>scene.speech.trim()).join(" ");
 if(job.voice_provider!=="elevenlabs"){
  await generateSpeech(job,text,file);
  return await transcribeWordTimings(job,file);
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
async function makeImage(job,scene,reference,index=0,total=1,correction=""){
 const director=sceneVisualDirection(scene,index,total,correction);
 const prompt=[
  "Portrait keyframe for a coherent multi-shot original video. The provider canvas is 1024x1536 (2:3); protect a central 9:16 safe crop, keeping all important faces, bodies, interactions and objects within the central 84% of the image width.",
  "LOCKED STYLE: "+STYLE[job.style],
  director.direction,
  "The exact story moment: "+scene.speech,
  "Scene-specific composition and visible actions: "+scene.imagePrompt,
  reference?
   "The supplied MASTER identity sheet controls ONLY recurring character proportions, face, colors and clothing. " +
   "IGNORE its neutral background, camera, pose, expression and arrangement. DO NOT recreate the identity sheet; " +
   "illustrate this entirely different scene according to the script and director shot.":
   "This shot is independently composed. DO NOT add a narrator's face unless the scene requires it.",
  "No writing, captions, subtitles, text, logos or watermarks."
 ].join(" ");
 let response;
 if(reference){
  const form=new FormData();
  form.set("model","gpt-image-1-mini");form.set("size","1024x1536");
  form.set("quality",job.quality_mode==="high"?"high":"medium");form.set("output_format","jpeg");
  form.set("prompt",prompt.slice(0,3500));
  form.append("image",new Blob([await readFile(reference)],{type:"image/jpeg"}),"reference.jpg");
  response=await request(OPENAI+"/images/edits",{method:"POST",headers:auth("OPENAI_API_KEY"),body:form},180000);
 }else{
  response=await request(OPENAI+"/images/generations",{
   method:"POST",headers:{...auth("OPENAI_API_KEY"),"Content-Type":"application/json"},
   body:JSON.stringify({model:"gpt-image-1-mini",size:"1024x1536",quality:job.quality_mode==="high"?"high":"medium",
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
 if(!["turbo","high"].includes(variant)||clips.length!==job.scenes.length)
  throw Error("invalid_montage_request");
 const concat=path.join(dir,"concat-"+variant+".txt"),
  raw=path.join(dir,"raw-"+variant+".mp4"),
  final=path.join(dir,"final-"+variant+".mp4");
 const originalDuration=narrationFile?
  recordedVoiceRuntime(job.seconds,Number(timing?.duration),
   (Number(job.resume_count)>0||Boolean(job.assets?.revision_source_id))&&
    Boolean(job.assets?.voice_continuous)):
  job.seconds;
 const segments=timing?.segments;
 if(!Array.isArray(segments)||segments.length!==clips.length)throw Error("scene_timing_invalid");
 const clipPaths=[];
 for(let i=0;i<clips.length;i++){
  const segment=segments[i];
  const sceneSeconds=segment.duration;
  if(!Number.isFinite(sceneSeconds)||sceneSeconds<0.2||sceneSeconds>20)throw Error("scene_timing_invalid");
  const normalized=path.join(dir,"norm-"+variant+"-"+i+".mp4");
  const sourceSeconds=await probe(clips[i]);
  const scale=(sceneSeconds/sourceSeconds).toFixed(6);
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
   String(index+1)+"\n"+timecode(cue.start)+" --> "+
    timecode(Math.max(cue.start+.08,cue.end))+"\n"+
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
  args.push("-map","0:v:0","-map","1:a:0","-c:a","aac","-b:a","128k");
 }else args.push("-an");
 args.push("-t",String(originalDuration),"-movflags","+faststart",final);
 await shell("ffmpeg",args,300000);
 const output=await stat(final);
 if(output.size<20000||output.size>150*1024*1024)throw Error("render_file_invalid");
 return final;
}
async function processJob(job){
 const single=job.assets?.single_image===true&&job.assets?.manual_editor===true&&job.seconds===5&&job.scenes?.length===1&&job.scenes[0]?.motion==="animate";
 if(!Array.isArray(job.scenes)||(!single&&job.scenes.length<3)||job.scenes.length>36||
  !STYLE[job.style]||!LANGUAGES[job.language]||job.credits_settled||
  !["turbo","high"].includes(job.quality_mode))throw Error("studio_job_invalid");
 const dir=await mkdtemp(path.join(tmpdir(),"vmv-studio-"));
 const heartbeat=setInterval(()=>{void keepAlive(job).catch(err=>log("heartbeat_failed",{id:job.id,reason:String(err.message).slice(0,50)}));},60000);
 try{
  const scenes=job.scenes.map(s=>({...s})),n=scenes.length,prefix=job.owner_id+"/"+job.id+"/";
  if(job.status==="generating_images"&&job.assets?.revision_source_id){
   await prepareRevisionAssets({db,job,scenes,patch,bucket:WORK});
   log("single_scene_revision_assets_prepared",{id:job.id,
    source:job.assets.revision_source_id,changedScene:job.assets.revision_scene_index+1});
  }
  if(job.status==="generating_images"){
   // A neutral identity master is shared by ALL scenes. Never chain the full
   // previous scene as the next image reference: that repeated the same kitchen,
   // character pose and framing in every image.
   let visualPlan=job.assets?.visual_plan;
   if(!validVisualPlan(visualPlan,n)){
    try{
     visualPlan=await planVisualIdentity(job,request,OPENAI,process.env.OPENAI_API_KEY);
    }catch(e){
     visualPlan={identityNeeded:false,characterDescription:"",sceneReference:Array(n).fill(false)};
     log("visual_identity_fallback",{id:job.id,reason:String(e?.message||"unknown").slice(0,70)});
    }
    await patch(job,{assets:{...job.assets,visual_plan:visualPlan}});
   }
   let master=null;
   if(visualPlan.identityNeeded){
    master=path.join(dir,"character-master.jpg");
    try{
     if(!await restoreAsset(job,"character_master",master)){
      const design=await generateCharacterMaster(visualPlan,job,request,OPENAI,process.env.OPENAI_API_KEY);
      if(!design)throw Error("character_master_invalid");
      await writeFile(master,design);
      await persistAsset(job,"character_master",master,"image/jpeg");
     }
    }catch(e){
     // A master is a quality improvement, not a reason to lose a paid job.
     master=null;
     log("character_master_unavailable",{id:job.id,reason:String(e?.message||"unknown").slice(0,60)});
    }
   }
   const referenceFor=index=>master&&imageUsesCharacterReference(scenes[index],visualPlan.sceneReference[index])?master:null;
   for(let i=0;i<n;i++){
    if(closing)throw Error("worker_stopping");
    const image=path.join(dir,"image-"+i+".jpg");
    if(typeof scenes[i].imagePath==="string"&&scenes[i].imagePath.startsWith(prefix)&&scenes[i].imagePath.endsWith(".jpg")){
     // Reload only when the final gallery audit needs the actual image.
     continue;
    }
    const reference=referenceFor(i);
    let accepted=null,lastCandidate=null,visuallyValid=false;
    for(let attempt=0;attempt<2;attempt++){
     const buffer=await makeImage(job,scenes[i],reference,i,n,
      attempt?"Recompose with a stronger narrative action, different camera angle and clear visual subject.":String(scenes[i].visualCorrection||"").slice(0,420));
     lastCandidate=buffer;
     if(await validateSceneImage(job,scenes[i],buffer)){accepted=buffer;visuallyValid=true;break;}
     log("frame_rejected",{id:job.id,scene:i+1,attempt:attempt+1});
    }
    if(!accepted){
     accepted=lastCandidate;
     log("frame_requires_manual_review",{id:job.id,scene:i+1});
    }
    await writeFile(image,accepted);
    await persistAsset(job,"image_"+i,image,"image/jpeg");
    scenes[i]={...scenes[i],imagePath:job.assets["image_"+i],
     approved:false,requiresReview:Boolean(job.assets?.revision_source_id)||!visuallyValid};
    await patch(job,{scenes:scenes.map(s=>({...s})),phase:"Creando fotograma "+(i+1)+"/"+n,
     progress:5+Math.floor(20*(i+1)/n),eta_seconds:Math.max(30,(n-i-1)*35)});
   }
   // Contact sheets expose actual repeated shot composition that independent
   // prompt checks cannot see. Review in overlapping groups of up to 8 frames.
   // At most two fully automatic image replacements per project, never billed
   // separately to the creator. All original images remain recoverable.
   if(!job.assets?.visual_gallery_audited){
    const files=[];
    for(let i=0;i<n;i++){
     const local=path.join(dir,"image-"+i+".jpg");
     try{await stat(local);}catch{
      const remote=scenes[i].imagePath||job.assets?.["image_"+i];
      if(remote)await download(WORK,remote,local);
     }
     files.push(local);
    }
    const feedback=new Map();
    let auditCompleted=true;
    for(let offset=0;offset<n;offset+=6){
     const groupFiles=files.slice(offset,Math.min(n,offset+8));
     if(groupFiles.length<2)break;
     try{
      const fixes=await reviewVisualSequence(job,scenes.slice(offset,offset+groupFiles.length),
       groupFiles,offset,dir,request,OPENAI,process.env.OPENAI_API_KEY,shell);
      for(const item of fixes)if(!feedback.has(item.index))feedback.set(item.index,item);
     }catch(e){
      auditCompleted=false;
      log("visual_gallery_audit_unavailable",{id:job.id,segment:offset,
       reason:String(e?.message||"unknown").slice(0,70)});
     }
     if(offset+8>=n)break;
    }
    const flagged=[...feedback.values()].sort((a,b)=>a.index-b.index);
    let corrected=0;
    for(const item of flagged){
     const i=item.index;
     // Do not replace already approved or previously reviewed images.
     if(i<0||i>=n||scenes[i].approved||corrected>=2){
      if(i>=0&&i<n&&!scenes[i].approved)scenes[i].requiresReview=true;
      continue;
     }
     try{
      const replacement=await makeImage(job,scenes[i],referenceFor(i),i,n,item.direction);
      const sound=await validateSceneImage(job,scenes[i],replacement);
      if(sound){
       await writeFile(files[i],replacement);
       await persistAsset(job,"image_"+i,files[i],"image/jpeg");
       scenes[i]={...scenes[i],imagePath:job.assets["image_"+i],approved:false,requiresReview:false,visualCorrection:item.direction.slice(0,420)};
       corrected++;
       log("visual_frame_recomposed",{id:job.id,scene:i+1,problem:item.problem});
      }else scenes[i].requiresReview=true;
     }catch(e){
      scenes[i].requiresReview=true;
      log("visual_frame_recompose_failed",{id:job.id,scene:i+1,
       reason:String(e?.message||"unknown").slice(0,70)});
     }
    }
    await patch(job,{assets:{...job.assets,visual_gallery_audited:true,
      visual_gallery_report:{checked:auditCompleted,flagged:flagged.length,corrected}},
     scenes:scenes.map(s=>({...s})),phase:"Revisión visual finalizada",progress:30});
   }
   await patch(job,{status:"awaiting_image_approval",phase:"Revisa tus imágenes",
    progress:30,eta_seconds:null,lease_token:null,lease_expires_at:null});
   log("images_awaiting_approval",{id:job.id,count:n});
   return;
  }
  if(job.status!=="animating")throw Error("studio_job_not_claimed");
  if(scenes.some(s=>s.approved!==true||typeof s.imagePath!=="string"||
    !s.imagePath.startsWith(prefix)||!s.imagePath.endsWith(".jpg")))throw Error("studio_images_not_approved");
  // Manual image projects contain instructions, not spoken words; checking
  // their dominant text language would be irrelevant and could block montage.
  if(job.assets?.manual_editor!==true)await verifyScriptLanguage(job,scenes);
  // A silent project is a complete video with NO audio track. Its optional
  // on-screen captions follow the visual windows rather than speech timestamps.
  const silent=job.voice_provider==="none"&&job.voice_id==="none";
  const narration=silent?null:path.join(dir,"narration.mp3");
  let duration=job.seconds;
  let timing=silent?(job.assets?.manual_editor===true?
   manualTimeline(scenes,duration):silentTimeline(scenes,duration,job.subtitles)):
   job.assets?.voice_timeline;
  if(!silent){
   // Voice preflight happens BEFORE spending on animated clips. The scenes are
   // independent visual windows; spoken grammar is never fitted to their edges.
   await patch(job,{status:"animating",phase:"Preparando narración continua",progress:32,eta_seconds:100});
   let alignment=null;
   if(!await restoreAsset(job,"voice_continuous",narration)){
    alignment=await generateContinuousSpeech(job,scenes,narration);
    await persistAsset(job,"voice_continuous",narration,"audio/mpeg");
   }
   const measuredVoiceSeconds=await probe(narration);
   const resumedExistingVoice=(Number(job.resume_count)>0||
    Boolean(job.assets?.revision_source_id))&&Boolean(job.assets?.voice_continuous);
   log("voice_duration_measured",{id:job.id,targetSeconds:job.seconds,
    actualSeconds:Number(measuredVoiceSeconds.toFixed(2)),recovery:resumedExistingVoice});
   duration=recordedVoiceRuntime(job.seconds,measuredVoiceSeconds,resumedExistingVoice);
   if(resumedExistingVoice&&duration>job.seconds*1.5)
    log("approved_voice_extended_on_resume",{id:job.id,
     targetSeconds:job.seconds,actualSeconds:Number(duration.toFixed(2))});
   if(Math.abs(duration-job.seconds)>2){
    log("voice_runtime_adjusted",{id:job.id,
     targetSeconds:job.seconds,actualSeconds:Number(duration.toFixed(2))});
   }
   if(!alignment&&timing?.segments?.length===n&&
    typeof timing.duration==="number"&&Math.abs(timing.duration-duration)<.25&&
    ["whisper_words","elevenlabs_characters"].includes(timing.alignmentSource)&&
    timing.alignmentVersion===2&&
    Array.isArray(timing.cues)&&timing.cues.length){
    // A previous attempt already saved verified timestamps for this recording.
   }else{
    if(!alignment)alignment=await transcribeWordTimings(job,narration);
    timing={...speechTimeline(scenes,duration,alignment),alignmentVersion:2};
    await patch(job,{assets:{...job.assets,voice_timeline:timing}});
   }
   await verifyAudioLanguage(job,[narration],dir);
  }
  if(!Array.isArray(timing?.segments)||timing.segments.length!==n||
   timing.segments.some(segment=>!Number.isFinite(segment.duration)||segment.duration<.5||segment.duration>20))
   throw Error("voice_scene_alignment_incomplete");
  const variant=job.quality_mode,clips=[];
  for(let i=0;i<n;i++){
   if(closing)throw Error("worker_stopping");
   const key="clip_"+variant+"_"+i,clip=path.join(dir,key+".mp4");
   if(!await restoreAsset(job,key,clip)){
    if(scenes[i].motion==="zoom"){
     const image=path.join(dir,"zoom-"+i+".jpg");
     await download(WORK,scenes[i].imagePath,image);
     const {frames,vf}=buildZoomMotion(timing.segments[i].duration);
     await shell("ffmpeg",["-hide_banner","-loglevel","error","-y","-i",image,
      "-vf",vf,"-frames:v",String(frames),"-an","-c:v","libx264","-preset","veryfast",
      "-crf","25","-movflags","+faststart",clip],240000);
     await persistAsset(job,key,clip,"video/mp4");
    }else if(scenes[i].motion==="still"&&job.assets?.manual_editor===true){
     const image=path.join(dir,"still-"+i+".jpg");
     await download(WORK,scenes[i].imagePath,image);
     await shell("ffmpeg",["-hide_banner","-loglevel","error","-y",
      "-loop","1","-framerate","24","-i",image,
      "-vf","scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,format=yuv420p",
      "-t",String(timing.segments[i].duration),"-an",
      "-c:v","libx264","-preset","veryfast","-crf","25",
      "-movflags","+faststart",clip],240000);
     await persistAsset(job,key,clip,"video/mp4");
    }else{
    const taskKey="task_"+variant+"_"+i;
    let task=job.assets?.[taskKey];
    if(!task){
     task=await startMotionClip({db,bucket:WORK,imagePath:scenes[i].imagePath,
      style:job.assets?.manual_editor===true?
       "Keep the exact original photographic or illustrated style of the uploaded picture. Preserve characters, identities, colors and scene details; animate only what the user's prompt explicitly asks.":
       STYLE[job.style],scene:scenes[i],variant});
     await patch(job,{assets:{...job.assets,[taskKey]:task}});
    }
    const url=await waitMotionClip(task,variant,()=>closing);
    const content=await bytes(await request(url,{},65000),60*1024*1024);
    await writeFile(clip,content);
    await persistAsset(job,key,clip,"video/mp4");
    }
   }
   clips.push(clip);
   await patch(job,{status:"animating",phase:"Animando escena "+(i+1)+"/"+n,
    progress:30+Math.floor(55*(i+1)/n),eta_seconds:Math.max(45,(n-i-1)*90+75)});
  }
  await patch(job,{status:"assembling",phase:"Uniendo clips y sincronizando voz",
   progress:94,eta_seconds:60});
  const final=await assemble(job,dir,clips,narration,timing,variant);
  if(Math.abs((await probe(final))-duration)>1.2)throw Error("studio_duration_mismatch");
  const output=prefix+"final.mp4";
  await upload(FINAL,output,final,"video/mp4");
  await patch(job,{status:"verifying",phase:"Guardando video en tu historial",
   progress:99,eta_seconds:15,output_path:output});
  const finished=await db.rpc("vmv_studio_finish",{
   p_id:job.id,p_token:job.lease_token,p_success:true,p_output:output,p_failure:null
  });
  if(finished.error||finished.data!==true)throw Error("studio_credit_finalize_failed");
  log("video_completed",{id:job.id,scenes:n,targetSeconds:job.seconds,actualSeconds:Number(duration.toFixed(2)),quality:variant});
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
 log("service_started",{configured:!STOP(),enabled:process.env.VMV_STUDIO_WORKER_ENABLED==="true",missing:missingConfig(),elevenlabsReady:Boolean(process.env.ELEVENLABS_API_KEY?.trim())});
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
