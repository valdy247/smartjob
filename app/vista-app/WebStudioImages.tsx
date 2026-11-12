"use client";
import {useEffect,useState,type ChangeEvent} from "react";
import {ImagePlus,Image as ImageIcon,Trash2, WandSparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {safeWebImageUrl,type WebSiteContent} from "@/lib/web-services-site";
import styles from "./WebStudioImages.module.css";
const bucket="smartjob-web-images";
type Target="hero"|"gallery";
type Props={
 ownerId:string;content:WebSiteContent;busy:boolean;
 onChange:(next:Pick<WebSiteContent,"heroImage"|"gallery">)=>void;
 onMessage:(value:string)=>void;
};
async function toOptimizedWebp(file:File):Promise<Blob>{
 if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Solo JPG, PNG o WebP");
 if(file.size>18*1024*1024)throw new Error("Archivo demasiado grande");
 if(typeof createImageBitmap!=="function"){
  if(file.size>5*1024*1024)throw new Error("Imagen máxima: 5 MB");
  return file;
 }
 const bitmap=await createImageBitmap(file);
 try{
  const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
  canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("No se pudo preparar la imagen");
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/webp",0.82));
  if(!blob||blob.size>5*1024*1024)throw new Error("Imagen demasiado grande");
  return blob;
 }finally{bitmap.close();}
}
export default function WebStudioImages({ownerId,content,busy,onChange,onMessage}:Props){
 const [uploading,setUploading]=useState(false);
 const [prompt,setPrompt]=useState("");
 const [generating,setGenerating]=useState(false);
 const [aiAvailable,setAiAvailable]=useState(false);
 useEffect(()=>{
  let active=true;
  void (async()=>{
   const client=getSupabase();
   if(!client)return;
   const {data:{session}}=await client.auth.getSession();
   if(!session?.access_token||session.user.id!==ownerId)return;
   const response=await fetch("/api/web-services/generate-image",{
    cache:"no-store",headers:{authorization:"Bearer "+session.access_token}
   });
   const payload=await response.json();
   if(active)setAiAvailable(response.ok&&payload?.enabled===true);
  })().catch(()=>{});
  return()=>{active=false;};
 },[ownerId]);
 async function uploadFile(file:File,target:Target){
  if(uploading||busy)return;
  if(target==="gallery"&&content.gallery.length>=4){onMessage("Máximo 4 imágenes");return;}
  setUploading(true);onMessage("");
  try{
   const client=getSupabase();
   if(!client)throw new Error("Inicia sesión");
   const {data,error}=await client.auth.getUser();
   if(error||!data.user||data.user.id!==ownerId||data.user.is_anonymous)throw new Error("Inicia sesión nuevamente");
   const blob=await toOptimizedWebp(file);
   const ext=blob.type==="image/webp"?"webp":file.type==="image/png"?"png":"jpg";
   const path=ownerId+"/"+crypto.randomUUID()+"."+ext;
   const upload=await client.storage.from(bucket).upload(path,blob,{cacheControl:"3600",upsert:false,contentType:blob.type||file.type});
   if(upload.error)throw new Error("No se pudo subir la imagen");
   const {data:publicData}=client.storage.from(bucket).getPublicUrl(path);
   const url=safeWebImageUrl(publicData.publicUrl);
   if(!url)throw new Error("URL de imagen inválida");
   if(target==="hero")onChange({heroImage:url,gallery:content.gallery});
   else onChange({heroImage:content.heroImage,gallery:[...content.gallery,url]});
   onMessage("Imagen añadida. Guarda los cambios.");
  }catch(e){onMessage(e instanceof Error?e.message:"Error al subir");}
  finally{setUploading(false);}
 }
 function input(target:Target){
  return <label className={styles.upload} aria-label={target==="hero"?"Subir imagen principal":"Añadir imagen a galería"}>
   <ImagePlus size={16}/>{uploading?"Subiendo…":target==="hero"?"Subir portada":"Añadir foto"}
   <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy||uploading}
    onChange={(e:ChangeEvent<HTMLInputElement>)=>{
     const file=e.currentTarget.files?.[0];e.currentTarget.value="";
     if(file)void uploadFile(file,target);
    }}/>
  </label>;
 }
 async function generate(){
  if(generating||!aiAvailable||!prompt.trim())return;
  const client=getSupabase();
  if(!client){onMessage("Inicia sesión");return;}
  setGenerating(true);onMessage("");
  try{
   const {data:{session}}=await client.auth.getSession();
   if(!session?.access_token)throw new Error("Inicia sesión nuevamente");
   const result=await fetch("/api/web-services/generate-image",{
    method:"POST",
    headers:{"content-type":"application/json",authorization:"Bearer "+session.access_token},
    body:JSON.stringify({prompt:prompt.trim(),business:content.business,categoryId:content.categoryId})
   });
   const payload=await result.json();
   if(!result.ok||typeof payload?.url!=="string")throw new Error(payload?.error||"No se pudo generar");
   const url=safeWebImageUrl(payload.url);
   if(!url)throw new Error("Imagen recibida inválida");
   onChange({heroImage:url,gallery:content.gallery});onMessage("Imagen generada. Guarda los cambios.");
  }catch(e){onMessage(e instanceof Error?e.message:"Error al generar");}
  finally{setGenerating(false);}
 }
 return <section className={styles.panel}>
  <div className={styles.title}><ImageIcon size={16}/><strong>Imágenes</strong></div>
  <span className={styles.label}>Portada</span>
  {content.heroImage?<div className={styles.heroPhoto}>
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img src={content.heroImage} alt="Portada del negocio"/>
   <button type="button" aria-label="Quitar portada" onClick={()=>onChange({heroImage:"",gallery:content.gallery})}><Trash2 size={16}/></button>
  </div>:null}
  {input("hero")}
  <span className={styles.label}>Galería ({content.gallery.length}/4)</span>
  {content.gallery.length>0?<div className={styles.gallery}>
   {content.gallery.map((url,i)=><div key={url}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} alt={"Galería "+(i+1)}/>
    <button type="button" aria-label={"Quitar foto "+(i+1)} onClick={()=>{
      onChange({heroImage:content.heroImage,gallery:content.gallery.filter((_,index)=>index!==i)});
    }}><Trash2 size={14}/></button>
   </div>)}
  </div>:null}
  {content.gallery.length<4?input("gallery"):null}
  <div className={styles.ai}>
   <span className={styles.label}><WandSparkles size={14}/> Crear portada con IA</span>
   <textarea rows={2} maxLength={450} spellCheck={false} placeholder="Describe la imagen para tu negocio"
    value={prompt} onChange={e=>setPrompt(e.target.value)} disabled={!aiAvailable||generating}/>
   <button type="button" onClick={()=>void generate()} disabled={!aiAvailable||busy||generating||!prompt.trim()}>
    <WandSparkles size={15}/>{generating?"Generando…":aiAvailable?"Generar imagen":"IA pendiente de activación"}
   </button>
  </div>
 </section>;
}
