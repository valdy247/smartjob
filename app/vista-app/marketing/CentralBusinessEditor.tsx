"use client";
import {useEffect,useState} from "react";
import {ImagePlus,ShieldCheck} from "lucide-react";
import type {CentralBusiness} from "@/lib/vmv-central-business";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import styles from "./CentralBusinessEditor.module.css";
import PlaceAddressLookup from "./PlaceAddressLookup";

export type CentralBusinessFiles={logo:File|null;cover:File|null;gallery:File[]};
export const emptyBusinessFiles:CentralBusinessFiles={logo:null,cover:null,gallery:[]};
function UploadPreview({file,label}:{file:File|null;label:string}){
 const [url,setUrl]=useState("");
 useEffect(()=>{
  if(!file){setUrl("");return;}
  const next=URL.createObjectURL(file);setUrl(next);
  return()=>URL.revokeObjectURL(next);
 },[file]);
 return url?<img src={url} className={styles.preview} alt={label}/>:null;
}
export default function CentralBusinessEditor({business,onChange,files,onFiles,allowImages=true}:{business:CentralBusiness;onChange:(next:CentralBusiness)=>void;files:CentralBusinessFiles;onFiles:(next:CentralBusinessFiles)=>void;allowImages?:boolean}){
 const {language}=useInterfaceLanguage();const en=language==="en";
 const [more,setMore]=useState(false);
 const [photoError,setPhotoError]=useState("");
 const patch=<K extends keyof CentralBusiness>(key:K,value:CentralBusiness[K])=>onChange({...business,[key]:value});
 const input=(key:keyof CentralBusiness,label:string,placeholder="",type="text")=><label className={styles.field}><span>{label}</span><input type={type} value={String(business[key]??"")} placeholder={placeholder} maxLength={key==="description"?900:250} onChange={e=>onChange({...business,[key]:e.target.value})}/></label>;
 const choose=(files:FileList|null,multiple=false)=>{
  const list=Array.from(files||[]),valid=list.every(f=>["image/jpeg","image/png"].includes(f.type)&&f.size>=10240&&f.size<=5242880);
  if(!valid){setPhotoError(en?"JPG or PNG only, 10 KB to 5 MB each.":"Solo JPG o PNG, de 10 KB a 5 MB cada una.");return [];}
  setPhotoError("");return multiple?list.slice(0,8):list.slice(0,1);
 };
 return <div className={styles.root}>
  <button type="button" className={styles.expand} aria-expanded={more} onClick={()=>setMore(v=>!v)}>
   {more?(en?"Hide business details":"Ocultar datos del negocio"):(en?"Complete my business profile (optional)":"Completar mi perfil de negocio (opcional)")} <span>{more?"−":"+"}</span>
  </button>
  {more?<div className={styles.content}>
   <div className={styles.grid}>{input("legal_name",en?"Legal name":"Nombre legal")}{input("email",en?"Business email":"Correo del negocio","","email")}</div>
   <label className={styles.field}><span>{en?"Description":"Descripción"}</span><textarea maxLength={900} rows={3} value={business.description} onChange={e=>patch("description",e.target.value)}/></label>
   <div className={styles.grid}>{input("phone",en?"Business phone":"Teléfono comercial","","tel")}{input("secondary_phone",en?"Additional phone":"Teléfono adicional","","tel")}</div>
   <label className={styles.field}><span>{en?"Where do you serve customers?":"¿Dónde atiendes?"}</span>
    <select value={business.kind} onChange={e=>onChange({...business,kind:e.target.value as CentralBusiness["kind"],address_visibility:e.target.value==="service_area"?"private":business.address_visibility})}>
     <option value="storefront">{en?"Storefront":"Local"}</option><option value="service_area">{en?"At customers' locations":"En casa del cliente / entregas"}</option><option value="hybrid">{en?"Both":"Ambos"}</option>
    </select></label>
   <div className={styles.grid}>{input("city",en?"City":"Ciudad")}{input("region",en?"State / region":"Estado / región")}{input("country",en?"Country code":"Código de país","US")}{input("postal",en?"ZIP / postal code":"Código postal")}</div>
   <label className={styles.field}><span>{en?"Service areas":"Zonas de servicio"}</span><textarea value={business.service_areas} rows={2} maxLength={600} onChange={e=>patch("service_areas",e.target.value)}/></label>
   <details className={styles.privateAddress}><summary>{en?"Address (stored privately)":"Dirección (almacenamiento privado)"}</summary>
    <PlaceAddressLookup country={business.country||"US"} onPick={address=>onChange({...business,street:address.street,city:address.city,region:address.region,postal:address.postal,country:address.country})}/>
    <div className={styles.grid}>{input("street",en?"Street address":"Calle y número")}{input("unit",en?"Suite / unit":"Local / unidad")}</div>
    <label className={styles.field}><span>{en?"May VMV mark this as a public storefront address?":"¿Es una dirección comercial que puede mostrarse públicamente?"}</span>
     <select value={business.address_visibility} onChange={e=>patch("address_visibility",e.target.value as "private"|"public")}>
      <option value="private">{en?"No, private":"No, privada"}</option><option value="public">{en?"Yes, public":"Sí, pública"}</option>
     </select></label>
    <p className={styles.note}><ShieldCheck size={14}/>{en?"Saving an address does not publish it anywhere.":"Guardar la dirección no la publica en ningún servicio."}</p>
   </details>
   <div className={styles.grid}>{input("booking_url",en?"Booking / ordering URL":"Enlace de reservas / pedidos","https://...")}<label className={styles.field}><span>{en?"Instagram / social URL":"Instagram / red social"}</span><input type="url" maxLength={500} value={business.social_links?.instagram||""} placeholder="https://instagram.com/..." onChange={e=>patch("social_links",{...business.social_links,instagram:e.target.value})}/></label></div>
   <label className={styles.field}><span>{en?"Products and services":"Productos y servicios"}</span><textarea value={business.products} maxLength={1200} rows={2} onChange={e=>patch("products",e.target.value)}/><textarea value={business.services} maxLength={1200} rows={2} onChange={e=>patch("services",e.target.value)}/></label>
   <label className={styles.toggle}><input type="checkbox" checked={business.hours_enabled} onChange={e=>patch("hours_enabled",e.target.checked)}/>{en?"I have regular opening hours":"Tengo horarios habituales"}</label>
   {business.hours_enabled?<div className={styles.hours}>{(business.hours?.length===7?business.hours:Array.from({length:7},()=>({closed:true,start:"09:00",end:"17:00"}))).map((h,i)=><div className={styles.day} key={i}><span>{(en?["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]:["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"])[i]}</span><input type="checkbox" aria-label={(en?"Open ":"Abierto ")+i} checked={!h.closed} onChange={e=>patch("hours",(business.hours?.length===7?business.hours:Array.from({length:7},()=>({closed:true,start:"09:00",end:"17:00"}))).map((x,j)=>j===i?{...x,closed:!e.target.checked}:x))}/>{!h.closed?<><input type="time" value={h.start} aria-label={"Opening "+i} onChange={e=>patch("hours",business.hours.map((x,j)=>j===i?{...x,start:e.target.value}:x))}/><input type="time" value={h.end} aria-label={"Closing "+i} onChange={e=>patch("hours",business.hours.map((x,j)=>j===i?{...x,end:e.target.value}:x))}/></>:null}</div>)}</div>:null}
   {allowImages?<div className={styles.media}>
    <strong><ImagePlus size={16}/>{en?"Business photos (private)":"Fotos del negocio (privadas)"}</strong>
    <div className={styles.grid}>
     <label>{en?"Logo":"Logo"}<input type="file" accept="image/jpeg,image/png" onChange={e=>onFiles({...files,logo:choose(e.target.files)[0]||null})}/><UploadPreview file={files.logo} label="Logo"/></label>
     <label>{en?"Cover":"Portada"}<input type="file" accept="image/jpeg,image/png" onChange={e=>onFiles({...files,cover:choose(e.target.files)[0]||null})}/><UploadPreview file={files.cover} label={en?"Cover":"Portada"}/></label>
    </div>
    <label>{en?"Gallery (up to 8)":"Galería (hasta 8)"}<input multiple type="file" accept="image/jpeg,image/png" onChange={e=>onFiles({...files,gallery:choose(e.target.files,true)})}/></label>
    <span>{[business.logo_path,business.cover_path,...business.gallery_paths].filter(Boolean).length} {en?"saved photos":"fotos guardadas"} · {files.gallery.length+(files.logo?1:0)+(files.cover?1:0)} {en?"selected":"seleccionadas"}</span>
    {photoError?<p role="alert" className={styles.photoError}>{photoError}</p>:null}
   </div>:null}
  </div>:null}
 </div>;
}
