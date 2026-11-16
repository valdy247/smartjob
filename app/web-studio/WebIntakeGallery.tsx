"use client";

import {useRef,useState,type ChangeEvent} from "react";
import {Check,ImagePlus,MoveLeft,MoveRight,Plus,Trash2} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {safeWebImageUrl} from "@/lib/web-services-site";
import styles from "./WebIntakeGallery.module.css";

const BUCKET="smartjob-web-images";
const MAX=24;
export type GalleryColumns=1|2|3;
type Props={
 ownerId:string;images:string[];columns:GalleryColumns;
 onChange:(images:string[],columns:GalleryColumns)=>void;
 onUploadingChange?:(uploading:boolean)=>void;
 disabled?:boolean;
};

async function optimizedPhoto(file:File):Promise<Blob>{
 if(!["image/jpeg","image/png","image/webp"].includes(file.type))
  throw Error("Solo se permiten JPG, PNG o WebP.");
 if(file.size>18*1024*1024)throw Error("La foto no puede superar 18 MB.");
 if(typeof createImageBitmap!=="function"){
  if(file.size>5*1024*1024)throw Error("Esta foto debe pesar menos de 5 MB.");
  return file;
 }
 const bitmap=await createImageBitmap(file);
 try{
  if(bitmap.width>9000||bitmap.height>9000)throw Error("Resolución demasiado alta.");
  const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
  canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
  const ctx=canvas.getContext("2d");
  if(!ctx)throw Error("No se pudo preparar esta foto.");
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/webp",.83));
  if(!blob||blob.size>5*1024*1024)throw Error("No se pudo optimizar esta foto.");
  return blob;
 }finally{bitmap.close();}
}

export default function WebIntakeGallery({ownerId,images,columns,onChange,onUploadingChange,disabled=false}:Props){
 const input=useRef<HTMLInputElement>(null);
 const [uploading,setUploading]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 async function uploadMany(event:ChangeEvent<HTMLInputElement>){
  const files=Array.from(event.currentTarget.files||[]);
  event.currentTarget.value="";
  if(!files.length||uploading||disabled)return;
  const slots=MAX-images.length;
  if(slots<=0){setError("La galería admite hasta 24 fotografías.");return;}
  setUploading(true);onUploadingChange?.(true);setError("");setNotice("");
  const uploaded:string[]=[];
  const failed:string[]=[];
  try{
   const db=getSupabase();if(!db)throw Error("No se pudo conectar a tu biblioteca.");
   const {data:auth,error:authError}=await db.auth.getUser();
   if(authError||!auth.user||auth.user.is_anonymous||auth.user.id!==ownerId)
    throw Error("Vuelve a iniciar sesión para subir fotografías.");
   for(const file of files.slice(0,slots)){
    try{
     const blob=await optimizedPhoto(file);
     const ext=blob.type==="image/webp"?"webp":blob.type==="image/png"?"png":"jpg";
     const path=ownerId+"/"+crypto.randomUUID()+"."+ext;
     const {error:uploadError}=await db.storage.from(BUCKET).upload(path,blob,{
      upsert:false,contentType:blob.type||file.type,cacheControl:"3600"
     });
     if(uploadError)throw Error("No se pudo subir "+file.name);
     const url=safeWebImageUrl(db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
     if(!url)throw Error("La foto no tiene un enlace válido.");
     uploaded.push(url);
    }catch(e){failed.push(file.name+" — "+(e instanceof Error?e.message:"Error de carga"));}
   }
   if(uploaded.length)onChange([...images,...uploaded],columns);
   if(files.length>slots)failed.push("Se alcanzó el límite de 24 fotografías.");
   if(failed.length)setError(failed.slice(0,3).join(" · "));
   if(uploaded.length)setNotice(uploaded.length+" "+(uploaded.length===1?"foto añadida":"fotos añadidas")+".");
  }catch(e){setError(e instanceof Error?e.message:"No se pudieron subir las fotografías.");}
  finally{setUploading(false);onUploadingChange?.(false);}
 }
 function move(index:number,offset:number){
  const next=[...images],destination=index+offset;
  if(destination<0||destination>=next.length)return;
  [next[index],next[destination]]=[next[destination],next[index]];
  onChange(next,columns);
 }
 return <section className={styles.root} aria-label="Galería de tu web">
  <div className={styles.top}>
   <div className={styles.titleGroup}>
    <strong>Subir fotos para la galería de tu web</strong>
    <small>Hasta 24 fotos · JPG, PNG o WebP</small>
   </div>
   <span className={styles.counter}>{images.length}/24</span>
  </div>
  <button type="button" className={styles.uploadButton} disabled={disabled||uploading||images.length>=MAX}
   onClick={()=>input.current?.click()}>
   {uploading?<span className={styles.spinner} aria-hidden="true"/>:<Plus size={19}/>}
   {uploading?"Subiendo fotografías…":"Añadir fotos"}
  </button>
  <input ref={input} className={styles.fileInput} type="file" multiple
   accept="image/jpeg,image/png,image/webp" disabled={disabled||uploading}
   onChange={event=>void uploadMany(event)}/>
  <div className={styles.layoutHeader}><strong>¿Cómo quieres ver tu galería?</strong></div>
  <div className={styles.layouts} role="group" aria-label="Columnas de la galería">
   {([1,2,3] as const).map(count=><button type="button" key={count}
    className={styles.layoutButton} aria-pressed={columns===count}
    disabled={disabled||uploading} onClick={()=>onChange(images,count)}>
    <span className={styles.columnsGraphic} style={{gridTemplateColumns:`repeat(${count},1fr)`}} aria-hidden="true">
     {Array.from({length:count*2},(_,i)=><span key={i}/>)}
    </span>
    <small>{count} {count===1?"columna":"columnas"}</small>
    {columns===count?<Check className={styles.selected} size={13} strokeWidth={3}/>:null}
   </button>)}
  </div>
  {images.length>0?<div className={styles.preview} style={{gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`}}>
   {images.map((url,index)=><div key={url} className={styles.imageTile}>
    <img src={url} alt={"Fotografía "+(index+1)+" de la galería"} loading="lazy"/>
    <div className={styles.imageActions}>
     <button type="button" disabled={disabled||uploading||index===0}
      aria-label={"Mover foto "+(index+1)+" a la izquierda"} onClick={()=>move(index,-1)}>
      <MoveLeft size={14}/></button>
     <span>{index+1}</span>
     <button type="button" disabled={disabled||uploading||index===images.length-1}
      aria-label={"Mover foto "+(index+1)+" a la derecha"} onClick={()=>move(index,1)}>
      <MoveRight size={14}/></button>
     <button type="button" disabled={disabled||uploading}
      aria-label={"Quitar foto "+(index+1)+" de la galería"}
      onClick={()=>onChange(images.filter((_,i)=>i!==index),columns)}>
      <Trash2 size={14}/></button>
    </div>
   </div>)}
  </div>:<div className={styles.empty}><ImagePlus size={23}/><span>Tus fotografías aparecerán aquí.</span></div>}
  {error?<p className={styles.error} role="alert">{error}</p>:null}
  {notice?<p className={styles.notice} role="status">{notice}</p>:null}
 </section>;
}
