"use client";
import {useEffect,useRef,useState} from "react";
import {ChevronDown,ChevronUp,ImagePlus,Plus,Trash2} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {safeWebImageUrl} from "@/lib/web-services-site";
import type {SiteProduct} from "@/lib/web-builder-templates";
import BuilderImageField from "./BuilderImageField";
import styles from "./WebIntakeProducts.module.css";

export type ProductSaveStatus="loading"|"saving"|"saved"|"error";
type Props={
 ownerId:string;items:SiteProduct[];visible:boolean;
 onChange:(items:SiteProduct[])=>void;
 onStatusChange:(status:ProductSaveStatus)=>void;
};
const MAX=30;
export function safeDraftProducts(value:unknown):SiteProduct[]{
 if(!Array.isArray(value))return [];
 return value.slice(0,MAX).flatMap(item=>{
  if(!item||typeof item!=="object"||Array.isArray(item))return [];
  const product=item as Record<string,unknown>;
  const id=typeof product.id==="string"&&/^[0-9a-f-]{36}$/.test(product.id)?product.id:crypto.randomUUID();
  const title=typeof product.title==="string"?product.title.slice(0,120):"";
  const description=typeof product.description==="string"?product.description.slice(0,400):"";
  const price=typeof product.price==="string"?product.price.slice(0,32):"";
  const image=typeof product.image==="string"?safeWebImageUrl(product.image)||"":"";
  return [{id,title,description,price,image}];
 });
}
export default function WebIntakeProducts({ownerId,items,visible,onChange,onStatusChange}:Props){
 const [loaded,setLoaded]=useState(false);
 const [dirty,setDirty]=useState(false);
 const [active,setActive]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [retry,setRetry]=useState(0);
 const revision=useRef(0);
 const queue=useRef<Promise<void>>(Promise.resolve());
 const mounted=useRef(true);
 useEffect(()=>{
  mounted.current=true;
  let alive=true;
  setLoaded(false);onStatusChange("loading");setError("");
  void(async()=>{
   try{
    const client=getSupabase();
    if(!client)throw new Error("No se pudo conectar con los productos.");
    const {data:auth,error:authError}=await client.auth.getUser();
    if(authError||auth.user?.id!==ownerId||auth.user.is_anonymous)
     throw new Error("Inicia sesión para recuperar tus productos.");
    const {data,error:readError}=await client.from("smartjob_web_intake_products")
     .select("items").eq("owner_id",ownerId).maybeSingle();
    if(readError)throw new Error("No se pudo recuperar la lista de productos.");
    if(!alive)return;
    const initial=safeDraftProducts(data?.items);
    onChange(initial);setActive(initial[0]?.id||null);
    setDirty(false);setLoaded(true);onStatusChange("saved");
   }catch(e){
    if(!alive)return;
    setError(e instanceof Error?e.message:"No se pudieron recuperar los productos.");
    onStatusChange("error");
   }
  })();
  return()=>{alive=false;mounted.current=false;};
 },[ownerId,onChange,onStatusChange]);
 function edit(next:SiteProduct[]){
  revision.current++;
  onChange(next);setDirty(true);onStatusChange("saving");setError("");
 }
 function change(id:string,field:keyof Omit<SiteProduct,"id">,value:string){
  const next=items.map(item=>item.id===id?{...item,[field]:value}:item);
  edit(next);
 }
 function add(){
  if(!loaded)return;
  if(items.length>=MAX){setError("Puedes agregar hasta 30 productos en esta pantalla.");return;}
  const item:SiteProduct={id:crypto.randomUUID(),title:"",description:"",price:"",image:""};
  edit([...items,item]);setActive(item.id);
 }
 function remove(id:string){
  const next=items.filter(item=>item.id!==id);
  edit(next);if(active===id)setActive(next[0]?.id||null);
 }
 useEffect(()=>{
  if(!loaded||!dirty)return;
  const version=revision.current;
  const snapshot=items.map(item=>({...item}));
  const timer=window.setTimeout(()=>{
   queue.current=queue.current.catch(()=>{}).then(async()=>{
    try{
     const client=getSupabase();if(!client)throw new Error("Sin conexión.");
     const {error:saveError}=await client.from("smartjob_web_intake_products").upsert({
      owner_id:ownerId,items:snapshot,updated_at:new Date().toISOString()
     },{onConflict:"owner_id"});
     if(saveError)throw new Error("No se pudieron guardar los productos. Reintenta.");
     if(!mounted.current||version!==revision.current)return;
     setDirty(false);setError("");onStatusChange("saved");
    }catch(e){
     if(!mounted.current||version!==revision.current)return;
     setError(e instanceof Error?e.message:"No se pudieron guardar los productos.");
     onStatusChange("error");
    }
   });
  },550);
  return()=>window.clearTimeout(timer);
 },[items,loaded,dirty,ownerId,retry,onStatusChange]);
 return <section className={styles.panel} hidden={!visible} aria-label="Catálogo de productos">
  <div className={styles.head}>
   <div><strong>Productos ({items.length})</strong>
    <small>Crea una ficha por producto. No habrá cobros automáticos.</small></div>
   <button type="button" disabled={!loaded||items.length>=MAX} onClick={add}><Plus size={16}/> Añadir producto</button>
  </div>
  <p role="status" className={styles.status}>
   {!loaded&&!error?"Recuperando productos…":dirty?"Guardando productos…":items.length?"Productos guardados":"Agrega tu primer producto"}
  </p>
  {error?<div className={styles.error} role="alert">{error}
   <button type="button" onClick={()=>setRetry(v=>v+1)}>Reintentar guardado</button>
  </div>:null}
  <div className={styles.cards}>
   {items.map((item,index)=><article key={item.id} className={styles.card}>
    <div className={styles.cardHead}>
     <button type="button" className={styles.expand} aria-expanded={active===item.id}
      onClick={()=>setActive(active===item.id?null:item.id)}>
      {item.image?<img src={item.image} alt="" className={styles.thumb}/>:<span className={styles.thumbEmpty}><ImagePlus size={20}/></span>}
      <span><small>PRODUCTO {index+1}</small><strong>{item.title.trim()||"Sin nombre"}</strong></span>
      {active===item.id?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
     </button>
     <button type="button" className={styles.remove} aria-label={"Eliminar producto "+(index+1)}
      onClick={()=>remove(item.id)} title="Eliminar producto"><Trash2 size={16}/></button>
    </div>
    {active===item.id?<div className={styles.edit}>
     <label>Nombre del producto
      <input type="text" maxLength={120} placeholder="Ej. Pastel de chocolate" value={item.title}
       onChange={e=>change(item.id,"title",e.target.value)}/>
     </label>
     <label>Descripción <small>(opcional)</small>
      <textarea rows={2} maxLength={400} placeholder="Qué incluye o qué lo hace especial"
       value={item.description} onChange={e=>change(item.id,"description",e.target.value)}/>
     </label>
     <label>Precio <small>(opcional, sin cobro en línea)</small>
      <input type="text" maxLength={32} placeholder="Ej. Desde $25"
       value={item.price} onChange={e=>change(item.id,"price",e.target.value)}/>
     </label>
     <div className={styles.imageField}><strong>Foto de este producto</strong>
      <BuilderImageField value={item.image} onChange={url=>change(item.id,"image",url)}/>
     </div>
    </div>:null}
   </article>)}
   {items.length===0&&loaded?<div className={styles.empty}>
    <ImagePlus size={20}/> Cada producto tendrá su propio nombre, foto y descripción.
   </div>:null}
  </div>
 </section>;
}
