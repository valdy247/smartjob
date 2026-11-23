"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {Download,ImageIcon,LoaderCircle,RefreshCw,Trash2} from "lucide-react";
import {listCreativeImages,removeCreativeImage} from "@/lib/vmv-creative-image-history";
import css from "./CreativeImageHistory.module.css";
type Entry={id:string;url:string;style:string;prompt:string;createdAt:number;mime:string};
export default function CreativeImageHistory({en=false}:{en?:boolean}){
 const [items,setItems]=useState<Entry[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState(false);
 const urls=useRef<string[]>([]);
 const load=useCallback(async()=>{
  setLoading(true);setError(false);
  try{
   const images=await listCreativeImages();
   const newItems=images.map(i=>({id:i.id,url:URL.createObjectURL(i.blob),style:i.style,prompt:i.prompt,
    createdAt:i.createdAt,mime:i.blob.type}));
   for(const url of urls.current)URL.revokeObjectURL(url);
   urls.current=newItems.map(x=>x.url);
   setItems(newItems);
  }catch{setError(true);}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();return()=>{for(const url of urls.current)URL.revokeObjectURL(url);urls.current=[];};},[load]);
 const remove=async(id:string)=>{try{await removeCreativeImage(id);await load();}catch{setError(true);}};
 return <section className={css.section} aria-label={en?"Generated image history":"Historial de imágenes"}>
  <div className={css.heading}><strong><ImageIcon size={17}/>{en?"Images":"Imágenes"} · {items.length}</strong>
   <button type="button" disabled={loading} aria-label={en?"Refresh images":"Actualizar imágenes"} onClick={()=>void load()}><RefreshCw size={17}/></button>
  </div>
  {loading?<p className={css.status}><LoaderCircle size={15}/>{en?"Loading…":"Cargando…"}</p>:null}
  {error?<p className={css.status} role="alert">{en?"Image history is unavailable on this device.":"El historial de imágenes no está disponible en este dispositivo."}</p>:null}
  {!loading&&!items.length&&!error?<p className={css.status}>{en?"No images yet.":"Sin imágenes todavía."}</p>:null}
  {items.length?<div className={css.grid}>{items.map(item=>
   <div key={item.id} className={css.card}>
    <img src={item.url} alt={item.prompt.slice(0,100)||item.style}/>
    <div className={css.details}><strong>{item.style}</strong>
     <span>{new Date(item.createdAt).toLocaleDateString(en?"en-US":"es-US")}</span>
    </div>
    <div className={css.buttons}>
     <a href={item.url} download={"vmv-"+item.id+(item.mime==="image/png"?".png":item.mime==="image/webp"?".webp":".jpg")} aria-label={en?"Download image":"Descargar imagen"}><Download size={16}/></a>
     <button type="button" aria-label={en?"Delete image":"Eliminar imagen"} onClick={()=>void remove(item.id)}><Trash2 size={16}/></button>
    </div>
   </div>)}</div>:null}
  <p className={css.note}>{en?"Saved on this device":"Guardadas en este dispositivo"}</p>
 </section>;
}
