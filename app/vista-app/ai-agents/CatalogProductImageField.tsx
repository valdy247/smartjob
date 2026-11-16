"use client";
import {useRef,useState} from "react";
import {ImagePlus,LockKeyhole,Trash2,Upload} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import styles from "./CommerceStudio.module.css";

const BUCKET="vmv-catalog-images";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function catalogImageUrl(path:string):string{
 if(!path||!getSupabase()||!/^[-a-f0-9]{36}\/[-a-f0-9]{36}\/[-a-f0-9]{36}\.(jpg|png|webp)$/.test(path))return "";
 return getSupabase()!.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
async function validatePhoto(file:File){
 if(file.size<100||file.size>5*1024*1024)throw Error("La imagen debe pesar menos de 5 MB.");
 const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
 const jpg=file.type==="image/jpeg"&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
 const png=file.type==="image/png"&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
 const webp=file.type==="image/webp"&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&
  String.fromCharCode(...bytes.slice(8,12))==="WEBP";
 if(!jpg&&!png&&!webp)throw Error("Solo se admiten fotos JPG, PNG o WebP originales.");
 return jpg?"jpg":png?"png":"webp";
}
export default function CatalogProductImageField({
 businessId,value,onChange,disabled=false,onBusy,kind="producto"
}:{businessId:string;value:string;onChange:(path:string)=>void;disabled?:boolean;onBusy?:(busy:boolean)=>void;kind?:"producto"|"servicio"}){
 const fileInput=useRef<HTMLInputElement>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const url=catalogImageUrl(value);
 async function upload(file?:File){
  if(!file||busy||disabled)return;
  setError("");setBusy(true);onBusy?.(true);
  try{
   if(!uuid.test(businessId))throw Error("Selecciona un negocio válido.");
   const db=getSupabase();
   if(!db)throw Error("Conexión no disponible.");
   const {data,error:authError}=await db.auth.getUser();
   if(authError||!data.user||data.user.is_anonymous)throw Error("Inicia sesión nuevamente.");
   const ext=await validatePhoto(file);
   // Never alter the uploaded bytes, resize, crop, upscale or generate an alternative.
   const path=data.user.id+"/"+businessId+"/"+crypto.randomUUID()+"."+ext;
   const {error:uploadError}=await db.storage.from(BUCKET).upload(path,file,{
    contentType:file.type,cacheControl:"31536000",upsert:false
   });
   if(uploadError)throw Error("No se pudo subir la imagen. Comprueba que el almacenamiento del catálogo está activado.");
   onChange(path);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo subir la foto.");}
  finally{setBusy(false);onBusy?.(false);if(fileInput.current)fileInput.current.value="";}
 }
 return <div className={styles.catalogImagePicker}>
  <div className={styles.catalogImagePreview}>
   {url?<img src={url} alt={"Fotografía original del "+kind} loading="lazy"/>:
    <div className={styles.catalogImagePlaceholder}><ImagePlus size={32}/><small>Sin fotografía</small></div>}
  </div>
  <div className={styles.catalogImageButtons}>
   <strong><LockKeyhole size={15}/> Imagen original protegida</strong>
   <p>La foto que subas se mostrará sin modificaciones en la web conectada. La IA no puede reemplazarla.</p>
   <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden
    aria-label="Seleccionar foto original del producto" onChange={e=>void upload(e.target.files?.[0])}/>
   <button type="button" disabled={disabled||busy} onClick={()=>fileInput.current?.click()}>
    <Upload size={15}/> {busy?"Subiendo…":url?"Reemplazar foto":"Subir foto"}
   </button>
   {url?<button type="button" disabled={disabled||busy} onClick={()=>onChange("")}>
    <Trash2 size={14}/> Quitar del {kind}
   </button>:null}
   {error?<small role="alert" className={styles.catalogImageError}>{error}</small>:null}
  </div>
 </div>;
}
