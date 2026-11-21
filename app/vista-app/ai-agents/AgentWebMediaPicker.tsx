"use client";
import {useRef,useState} from "react";
import {Camera,Check,FileImage,Image,ImagePlus,LoaderCircle,RefreshCw,Trash2,WandSparkles,X} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {safeWebImageUrl} from "@/lib/web-services-site";
import styles from "./AgentWebMediaPicker.module.css";
type Target="logo"|"cover"|"gallery";
type Method="upload"|"ai";
const bucket="smartjob-web-images";
const names:Record<Target,string>={logo:"Logo",cover:"Portada",gallery:"Galería"};
const labels:Record<Target,string>={
 logo:"Identidad visual original, símbolo limpio y legible, sin tipografía ni marcas conocidas",
 cover:"Fotografía principal panorámica y elegante del negocio",
 gallery:"Fotografía comercial realista que muestre los productos o servicios"
};
async function optimized(file:File):Promise<Blob>{
 if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>18*1024*1024||file.size<512)
  throw Error("Selecciona JPG, PNG o WebP de hasta 18 MB.");
 const bitmap=await createImageBitmap(file);
 try{
  if(bitmap.width>9000||bitmap.height>9000||bitmap.width<10||bitmap.height<10)
   throw Error("La foto tiene una resolución incompatible.");
  const factor=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.round(bitmap.width*factor);canvas.height=Math.round(bitmap.height*factor);
  const ctx=canvas.getContext("2d");if(!ctx)throw Error("No se pudo optimizar.");
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/webp",.84));
  if(!blob||blob.size>5*1024*1024)throw Error("La imagen optimizada supera el límite.");
  return blob;
 }finally{bitmap.close();}
}
export default function AgentWebMediaPicker({business,category,offer,aiEnabled,logo,cover,gallery,
 onLogo,onCover,onGallery}:{
 business:string;category:string;offer:string;aiEnabled:boolean;logo:string;cover:string;gallery:string[];
 onLogo:(v:string)=>void;onCover:(v:string)=>void;onGallery:(v:string[])=>void;
}){
 const [method,setMethod]=useState<Method|null>(null);
 const [target,setTarget]=useState<Target|null>(null);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [candidate,setCandidate]=useState("");
 const [prompt,setPrompt]=useState("");
 const cameraRef=useRef<HTMLInputElement>(null),galleryRef=useRef<HTMLInputElement>(null);
 const fileRef=useRef<HTMLInputElement>(null);
 const close=()=>{if(busy)return;setMethod(null);setTarget(null);setCandidate("");setError("");setPrompt("");};
 const open=(m:Method)=>{setMethod(m);setTarget(null);setCandidate("");setError("");setPrompt("");};
 const put=(url:string)=>{
  const safe=safeWebImageUrl(url);
  if(!safe)throw Error("No se pudo validar la imagen.");
  if(target==="logo")onLogo(safe);
  if(target==="cover")onCover(safe);
  if(target==="gallery"){
   if(gallery.length>=8)throw Error("La galería admite máximo 8 imágenes.");
   onGallery([...gallery,safe]);
  }
 };
 const upload=async(file?:File)=>{
  if(!file||busy||!target)return;
  setBusy("upload");setError("");
  try{
   const db=getSupabase();if(!db)throw Error("No se pudo abrir la biblioteca.");
   const {data:{user},error:authError}=await db.auth.getUser();
   if(authError||!user||user.is_anonymous)throw Error("Inicia sesión nuevamente.");
   const blob=await optimized(file);
   const path=user.id+"/"+crypto.randomUUID()+".webp";
   const {error:uploadError}=await db.storage.from(bucket).upload(path,blob,{
    contentType:"image/webp",cacheControl:"3600",upsert:false
   });
   if(uploadError)throw Error("No se pudo guardar la imagen en tu biblioteca.");
   const {data}=db.storage.from(bucket).getPublicUrl(path);
   put(data.publicUrl);setMethod(null);setTarget(null);setCandidate("");setPrompt("");
  }catch(e){setError(e instanceof Error?e.message:"No fue posible subir la imagen.");}
  finally{setBusy("");}
 };
 const generate=async()=>{
  if(!target||busy||!aiEnabled)return;
  if(!window.confirm("La generación con IA consume una generación del cupo diario de VMV. ¿Continuar?"))return;
  setBusy("generate");setError("");setCandidate("");
  try{
   const db=getSupabase();if(!db)throw Error("No se pudo conectar.");
   const {data:{session}}=await db.auth.getSession();
   if(!session?.access_token)throw Error("Inicia sesión nuevamente.");
   const response=await fetch("/api/web-services/generate-image",{
    method:"POST",cache:"no-store",headers:{
     Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"
    },body:JSON.stringify({
     kind:target,categoryId:category,business:business.slice(0,100),
     prompt:(prompt.trim()||labels[target]+"; "+offer.slice(0,100)).slice(0,450)
    })
   });
   const result=await response.json().catch(()=>({}));
   const url=typeof result.url==="string"?safeWebImageUrl(result.url):null;
   if(!response.ok||!url)throw Error(String(result.error||"La imagen no se pudo crear."));
   setCandidate(url);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo generar la imagen.");}
  finally{setBusy("");}
 };
 return <section className={styles.root}>
  <div className={styles.methods}>
   <button type="button" onClick={()=>open("upload")}><ImagePlus size={21}/> Subir imagen</button>
   <button type="button" onClick={()=>open("ai")}><WandSparkles size={21}/> Generar con IA</button>
  </div>
  {logo||cover||gallery.length?<div className={styles.current}>
   {logo?<div><small>Logo</small><img src={logo} alt="Logo seleccionado"/>
    <button type="button" onClick={()=>onLogo("")}><Trash2 size={14}/> Quitar</button></div>:null}
   {cover?<div><small>Portada</small><img src={cover} alt="Portada seleccionada"/>
    <button type="button" onClick={()=>onCover("")}><Trash2 size={14}/> Quitar</button></div>:null}
   {gallery.map((url,i)=><div key={url+"-"+i}><small>Galería {i+1}/8</small>
    <img src={url} alt={"Imagen de galería "+(i+1)}/>
    <button type="button" onClick={()=>onGallery(gallery.filter((_,j)=>j!==i))}><Trash2 size={14}/> Quitar</button>
   </div>)}
  </div>:<p className={styles.hint}>Puedes preparar logo, portada y hasta ocho imágenes de galería. También puedes continuar sin fotos.</p>}
  {method?<div className={styles.overlay} role="presentation"
   onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
   <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Seleccionar imagen">
    <div className={styles.header}><div><small>IMÁGENES · WEB SERVICES</small>
     <strong>{!target?"¿Qué imagen quieres "+(method==="ai"?"generar":"subir")+"?":names[target]}</strong></div>
     <button type="button" onClick={close} disabled={Boolean(busy)} aria-label="Cerrar"><X size={19}/></button>
    </div>
    {!target?<div className={styles.targets}>
     {(["logo","cover","gallery"] as const).map(kind=><button type="button"
      key={kind} disabled={kind==="gallery"&&gallery.length>=8}
      onClick={()=>{setTarget(kind);setError("");setPrompt("");}}>
      <Image size={18}/><span><strong>{names[kind]}</strong><small>{
       kind==="logo"?"Una imagen; puedes reemplazarla":kind==="cover"?"Una portada; puedes reemplazarla":
       gallery.length+"/8 · Puedes añadir varias"}</small></span>
     </button>)}
    </div>:method==="upload"?<div className={styles.upload}>
     <p>Selecciona de dónde quieres obtener la imagen para <strong>{names[target]}</strong>.</p>
     <button type="button" onClick={()=>cameraRef.current?.click()} disabled={Boolean(busy)}>
      <Camera size={18}/> Cámara</button>
     <button type="button" onClick={()=>galleryRef.current?.click()} disabled={Boolean(busy)}>
      <Image size={18}/> Fotos / Galería</button>
     <button type="button" onClick={()=>fileRef.current?.click()} disabled={Boolean(busy)}>
      <FileImage size={18}/> Archivos</button>
     <input type="file" ref={cameraRef} accept="image/*" capture="environment" hidden
      onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void upload(f);}}/>
     <input type="file" ref={galleryRef} accept="image/jpeg,image/png,image/webp" hidden
      onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void upload(f);}}/>
     <input type="file" ref={fileRef} accept="image/jpeg,image/png,image/webp" hidden
      onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void upload(f);}}/>
     {busy==="upload"?<p role="status" className={styles.progress}>
      <LoaderCircle size={17}/> Guardando en tu biblioteca…</p>:null}
    </div>:<div className={styles.generate}>
     {aiEnabled?<>
      <p>{target==="logo"?"La IA creará un símbolo de marca original, sin texto ni logotipos conocidos.":
       "La IA preparará una propuesta visual usando los datos de tu negocio."}</p>
      <label>Describe tu imagen<textarea maxLength={450} rows={4} value={prompt}
       onChange={e=>setPrompt(e.target.value)}
       placeholder={target==="logo"?"Símbolo minimalista de repostería, colores elegantes…":
        "Fotografía realista, buena iluminación, fondo profesional…"}/></label>
      {!candidate?<button type="button" className={styles.primary} disabled={Boolean(busy)}
       onClick={()=>void generate()}><WandSparkles size={17}/>
       {busy==="generate"?"Generando…":"Generar imagen"}</button>:<div className={styles.candidate}>
       <img src={candidate} alt="Imagen de IA pendiente de aprobación"/>
       <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={Boolean(busy)}
         onClick={()=>{try{put(candidate);close();}catch(e){setError(e instanceof Error?e.message:"Error al asignar.");}}}>
         <Check size={16}/> Aprobar imagen</button>
        <button type="button" disabled={Boolean(busy)} onClick={()=>void generate()}>
         <RefreshCw size={16}/> Reintentar</button>
       </div>
      </div>}
      {busy==="generate"?<p role="status" className={styles.progress}>
       <LoaderCircle size={17}/> Creando propuesta con IA…</p>:null}
     </>:<p>Generación con IA no disponible para esta cuenta. Puedes subir imágenes ahora.</p>}
    </div>}
    {target?<button type="button" className={styles.back}
     disabled={Boolean(busy)} onClick={()=>{setTarget(null);setCandidate("");setError("");}}>
     Volver a elegir ubicación</button>:null}
    {error?<p role="alert" className={styles.error}>{error}</p>:null}
   </div>
  </div>:null}
 </section>;
}
