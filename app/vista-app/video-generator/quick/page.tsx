"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {ArrowLeft,BookOpen,CheckCircle2,Clapperboard,Download,Film,
 ImageIcon,LoaderCircle,Mic2,Play,RefreshCw,ShieldCheck,Sparkles,WandSparkles} from "lucide-react";
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
 const [kind,setKind]=useState<Kind>("promo");
 const [visual,setVisual]=useState<Visual>("sticks");
 const [seconds,setSeconds]=useState<15|30>(30);
 const [ratio,setRatio]=useState<"portrait"|"landscape">("portrait");
 const [narration,setNarration]=useState(true);
 const [topic,setTopic]=useState("VMV Business: ayuda a los emprendedores a organizar y hacer crecer su negocio");
 const [stage,setStage]=useState<Stage>("setup");
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
   <section className={css.hero}>
    <span className={css.eyebrow}><Clapperboard size={16}/> VIDEO STUDIO</span>
    <h1>{L("Crea tu video","Create your video")}</h1>
    <p>{L("Historia, promoción o curiosidades.","Stories, promos or fun facts.")}</p>
   </section>
   <nav className={css.steps} aria-label={L("Pasos","Steps")}>
    <span className={css.active}>1 · {L("Idea","Idea")}</span>
    <span className={stage!=="setup"?css.active:""}>2 · {L("Escenas","Scenes")}</span>
    <span className={stage==="ready"?css.active:""}>3 · Video</span>
   </nav>
   {stage==="setup"?<section className={css.panel}>
    <label className={css.label}>{L("¿Qué vamos a crear?","What are we making?")}</label>
    <div className={css.cards}>
     <button type="button" className={kind==="promo"?css.selected:css.choice} onClick={()=>changeKind("promo")}>
      <Clapperboard size={27}/><strong>{L("Promoción","Promotion")}</strong>
     </button>
     <button type="button" className={kind==="facts"?css.selected:css.choice} onClick={()=>changeKind("facts")}>
      <BookOpen size={27}/><strong>{L("Datos curiosos","Fun facts")}</strong>
     </button>
    </div>
    <label className={css.label} htmlFor="vmv-quick-topic">{L("Tu idea","Your idea")}</label>
    <textarea id="vmv-quick-topic" className={css.topic} rows={3} value={topic} maxLength={220} onChange={e=>setTopic(e.target.value)}/>
    <label className={css.label}>{L("Estilo visual","Visual style")}</label>
    <div className={css.cards}>
     <button type="button" className={visual==="sticks"?css.selected:css.choice} onClick={()=>setVisual("sticks")}>
      <Film size={27}/><strong>Stick figure</strong><small>Cartoon 2D</small>
     </button>
     <button type="button" className={visual==="stills"?css.selected:css.choice} onClick={()=>setVisual("stills")}>
      <ImageIcon size={27}/><strong>{L("Imágenes IA","AI images")}</strong><small>{L("Estáticas","Still frames")}</small>
     </button>
    </div>
    <div className={css.twocol}>
     <div><label className={css.label}>{L("Duración","Duration")}</label>
      <div className={css.segments}>{([15,30] as const).map(n=><button type="button" key={n} className={seconds===n?css.activeSegment:""} onClick={()=>setSeconds(n)}>{n} s</button>)}</div>
     </div>
     <div><label className={css.label}>{L("Formato","Aspect ratio")}</label>
      <div className={css.segments}>
       <button type="button" className={ratio==="portrait"?css.activeSegment:""} onClick={()=>setRatio("portrait")}>9:16</button>
       <button type="button" className={ratio==="landscape"?css.activeSegment:""} onClick={()=>setRatio("landscape")}>16:9</button>
      </div>
     </div>
    </div>
    <button type="button" aria-pressed={narration} className={css.toggle} onClick={()=>setNarration(v=>!v)}>
     <Mic2 size={21}/><strong>{L("Narración IA","AI narration")}</strong>
     <span className={narration?css.on:css.off}>{narration?L("Sí","On"):L("No","Off")}</span>
    </button>
    <button type="button" className={css.primary} disabled={Boolean(working)||topic.trim().length<3} onClick={()=>void plan()}>
     {working==="story"?<LoaderCircle className={css.spin} size={19}/>:<WandSparkles size={19}/>}
     {L("Crear escenas","Create scenes")}
    </button>
   </section>:null}
   {stage!=="setup"?<section className={css.panel}>
    <div className={css.sectionTitle}>
     <div><span className={css.eyebrow}>{visual==="sticks"?"STICK FIGURE":"AI STILLS"}</span>
      <h2>{title}</h2></div>
     <button type="button" className={css.iconButton} onClick={()=>{if(!working){resetMedia();setStage("setup");}}} disabled={Boolean(working)} aria-label={L("Editar idea","Edit idea")}><RefreshCw size={18}/></button>
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
