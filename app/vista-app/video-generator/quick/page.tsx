"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {ArrowLeft,ArrowRight,BookOpen,CheckCircle2,Clapperboard,Download,Film,
 ImageIcon,LoaderCircle,Mic2,Play,RefreshCw,ShieldCheck,Sparkles,WandSparkles,
 Clock3,Smartphone,Monitor,VolumeX} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import css from "./page.module.css";

type Kind="promo"|"facts";
type Visual="sticks"|"stills";
type Scene={speech:string;imagePrompt:string;caption:string};
type Stage="setup"|"story"|"ready";
const styles:Record<Visual,string>={
 sticks:"Clean 2D minimalist stick-figure cartoon. White circular heads, small simple eyes, thin black arms and legs, thick black outlines, expressive faces, colorful flat vector-like backgrounds, bright fun educational animation style. Preserve a recurring hero: white round head, short messy black hair, small black eyes, blue shirt, black stick arms and legs. ",
 stills:"Cinematic original documentary still image, richly detailed digital painting, coherent color grading, dramatic storytelling, believable environments. "
};
function errorLabel(code:string,en:boolean){
 const messages:Record<string,[string,string]>={
  video_not_enabled_for_account:["Esta prueba aún no está habilitada en tu cuenta.","This test isn't enabled for this account."],
  storyboard_unavailable:["No se pudo preparar el guion. Intenta otra vez.","Storyboard is unavailable. Try again."],
  storyboard_retry:["Vuelve a crear las escenas.","Please retry the storyboard."],
  storyboard_daily_limit:["Se alcanzó el límite de guiones de prueba.","Storyboard testing limit reached."],
  image_daily_limit:["Límite de imágenes alcanzado.","Image limit reached."],
  image_provider_busy:["El generador de imágenes está ocupado.","Image service is busy."],
  video_image_unavailable:["No se pudo generar una imagen.","Image generation failed."],
  voice_unavailable:["La voz no está disponible. Puedes probar sin narración.","Voice isn't available. Try without narration."],
  voice_limit:["Límite de voces alcanzado.","Voice limit reached."],
  login:["Vuelve a iniciar sesión.","Please sign in again."]
 };
 return (messages[code]||[en?"The request couldn't be completed.":"No se pudo completar."])[en?1:0];
}
async function token(){
 const supabase=getSupabase();if(!supabase)throw Error("login");
 const {data}=await supabase.auth.getSession();
 if(!data.session?.access_token)throw Error("login");
 return data.session.access_token;
}
async function post(path:string,payload:Record<string,unknown>){
 const response=await fetch("/api/video-generator/"+path,{
  method:"POST",cache:"no-store",headers:{
   Authorization:"Bearer "+await token(),"Content-Type":"application/json"
  },body:JSON.stringify(payload)
 });
 if(!response.ok){
  const body=await response.json().catch(()=>({error:"network"}));
  throw Error(String(body.error||"network"));
 }
 return response;
}
async function loadImage(url:string):Promise<HTMLImageElement>{
 return new Promise((resolve,reject)=>{
  const img=new Image();
  img.onload=()=>resolve(img);
  img.onerror=()=>reject(Error("invalid_image"));
  img.src=url;
 });
}
function download(blob:Blob,filename:string){
 const link=URL.createObjectURL(blob);
 const a=document.createElement("a");
 a.href=link;a.download=filename;document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(link),90000);
}
export default function QuickVideoPage(){
 const {language}=useInterfaceLanguage(),en=language==="en";
 const L=(es:string,english:string)=>en?english:es;
 const questionTitles:[string,string][]=[
  ["¿Qué quieres crear?","What do you want to create?"],
  ["¿De qué trata el video?","What's your video about?"],
  ["¿Qué estilo prefieres?","Choose your visual style"],
  ["¿Cuánto debe durar?","How long should it be?"],
  ["¿En qué formato?","Choose the format"],
  ["¿Quieres narración?","Add a voice-over?"],
  ["¿Listo para comenzar?","Ready to create?"]
 ];
 const stepNumber=stage==="setup"?step+1:stage==="story"?8:9;
 const goPrevious=()=>{
  if(working)return;
  if(stage!=="setup"){resetMedia();setStage("setup");setStep(6);return;}
  if(step>0){setStep(current=>current-1);setError("");return;}
  window.location.assign("/vista-app/video-generator?setup=autopilot");
 };
 const goNext=()=>{
  if(working)return;
  if(step<6&&!(step===1&&topic.trim().length<3)){
   setStep(current=>current+1);setError("");
  }
 };
 const [kind,setKind]=useState<Kind>("promo");
 const [visual,setVisual]=useState<Visual>("sticks");
 const [seconds,setSeconds]=useState<15|30>(30);
 const [ratio,setRatio]=useState<"portrait"|"landscape">("portrait");
 const [narration,setNarration]=useState(true);
 const [topic,setTopic]=useState("VMV Business: ayuda a los emprendedores a organizar y hacer crecer su negocio");
 const [stage,setStage]=useState<Stage>("setup");
 const [step,setStep]=useState(0);
 const [title,setTitle]=useState("");
 const [scenes,setScenes]=useState<Scene[]>([]);
 const [images,setImages]=useState<Record<number,string>>({});
 const [audio,setAudio]=useState<ArrayBuffer|null>(null);
 const [approved,setApproved]=useState(false);
 const [working,setWorking]=useState("");
 const [progress,setProgress]=useState("");
 const [error,setError]=useState("");
 const [videoUrl,setVideoUrl]=useState("");
 const [extension,setExtension]=useState("");
 const mediaRef=useRef<string[]>([]);
 const resultRef=useRef("");
 useEffect(()=>{
  const q=new URLSearchParams(window.location.search);
  const kindParam=q.get("kind"),visualParam=q.get("visual"),topicParam=q.get("topic");
  if(kindParam==="promo"||kindParam==="facts")setKind(kindParam);
  if(visualParam==="sticks"||visualParam==="stills")setVisual(visualParam);
  if(topicParam&&topicParam.trim().length>=3)setTopic(topicParam.slice(0,220));
 },[]);
 useEffect(()=>()=>{mediaRef.current.forEach(URL.revokeObjectURL);if(resultRef.current)URL.revokeObjectURL(resultRef.current);},[]);
 const resetMedia=()=>{
  mediaRef.current.forEach(URL.revokeObjectURL);mediaRef.current=[];
  if(resultRef.current)URL.revokeObjectURL(resultRef.current);
  resultRef.current="";setVideoUrl("");setImages({});setAudio(null);setApproved(false);
 };
 const changeKind=(next:Kind)=>{
  resetMedia();setKind(next);setStage("setup");setError("");
  setTopic(next==="promo"?
   "VMV Business: ayuda a los emprendedores a organizar y hacer crecer su negocio":
   "Datos curiosos y sorprendentes sobre el universo");
 };
 const plan=async()=>{
  if(working||topic.trim().length<3)return;
  setWorking("story");setError("");setProgress("");resetMedia();
  try{
   const r=await post("storyboard",{kind,visual,topic:topic.trim(),seconds,language:en?"en":"es"});
   const data=await r.json() as {title:string;scenes:Scene[]};
   if(!Array.isArray(data.scenes)||data.scenes.length<4)throw Error("storyboard_retry");
   setTitle(data.title);setScenes(data.scenes);setStage("story");
  }catch(e){setError(e instanceof Error?e.message:"storyboard_unavailable");}
  finally{setWorking("");}
 };
 const assets=async()=>{
  if(working||!approved||!scenes.length)return;
  setWorking("images");setError("");
  try{
   for(let i=0;i<scenes.length;i++){
    if(images[i])continue;
    setProgress(L("Imagen ","Image ")+(i+1)+"/"+scenes.length);
    const prompt=styles[visual]+scenes[i].imagePrompt+
     " Single frame, centered composition, no text or letters, no watermarks, "+
     (ratio==="portrait"?"vertical 9:16 safe composition.":"horizontal 16:9 safe composition.");
    const imageResult=await post("image",{
     output:"image",prompt:prompt.slice(0,2800),
     size:ratio==="portrait"?"1024x1536":"1536x1024",quality:"standard"
    });
    const imageBlob=await imageResult.blob();
    if(!imageBlob.type.startsWith("image/"))throw Error("video_image_unavailable");
    const url=URL.createObjectURL(imageBlob);
    mediaRef.current.push(url);setImages(prev=>({...prev,[i]:url}));
   }
   if(narration){
    setProgress(L("Grabando voz","Generating voice"));
    const all=scenes.map(s=>s.speech).join(" ");
    const voiceResult=await post("speech",{text:all,voice:"alloy",confirmCost:true});
    const bytes=await voiceResult.arrayBuffer();
    if(bytes.byteLength<1024)throw Error("voice_unavailable");
    setAudio(bytes);
   }else setAudio(null);
   setStage("ready");setProgress("");
  }catch(e){setError(e instanceof Error?e.message:"video_image_unavailable");}
  finally{setWorking("");}
 };
 const render=async()=>{
  if(working||scenes.some((_,i)=>!images[i]))return;
  setWorking("export");setError("");setProgress(L("Exportando video…","Exporting video…"));
  let ctxAudio:AudioContext|null=null,source:AudioBufferSourceNode|null=null,stream:MediaStream|null=null;
  try{
   if(typeof MediaRecorder==="undefined")throw Error("recorder_unsupported");
   const width=ratio==="portrait"?720:1280,height=ratio==="portrait"?1280:720;
   const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
   const ctx=canvas.getContext("2d");if(!ctx||!canvas.captureStream)throw Error("recorder_unsupported");
   const frames=await Promise.all(scenes.map((_,i)=>loadImage(images[i])));
   const audioContext=audio?new AudioContext():null;ctxAudio=audioContext;
   let decoded:AudioBuffer|null=null,destination:MediaStreamAudioDestinationNode|null=null;
   if(audioContext&&audio){
    await audioContext.resume();
    decoded=await audioContext.decodeAudioData(audio.slice(0));
    destination=audioContext.createMediaStreamDestination();
    const bufferSource=audioContext.createBufferSource();
    bufferSource.buffer=decoded;bufferSource.connect(destination);source=bufferSource;
   }
   const total=decoded?Math.max(4,decoded.duration+0.2):seconds;
   const weights=scenes.map(s=>Math.max(1,s.speech.length));
   const sum=weights.reduce((a,b)=>a+b,0);
   const ends:number[]=[];let sumTime=0;
   for(const weight of weights){sumTime+=total*weight/sum;ends.push(sumTime);}
   stream=canvas.captureStream(24);
   if(destination)for(const track of destination.stream.getAudioTracks())stream.addTrack(track);
   const types=["video/mp4;codecs=avc1.42E01E,mp4a.40.2","video/mp4",
    "video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"];
   const type=types.find(t=>MediaRecorder.isTypeSupported(t));
   if(!type)throw Error("recorder_unsupported");
   const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:3200000});
   const chunks:Blob[]=[];
   const ended=new Promise<Blob>((resolve,reject)=>{
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onerror=()=>reject(Error("recorder_failed"));
    recorder.onstop=()=>chunks.length?resolve(new Blob(chunks,{type})):reject(Error("recorder_failed"));
   });
   const draw=(time:number)=>{
    const pos=Math.max(0,ends.findIndex(t=>time<t));
    const idx=ends.findIndex(t=>time<t);
    const i=idx<0?frames.length-1:pos;
    const prior=i===0?0:ends[i-1];
    const local=Math.max(0,Math.min(1,(time-prior)/Math.max(0.01,ends[i]-prior)));
    const img=frames[i],zoom=1.02+0.045*local;
    ctx.fillStyle="#101c1c";ctx.fillRect(0,0,width,height);
    const scale=Math.max(width/img.width,height/img.height)*zoom;
    const iw=img.width*scale,ih=img.height*scale;
    ctx.drawImage(img,(width-iw)/2,(height-ih)/2,iw,ih);
    const shade=ctx.createLinearGradient(0,height*0.55,0,height);
    shade.addColorStop(0,"rgba(0,0,0,0)");shade.addColorStop(1,"rgba(0,0,0,.79)");
    ctx.fillStyle=shade;ctx.fillRect(0,height*0.55,width,height*0.45);
    ctx.textAlign="center";ctx.textBaseline="middle";
    const label=kind==="promo"?"VMV BUSINESS":(en?"DID YOU KNOW?":"¿SABÍAS QUE?");
    ctx.fillStyle="#d7f8df";ctx.font="700 "+Math.round(width*0.026)+"px system-ui";
    ctx.fillText(label,width/2,height*0.095);
    const caption=scenes[i].caption||title;
    ctx.fillStyle="white";ctx.font="800 "+Math.round(width*0.05)+"px system-ui";
    const words=caption.split(/\s+/),lines:string[]=[];let line="";
    for(const word of words){
     if(ctx.measureText((line+" "+word).trim()).width>width*.84&&line){lines.push(line);line=word;}
     else line=(line+" "+word).trim();
    }
    if(line)lines.push(line);
    lines.slice(0,3).forEach((txt,n)=>ctx.fillText(txt,width/2,height*.81+n*width*.075));
    ctx.textAlign="right";ctx.fillStyle="rgba(255,255,255,.85)";
    ctx.font="500 "+Math.round(width*.018)+"px system-ui";
    ctx.fillText((i+1)+"/"+scenes.length,width*.94,height*.95);
   };
   draw(0);recorder.start(250);
   const start=performance.now()+90;
   if(source&&ctxAudio)source.start(ctxAudio.currentTime+0.09);
   await new Promise<void>((resolve)=>{
    let raf=0;
    const tick=(now:number)=>{
     const elapsed=Math.max(0,(now-start)/1000);
     draw(Math.min(elapsed,total-.001));
     if(elapsed>=total){resolve();return;}
     raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    void raf;
   });
   if(recorder.state!=="inactive")recorder.stop();
   const blob=await ended;
   const url=URL.createObjectURL(blob);
   if(resultRef.current)URL.revokeObjectURL(resultRef.current);
   resultRef.current=url;setVideoUrl(url);
   const ext=type.includes("mp4")?"mp4":"webm";setExtension(ext);
  }catch(e){setError(e instanceof Error?e.message:"recorder_failed");}
  finally{
   try{source?.stop();}catch{}
   stream?.getTracks().forEach(t=>t.stop());
   if(ctxAudio)void ctxAudio.close();
   setWorking("");setProgress("");
  }
 };
 const updateScene=(index:number,key:"speech"|"caption",value:string)=>{
  setScenes(prev=>prev.map((s,i)=>i===index?{...s,[key]:value}:s));
  setAudio(null);if(stage==="ready")setStage("story");
  if(resultRef.current)URL.revokeObjectURL(resultRef.current);
  resultRef.current="";setVideoUrl("");
 };
 return <main className={css.page}>
  <div className={css.shell}>
   <header className={css.header}>
    <Link href="/vista-app/video-generator?setup=autopilot" className={css.back}><ArrowLeft size={18}/> VMV Business</Link>
    <span className={css.preview}><Sparkles size={14}/> Beta</span>
   </header>
   <div className={css.wizardTop}>
    <span className={css.eyebrow}><Clapperboard size={15}/> VIDEO WIZARD</span>
    <span className={css.stepCounter}>{L("Paso","Step")} {stepNumber}/9</span>
   </div>
   <div className={css.track} role="progressbar" aria-label={L("Progreso del Wizard","Wizard progress")}
     aria-valuemin={1} aria-valuemax={9} aria-valuenow={stepNumber}>
    <span style={{width:(stepNumber/9*100)+"%"}}/>
   </div>
   {stage==="setup"?<>
    <section className={css.wizardHead} aria-live="polite">
     <span className={css.headIcon}>
      {step===0?<Clapperboard size={28}/>:step===1?<WandSparkles size={28}/>:
       step===2?<Film size={28}/>:step===3?<Clock3 size={28}/>:
       step===4?<Smartphone size={28}/>:step===5?<Mic2 size={28}/>:<CheckCircle2 size={28}/>}
     </span>
     <h1>{questionTitles[step][en?1:0]}</h1>
    </section>
    <section className={css.wizardContent} key={step}>
     {step===0?<div className={css.optionGrid}>
      <button type="button" aria-pressed={kind==="promo"} className={kind==="promo"?css.optionSelected:css.option}
       onClick={()=>changeKind("promo")}><span className={css.optionIcon}><Clapperboard size={29}/></span>
       <strong>{L("Promoción","Promotion")}</strong>{kind==="promo"?<CheckCircle2 className={css.selectedTick} size={20}/>:null}</button>
      <button type="button" aria-pressed={kind==="facts"} className={kind==="facts"?css.optionSelected:css.option}
       onClick={()=>changeKind("facts")}><span className={css.optionIcon}><BookOpen size={29}/></span>
       <strong>{L("Datos curiosos","Fun facts")}</strong>{kind==="facts"?<CheckCircle2 className={css.selectedTick} size={20}/>:null}</button>
     </div>:null}
     {step===1?<div className={css.topicWrap}>
      <textarea autoFocus id="vmv-quick-topic" aria-label={L("Describe la idea del video","Describe your video idea")}
       className={css.topic} rows={4} maxLength={220} value={topic}
       placeholder={L("Escribe tu idea…","Write your idea…")} onChange={e=>setTopic(e.target.value)}/>
      <span className={css.counter}>{topic.length}/220</span>
     </div>:null}
     {step===2?<div className={css.optionGrid}>
      <button type="button" aria-pressed={visual==="sticks"} className={visual==="sticks"?css.optionSelected:css.option}
       onClick={()=>setVisual("sticks")}><span className={css.optionIcon}><Film size={29}/></span>
       <strong>Stick figure</strong><small>Cartoon 2D</small>
       {visual==="sticks"?<CheckCircle2 className={css.selectedTick} size={20}/>:null}</button>
      <button type="button" aria-pressed={visual==="stills"} className={visual==="stills"?css.optionSelected:css.option}
       onClick={()=>setVisual("stills")}><span className={css.optionIcon}><ImageIcon size={29}/></span>
       <strong>{L("Imágenes IA","AI images")}</strong><small>{L("Estáticas","Still frames")}</small>
       {visual==="stills"?<CheckCircle2 className={css.selectedTick} size={20}/>:null}</button>
     </div>:null}
     {step===3?<div className={css.optionGrid}>
      {([15,30] as const).map(n=><button type="button" key={n}
       aria-pressed={seconds===n} className={seconds===n?css.optionSelected:css.option}
       onClick={()=>setSeconds(n)}><span className={css.optionIcon}><Clock3 size={29}/></span>
       <strong className={css.largeValue}>{n} s</strong>
       {seconds===n?<CheckCircle2 className={css.selectedTick} size={20}/>:null}</button>)}
     </div>:null}
     {step===4?<div className={css.optionGrid}>
      <button type="button" aria-pressed={ratio==="portrait"} className={ratio==="portrait"?css.optionSelected:css.option}
       onClick={()=>setRatio("portrait")}><span className={css.optionIcon}><Smartphone size={29}/></span>
       <strong>9:16</strong><small>{L("Vertical","Portrait")}</small>
       {ratio==="portrait"?<CheckCircle2 className={css.selectedTick} size={20}/>:null}</button>
      <button type="button" aria-pressed={ratio==="landscape"} className={ratio==="landscape"?css.optionSelected:css.option}
       onClick={()=>setRatio("landscape")}><span className={css.optionIcon}><Monitor size={29}/></span>
       <strong>16:9</strong><small>{L("Horizontal","Landscape")}</small>
       {ratio==="landscape"?<CheckCircle2 className={css.selectedTick} size={20}/>:null}</button>
     </div>:null}
     {step===5?<div className={css.optionGrid}>
      <button type="button" aria-pressed={narration} className={narration?css.optionSelected:css.option}
       onClick={()=>setNarration(true)}><span className={css.optionIcon}><Mic2 size={29}/></span>
       <strong>{L("Con narración IA","AI narration")}</strong>
       {narration?<CheckCircle2 className={css.selectedTick} size={20}/>:null}</button>
      <button type="button" aria-pressed={!narration} className={!narration?css.optionSelected:css.option}
       onClick={()=>setNarration(false)}><span className={css.optionIcon}><VolumeX size={29}/></span>
       <strong>{L("Sin narración","No narration")}</strong>
       {!narration?<CheckCircle2 className={css.selectedTick} size={20}/>:null}</button>
     </div>:null}
     {step===6?<div className={css.reviewGrid}>
      <span><Clapperboard size={17}/>{kind==="promo"?L("Promoción","Promotion"):L("Datos curiosos","Fun facts")}</span>
      <span><Film size={17}/>{visual==="sticks"?"Stick figure":L("Imágenes IA","AI images")}</span>
      <span><Clock3 size={17}/>{seconds} s</span>
      <span>{ratio==="portrait"?<Smartphone size={17}/>:<Monitor size={17}/>}
       {ratio==="portrait"?"9:16":"16:9"}</span>
      <span><Mic2 size={17}/>{narration?L("Con voz","Voice on"):L("Sin voz","No voice")}</span>
     </div>:null}
    </section>
    <div className={css.wizardActions}>
     <button type="button" className={css.backAction} onClick={goPrevious} disabled={Boolean(working)}>
      <ArrowLeft size={18}/>{L("Atrás","Back")}
     </button>
     {step<6?<button type="button" className={css.nextAction} disabled={Boolean(working)||(step===1&&topic.trim().length<3)}
      onClick={goNext}>{L("Continuar","Continue")}<ArrowRight size={19}/></button>:
      <button type="button" className={css.nextAction} disabled={Boolean(working)} onClick={()=>void plan()}>
       {working==="story"?<LoaderCircle size={19} className={css.spin}/>:<WandSparkles size={19}/>}
       {working==="story"?L("Preparando…","Preparing…"):L("Crear escenas","Create scenes")}
      </button>}
    </div>
   </>:null}
   {stage!=="setup"?<section className={css.panel}>
    <div className={css.sectionTitle}>
     <div><span className={css.eyebrow}>{visual==="sticks"?"STICK FIGURE":"AI STILLS"}</span>
      <h2>{title}</h2></div>
     <button type="button" className={css.iconButton} onClick={goPrevious} disabled={Boolean(working)} aria-label={L("Editar idea","Edit idea")}><RefreshCw size={18}/></button>
    </div>
    <div className={css.frameGrid}>
     {scenes.map((s,i)=><article key={i} className={css.frame}>
      {images[i]?<img src={images[i]} alt={L("Escena ","Scene ")+(i+1)}/>:<div className={css.frameEmpty}><ImageIcon size={24}/><span>{i+1}</span></div>}
      <div className={css.frameText}><strong>{s.caption}</strong>
       <details><summary>{L("Editar voz","Edit narration")}</summary>
        <textarea rows={3} value={s.speech} maxLength={240} onChange={e=>updateScene(i,"speech",e.target.value)}/>
       </details>
      </div>
     </article>)}
    </div>
    {stage==="story"?<>
     <label className={css.confirm}><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>
      <span><ShieldCheck size={17}/>{L("Autorizo generar imágenes y voz con créditos de IA.","I approve paid AI image and voice generation.")}</span></label>
     <button type="button" disabled={!approved||Boolean(working)} className={css.primary} onClick={()=>void assets()}>
      {working==="images"?<LoaderCircle className={css.spin} size={18}/>:<Sparkles size={18}/>}
      {progress||L("Generar imágenes y voz","Generate images and voice")}
     </button>
     {!working&&scenes.every((_,i)=>Boolean(images[i]))?<button type="button" className={css.skipVoice}
      onClick={()=>{setNarration(false);setAudio(null);setError("");setStage("ready");}}>
      {L("Continuar sin narración","Continue without narration")}
     </button>:null}
    </>:null}
    {stage==="ready"?<>
     <div className={css.done}><CheckCircle2 size={21}/>{L("Escenas listas","Scenes ready")}</div>
     <button type="button" disabled={Boolean(working)} className={css.primary} onClick={()=>void render()}>
      {working==="export"?<LoaderCircle size={18} className={css.spin}/>:<Play size={18}/>}
      {progress||L("Crear video","Render video")}
     </button>
     {videoUrl?<div className={css.result}>
      <video controls playsInline src={videoUrl}/>
      <a className={css.download} href={videoUrl} download={"vmv-"+kind+"-"+visual+"."+extension}>
       <Download size={19}/>{L("Descargar video","Download video")} · {extension.toUpperCase()}
      </a>
     </div>:null}
    </>:null}
   </section>:null}
   {error?<p className={css.error} role="alert">{errorLabel(error,en)}</p>:null}
   <p className={css.foot}>{L("Prueba privada · sin publicación automática. El formato de exportación depende del navegador.","Private test · no automatic posting. Export format depends on browser.")}</p>
  </div>
 </main>;
}
