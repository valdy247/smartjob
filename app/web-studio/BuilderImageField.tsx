"use client";
import {useCallback,useEffect,useState,type ChangeEvent} from "react";
import {ImagePlus,RefreshCw,WandSparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {safeWebImageUrl} from "@/lib/web-services-site";
import styles from "./BuilderImageField.module.css";
type Props={value:string;onChange:(url:string)=>void};
const bucket="smartjob-web-images";
async function shrink(file:File):Promise<Blob>{
 if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Solo imágenes JPG, PNG o WebP");
 if(file.size>18*1024*1024)throw new Error("La foto supera el límite de 18 MB");
 if(typeof createImageBitmap!=="function"){
  if(file.size>5*1024*1024)throw new Error("La imagen debe pesar menos de 5 MB");
  return file;
 }
 const bitmap=await createImageBitmap(file);
 try{
  if(bitmap.width>9000||bitmap.height>9000)throw new Error("Resolución demasiado alta");
  const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
  canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("No se pudo preparar la foto");
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const converted=await new Promise<Blob|null>(res=>canvas.toBlob(res,"image/webp",.83));
  if(!converted||converted.size>5*1024*1024)throw new Error("No se pudo optimizar la imagen");
  return converted;
 }finally{bitmap.close();}
}
export default function BuilderImageField({value,onChange}:Props){
 const [items,setItems]=useState<string[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [prompt,setPrompt]=useState("");
 const [ai,setAi]=useState(false);
 const [generating,setGenerating]=useState(false);
 const load=useCallback(async()=>{
  const client=getSupabase();if(!client)return;
  const {data,error:authError}=await client.auth.getUser();
  if(authError||!data.user||data.user.is_anonymous)return;
  const {data:files,error}=await client.storage.from(bucket).list(data.user.id,{
   limit:50,sortBy:{column:"created_at",order:"desc"}
  });
  if(error){setError("No se pudo cargar la biblioteca");return;}
  const urls=(files||[]).filter(f=>/\.(webp|jpg|png)$/.test(f.name)).map(f=>{
   const info=client.storage.from(bucket).getPublicUrl(data.user.id+"/"+f.name);
   return safeWebImageUrl(info.data.publicUrl)||"";
  }).filter(Boolean);
  setItems(urls);
 },[]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  let active=true;
  void(async()=>{
   const client=getSupabase();if(!client)return;
   const {data:{session}}=await client.auth.getSession();
   if(!session?.access_token)return;
   const result=await fetch("/api/web-services/generate-image",{
    headers:{authorization:"Bearer "+session.access_token},cache:"no-store"
   });
   const json=await result.json().catch(()=>({}));
   if(active)setAi(result.ok&&json.enabled===true);
  })();
  return()=>{active=false;};
 },[]);
 async function upload(file:File){
  if(busy)return;
  setBusy(true);setError("");
  try{
   const client=getSupabase();if(!client)throw new Error("No disponible");
   const {data,error:authError}=await client.auth.getUser();
   if(authError||!data.user||data.user.is_anonymous)throw new Error("Inicia sesión");
   const blob=await shrink(file);
   const ext=blob.type==="image/webp"?"webp":blob.type==="image/png"?"png":"jpg";
   const path=data.user.id+"/"+crypto.randomUUID()+"."+ext;
   const {error}=await client.storage.from(bucket).upload(path,blob,{
    contentType:blob.type||file.type,cacheControl:"3600",upsert:false
   });
   if(error)throw new Error("No se pudo subir");
   const result=client.storage.from(bucket).getPublicUrl(path);
   const url=safeWebImageUrl(result.data.publicUrl);
   if(!url)throw new Error("La URL no es válida");
   onChange(url);
   await load();
  }catch(e){setError(e instanceof Error?e.message:"No se pudo subir la imagen");}
  finally{setBusy(false);}
 }
 async function generate(){
  if(generating||!ai||prompt.trim().length<8)return;
  if(!window.confirm("Generar una imagen consume 1 generación del límite diario y tiene un costo externo de IA para VMV. No hay cobro al cliente en esta pantalla. ¿Continuar?"))return;
  setGenerating(true);setError("");
  try{
   const client=getSupabase();if(!client)throw new Error("No disponible");
   const {data:{session}}=await client.auth.getSession();
   if(!session?.access_token)throw new Error("Inicia sesión");
   const result=await fetch("/api/web-services/generate-image",{
    method:"POST",headers:{"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json"},
    body:JSON.stringify({prompt:prompt.trim(),business:"Sitio web de negocio",categoryId:""})
   });
   const body=await result.json();
   const url=typeof body.url==="string"?safeWebImageUrl(body.url):null;
   if(!result.ok||!url)throw new Error(body.error||"No se pudo generar");
   onChange(url);await load();
  }catch(e){setError(e instanceof Error?e.message:"Error en generación");}
  finally{setGenerating(false);}
 }
 return <div className={styles.wrap}>
  {value&&safeWebImageUrl(value)?<img src={value} alt="Imagen seleccionada" className={styles.current}/>:null}
  <label className={styles.upload}><ImagePlus size={16}/>{busy?"Subiendo…":"Subir foto"}
   <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
    onChange={(e:ChangeEvent<HTMLInputElement>)=>{
     const selected=e.target.files?.[0];e.target.value="";
     if(selected)void upload(selected);
    }}/>
  </label>
  <div className={styles.heading}><span>Biblioteca</span><button type="button" onClick={()=>void load()} aria-label="Actualizar"><RefreshCw size={14}/></button></div>
  {items.length>0?<div className={styles.gallery}>{items.map(url=><button key={url} type="button"
   aria-label="Seleccionar esta foto" aria-pressed={value===url}
   onClick={()=>onChange(url)} className={value===url?styles.active:""}>
    <img src={url} alt="Imagen disponible"/>
   </button>)}</div>:<small className={styles.empty}>Sube tu primera fotografía.</small>}
  {ai?<div className={styles.ai}>
   <small>Consumo por imagen: 1 generación del cupo diario. El servicio utiliza una API con costo para VMV.</small>
   <textarea value={prompt} maxLength={450} spellCheck={false} rows={2}
    placeholder="Describe una imagen para generar" onChange={e=>setPrompt(e.target.value)}/>
   <button type="button" disabled={generating||prompt.trim().length<8} onClick={()=>void generate()}>
    <WandSparkles size={15}/>{generating?"Creando…":"Generar con IA"}
   </button>
  </div>:null}
  {error?<small role="alert" className={styles.error}>{error}</small>:null}
 </div>;
}
