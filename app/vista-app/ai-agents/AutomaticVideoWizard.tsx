"use client";
import {useEffect,useMemo,useState} from "react";
import {ArrowLeft,ArrowRight,Bot,Check,CheckCircle2,Film,ImagePlus,LoaderCircle,Package,Pencil,Play,RefreshCw,ShieldCheck,Sparkles,WandSparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import type {CentralBusiness} from "./centralBusiness";
import type {PersistedAgent} from "./agentStore";
import theme from "./AgentServiceFlow.module.css";
import base from "./AutomaticWebWizard.module.css";
import styles from "./AutomaticVideoWizard.module.css";

type Stage="business"|"purpose"|"offer"|"audience"|"format"|"source"|"reference"|"script"|"review";
type Mode="text"|"image";
type Model="gen4.5"|"kling";
type Ratio="720:1280"|"1280:720";
type Item={id:string;name:string;description:string;type:"product"|"service"};
type Pilot={id:string;niche:string;audience:string;goal:string;style:string;frequency:number};
type VideoStatus={configured:boolean;dailyLimit?:number;pilots?:Pilot[]};
const stages:(mode:Mode)=>Stage[]=mode=>mode==="image"?
 ["business","purpose","offer","audience","format","source","reference","script","review"]:
 ["business","purpose","offer","audience","format","source","script","review"];
const questions:Record<Stage,string>={
 business:"¿Este video es para tu negocio?",
 purpose:"¿Qué quieres lograr con el video?",
 offer:"¿Qué productos o servicios aparecerán?",
 audience:"¿A quién quieres llegar?",
 format:"¿Cómo quieres que se vea?",
 source:"¿De dónde partimos?",
 reference:"¿Qué imagen usaremos?",
 script:"Tu agente preparó el guion",
 review:"Revisa tu video antes de generarlo"
};
const targets=[["promotion","Presentar mi negocio"],["product","Mostrar productos o servicios"],
 ["education","Compartir un consejo"],["social","Contenido para redes"]] as const;
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
export default function AutomaticVideoWizard({business,workspaceId,agent,onClose}:{
 business:CentralBusiness;workspaceId:string;agent:PersistedAgent;onClose:()=>void;
}){
 const [stage,setStage]=useState<Stage>("business");
 const [editing,setEditing]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [owner,setOwner]=useState("");
 const [name,setName]=useState(business.name);
 const [editName,setEditName]=useState(false);
 const [purpose,setPurpose]=useState<(typeof targets)[number][0]>("promotion");
 const [items,setItems]=useState<Item[]>([]);
 const [selected,setSelected]=useState<string[]>([]);
 const [extra,setExtra]=useState("");
 const [audience,setAudience]=useState("Clientes interesados en "+business.name.slice(0,80));
 const [style,setStyle]=useState<(typeof concepts)[number][0]>("cinematic");
 const [model,setModel]=useState<Model>("gen4.5");
 const [ratio,setRatio]=useState<Ratio>("720:1280");
 const [duration,setDuration]=useState<5|10>(5);
 const [mode,setMode]=useState<Mode>("text");
 const [filePreview,setFilePreview]=useState("");
 const [pilotId,setPilotId]=useState<string|null>(null);
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
 const [scriptAutoTried,setScriptAutoTried]=useState(false);
 const [clientKey]=useState(()=>crypto.randomUUID());
 const steps=stages(mode),index=steps.indexOf(stage);
 const chosen=useMemo(()=>items.filter(x=>selected.includes(x.id)),[items,selected]);
 const offer=[...chosen.map(x=>x.name),...extra.split(/[\n,]+/).map(x=>x.trim()).filter(Boolean)]
  .filter((x,i,a)=>a.indexOf(x)===i).slice(0,12).join(", ");
 const topic=(offer||business.description||name).slice(0,160);
 const goal=targets.find(x=>x[0]===purpose)?.[1]||"Presentar el negocio";
 const valid=stage==="business"?name.trim().length>=2:
  stage==="audience"?audience.trim().length>=3:
  stage==="reference"?Boolean(filePreview)&&!imageCandidate&&Boolean(imageAnalysis||manualSubject.trim().length>=8)&&(!imageAnalysis?.conflict||creativeOverride)&&(!allowTransformation||imageDirection.trim().length>=8):
  stage==="script"?prompt.trim().length>=3&&prompt.length<=1000:
  true;
 useEffect(()=>{
  let active=true;
  void(async()=>{
   try{
    const db=getSupabase();if(!db)throw Error("No hay conexión con VMV.");
    const {data:{user},error:authError}=await db.auth.getUser();
    if(authError||!user||user.is_anonymous||user.id!==business.owner_id||
       user.id!==agent.owner_id||agent.business_id!==workspaceId)
     throw Error("El agente y el negocio deben pertenecer a la misma cuenta.");
    if(!active)return;
    setOwner(user.id);
    const [central,catalog,services]=await Promise.all([
     db.from("vmv_marketing_businesses").select("id,services,products,description")
      .eq("owner_id",user.id).eq("id",business.id).maybeSingle(),
     db.from("vmv_ai_catalog_items").select("id,name,description")
      .eq("owner_id",user.id).eq("business_id",workspaceId)
      .eq("approved",true).eq("active",true).limit(40),
     db.from("vmv_ai_booking_services").select("id,name,description")
      .eq("owner_id",user.id).eq("business_id",workspaceId)
      .eq("approved",true).eq("active",true).limit(30)
    ]);
    if(central.error||!central.data)throw Error("No se pudo validar tu negocio.");
    const records:Item[]=[
     ...(catalog.data||[]).map(v=>({id:v.id,name:v.name,description:v.description||"",type:"product" as const})),
     ...(services.data||[]).map(v=>({id:v.id,name:v.name,description:v.description||"",type:"service" as const}))
    ];
    for(const [type,names] of [
     ["service",String(central.data.services||"")],["product",String(central.data.products||"")]
    ] as const){
     for(const item of names.split(/[\n,]+/).map(v=>v.trim()).filter(Boolean).slice(0,12)){
      if(records.some(r=>r.name.toLowerCase()===item.toLowerCase()))continue;
      records.push({id:"central-"+type+"-"+records.length,name:item.slice(0,100),
       description:"",type});
     }
    }
    if(active){setItems(records);setSelected(records.slice(0,4).map(x=>x.id));}
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
    const pilotId=new URLSearchParams(window.location.search).get("pilot");
    const activePilot=status.pilots?.find(p=>p.id===pilotId);
    if(activePilot){
     setPilotId(activePilot.id);
     setAudience(activePilot.audience.slice(0,180)||"Clientes interesados en "+business.name);
     setExtra(activePilot.niche.slice(0,160));
     if(["realistic","cinematic","animated","product"].includes(activePilot.style))
      setStyle(activePilot.style as (typeof concepts)[number][0]);
     if(activePilot.goal.trim())setPurpose("social");
    }
   }catch(e){if(active)setError(e instanceof Error?e.message:"No se pudo cargar el contexto del video.");}
   finally{if(active)setLoading(false);}
  })();
  return()=>{active=false;};
 },[business.id,workspaceId,agent.id]);
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
  if(nextStage==="script"&&!scriptAutoTried&&!prompt.trim()&&(mode==="text"||Boolean(imageAnalysis||manualSubject.trim()))){
   setScriptAutoTried(true);void generateScript();
  }
  move(nextStage);
 };
 const back=()=>{
  if(editing){setEditing(false);move("review");return;}
  if(index===0){onClose();return;}
  move(steps[index-1]);
 };
 const edit=(target:Stage)=>{setConfirmCredits(false);setEditing(true);move(target);};
 const generateScript=async()=>{
  if(busy)return;
  setBusy("script");setError("");
  try{
   const details=chosen.slice(0,6).map(x=>x.name+": "+x.description.slice(0,85)).join("; ");
   const visual=mode==="image"?
    (imageAnalysis?("VERIFIED IMAGE SUBJECT: "+imageAnalysis.subject+
     ". OBSERVED FRAME: "+imageAnalysis.observations+
     ". PRESERVE THIS SUBJECT: "+imageAnalysis.groundedMotion):
     "USER-CONFIRMED IMAGE SUBJECT: "+manualSubject.trim()):"";
   const existing=[
    mode==="image"?"IMAGE TO VIDEO. The image is primary visual evidence.":"TEXT TO VIDEO.",
    visual,
    mode==="image"?"HARD CONSTRAINT: keep the pictured main subject and species.":
     "Describe one clear scene.",
    mode==="image"&&allowTransformation?
     "Explicit owner-approved creative transformation: "+imageDirection.slice(0,180):"",
    "Business context only (must NEVER replace pictured subject): "+name.slice(0,70),
    "Goal: "+goal,
    mode==="text"?"Products/services: "+(offer||"No confirmed offering"):
     "Commercial context (optional, never insert people or cake unless visually supported): "+offer.slice(0,110),
    mode==="text"&&details?"Known details: "+details:"",
    "Style: "+style,"No invented prices, discounts or testimonials."
   ].filter(Boolean).join("\n").slice(0,1000);
   const result=await api("/api/video-generator/brief",{
    niche:topic,audience:audience.trim().slice(0,150),goal:goal.slice(0,160),
    style,prompt:existing,locale:"es",
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
  setScriptAutoTried(false);setPrompt("");setCaption("");setConfirmCredits(false);
  try{
   const visual=await api("/api/video-generator/analyze-image",{
    imageUrl:reference,desiredScene:imageDirection.slice(0,260),offer:offer.slice(0,170)
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
    businessId:business.id,workspaceId,offer:offer||name,
    audience:audience.trim(),context:chosen.slice(0,4).map(x=>x.description).join("; ").slice(0,220),
    direction:imageDirection
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
  if(!window.confirm("¿Autorizas generar este video de "+duration+
   " segundos con "+(model==="kling"?"Kling":"Runway")+
   "? El proveedor puede consumir créditos. No se publicará en redes."))return;
  setBusy("submit");setError("");
  try{
   const result=await api("/api/video-generator",{
    prompt:prompt.trim(),caption:caption.trim(),mode,model,ratio,duration,
    imageUrl:mode==="image"?filePreview:"",pilotId,confirmCost:true,clientKey
   });
   if(!result.job?.id||!String(result.job.id).match(/^[0-9a-f-]{36}$/i))
    throw Error("No se pudo confirmar el trabajo.");
   window.location.assign("/vista-app/video-generator?job="+encodeURIComponent(result.job.id));
  }catch(e){const code=e instanceof Error?e.message:"network";
   setError(videoError[code]||"No se pudo iniciar el video. Si hubo un error de red, revisa Mi biblioteca antes de reintentar.");}
  finally{setBusy("");}
 };
 const reviewCard=(label:string,value:string,target:Stage)=><div className={base.reviewCard} key={label}>
  <span><small>{label}</small><strong>{value||"Pendiente"}</strong></span>
  <button className={base.edit} type="button" aria-label={"Editar "+label} title={"Editar "+label}
   onClick={()=>edit(target)}><Pencil size={17}/></button>
 </div>;
 return <section className={base.root+" "+theme.flow} aria-label="Video Generator con AI Agents">
  <div className={base.top}><button type="button" aria-label="Volver" onClick={back}><ArrowLeft size={19}/></button>
   <span>Video Generator · Mi agente</span><span>{index+1}/{steps.length}</span></div>
  <div className={base.track}><span className={theme.agentProgress}
   style={{width:((index+1)/steps.length*100)+"%"}}/></div>
  <div className={base.robot+" "+theme.agentRobot}><Bot size={35}/><Sparkles size={16}/></div>
  <h1 className={base.question+" "+theme.agentHeading}>{questions[stage]}</h1>
  {loading?<p role="status" className={base.note}><LoaderCircle size={17} className={base.spin}/> Cargando tu negocio…</p>:null}
  {!loading&&owner&&stage==="business"?<div className={base.panel}>
   <strong className={base.emphasis+" "+theme.agentText}>{business.name}</strong>
   <div className={base.options}>
    <button type="button" className={!editName?base.optionActive:base.option}
     onClick={()=>{setEditName(false);setName(business.name);}}>Sí, usar este negocio</button>
    <button type="button" className={editName?base.optionActive:base.option}
     onClick={()=>setEditName(true)}>Corregir el nombre</button>
   </div>
   {editName?<label className={base.field}>Nombre que aparecerá en el guion
    <input maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>:null}
   <p className={base.note}>Los datos de este video no alteran tu negocio ni la configuración del agente principal.</p>
  </div>:null}
  {!loading&&owner&&stage==="purpose"?<div className={base.panel}>
   <div className={base.optionsVertical}>
    {targets.map(([id,label])=><button key={id} type="button" aria-pressed={purpose===id}
     className={purpose===id?base.optionActive:base.option} onClick={()=>setPurpose(id)}>
     {purpose===id?<Check size={16}/>:null}{label}</button>)}
   </div>
   <p className={base.note}>El agente adaptará la escena y la descripción a tu objetivo.</p>
  </div>:null}
  {!loading&&owner&&stage==="offer"?<div className={base.panel}>
   <p className={base.note}>Productos y servicios aprobados de tu negocio. Puedes seleccionar varios o escribir otro tema.</p>
   {items.length?<div className={base.items} role="group" aria-label="Seleccionar productos y servicios">
    {items.map(x=><button type="button" key={x.id}
     className={selected.includes(x.id)?base.itemSelected:base.item}
     aria-pressed={selected.includes(x.id)}
     onClick={()=>setSelected(a=>a.includes(x.id)?a.filter(v=>v!==x.id):a.length>=12?a:[...a,x.id])}>
     <Package size={17}/><span><strong>{x.name}</strong>
      <small>{x.type==="product"?"Producto":"Servicio"}</small></span>
     {selected.includes(x.id)?<Check size={17}/>:null}</button>)}
   </div>:null}
   <label className={base.field}>Otro tema o producto (opcional)
    <textarea rows={3} maxLength={300} value={extra} onChange={e=>setExtra(e.target.value)}
     placeholder="Ejemplo: nuevo diseño de pastel, consejos para clientes…"/></label>
  </div>:null}
  {!loading&&owner&&stage==="audience"?<div className={base.panel}>
   <p className={base.note}>Usé el contexto de tu negocio; confirma a quién va dirigido el video.</p>
   <label className={base.field}>Público objetivo
    <textarea rows={3} maxLength={150} value={audience}
     onChange={e=>setAudience(e.target.value)}/></label>
  </div>:null}
  {!loading&&owner&&stage==="format"?<div className={base.panel}>
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
   <p className={base.note}>La disponibilidad de modelos depende de tu cuenta y los créditos del proveedor.</p>
  </div>:null}
  {!loading&&owner&&stage==="source"?<div className={base.panel}>
   <div className={base.optionsVertical}>
    <button type="button" className={mode==="text"?base.optionActive:base.option}
     onClick={()=>setMode("text")}><Film size={19}/> Crear video desde texto</button>
    <button type="button" className={mode==="image"?base.optionActive:base.option}
     onClick={()=>setMode("image")}><ImagePlus size={19}/> Animar una imagen</button>
   </div>
   <p className={base.note}>Si eliges una imagen, podrás subirla o generar una referencia y aprobarla antes de gastar créditos de video.</p>
  </div>:null}
  {!loading&&owner&&stage==="reference"?<div className={base.panel}>
   <label className={base.field}>Sube una imagen · JPG, PNG o WebP (máximo 14 MB)
    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)}
     onChange={e=>{const file=e.target.files?.[0];if(file)void uploadReference(file);}}/></label>
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
    <label className={base.field}>Indicación visual (opcional)
     <textarea rows={2} value={imageDirection} maxLength={260} disabled={Boolean(busy)}
      onChange={e=>setImageDirection(e.target.value)}
      placeholder="Ejemplo: toma cinematográfica de un pastel elegante sobre una mesa"/></label>
    <button type="button" className={base.option+" "+theme.agentOutline}
     onClick={()=>void generateReference()} disabled={Boolean(busy)}>
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
  {!loading&&owner&&stage==="script"?<div className={base.panel}>
   {busy==="script"?<div className={styles.generating} role="status">
    <LoaderCircle size={19} className={base.spin}/> Tu agente está creando la escena…</div>:null}
   {scriptAutoTried&&!prompt&&busy!=="script"?<button type="button" className={base.option}
    onClick={()=>void generateScript()}><Sparkles size={16}/> Intentar generar guion con IA</button>:null}
   <label className={base.field}>Guion visual · máximo 1000 caracteres
    <textarea rows={7} maxLength={1000} value={prompt}
     placeholder="Describe una escena, su iluminación, movimiento de cámara y acción…"
     onChange={e=>setPrompt(e.target.value)}/></label>
   <label className={base.field}>Descripción para redes · opcional
    <textarea rows={3} maxLength={500} value={caption}
     placeholder="Texto que puedes copiar después; no se publicará automáticamente."
     onChange={e=>setCaption(e.target.value)}/></label>
   <p className={base.note}>Revisa lo que dice el guion. No se deben inventar precios, premios ni beneficios.</p>
  </div>:null}
  {!loading&&owner&&stage==="review"?<div className={base.panel}>
   <div className={base.review}>
    {reviewCard("Negocio",name,"business")}
    {reviewCard("Objetivo",goal,"purpose")}
    {reviewCard("Productos y servicios",offer||"Video general del negocio","offer")}
    {reviewCard("Público",audience,"audience")}
    {reviewCard("Estilo y motor",style+" · "+(model==="kling"?"Kling":"Runway"),"format")}
    {reviewCard("Formato y duración",(ratio==="720:1280"?"Vertical":"Horizontal")+" · "+duration+" segundos","format")}
    {reviewCard("Origen",mode==="image"?"Imagen a video":"Texto a video","source")}
    {mode==="image"?reviewCard("Imagen",filePreview?"Preparada y aprobada":"Pendiente","reference"):null}
    {reviewCard("Guion",prompt,"script")}
    {reviewCard("Descripción para redes",caption||"Sin descripción","script")}
   </div>
   <label className={base.checkLine}>
    <input type="checkbox" checked={confirmCredits} onChange={e=>setConfirmCredits(e.target.checked)}/>
    Autorizo generar este video. El proveedor puede consumir créditos incluso si el resultado no me satisface.
   </label>
   <div className={base.info}><ShieldCheck size={17}/> No se publicará el video en redes.
    La generación es manual y el historial estará disponible en Mi biblioteca.</div>
   {!configured?<div className={base.warning} role="status">
    {videoStatus||"Video Generator aún no está conectado para tu cuenta."}</div>:null}
  </div>:null}
  {error?<div role="alert" className={base.error}>{error}</div>:null}
  {!loading&&owner?<div className={base.footer}>
   {stage==="review"?<button type="button" className={base.primary+" "+theme.agentButton}
    disabled={!configured||!confirmCredits||!prompt.trim()||Boolean(busy)||(mode==="image"&&(!filePreview||Boolean(imageCandidate)))}
    onClick={()=>void submit()}>
    {busy==="submit"?<LoaderCircle size={18} className={base.spin}/>:<Play size={18}/>}
    {busy==="submit"?"Iniciando generación…":"Confirmar y generar video"} <ArrowRight size={17}/></button>:
    <button type="button" className={base.primary+" "+theme.agentButton}
     disabled={!valid||Boolean(busy)} onClick={next}>
     {editing?"Guardar y volver a Revisión":"Continuar"} <ArrowRight size={17}/></button>}
  </div>:null}
  <p className={base.footnote}><ShieldCheck size={14}/> Preparación privada. Sin publicación automática.</p>
 </section>;
}
