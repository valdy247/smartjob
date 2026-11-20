"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,ArrowRight,Bot,Check,CheckCircle2,Film,ImagePlus,LoaderCircle,Pencil,RefreshCw,Sparkles,WandSparkles} from "lucide-react";
import VideoCreationResult,{mediaHeaders} from "./VideoCreationResult";
import {getSupabase} from "@/lib/supabase";
import theme from "./AgentServiceFlow.module.css";
import base from "./AutomaticWebWizard.module.css";
import styles from "./AutomaticVideoWizard.module.css";

type Stage="source"|"reference"|"script"|"format"|"review"|"result";
type Mode="text"|"image";
type Model="gen4.5"|"kling";
type Ratio="720:1280"|"1280:720";
type VideoStatus={configured:boolean};
const stages=(mode:Mode):Stage[]=>mode==="image"?
 ["source","reference","script","format","review","result"]:
 ["source","script","format","review","result"];
const questions:Record<Stage,string>={
 source:"¿Qué quieres crear?",reference:"Elige tu imagen de partida",script:"Describe lo que quieres crear",
 format:"Ajustes de generación",review:"Revisa tu creación",result:"Tu resultado"
};
const concepts=[["realistic","Realista"],["cinematic","Cinematográfico"],["animated","Animado"],["product","Producto"]] as const;
const videoError:Record<string,string>={
 video_not_enabled_for_account:"La generación está limitada a cuentas autorizadas del piloto. Puedes preparar el guion.",
 runway_key_missing:"El proveedor de video todavía no está conectado.",
 video_daily_limit:"Se alcanzó el límite de pruebas para esta cuenta.",
 video_active_job_limit:"Espera a que termine la generación anterior.",
 runway_credits_required:"Runway necesita créditos disponibles.",
 runway_rate_limited:"El proveedor está ocupado; intenta más tarde.",
 runway_access_denied:"Este modelo no está habilitado en Runway.",
 runway_parameters_or_model_rejected:"Runway rechazó esta combinación de formato y modelo.",
 video_ai_limit:"El asistente alcanzó el límite temporal de guiones.",
 video_ai_unavailable:"La IA no pudo generar el guion. Puedes escribirlo manualmente.",
 image_daily_limit:"Se alcanzó el presupuesto de seguridad del piloto. Puedes subir una foto.",
 video_image_unavailable:"No se pudo generar esta imagen. Puedes reintentar o subir una foto.",
 invalid_video_request:"Revisa el guion, imagen, formato y autorización de créditos."
};
async function jpgDataUrl(blob:Blob){
 if(!["image/jpeg","image/png","image/webp"].includes(blob.type)||
    blob.size<1024||blob.size>14*1024*1024)throw Error("Selecciona una imagen JPG, PNG o WebP válida.");
 const bitmap=await createImageBitmap(blob);
 try{
  if(!bitmap.width||!bitmap.height||bitmap.width>9000||bitmap.height>9000)
   throw Error("La resolución de la imagen no es válida.");
  const ratio=Math.min(1,1440/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
  canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
  const ctx=canvas.getContext("2d");if(!ctx)throw Error("No se pudo procesar la imagen.");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  for(const quality of [.82,.7,.55,.4]){
   const url=canvas.toDataURL("image/jpeg",quality);
   if(url.length<=4100000)return url;
  }
  throw Error("La imagen es demasiado grande para el generador.");
 }finally{bitmap.close();}
}
export default function AutomaticVideoWizard({onClose}:{onClose:()=>void}){
 const [stage,setStage]=useState<Stage>("source");
 const [editing,setEditing]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [owner,setOwner]=useState("");
 const [style,setStyle]=useState<(typeof concepts)[number][0]>("cinematic");
 const [model,setModel]=useState<Model>("gen4.5");
 const [ratio,setRatio]=useState<Ratio>("720:1280");
 const [duration,setDuration]=useState<5|10>(5);
 const [mode,setMode]=useState<Mode>("text");
 const [filePreview,setFilePreview]=useState("");
 const [imageCandidate,setImageCandidate]=useState("");
 const [imageDirection,setImageDirection]=useState("");
 const [imageAnalysis,setImageAnalysis]=useState<{
  subject:string;observations:string;groundedMotion:string;conflict:boolean;reason:string;
 }|null>(null);
 const [manualSubject,setManualSubject]=useState("");
 const [creativeOverride,setCreativeOverride]=useState(false);
 const [allowTransformation,setAllowTransformation]=useState(false);
 const [prompt,setPrompt]=useState("");
 const [caption,setCaption]=useState("");
 const [confirmCredits,setConfirmCredits]=useState(false);
 const [configured,setConfigured]=useState(false);
 const [videoStatus,setVideoStatus]=useState("");
 const [standalone,setStandalone]=useState(false);
 const [size,setSize]=useState("1024x1024");
 const [quality,setQuality]=useState("standard");
 const [jobId,setJobId]=useState("");
 const [outputImage,setOutputImage]=useState<Blob|null>(null);
 const [clientKey]=useState(()=>crypto.randomUUID());
 const steps=stages(mode),index=steps.indexOf(stage);
 const valid=
  stage==="reference"?Boolean(filePreview)&&!imageCandidate&&Boolean(imageAnalysis||manualSubject.trim().length>=8)&&(!imageAnalysis?.conflict||creativeOverride)&&(!allowTransformation||imageDirection.trim().length>=8):
  stage==="script"?prompt.trim().length>=3&&prompt.length<=1000:
  true;
 useEffect(()=>{
  let active=true;
  void(async()=>{
   try{
    const db=getSupabase();if(!db)throw Error("No hay conexión con VMV.");
    const {data:{user},error:authError}=await db.auth.getUser();
    if(authError||!user||user.is_anonymous)throw Error("Inicia sesión para crear.");
    if(!active)return;
    setOwner(user.id);
    const {data:{session}}=await db.auth.getSession();
    if(!session?.access_token)throw Error("Inicia sesión nuevamente.");
    const r=await fetch("/api/video-generator",{
     headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"
    });
    const status=await r.json().catch(()=>({})) as VideoStatus & {error?:string};
    if(!active)return;
    if(!r.ok){setVideoStatus(videoError[status.error||""]||"Video Generator aún no está disponible para esta cuenta.");return;}
    setConfigured(status.configured===true);
    if(!status.configured)setVideoStatus("Falta conectar Runway en el entorno de pruebas.");
   }catch(e){if(active)setError(e instanceof Error?e.message:"No se pudo cargar el contexto del video.");}
   finally{if(active)setLoading(false);}
  })();
  return()=>{active=false;};
 },[]);
 const api=async(path:string,body:Record<string,unknown>)=>{
  const db=getSupabase();if(!db)throw Error("No hay conexión.");
  const {data:{session}}=await db.auth.getSession();
  if(!session?.access_token||session.user.id!==owner)throw Error("Inicia sesión nuevamente.");
  const res=await fetch(path,{method:"POST",cache:"no-store",headers:{
   Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"
  },body:JSON.stringify(body)});
  const result=await res.json().catch(()=>({error:"network"}));
  if(!res.ok)throw Error(String(result.error||"network"));
  return result;
 };
 const move=(target:Stage)=>{setError("");setStage(target);};
 const next=()=>{
  if(busy||!valid)return;
  if(editing){setEditing(false);move("review");return;}
  const nextStage=steps[Math.min(index+1,steps.length-1)];
  move(nextStage);
 };
 const back=()=>{
  if(editing){setEditing(false);move("review");return;}
  if(busy)return;
  if(index===0||stage==="result"){onClose();return;}
  move(steps[index-1]);
 };
 const edit=(target:Stage)=>{setConfirmCredits(false);setEditing(true);move(target);};
 const generateScript=async()=>{
  if(busy)return;
  setBusy("script");setError("");
  try{
   const visual=mode==="image"?
    (imageAnalysis?("VERIFIED IMAGE SUBJECT: "+imageAnalysis.subject+
     ". OBSERVED FRAME: "+imageAnalysis.observations+
     ". PRESERVE THIS SUBJECT: "+imageAnalysis.groundedMotion):
     "USER-CONFIRMED IMAGE SUBJECT: "+manualSubject.trim()):"";
   const existing=[
    prompt.trim(),
    mode==="image"?"IMAGE TO VIDEO. The image is primary visual evidence.":"TEXT TO VIDEO.",
    visual,
    mode==="image"?"HARD CONSTRAINT: keep the pictured main subject and species.":
     "Describe one clear scene.",
    mode==="image"&&allowTransformation?
     "Explicit owner-approved creative transformation: "+imageDirection.slice(0,180):"",
    "Style: "+style
   ].filter(Boolean).join("\n").slice(0,1000);
   const result=await api("/api/video-generator/brief",{
    style,prompt:standalone?prompt:existing,output:standalone?"image":"video",locale:"es",
    visualGrounding:mode==="image"?{
     subject:imageAnalysis?.subject||manualSubject.trim(),
     observations:imageAnalysis?.observations||manualSubject.trim(),
     groundedMotion:imageAnalysis?.groundedMotion||manualSubject.trim(),
     permitTransformation:allowTransformation,creativeDirection:imageDirection.slice(0,180)
    }:null
   });
   if(typeof result.prompt!=="string"||result.prompt.trim().length<20)
    throw Error("video_ai_unavailable");
   setPrompt(result.prompt.slice(0,1000));
   setCaption(String(result.caption||"").slice(0,500));
  }catch(e){const code=e instanceof Error?e.message:"video_ai_unavailable";
   setError(videoError[code]||"No se pudo crear el guion automáticamente. Puedes escribirlo aquí.");}
  finally{setBusy("");}
 };
 const inspectReference=async(reference:string)=>{
  setImageAnalysis(null);setManualSubject("");setCreativeOverride(false);setAllowTransformation(false);
  setPrompt("");setCaption("");setConfirmCredits(false);
  try{
   const visual=await api("/api/video-generator/analyze-image",{
    imageUrl:reference,desiredScene:imageDirection.slice(0,260)
   });
   if(typeof visual.subject!=="string"||!visual.subject.trim()||
      typeof visual.groundedMotion!=="string")throw Error("visual_analysis_unavailable");
   setImageAnalysis({
    subject:visual.subject.slice(0,130),observations:String(visual.observations||"").slice(0,240),
    groundedMotion:visual.groundedMotion.slice(0,450),
    conflict:visual.conflict===true,reason:String(visual.reason||"").slice(0,220)
   });
  }catch{
   setError("No pude reconocer esta imagen automáticamente. Describe qué aparece en ella para continuar. No inventaré el sujeto.");
  }
 };
 const uploadReference=async(file?:File)=>{
  if(!file||busy)return;
  setBusy("analyze");setError("");
  try{
   const reference=await jpgDataUrl(file);
   setFilePreview(reference);setImageCandidate("");
   await inspectReference(reference);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo preparar la imagen.");}
  finally{setBusy("");}
 };
 const generateReference=async()=>{
  if(busy)return;
  if(!window.confirm("Generar una imagen utiliza 1 crédito del cupo diario compartido de imágenes con IA. ¿Continuar?"))return;
  setBusy("image");setError("");setImageCandidate("");
  try{
   const result=await api("/api/video-generator/image",{
    direction:imageDirection,size,quality
   });
   const mime=String(result.mediaType||"");
   const base64=String(result.imageBase64||"");
   if(!["image/jpeg","image/png","image/webp"].includes(mime)||!base64||base64.length>9000000)
    throw Error("La imagen generada no tiene un formato válido.");
   const binary=atob(base64),bytes=new Uint8Array(binary.length);
   for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   const preview=await jpgDataUrl(new Blob([bytes],{type:mime}));
   setImageCandidate(preview);
  }catch(e){const code=e instanceof Error?e.message:"video_image_unavailable";
   setError(videoError[code]||"No se pudo crear la imagen. Reintenta o sube una foto.");}
  finally{setBusy("");}
 };
 const submit=async()=>{
  if(!configured||!confirmCredits||busy||prompt.trim().length<3||
     (mode==="image"&&(!filePreview||Boolean(imageCandidate)))||!owner)return;
  
  setBusy("submit");setError("");
  try{
   const result=await api("/api/video-generator",{
    prompt:(prompt.trim().slice(0,960)+"\nVisual style: "+style).slice(0,1000),caption:caption.trim(),mode,model,ratio,duration,
    imageUrl:mode==="image"?filePreview:"",confirmCost:true,clientKey
   });
   if(!result.job?.id||!String(result.job.id).match(/^[0-9a-f-]{36}$/i))
    throw Error("No se pudo confirmar el trabajo.");
   setJobId(result.job.id);move("result");
  }catch(e){const code=e instanceof Error?e.message:"network";
   setError(videoError[code]||"No se pudo iniciar el video. Si hubo un error de red, revisa Mi biblioteca antes de reintentar.");}
  finally{setBusy("");}
 };
 const reviewCard=(label:string,value:string,target:Stage)=><div className={base.reviewCard} key={label}>
  <span><small>{label}</small><strong>{value||"Pendiente"}</strong></span>
  <button className={base.edit} type="button" aria-label={"Editar "+label} title={"Editar "+label}
   onClick={()=>edit(target)}><Pencil size={17}/></button>
 </div>;
 const startImage=async()=>{
  if(busy||!confirmCredits||!owner||prompt.trim().length<3)return;
  setBusy("submit");setError("");
  try{
   const response=await fetch("/api/video-generator/image",{method:"POST",
    headers:{...await mediaHeaders(owner),"Content-Type":"application/json"},
    body:JSON.stringify({output:"image",prompt,size,quality})});
   if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(videoError[data.error]||"No se pudo generar la imagen.");}
   const blob=await response.blob();
   if(!blob.type.startsWith("image/"))throw Error("El proveedor devolvió un archivo inválido.");
   setOutputImage(blob);move("result");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo generar la imagen.");}
  finally{setBusy("");}
 };
 const selectMode=(choice:"text"|"image"|"still")=>{
  setEditing(false);setStandalone(choice==="still");setMode(choice==="image"?"image":"text");
  setConfirmCredits(false);move(choice==="image"?"reference":"script");
 };
 const imageSettings=<>
  <label className={base.field}>Tamaño de imagen<select value={size} onChange={e=>setSize(e.target.value)}>
   <option value="1024x1024">Cuadrada · 1024 × 1024</option><option value="1024x1536">Vertical · 1024 × 1536</option>
   <option value="1536x1024">Horizontal · 1536 × 1024</option></select></label>
  <label className={base.field}>Calidad<select value={quality} onChange={e=>setQuality(e.target.value)}>
   <option value="standard">Estándar · GPT Image 1 Mini</option><option value="high">Alta · GPT Image 1.5</option></select></label>
 </>;
 return <section className={base.root+" "+theme.flow} aria-label="Video Generator con AI Agents">
  <div className={base.top}><button type="button" aria-label="Volver" disabled={Boolean(busy)} onClick={back}><ArrowLeft size={19}/></button>
   <span>Video Generator · Mi agente</span><span>{index+1}/{steps.length}</span></div>
  <div className={base.track}><span className={theme.agentProgress}
   style={{width:((index+1)/steps.length*100)+"%"}}/></div>
  <div className={base.robot+" "+theme.agentRobot}><Bot size={35}/><Sparkles size={16}/></div>
  <h1 className={base.question+" "+theme.agentHeading}>{questions[stage]}</h1>
  {loading?<p role="status" className={base.note}><LoaderCircle size={17} className={base.spin}/> Cargando el creador…</p>:null}
  {!loading&&owner&&stage==="source"&&<div className={base.optionsVertical}>
   <button className={base.option} onClick={()=>selectMode("text")}><Film/>Texto a video</button>
   <button className={base.option} onClick={()=>selectMode("image")}><ImagePlus/>Imagen a video</button>
   <button className={base.option} onClick={()=>selectMode("still")}><WandSparkles/>Texto a imagen</button>
  </div>}
  {!loading&&owner&&stage==="reference"?<div className={base.panel}>
   <label className={styles.referenceUpload}>
    <ImagePlus size={22}/><strong>Subir imagen de referencia</strong>
    <small>JPG, PNG o WebP · máximo 14 MB</small>
    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)}
     onChange={e=>{const file=e.target.files?.[0];e.target.value="";
      if(file)void uploadReference(file);}}/>
   </label>
   {filePreview?<div className={styles.reference}><img src={filePreview} alt="Imagen aprobada para generar el video"/>
    <div className={styles.success}><CheckCircle2 size={16}/> Imagen preparada para el video</div></div>:null}
   {busy==="analyze"?<p className={styles.generating} role="status">
    <LoaderCircle size={17} className={base.spin}/> Analizando el contenido real de tu imagen…</p>:null}
   {imageAnalysis?<div className={styles.vision}>
    <strong>El agente reconoce: {imageAnalysis.subject}</strong>
    <p>{imageAnalysis.observations}</p>
    {imageAnalysis.conflict?<div className={styles.conflict}>
     <strong>La idea no coincide completamente con la imagen</strong>
     <p>{imageAnalysis.reason||"La imagen contiene un sujeto distinto de la escena indicada."}</p>
     <div className={styles.visionChoices}>
      <button type="button" className={creativeOverride&&!allowTransformation?base.optionActive:base.option}
       onClick={()=>{setCreativeOverride(true);setAllowTransformation(false);}}>
       Mantener el sujeto visible y corregir el guion</button>
      <button type="button" className={allowTransformation?base.optionActive:base.option}
       onClick={()=>{setCreativeOverride(true);setAllowTransformation(true);}}>
       Autorizar una transformación creativa</button>
     </div>
     {allowTransformation?<p>Describe arriba qué transformación quieres. Primero se respetará el fotograma original.</p>:null}
     <p>También puedes sustituir la imagen. Si no autorizas el cambio, no generaré un guion contradictorio.</p>
    </div>:<p className={styles.success}>El guion conservará este sujeto como protagonista.</p>}
   </div>:null}
   {filePreview&&!imageAnalysis&&busy!=="analyze"?<label className={base.field}>
    Qué aparece realmente en la imagen (si el análisis no estuvo disponible)
    <textarea value={manualSubject} maxLength={260} rows={3}
     onChange={e=>setManualSubject(e.target.value)}
     placeholder="Ejemplo: pantera negra caminando hacia la cámara; no hay personas."/>
   </label>:null}
   <div className={styles.imageAiBox}>
    <strong className={styles.label}>O genera tu imagen de referencia con IA</strong>
    <label className={base.field}>Describe la imagen
     <textarea rows={2} value={imageDirection} maxLength={260} disabled={Boolean(busy)}
      onChange={e=>setImageDirection(e.target.value)}
      placeholder="Ejemplo: toma cinematográfica de un pastel elegante sobre una mesa"/></label>
    {imageSettings}
    <button type="button" className={base.option+" "+theme.agentOutline}
     onClick={()=>void generateReference()} disabled={Boolean(busy)||imageDirection.trim().length<3}>
     {busy==="image"?<LoaderCircle size={17} className={base.spin}/>:<WandSparkles size={17}/>}
     {busy==="image"?"Creando imagen…":"Generar imagen con IA"}</button>
    {imageCandidate?<div className={styles.reference}>
     <img src={imageCandidate} alt="Propuesta generada por IA, pendiente de aprobación"/>
     <div className={styles.imageActions}>
      <button type="button" className={base.optionActive} onClick={()=>{
       const reference=imageCandidate;setFilePreview(reference);setImageCandidate("");
       setError("");setBusy("analyze");
       void inspectReference(reference).finally(()=>setBusy(""));
      }} disabled={Boolean(busy)}><Check size={16}/> Aprobar imagen</button>
      <button type="button" className={base.option} disabled={Boolean(busy)}
       onClick={()=>void generateReference()}><RefreshCw size={16}/> Reintentar</button>
      <button type="button" className={base.option} disabled={Boolean(busy)}
       onClick={()=>setImageCandidate("")}>Descartar propuesta</button>
     </div>
    </div>:null}
   </div>

   <p className={base.note}>Una imagen de IA no se envía a Runway hasta que la apruebes y confirmes los créditos.</p>
  </div>:null}

  {!loading&&owner&&stage==="script"&&<div className={base.panel}>
   <label className={base.field}>{mode==="image"?"¿Cómo debe moverse la imagen?":"Tu prompt"}
    <textarea rows={5} maxLength={1000} value={prompt} disabled={Boolean(busy)} onChange={e=>setPrompt(e.target.value)}
     placeholder={standalone?"Describe el sujeto, el fondo y el estilo…":mode==="image"?"Describe el movimiento del sujeto o de la cámara…":"Describe la escena, la acción y el ambiente…"}/></label>
   <button className={base.option} disabled={Boolean(busy)||(mode!=="image"&&prompt.trim().length<3)} onClick={()=>void generateScript()}>
    <Sparkles size={17}/>{busy==="script"?"Preparando prompt…":prompt.trim()?"Mejorar con IA":"Sugerir movimiento con IA"}</button>
  </div>}
  {!loading&&owner&&stage==="format"&&<div className={base.panel}>{standalone?imageSettings:<>
   <span className={styles.label}>Estilo del video</span>
   <div className={base.optionsVertical}>{concepts.map(([id,label])=><button key={id} type="button"
    className={style===id?base.optionActive:base.option} onClick={()=>setStyle(id)}
    aria-pressed={style===id}>{label}</button>)}</div>
   <span className={styles.label}>Formato</span>
   <div className={base.options}>
    <button type="button" className={ratio==="720:1280"?base.optionActive:base.option}
     onClick={()=>setRatio("720:1280")}>Vertical · Reels</button>
    <button type="button" className={ratio==="1280:720"?base.optionActive:base.option}
     onClick={()=>setRatio("1280:720")}>Horizontal · YouTube</button>
   </div>
   <span className={styles.label}>Duración</span>
   <div className={base.options}>
    {([5,10] as const).map(v=><button type="button" key={v}
     className={duration===v?base.optionActive:base.option}
     onClick={()=>setDuration(v)}>{v} segundos</button>)}
   </div>
   <span className={styles.label}>Motor de generación</span>
   <div className={base.options}>
    <button type="button" className={model==="gen4.5"?base.optionActive:base.option}
     onClick={()=>setModel("gen4.5")}>Runway</button>
    <button type="button" className={model==="kling"?base.optionActive:base.option}
     onClick={()=>setModel("kling")}>Kling</button>
   </div>

  </>}</div>}
  {!loading&&owner&&stage==="review"&&<div className={base.panel}>
   {reviewCard("Guion",prompt,"script")}
   {mode==="image"&&reviewCard("Imagen","Referencia aprobada","reference")}
   {reviewCard("Ajustes",standalone?size+" · "+(quality==="high"?"Alta":"Estándar"):
    duration+" segundos · "+(ratio==="720:1280"?"Vertical":"Horizontal")+" · "+(model==="kling"?"Kling":"Runway"),"format")}
   <label className={base.checkLine}><input type="checkbox" checked={confirmCredits} onChange={e=>setConfirmCredits(e.target.checked)}/>
    Autorizo usar créditos para esta generación.</label>
   {!standalone&&!configured&&<p className={base.warning}>{videoStatus||"El generador de video no está disponible."}</p>}
  </div>}
  {stage==="result"&&<VideoCreationResult owner={owner} jobId={jobId} image={outputImage}/>}
  {error&&<p className={base.error} role="alert">{error}</p>}
  {!loading&&owner&&stage!=="source"&&stage!=="result"&&<div className={base.footer}>
   {stage==="review"?<button className={base.primary+" "+theme.agentButton} disabled={Boolean(busy)||!confirmCredits||(!standalone&&!configured)}
    onClick={()=>void (standalone?startImage():submit())}>{busy?"Generando…":standalone?"Generar imagen":"Generar video"}</button>:
    <button className={base.primary+" "+theme.agentButton} disabled={!valid||Boolean(busy)} onClick={next}>
     {editing?"Guardar y volver a Revisión":"Continuar"} <ArrowRight size={17}/></button>}
  </div>}
 </section>;
}
