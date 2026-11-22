"use client";
import {useCallback,useEffect,useState} from "react";
import {ArrowLeft,Check,Download,ImagePlus,LoaderCircle,RefreshCw,Sparkles,Upload,Video,WandSparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import VideoPromptAssistant from "@/components/VideoPromptAssistant";
import {saveCreativeImage} from "@/lib/vmv-creative-image-history";
import css from "./CreativeGenerator.module.css";

export type CreativeMode="text-image"|"edit-image"|"image-video"|"text-video";
type Style="stickman"|"realistic"|"cartoon"|"cinematic";
type Stage="style"|"source"|"upload"|"action"|"basePrompt"|"baseResult"|"duration"|"prompt"|"result";
type Action="edit"|"restyle"|"enhance";
const visualStyles:{id:Style;es:string;en:string;instruction:string}[]=[
 {id:"stickman",es:"Stickman",en:"Stickman",instruction:"Minimal 2D stickman illustration. Simple round heads, thin limbs, clean black outlines, flat colors, uncluttered backgrounds. Preserve character consistency."},
 {id:"realistic",es:"Realista",en:"Realistic",instruction:"Professional photorealism, authentic materials, natural details, believable lighting and proportions."},
 {id:"cartoon",es:"Cartoon",en:"Cartoon",instruction:"Modern colorful cartoon illustration, expressive characters, clean shapes and coherent consistent art direction."},
 {id:"cinematic",es:"Cinemático",en:"Cinematic",instruction:"Premium cinematic composition, deliberate camera angle, evocative film lighting, depth and atmospheric storytelling."}
];

export function Preview({id}:{id:Style}){
 if(id==="stickman")return <svg className={css.sample} viewBox="0 0 240 144" role="img" aria-label="Stickman">
  <rect width="240" height="144" fill="#f8f7f1"/><path d="M0 116H240" stroke="#dce8db" strokeWidth="2"/>
  <circle cx="116" cy="44" r="20" fill="white" stroke="#222" strokeWidth="4"/>
  <path d="M108 41h2m15 0h2" stroke="#222" strokeWidth="4" strokeLinecap="round"/><path d="M109 53q7 7 14 0" fill="none" stroke="#222" strokeWidth="2"/>
  <path d="M116 65v42m0-29-28 20m28-20 29-19m-29 48-23 25m23-25 25 25" fill="none" stroke="#222" strokeWidth="4" strokeLinecap="round"/>
  <circle cx="163" cy="34" r="18" fill="#e8d8ff"/><path d="M156 34h14m-7-7v14" stroke="#9870de" strokeWidth="3" strokeLinecap="round"/>
 </svg>;
 if(id==="realistic")return <svg className={css.sample} viewBox="0 0 240 144" role="img" aria-label="Realista">
  <defs><linearGradient id="real-bg" x2="0" y2="1"><stop stopColor="#d2e6db"/><stop offset="1" stopColor="#faf3df"/></linearGradient><linearGradient id="real-cup"><stop stopColor="#fafafa"/><stop offset=".55" stopColor="#ccc6bf"/><stop offset="1" stopColor="#fff"/></linearGradient></defs>
  <rect width="240" height="144" fill="url(#real-bg)"/><ellipse cx="121" cy="123" rx="98" ry="12" fill="#a0a79a" opacity=".25"/>
  <path d="M42 51Q50 20 74 32T97 53" stroke="#7ba58c" strokeWidth="15" fill="none" opacity=".55"/>
  <path d="M81 59h78l-9 62H91Z" fill="url(#real-cup)" stroke="#e6e4e0" strokeWidth="2"/><ellipse cx="120" cy="59" rx="39" ry="10" fill="#f8f8f5"/><ellipse cx="120" cy="59" rx="31" ry="6" fill="#8c5938"/><path d="M159 71q42-6 22 32-7 10-25 7" fill="none" stroke="#efeee9" strokeWidth="11"/><path d="M104 42q-5-8 2-16m16 16q-5-9 1-18" fill="none" stroke="white" strokeWidth="3" opacity=".75"/>
 </svg>;
 if(id==="cartoon")return <svg className={css.sample} viewBox="0 0 240 144" role="img" aria-label="Cartoon">
  <rect width="240" height="144" fill="#fee9e6"/><circle cx="40" cy="32" r="23" fill="#ffd0a2"/><circle cx="202" cy="109" r="33" fill="#ffbd9c"/>
  <path d="M76 142q-10-41 20-51h55q32 13 30 51" fill="#8f81e9"/><path d="M91 49q-5-32 31-35 37-2 36 34l-6 28q-13 28-32 25-28-4-31-32Z" fill="#ffd39e" stroke="#583a6b" strokeWidth="4"/>
  <path d="M90 48Q90 7 119 10q50-7 44 43-13-12-17-24-20 19-56 19Z" fill="#593873"/><circle cx="106" cy="63" r="4" fill="#563450"/><circle cx="139" cy="63" r="4" fill="#563450"/><path d="M111 79q12 13 24-1" fill="none" stroke="#bf5c70" strokeWidth="4" strokeLinecap="round"/>
  <path d="M191 25l4 12 12 4-12 4-4 12-4-12-12-4 12-4Z" fill="#f7b846"/>
 </svg>;
 return <svg className={css.sample} viewBox="0 0 240 144" role="img" aria-label="Cinemático">
  <defs><linearGradient id="cine-bg" x2="0" y2="1"><stop stopColor="#12233d"/><stop offset=".7" stopColor="#844c6d"/><stop offset="1" stopColor="#e69b7e"/></linearGradient></defs>
  <rect width="240" height="144" fill="url(#cine-bg)"/><circle cx="162" cy="73" r="32" fill="#ffca99" opacity=".9"/>
  <path d="M0 118L53 67l38 46 47-54 53 66 49-40v59H0Z" fill="#222438"/><path d="M0 135l48-37 49 33 50-29 93 26v16H0Z" fill="#11192b"/>
  <path d="M113 140v-26m0 4-12 12m12-12 12 12" stroke="#0b1021" strokeWidth="7" strokeLinecap="round"/><circle cx="113" cy="107" r="8" fill="#0b1021"/>
 </svg>;
}

function fileAsData(file:File):Promise<string>{
 if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>14*1024*1024)throw Error("Usa una imagen JPG, PNG o WebP de hasta 14 MB.");
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(Error("No se pudo leer la imagen."));
  reader.onload=()=>{const img=new Image();img.onerror=()=>reject(Error("Imagen inválida."));img.onload=()=>{
   const scale=Math.min(1,1440/Math.max(img.naturalWidth,img.naturalHeight));
   const c=document.createElement("canvas");c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);
   const ctx=c.getContext("2d");if(!ctx){reject(Error("No se pudo preparar la imagen."));return;}
   ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);
   const data=c.toDataURL("image/jpeg",.72);
   if(data.length>4000000)reject(Error("La imagen es demasiado grande."));else resolve(data);
  };img.src=String(reader.result||"");};
  reader.readAsDataURL(file);
 });
}
async function authFetch(path:string,body:Record<string,unknown>){
 const db=getSupabase();if(!db)throw Error("Inicia sesión en VMV.");
 const {data:{session}}=await db.auth.getSession();
 if(!session)throw Error("Inicia sesión en VMV.");
 return fetch("/api/video-generator"+path,{method:"POST",headers:{
  Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"
 },body:JSON.stringify(body)});
}
export default function CreativeGenerator({mode,en,onBack,onLibrary,registerBack,onVideoCreated}:{
 mode:CreativeMode;en:boolean;onBack:()=>void;onLibrary:()=>void;
 registerBack:(go:(()=>void)|null)=>void;onVideoCreated:(id:string)=>void;
}){
 const L=(es:string,english:string)=>en?english:es;
 const [stage,setStage]=useState<Stage>("style");
 const [style,setStyle]=useState<Style>("realistic");
 const [action,setAction]=useState<Action>("edit");
 const [image,setImage]=useState("");
 const [source,setSource]=useState<"upload"|"create">("upload");
 const [prompt,setPrompt]=useState("");
 const [basePrompt,setBasePrompt]=useState("");
 const [duration,setDuration]=useState<5|10>(5);
 const [ratio,setRatio]=useState<"720:1280"|"1280:720">("720:1280");
 const [size,setSize]=useState("1024x1536");
 const [model,setModel]=useState<"gen4.5"|"kling">("gen4.5");
 const [confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [resultUrl,setResultUrl]=useState("");
 const [resultBlob,setResultBlob]=useState<Blob|null>(null);
 const [jobId,setJobId]=useState("");
 const [generatedBase,setGeneratedBase]=useState(false);
 const selected=visualStyles.find(v=>v.id===style)||visualStyles[1];
 const video=mode==="image-video"||mode==="text-video";
 const newStage=(next:Stage)=>{setError("");setStage(next);};
 const goBack=useCallback(()=>{
  if(busy)return;
  if(stage==="style"){onBack();return;}
  if(stage==="result"){newStage("prompt");return;}
  if(stage==="prompt"){newStage(video?"duration":mode==="edit-image"?"action":"style");return;}
  if(stage==="duration"){newStage(mode==="image-video"?(source==="create"?"baseResult":"upload"):"style");return;}
  if(stage==="baseResult"){newStage("basePrompt");return;}
  if(stage==="basePrompt"){newStage("source");return;}
  if(stage==="action"){newStage("upload");return;}
  if(stage==="upload"){newStage(mode==="edit-image"?"style":"source");return;}
  newStage("style");
 },[stage,mode,source,video,busy,onBack]);
 useEffect(()=>{registerBack(goBack);return()=>registerBack(null);},[goBack,registerBack]);
 useEffect(()=>()=>{if(resultUrl)URL.revokeObjectURL(resultUrl);},[resultUrl]);
 const chooseStyle=(s:Style)=>{
  setStyle(s);
  newStage(mode==="edit-image"?"upload":mode==="image-video"?"source":mode==="text-video"?"duration":"prompt");
 };
 const handleUpload=async(file?:File)=>{
  if(!file||busy)return;setBusy(true);setError("");
  try{const next=await fileAsData(file);setImage(next);setGeneratedBase(false);newStage(mode==="edit-image"?"action":"duration");}
  catch(e){setError(e instanceof Error?e.message:"No se pudo abrir la imagen.");}
  finally{setBusy(false);}
 };
 const imageResult=async(base=false)=>{
  if(busy||!confirmed)return;setBusy(true);setError("");
  try{
   const entry=base?basePrompt:prompt;
   const normalized=selected.instruction+"\n"+(mode==="edit-image"&&!base?
    (action==="restyle"?"Transform the provided image into this visual style while preserving the main subject. ":
     action==="enhance"?"Enhance the source image, preserving subject and identity. ":"Edit only what the user explicitly requests; preserve other details. "):"")+entry.trim();
   const response=await authFetch("/image",{
    output:"image",prompt:normalized.slice(0,12000),
    size,quality:"standard",
    ...(!base&&mode==="edit-image"?{sourceImage:image}: {})
   });
   if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(String(body.error||"image_generation_failed"));}
   const blob=await response.blob();
   if(!blob.type.startsWith("image/"))throw Error("La imagen recibida no es válida.");
   try{await saveCreativeImage(blob,en?selected.en:selected.es,entry);}catch{setError(L("La imagen se creó, pero no se pudo guardar en el historial.","Image created, but could not be saved to history."));}
   if(base){
    const file=new File([blob],"generated.jpg",{type:blob.type});
    setImage(await fileAsData(file));setGeneratedBase(true);setConfirmed(false);newStage("baseResult");
   }else{
    setResultBlob(blob);setResultUrl(URL.createObjectURL(blob));setConfirmed(false);newStage("result");
   }
  }catch(e){setError(e instanceof Error?e.message:"No se pudo generar la imagen.");}
  finally{setBusy(false);}
 };
 const makeVideo=async()=>{
  if(busy||!confirmed||prompt.trim().length<3||(mode==="image-video"&&!image))return;
  setBusy(true);setError("");
  try{
   const normalized=(selected.instruction+"\n"+(mode==="image-video"?
    "Animate the provided reference image. Keep the exact original subject, identity and composition; use realistic consistent movement. ":"")+
    prompt.trim()).slice(0,1000);
   const response=await authFetch("",{
    prompt:normalized,mode:mode==="image-video"?"image":"text",
    model,ratio,duration,imageUrl:mode==="image-video"?image:"",
    clientKey:crypto.randomUUID(),pilotId:null,caption:"",confirmCost:true
   });
   const body=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(String(body.error||"video_generation_failed"));
   const id=String(body.job?.id||"");
   if(!id)throw Error("No se recibió el identificador del video.");
   setJobId(id);setConfirmed(false);onVideoCreated(id);newStage("result");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo generar el video.");}
  finally{setBusy(false);}
 };
 const currentTitle=mode==="text-image"?L("Texto a imagen","Text to image"):
  mode==="edit-image"?L("Modificar imagen","Edit image"):
  mode==="image-video"?L("Imagen a video","Image to video"):L("Texto a video","Text to video");
 return <section className={css.flow}>
  <div className={css.progress}><span>{currentTitle}</span><span>{selected.es}</span></div>
  {stage==="style"?<><h2>{L("Elige un estilo","Choose a style")}</h2>
   <div className={css.grid}>{visualStyles.map(item=><button type="button" key={item.id} className={css.style} onClick={()=>chooseStyle(item.id)}>
    <Preview id={item.id}/><strong>{en?item.en:item.es}</strong>
   </button>)}</div></>:null}
  {stage==="source"?<><h2>{L("Elige una imagen","Choose an image")}</h2>
   <div className={css.grid}>
    <button type="button" className={css.tile} onClick={()=>{setSource("upload");newStage("upload");}}><Upload size={33}/><strong>{L("Subir imagen","Upload image")}</strong></button>
    <button type="button" className={css.tile} onClick={()=>{setSource("create");newStage("basePrompt");}}><WandSparkles size={33}/><strong>{L("Crear con IA","Create with AI")}</strong></button>
   </div></>:null}
  {stage==="upload"?<><h2>{L("Subir imagen","Upload image")}</h2>
   <label className={css.drop}><ImagePlus size={34}/><span>{L("Seleccionar imagen","Choose image")}</span>
    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>void handleUpload(e.target.files?.[0])}/>
   </label></>:null}
  {stage==="action"?<><h2>{L("¿Qué quieres hacer?","What would you like to do?")}</h2>
   <div className={css.actions}>
    {([["edit","Editar","Edit"],["restyle","Cambiar estilo","Change style"],["enhance","Mejorar calidad","Enhance"]] as const).map(([id,es,english])=>
     <button type="button" key={id} onClick={()=>{setAction(id);newStage("prompt");}}>{en?english:es}<Check size={16}/></button>)}
   </div></>:null}
  {stage==="duration"?<><h2>{L("Duración","Duration")}</h2>
   <div className={css.grid}>
    {([5,10] as const).map(t=><button type="button" className={css.tile} key={t} onClick={()=>{setDuration(t);newStage("prompt");}}>
     <Video size={29}/><strong>{t} s</strong></button>)}
   </div></>:null}
  {stage==="basePrompt"?<><h2>{L("Crear imagen","Create image")}</h2>
   <textarea className={css.input} autoFocus rows={5} maxLength={2000} value={basePrompt}
    onChange={e=>setBasePrompt(e.target.value)} placeholder={L("Describe tu imagen…","Describe your image…")}/>
   <VideoPromptAssistant value={basePrompt} onApply={setBasePrompt} kind="image" maxLength={2000} en={en}
    context={{visual:selected.id,purpose:"Starting image for image-to-video"}} disabled={busy}/>
   <label className={css.consent}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{L("Autorizo el uso de créditos","I approve credit usage")}</label>
   <button type="button" className={css.primary} onClick={()=>void imageResult(true)} disabled={busy||!confirmed||basePrompt.trim().length<3}>
    {busy?<LoaderCircle className={css.spin} size={17}/>:<Sparkles size={17}/>} {L("Generar imagen","Generate image")}
   </button></>:null}
  {stage==="baseResult"?<><h2>{L("Imagen creada","Image created")}</h2>
   {image?<img src={image} alt={L("Imagen creada","Generated image")} className={css.preview}/>:null}
   <button type="button" className={css.primary} onClick={()=>newStage("duration")}>{L("Usar esta imagen","Use this image")}</button>
   <button type="button" className={css.secondary} onClick={()=>newStage("basePrompt")}><RefreshCw size={16}/> {L("Regenerar","Regenerate")}</button></>:null}
  {stage==="prompt"?<><h2>{mode==="edit-image"?L("¿Qué quieres cambiar?","What should change?"):L("Describe tu idea","Describe your idea")}</h2>
   {image&&mode!=="text-video"?<img src={image} alt={L("Referencia","Reference")} className={css.reference}/>:null}
   <textarea className={css.input} autoFocus rows={5} maxLength={video?850:4000} value={prompt}
    onChange={e=>setPrompt(e.target.value)}
    placeholder={mode==="image-video"?L("Describe el movimiento…","Describe the movement…"):
     mode==="edit-image"?L("Describe el cambio…","Describe the change…"):L("Describe tu idea…","Describe your idea…")}/>
   <VideoPromptAssistant value={prompt} onApply={setPrompt} kind={video?"video":"image"}
    maxLength={video?850:4000} en={en} disabled={busy}
    context={{visual:selected.id,purpose:mode==="edit-image"?
     "Edit the uploaded image; preserve unchanged elements. Selected action: "+action:
     mode==="image-video"?"Animate the supplied image, preserving identity":
     "Create original "+currentTitle,duration:video?duration:undefined}}/>
   <details className={css.advanced}><summary>{L("Ajustes","Settings")}</summary>
    {video?<><label>{L("Formato","Format")}</label><div className={css.smallChoices}>
     <button type="button" aria-pressed={ratio==="720:1280"} onClick={()=>setRatio("720:1280")}>9:16</button>
     <button type="button" aria-pressed={ratio==="1280:720"} onClick={()=>setRatio("1280:720")}>16:9</button>
    </div><label>{L("Motor","Engine")}</label><div className={css.smallChoices}>
     <button type="button" aria-pressed={model==="gen4.5"} onClick={()=>setModel("gen4.5")}>Runway</button>
     <button type="button" aria-pressed={model==="kling"} onClick={()=>setModel("kling")}>Kling</button></div></>:
    <><label>{L("Formato","Format")}</label><div className={css.smallChoices}>
     {([["1024x1536","2:3"],["1024x1024","1:1"],["1536x1024","3:2"]] as const).map(([v,label])=>
      <button key={v} type="button" aria-pressed={size===v} onClick={()=>setSize(v)}>{label}</button>)}
    </div></>}
   </details>
   <label className={css.consent}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
    {L("Autorizo el uso de créditos","I approve credit usage")}</label>
   <button type="button" className={css.primary} disabled={busy||!confirmed||prompt.trim().length<3}
    onClick={()=>void (video?makeVideo():imageResult())}>
    {busy?<LoaderCircle className={css.spin} size={17}/>:<Sparkles size={17}/>}
    {busy?L("Generando…","Generating…"):video?L("Generar video","Generate video"):L("Generar imagen","Generate image")}
   </button></>:null}
  {stage==="result"?<><h2>{video?L("Video en proceso","Video in progress"):L("Imagen lista","Image ready")}</h2>
   {!video&&resultUrl?<><img className={css.preview} src={resultUrl} alt={L("Imagen generada","Generated image")}/>
    <a className={css.primary} href={resultUrl} download="vmv-imagen.png"><Download size={17}/> {L("Descargar imagen","Download image")}</a>
    <button type="button" className={css.secondary} onClick={()=>newStage("prompt")}><RefreshCw size={16}/> {L("Editar prompt","Edit prompt")}</button></>:null}
   {video&&jobId?<><p className={css.muted}>{L("Tu video está en el historial.","Your video is in history.")}</p>
    <button type="button" className={css.primary} onClick={onLibrary}>{L("Ver historial","View history")}</button></>:null}
   <button type="button" className={css.secondary} onClick={onBack}>{L("Crear otro","Create another")}</button></>:null}
  {error?<p className={css.error} role="alert">{error}</p>:null}
  {busy&&stage==="upload"?<p className={css.muted}><LoaderCircle className={css.spin} size={16}/> {L("Preparando…","Preparing…")}</p>:null}
 </section>;
}
