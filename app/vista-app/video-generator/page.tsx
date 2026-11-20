"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {ArrowLeft,ArrowUpRight,CalendarDays,Check,CheckCircle2,ChevronRight,
 Clapperboard,Download,Film,ImagePlus,Library,LoaderCircle,Play,RefreshCw,
 ShieldCheck,Sparkles,Video,WandSparkles,Workflow,X} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {InterfaceLanguagePicker} from "@/components/InterfaceLanguagePicker";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import styles from "./page.module.css";
import AutopilotWizard,{type AutopilotPlan} from "./AutopilotWizard";

type Job={id:string;pilot_id:string|null;prompt:string;mode:"text"|"image";model:"gen4.5"|"kling";
 ratio:"1280:720"|"720:1280";duration:number;status:string;output_url:string|null;
 failure_code:string|null;caption:string|null;created_at:string;updated_at:string};
type Pilot=AutopilotPlan & {status:string;created_at:string};
type Screen="home"|"create"|"pilot"|"library";
type Form={prompt:string;caption:string;mode:"text"|"image";model:"gen4.5"|"kling";
 ratio:"1280:720"|"720:1280";duration:5|10};
const initial:Form={prompt:"",caption:"",mode:"text",model:"gen4.5",ratio:"720:1280",duration:5};
const defaultPilot:AutopilotPlan={id:"",niche:"",audience:"Público general",goal:"Atraer clientes",style:"realistic",frequency:3,
 model:"gen4.5",monthly_budget_cents:1500,delivery:"download"};
function errMessage(code:string,en:boolean){
 const map:Record<string,[string,string]>={
  video_not_enabled_for_account:["Video Generator aún no está habilitado para esta cuenta.","Video Generator isn't enabled for this account yet."],
  runway_key_missing:["Falta conectar Runway en Vercel.","Connect Runway in Vercel first."],
  video_daily_limit:["Se alcanzó el presupuesto de seguridad para las pruebas de video.","The pilot testing budget was reached."],
  video_active_job_limit:["Espera a que termine el video anterior.","Wait for your previous video to finish."],
  invalid_video_request:["Revisa el texto, formato, imagen y autorización.","Check your prompt, format, image and confirmation."],
  runway_credits_required:["Runway necesita créditos para generar videos.","Runway requires credits to generate videos."],
  runway_rate_limited:["Runway está procesando demasiadas solicitudes. Intenta más tarde.","Runway is processing too many requests. Retry later."],
  runway_access_denied:["La clave de Runway no tiene acceso al modelo seleccionado.","Your Runway key can't access the selected model."],
  runway_parameters_or_model_rejected:["Runway rechazó el formato o modelo. Prueba otra opción.","Runway rejected this model or format. Try another option."],
  runway_start_unavailable:["No se pudo iniciar la generación. Intenta nuevamente.","Could not start video generation. Try again."],
  video_ai_unavailable:["La IA de guiones no respondió. Puedes escribir la idea manualmente.","AI couldn't write a prompt. You can enter one manually."],
  video_ai_limit:["Espera un momento antes de pedir otra idea.","Please wait before requesting another AI idea."],
  video_database_unavailable:["El historial no está disponible. Intenta de nuevo.","History is temporarily unavailable. Retry."],
  pilot_save_unavailable:["No se pudo guardar el piloto.","Could not save the pilot."],
  download_expired_or_unavailable:["El enlace del video expiró o no está disponible. Prueba abrir el original.","The video link expired or is unavailable. Try opening the original."],
  download_provider_link_unavailable:["Descarga directa no disponible para este proveedor.","Direct download is unavailable for this provider."],
  video_history_unavailable:["No se pudo cargar tu biblioteca.","Could not load your library."]
 };
 return (map[code]||["No se pudo completar la operación.","The request could not be completed."])[en?1:0];
}
async function api(path:string,method="GET",body?:Record<string,unknown>){
 const client=getSupabase();
 if(!client)throw Error("login");
 const {data}=await client.auth.getSession();
 if(!data.session)throw Error("login");
 const r=await fetch("/api/video-generator"+path,{
  method,cache:"no-store",
  headers:{Authorization:"Bearer "+data.session.access_token,...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const payload=await r.json().catch(()=>({error:"network"}));
 if(!r.ok)throw Error(payload.error||"network");
 return payload;
}
async function imageData(file:File){
 if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>14*1024*1024)
  throw Error("image_invalid");
 const bitmap=await createImageBitmap(file);
 try{
  const scale=Math.min(1,1440/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));
  canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext("2d");if(!ctx)throw Error("image_invalid");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  for(const quality of [0.82,0.7,0.55,0.4]){
   const data=canvas.toDataURL("image/jpeg",quality);
   if(data.length<=4100000)return data;
  }
  throw Error("image_invalid");
 }finally{bitmap.close();}
}
/** Best-effort client capture: never proxies arbitrary provider URLs through our server.
 * Some providers do not allow cross-origin canvas; caller asks for a description. */
async function captureVideoFrame(url:string):Promise<string>{
 const parsed=new URL(url);
 if(parsed.protocol!=="https:"||parsed.username||parsed.password)throw Error("video_invalid");
 const video=document.createElement("video");
 video.crossOrigin="anonymous";video.preload="auto";video.muted=true;
 try{
  return await new Promise<string>((resolve,reject)=>{
   let closed=false;
   const finish=(result?:string,error?:Error)=>{
    if(closed)return;closed=true;window.clearTimeout(timer);
    video.onloadeddata=null;video.onerror=null;
    if(error)reject(error);else resolve(result||"");
   };
   const timer=window.setTimeout(()=>finish(undefined,Error("video_frame_timeout")),7000);
   video.onerror=()=>finish(undefined,Error("video_frame_unavailable"));
   video.onloadeddata=()=>{
    try{
     const max=980,scale=Math.min(1,max/Math.max(video.videoWidth,video.videoHeight));
     if(!Number.isFinite(scale)||!video.videoWidth||!video.videoHeight)throw Error("video_frame_invalid");
     const canvas=document.createElement("canvas");
     canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
     canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
     const ctx=canvas.getContext("2d");if(!ctx)throw Error("video_frame_invalid");
     ctx.drawImage(video,0,0,canvas.width,canvas.height);
     const data=canvas.toDataURL("image/jpeg",0.67);
     if(data.length<1000||data.length>3500000)throw Error("video_frame_invalid");
     finish(data);
    }catch{finish(undefined,Error("video_frame_cors"));}
   };
   video.src=url;video.load();
  });
 }finally{video.removeAttribute("src");video.load();}
}
export default function VideoGeneratorPage(){
 const {language}=useInterfaceLanguage(),en=language==="en";
 const L=(es:string,english:string)=>en?english:es;
 const [screen,setScreen]=useState<Screen>("home");
 const [jobs,setJobs]=useState<Job[]>([]),[pilots,setPilots]=useState<Pilot[]>([]);
 const [form,setForm]=useState<Form>(initial);
 const [image,setImage]=useState(""),[imageLoading,setImageLoading]=useState(false);
 const [pilot,setPilot]=useState(defaultPilot);
 const [selected,setSelected]=useState<string|null>(null);
 const [costApproved,setCostApproved]=useState(false),[configured,setConfigured]=useState(false);
 const [sourcePilot,setSourcePilot]=useState<string|null>(null),[downloading,setDownloading]=useState(false);
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [promptOpen,setPromptOpen]=useState<string|null>(null);
 const [captionModal,setCaptionModal]=useState(false);
 const [generatedCaptions,setGeneratedCaptions]=useState<Record<string,{platform:string;caption:string}>>({});
 const [captionBusy,setCaptionBusy]=useState(false);
 const [captionError,setCaptionError]=useState("");
 const [manualVideoSubject,setManualVideoSubject]=useState("");
 const [needsVideoSubject,setNeedsVideoSubject]=useState(false);
 const [verifiedFrames,setVerifiedFrames]=useState<Record<string,string>>({});
 const createCaption=async(platform:"instagram"|"facebook"|"tiktok"|"youtube"|"linkedin")=>{
  if(!current||captionBusy)return;
  setCaptionBusy(true);setCaptionError("");
  try{
   const client=getSupabase();if(!client)throw Error("Inicia sesión nuevamente.");
   const {data:{session}}=await client.auth.getSession();
   if(!session?.access_token)throw Error("Inicia sesión nuevamente.");
   let visualFacts=manualVideoSubject.trim().slice(0,450)||verifiedFrames[current.id]||"";
   if(!visualFacts){
    try{
     if(!current.output_url||current.status!=="SUCCEEDED")throw Error("video_not_ready");
     const frame=await captureVideoFrame(current.output_url);
     const visionResponse=await fetch("/api/video-generator/analyze-image",{
      method:"POST",cache:"no-store",headers:{
       Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"
      },body:JSON.stringify({imageUrl:frame,desiredScene:current.prompt.slice(0,280),offer:""})
     });
     const visual=await visionResponse.json().catch(()=>({}));
     if(!visionResponse.ok||typeof visual.subject!=="string"||!visual.subject.trim()||
      typeof visual.observations!=="string")throw Error("visual_unavailable");
     visualFacts=(visual.subject+". "+visual.observations).slice(0,450);
     setVerifiedFrames(old=>({...old,[current.id]:visualFacts}));
    }catch{
     setNeedsVideoSubject(true);
     throw Error("No pude verificar un fotograma del video. Escribe brevemente qué aparece realmente y vuelve a elegir la red social.");
    }
   }
   const response=await fetch("/api/video-generator/caption",{
    method:"POST",cache:"no-store",headers:{
     Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"
    },body:JSON.stringify({jobId:current.id,platform,visualFacts})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||typeof data.caption!=="string")throw Error(
    data.error==="video_not_ready"?"Espera a que termine la generación.":"No se pudo crear la descripción.");
   setGeneratedCaptions(old=>({...old,[current.id]:{platform,caption:data.caption}}));
   setCaptionModal(false);setNeedsVideoSubject(false);setManualVideoSubject("");
  }catch(e){setCaptionError(e instanceof Error?e.message:"No se pudo generar.");}
  finally{setCaptionBusy(false);}
 };
 const patch=<K extends keyof Form>(field:K,value:Form[K])=>{setForm(f=>({...f,[field]:value}));setCostApproved(false);};
 const active=(job:Job)=>["starting","PENDING","THROTTLED","RUNNING"].includes(job.status);
 const load=useCallback(async()=>{
  try{
   const r=await api("");
   setJobs(r.jobs||[]);setPilots(r.pilots||[]);setConfigured(Boolean(r.configured));
   if(r.pilots?.[0])setPilot({
    id:r.pilots[0].id,niche:r.pilots[0].niche,audience:r.pilots[0].audience,
    goal:r.pilots[0].goal,style:r.pilots[0].style,frequency:r.pilots[0].frequency,
    model:r.pilots[0].model==="kling"?"kling":"gen4.5",
    monthly_budget_cents:[0,1500,3000,6000].includes(r.pilots[0].monthly_budget_cents)?r.pilots[0].monthly_budget_cents:1500,
    delivery:r.pilots[0].delivery==="social_draft"?"social_draft":"download
   });
  }catch(e){setError(e instanceof Error?e.message:"unavailable");}
  finally{setReady(true);}
 },[]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  if(!ready)return;
  const url=new URL(window.location.href);
  if(url.searchParams.get("setup")==="autopilot"){
   url.searchParams.delete("setup");
   window.history.replaceState(null,"",url.pathname+url.search+url.hash);
   setScreen("pilot");return;
  }
  if(url.searchParams.get("view")==="library"){
   url.searchParams.delete("view");
   window.history.replaceState(null,"",url.pathname+url.search+url.hash);
   setScreen("library");
  }
 },[ready]);
 const refreshJob=useCallback(async(id:string)=>{
  try{
   const r=await api("?id="+encodeURIComponent(id));
   const next=r.job as Job;
   if(next)setJobs(prev=>[next,...prev.filter(j=>j.id!==id)]);
  }catch(e){setError(e instanceof Error?e.message:"unavailable");}
 },[]);
 const current=useMemo(()=>jobs.find(j=>j.id===selected)||null,[jobs,selected]);
 useEffect(()=>{
  if(!ready)return;
  const url=new URL(window.location.href),id=url.searchParams.get("job");
  if(!id||!/^[0-9a-f-]{36}$/i.test(id))return;
  url.searchParams.delete("job");
  window.history.replaceState(null,"",url.pathname+url.search+url.hash);
  setSelected(id);setScreen("library");void refreshJob(id);
 },[ready,refreshJob]);
 useEffect(()=>{
  if(!current||!active(current))return;
  const timer=window.setInterval(()=>void refreshJob(current.id),7000);
  return()=>window.clearInterval(timer);
 },[current?.id,current?.status,refreshJob]);
 const failures=jobs.filter(j=>j.status==="FAILED").length;
 const open=(next:Screen)=>{setScreen(next);setError("");setNotice("");};
 const generate=async()=>{
  if(busy||!costApproved)return;
  setBusy("generate");setError("");setNotice("");
  try{
   const result=await api("","POST",{
    ...form,pilotId:sourcePilot,imageUrl:form.mode==="image"?image:"",confirmCost:true,clientKey:crypto.randomUUID(),
    caption:form.caption.trim().slice(0,500)
   });
   if(result.job){
    setJobs(prev=>[result.job,...prev.filter(j=>j.id!==result.job.id)]);
    setSelected(result.job.id);setCostApproved(false);open("library");
   }
  }catch(e){setError(e instanceof Error?e.message:"unavailable");}
  finally{setBusy("");}
 };
 const idea=async(usePilot=false)=>{
  if(busy)return;
  const niche=usePilot?pilot.niche:form.prompt;
  if(niche.trim().length<3)return;
  setBusy("idea");setError("");setNotice("");
  try{
   const r=await api("/brief","POST",{
    niche,goal:usePilot?pilot.goal:"",
    audience:usePilot?pilot.audience:"",style:usePilot?pilot.style:"realistic",
    prompt:usePilot?"":form.prompt,locale:en?"en":"es"
   });
   setForm(v=>({...v,prompt:r.prompt,caption:r.caption}));
   if(usePilot){setImage("");setSourcePilot(pilot.id||null);setScreen("create");}else{setSourcePilot(null);}
   setNotice(L("Guion y descripción listos.","Prompt and caption ready."));
  }catch(e){setError(e instanceof Error?e.message:"unavailable");}
  finally{setBusy("");}
 };
 const savePilot=async(next:AutopilotPlan,prepare:boolean):Promise<boolean>=>{
  if(busy)return false;
  setBusy("pilot");setError("");setNotice("");
  try{
   const result=await api("/pilot","POST",{
    ...(next.id?{id:next.id}:{}),
    niche:next.niche,audience:next.audience,goal:next.goal,style:next.style,frequency:next.frequency,
    model:next.model,monthly_budget_cents:next.monthly_budget_cents,delivery:next.delivery
   });
   setPilots(prev=>[result.pilot,...prev.filter(p=>p.id!==result.pilot.id)]);
   setPilot({...next,id:result.pilot.id});
   if(prepare)window.location.assign("/vista-app/ai-agents?service=video&pilot="+encodeURIComponent(result.pilot.id));
   return true;
  }catch(e){setError(e instanceof Error?e.message:"pilot_save_unavailable");return false;}
  finally{setBusy("");}
 };
 const onFile=async(file?:File)=>{
  if(!file)return;
  setImageLoading(true);setImage("");setError("");
  try{setImage(await imageData(file));}
  catch{setError("image_invalid");}
  finally{setImageLoading(false);}
 };
 const selectJob=(job:Job)=>{setSelected(job.id);setCaptionModal(false);setCaptionError("");setNeedsVideoSubject(false);setManualVideoSubject("");setPromptOpen(null);open("library");if(active(job))void refreshJob(job.id);};
 const downloadJob=async(job:Job)=>{
  if(downloading)return;
  setDownloading(true);setError("");
  try{
   const db=getSupabase(),session=await db?.auth.getSession();
   const token=session?.data.session?.access_token;
   if(!token)throw Error("login");
   const result=await fetch("/api/video-generator/download?id="+encodeURIComponent(job.id),{
    cache:"no-store",headers:{Authorization:"Bearer "+token}
   });
   if(!result.ok){
    const detail=await result.json().catch(()=>({error:"download_expired_or_unavailable"}));
    throw Error(detail.error||"download_expired_or_unavailable");
   }
   const blob=await result.blob(),url=URL.createObjectURL(blob);
   const anchor=document.createElement("a");anchor.href=url;
   anchor.download="vmv-video-"+job.id.slice(0,8)+".mp4";
   document.body.appendChild(anchor);anchor.click();anchor.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){setError(e instanceof Error?e.message:"download_expired_or_unavailable");}
  finally{setDownloading(false);}
 };
 const status=(job:Job)=>job.status==="SUCCEEDED"?L("Listo","Ready"):
  job.status==="FAILED"?L("Falló","Failed"):
  job.status==="RUNNING"?L("Generando","Generating"):
  job.status==="CANCELED"?L("Cancelado","Canceled"):L("Procesando","Processing");
 const date=(value:string)=>new Date(value).toLocaleDateString(en?"en-US":"es-US",{month:"short",day:"numeric",year:"numeric"});
 const errorText=error==="login"?L("Inicia sesión en VMV Business.","Sign in to VMV Business."):
  error==="image_invalid"?L("Selecciona una imagen JPG, PNG o WebP válida.","Choose a valid JPG, PNG or WebP image."):
  error?errMessage(error,en):"";
 return <main className={styles.page}><div className={styles.shell}>
  <header className={styles.topbar}>
   {screen==="home"?<Link href="/vista-app" className={styles.back}><ArrowLeft size={17}/> VMV Business</Link>:
    <button type="button" className={styles.back} onClick={()=>open("home")}><ArrowLeft size={17}/>{L("Video Generator","Video Generator")}</button>}
   <div className={styles.topRight}><InterfaceLanguagePicker compact/><span className={styles.pill}><Sparkles size={14}/> Beta</span></div>
  </header>
  {screen==="home"?<>
   <div className={styles.intro}><span className={styles.eyebrow}><Video size={15}/> VMV VIDEO GENERATOR</span>
    <h1>{L("Crea videos con IA","Create videos with AI")}</h1>
    <p>{L("Un estudio sencillo para crear, organizar y preparar tus videos.","A simple studio to create, organize and prepare videos.")}</p>
   </div>
   <div className={styles.choiceGrid}>
    <button type="button" className={styles.choice} onClick={()=>window.location.assign("/vista-app/ai-agents?service=video")}>
     <span className={styles.choiceIcon}><Clapperboard size={23}/></span>
     <strong>{L("Crear un video","Create a video")}</strong>
     <small>{L("De texto o imagen a video.","Turn text or images into video.")}</small>
     <ArrowUpRight size={18} className={styles.choiceArrow}/>
    </button>
    <button type="button" className={styles.choice} onClick={()=>open("pilot")}>
     <span className={styles.choiceIcon}><Workflow size={23}/></span>
     <strong>{L("Piloto automático","Content autopilot")}</strong>
     <small>{L("Elige tu nicho y prepara contenido recurrente.","Choose a niche and prepare recurring content.")}</small>
     <ArrowUpRight size={18} className={styles.choiceArrow}/>
    </button>
   </div>
   <button type="button" className={styles.libraryShortcut} onClick={()=>open("library")}>
    <Library size={19}/><span>{L("Mi biblioteca","My library")}</span>
    <span className={styles.count}>{jobs.length}</span><ChevronRight size={17}/>
   </button>
   {ready&&!configured?<div className={styles.setup}><ShieldCheck size={17}/>
    {L("Para comenzar falta conectar Runway en Vercel.","Connect Runway in Vercel to begin.")}</div>:null}
   {failures>0?<p className={styles.foot}>{L("Generaciones fallidas registradas: ","Failed attempts recorded: ")}{failures}</p>:null}
  </>:null}
  {screen==="create"?<>
   <div className={styles.heading}><span className={styles.eyebrow}><Film size={15}/>{L("ESTUDIO DE VIDEO","VIDEO STUDIO")}</span>
    <h1>{L("Crear video","Create video")}</h1>
   </div>
   <section className={styles.card}>
    <div className={styles.field}><label>{L("Origen","Source")}</label>
     <div className={styles.segment}>
      <button type="button" aria-pressed={form.mode==="text"} className={form.mode==="text"?styles.chosen:""} onClick={()=>patch("mode","text")}>{L("Texto","Text")}</button>
      <button type="button" aria-pressed={form.mode==="image"} className={form.mode==="image"?styles.chosen:""} onClick={()=>patch("mode","image")}>{L("Imagen","Image")}</button>
     </div>
    </div>
    {form.mode==="image"?<div className={styles.field}>
     <label>{L("Imagen de referencia","Reference image")}</label>
     <label className={styles.filePicker}><ImagePlus size={18}/>
      {image?L("Cambiar imagen","Change image"):L("Seleccionar imagen","Choose image")}
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void onFile(e.target.files?.[0])}/>
     </label>
     {imageLoading?<span className={styles.progress}><LoaderCircle size={15} className={styles.spinner}/>{L("Preparando imagen…","Preparing image…")}</span>:null}
     {image?<img alt={L("Imagen seleccionada","Selected image")} className={styles.reference} src={image}/>:null}
    </div>:null}
    <div className={styles.field}>
     <label htmlFor="vmv-video-prompt">{L("Describe tu video","Describe your video")}</label>
     <textarea id="vmv-video-prompt" rows={5} maxLength={1000}
      value={form.prompt} placeholder={L("Un pastel recién terminado sobre una mesa, cámara cinematográfica…","A freshly decorated cake on a table, cinematic camera movement…")}
      onChange={e=>patch("prompt",e.target.value)}/>
     <div className={styles.fieldFooter}>
      <span>{form.prompt.length}/1000</span>
      <button type="button" className={styles.miniAction} disabled={busy!==""||form.prompt.trim().length<3}
       onClick={()=>void idea()}><WandSparkles size={15}/>{L("Mejorar con IA","Enhance with AI")}</button>
     </div>
    </div>
    <div className={styles.dual}>
     <div className={styles.field}><label>{L("Motor","Engine")}</label>
      <div className={styles.segment}>
       <button type="button" className={form.model==="gen4.5"?styles.chosen:""} onClick={()=>patch("model","gen4.5")}>Runway</button>
       <button type="button" className={form.model==="kling"?styles.chosen:""} onClick={()=>patch("model","kling")}>Kling</button>
      </div>
     </div>
     <div className={styles.field}><label>{L("Duración","Duration")}</label>
      <div className={styles.segment}>
       <button type="button" className={form.duration===5?styles.chosen:""} onClick={()=>patch("duration",5)}>5 s</button>
       <button type="button" className={form.duration===10?styles.chosen:""} onClick={()=>patch("duration",10)}>10 s</button>
      </div>
     </div>
    </div>
    <div className={styles.field}><label>{L("Formato","Format")}</label>
     <div className={styles.segment}>
      <button type="button" className={form.ratio==="720:1280"?styles.chosen:""} onClick={()=>patch("ratio","720:1280")}>{L("Vertical · Reels","Vertical · Reels")}</button>
      <button type="button" className={form.ratio==="1280:720"?styles.chosen:""} onClick={()=>patch("ratio","1280:720")}>{L("Horizontal","Landscape")}</button>
     </div>
    </div>
    <div className={styles.field}>
     <label htmlFor="vmv-caption">{L("Descripción para redes","Social description")}</label>
     <textarea id="vmv-caption" rows={2} maxLength={500} value={form.caption}
      onChange={e=>patch("caption",e.target.value)}
      placeholder={L("Descripción y hashtags opcionales","Optional caption and hashtags")}/>
    </div>
    <label className={styles.approval}>
     <input type="checkbox" checked={costApproved} onChange={e=>setCostApproved(e.target.checked)}/>
     <span>{L("Autorizo esta generación. Runway puede cobrar créditos por el resultado.","I authorize this generation. Runway may charge credits for the result.")}</span>
    </label>
    <button className={styles.primary} type="button" onClick={()=>void generate()}
     disabled={!configured||!costApproved||busy!==""||imageLoading||form.prompt.trim().length<3||(form.mode==="image"&&!image)}>
     {busy==="generate"?<LoaderCircle size={18} className={styles.spinner}/>:<Play size={18}/>}
     {busy==="generate"?L("Enviando a Runway…","Sending to Runway…"):L("Generar video","Generate video")}
    </button>
   </section>
  </>:null}
  {screen==="pilot"&&ready?<AutopilotWizard initial={pilot} en={en} busy={busy==="pilot"}
   onSave={savePilot} onExit={()=>open("home")} onLibrary={()=>open("library")}/>:null}
  {screen==="library"?<>
   <div className={styles.heading}><span className={styles.eyebrow}><Library size={15}/>{L("TUS CREACIONES","YOUR CREATIONS")}</span>
    <h1>{L("Mi biblioteca","My library")}</h1>
   </div>
   <div className={styles.libraryGrid}>
    <section className={styles.libraryList}>
     <div className={styles.libraryTitle}>
      <strong>{L("Videos","Videos")} · {jobs.length}</strong>
      <button type="button" disabled={busy!==""} className={styles.iconButton} onClick={()=>void load()} aria-label={L("Actualizar","Refresh")}>
       <RefreshCw size={17}/></button>
     </div>
     {jobs.length?jobs.map(j=><button type="button" key={j.id}
      className={selected===j.id?styles.jobSelected:styles.job} onClick={()=>selectJob(j)}>
      <span className={styles.jobIcon}><Film size={17}/></span>
      <span className={styles.jobInfo}><strong>{L("Video generado","Generated video")} · {date(j.created_at)}</strong><small>{j.duration} s · {j.model==="kling"?"Kling":"Runway"}</small></span>
      <span className={j.status==="SUCCEEDED"?styles.done:j.status==="FAILED"?styles.failed:styles.waiting}>{status(j)}</span>
     </button>):<div className={styles.empty}>{L("Aún no has generado videos.","You haven't generated videos yet.")}</div>}
    </section>
    <section className={styles.previewCard}>
     {current?<>
      <div className={styles.previewHeading}><strong>{status(current)}</strong>
       {active(current)?<LoaderCircle size={19} className={styles.spinner}/>:current.status==="SUCCEEDED"?<CheckCircle2 size={20}/>:<X size={18}/>}</div>
      {current.output_url&&current.status==="SUCCEEDED"?<>
       <video controls playsInline preload="metadata" className={styles.video} src={current.output_url}/>
       <button type="button" className={styles.primary} disabled={downloading} onClick={()=>void downloadJob(current)}>
        {downloading?<LoaderCircle size={17} className={styles.spinner}/>:<Download size={17}/>}
        {downloading?L("Descargando…","Downloading…"):L("Descargar MP4","Download MP4")}</button>
       <a href={current.output_url} target="_blank" rel="noopener noreferrer" className={styles.miniAction}>
        <ArrowUpRight size={15}/>{L("Abrir original","Open original")}</a>
       <p className={styles.foot}>{L("Descarga el archivo: el enlace del proveedor puede caducar.","Save your file; provider links may expire.")}</p>
      </>:<div className={styles.videoEmpty}>
       {active(current)?<LoaderCircle size={26} className={styles.spinner}/>:<Video size={26}/>}
       <p>{current.status==="FAILED"?errMessage(current.failure_code||"",en):
        active(current)?L("Generando tu video. Puedes salir y volver más tarde.","Generating your video. You can come back later."):
        L("Sin video disponible.","No video available.")}</p>
       {active(current)?<button type="button" className={styles.secondary} onClick={()=>void refreshJob(current.id)}>
        <RefreshCw size={15}/>{L("Comprobar progreso","Check progress")}</button>:null}
      </div>}
      <div className={styles.resultActions}>
       <button type="button" className={styles.secondary} onClick={()=>
        setPromptOpen(id=>id===current.id?null:current.id)}>
        {promptOpen===current.id?L("Ocultar prompt","Hide prompt"):L("Ver prompt de este video","View video prompt")}
       </button>
       <button type="button" className={styles.primary} disabled={current.status!=="SUCCEEDED"}
        onClick={()=>{setCaptionModal(true);setCaptionError("");}}>
        <Sparkles size={17}/>{L("Generar descripción","Generate caption")}
       </button>
      </div>
      {promptOpen===current.id?<p className={styles.videoPrompt}>{current.prompt}</p>:null}
      {generatedCaptions[current.id]?<div className={styles.caption}>
       <strong>{L("Descripción para","Caption for")} {generatedCaptions[current.id].platform}</strong>
       <p>{generatedCaptions[current.id].caption}</p>
       <button type="button" className={styles.miniAction} onClick={()=>void navigator.clipboard.writeText(generatedCaptions[current.id].caption)}>
        {L("Copiar descripción","Copy caption")}</button>
      </div>:null}
      {captionModal?<div className={styles.captionOverlay} role="presentation"
       onMouseDown={e=>{if(e.target===e.currentTarget&&!captionBusy)setCaptionModal(false);}}>
       <div className={styles.captionDialog} role="dialog" aria-modal="true" aria-label={L("Elegir red social","Choose social platform")}>
        <div className={styles.captionHeader}><strong>{L("¿Para qué red social?","Which social platform?")}</strong>
         <button type="button" aria-label={L("Cerrar","Close")} disabled={captionBusy}
          onClick={()=>setCaptionModal(false)}><X size={18}/></button></div>
        <p>{L("Crearé un texto específico con estructura y hashtags relevantes.","I'll write a structured, platform-specific caption with relevant hashtags.")}</p>
        <div className={styles.captionPlatforms}>
         {([["instagram","Instagram"],["facebook","Facebook"],["tiktok","TikTok"],
          ["youtube","YouTube Shorts"],["linkedin","LinkedIn"]] as const).map(([id,label])=>
          <button key={id} type="button" disabled={captionBusy||(needsVideoSubject&&manualVideoSubject.trim().length<8)} onClick={()=>void createCaption(id)}>
           {captionBusy?<LoaderCircle size={17} className={styles.spinner}/>:<Sparkles size={16}/>} {label}
          </button>)}
        </div>
        {needsVideoSubject?<label className={styles.captionManual}>
         {L("¿Qué aparece realmente en el video?","What actually appears in the video?")}
         <textarea rows={3} maxLength={450} value={manualVideoSubject}
          placeholder={L("Ejemplo: una pantera negra camina hacia la cámara en un jardín.","Example: a black panther walks toward the camera in a garden.")}
          onChange={e=>setManualVideoSubject(e.target.value)}/>
        </label>:null}
        {captionError?<p role="alert" className={styles.captionError}>{captionError}</p>:null}
       </div>
      </div>:null}
     </>:<div className={styles.empty}>{L("Selecciona un video para verlo.","Select a video to preview.")}</div>}
    </section>
   </div>
  </>:null}
  {!ready?<div className={styles.status}><LoaderCircle size={17} className={styles.spinner}/>{L("Cargando…","Loading…")}</div>:null}
  {errorText?<div className={styles.alert} role="alert"><span>{errorText}</span>
   <button type="button" onClick={()=>setError("")} aria-label={L("Cerrar aviso","Dismiss")}><X size={16}/></button></div>:null}
  {notice?<div className={styles.notice} role="status"><CheckCircle2 size={16}/>{notice}</div>:null}
 </div></main>;
}
