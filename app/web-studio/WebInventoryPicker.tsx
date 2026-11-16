"use client";

import {useEffect,useState} from "react";
import {Check,ChevronDown,Image as ImageIcon,Link2,Package,RefreshCw,Unlink} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import type {SiteProduct} from "@/lib/web-builder-templates";
import styles from "./WebInventoryPicker.module.css";

type Business={id:string;name:string};
type CatalogRow={id:string;name:string;description:string|null;price_cents:number;currency:string;image_path:string|null};
export type InventoryLoadStatus="idle"|"loading"|"ready"|"error";
type Props={
 ownerId:string;businessName:string;selectedBusinessId:string;
 onSelect:(businessId:string)=>void;
 onProducts:(products:SiteProduct[])=>void;
 onStatus:(status:InventoryLoadStatus)=>void;
};
const normalized=(v:string)=>v.normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("en-US");
const validImagePath=(path:string,owner:string,business:string)=>
 new RegExp("^"+owner+"/"+business+"/[0-9a-f-]{36}\\.(?:jpg|png|webp)$","i").test(path);

export default function WebInventoryPicker({
 ownerId,businessName,selectedBusinessId,onSelect,onProducts,onStatus
}:Props){
 const [businesses,setBusinesses]=useState<Business[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [products,setProducts]=useState<SiteProduct[]>([]);
 const [manual,setManual]=useState(false);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  let alive=true;
  setLoading(true);setError("");setBusinesses([]);
  void(async()=>{
   try{
    const db=getSupabase();if(!db)throw Error("No se pudo consultar el inventario.");
    const {data:auth,error:authError}=await db.auth.getUser();
    if(authError||!auth.user||auth.user.is_anonymous||auth.user.id!==ownerId)
     throw Error("Inicia sesión para conectar tu inventario.");
    const {data,error:readError}=await db.from("vmv_ai_businesses")
     .select("id,name").eq("owner_id",ownerId).order("created_at",{ascending:true}).limit(50);
    if(readError)throw Error("No se pudieron cargar tus negocios.");
    if(alive)setBusinesses((data||[]) as Business[]);
   }catch(e){if(alive)setError(e instanceof Error?e.message:"No se pudo consultar el inventario.");}
   finally{if(alive)setLoading(false);}
  })();
  return()=>{alive=false;};
 },[ownerId,retry]);

 // Link automatically only if this owner has exactly one inventory business
 // matching the web business name; never infer a match from a different owner.
 useEffect(()=>{
  if(loading||manual||selectedBusinessId)return;
  const matches=businesses.filter(b=>normalized(b.name)===normalized(businessName));
  if(matches.length===1)onSelect(matches[0].id);
 },[businessName,businesses,loading,manual,selectedBusinessId,onSelect]);

 useEffect(()=>{
  let alive=true;
  setProducts([]);onProducts([]);
  if(!selectedBusinessId){onStatus("idle");return()=>{alive=false;};}
  onStatus("loading");
  void(async()=>{
   try{
    const db=getSupabase();if(!db)throw Error("No se pudo abrir el catálogo.");
    const {data:auth,error:authError}=await db.auth.getUser();
    if(authError||!auth.user||auth.user.is_anonymous||auth.user.id!==ownerId)
     throw Error("Inicia sesión para consultar los productos.");
    // Both ownership conditions are mandatory. An AI agent never writes to this catalog.
    const {data,error:readError}=await db.from("vmv_ai_catalog_items")
     .select("id,name,description,price_cents,currency,image_path")
     .eq("owner_id",ownerId).eq("business_id",selectedBusinessId)
     .eq("approved",true).eq("active",true).order("name").limit(40);
    if(readError)throw Error("No se pudieron cargar los productos aprobados.");
    const mapped=((data||[]) as CatalogRow[]).filter(item=>
     item.name?.trim()&&item.currency==="usd"&&
     Number.isInteger(item.price_cents)&&item.price_cents>0)
     .map(item=>({
      id:item.id,title:item.name.slice(0,120),
      description:(item.description||"").slice(0,400),
      price:"$"+(item.price_cents/100).toFixed(2),
      image:item.image_path&&validImagePath(item.image_path,ownerId,selectedBusinessId)?
       db.storage.from("vmv-catalog-images").getPublicUrl(item.image_path).data.publicUrl:""
     } satisfies SiteProduct));
    if(!alive)return;
    setError("");setProducts(mapped);onProducts(mapped);onStatus("ready");
   }catch(e){
    if(!alive)return;
    setError(e instanceof Error?e.message:"No se pudo recuperar el catálogo.");
    onStatus("error");
   }
  })();
  return()=>{alive=false;};
 },[ownerId,selectedBusinessId,retry,onProducts,onStatus]);

 const linked=businesses.find(b=>b.id===selectedBusinessId);
 return <section className={styles.root} aria-label="Inventario de tu negocio">
  <div className={styles.heading}>
   <span className={styles.icon}><Package size={23} strokeWidth={1.8}/></span>
   <div className={styles.headCopy}><strong>Inventario del negocio</strong>
    <small>Productos y fotos sincronizados con tu web</small></div>
   {selectedBusinessId&&linked?<span className={styles.connected}><Check size={13}/> Conectado</span>:null}
  </div>
  {loading?<p className={styles.help}>Buscando tu inventario…</p>:
   businesses.length===0?<div className={styles.noInventory}>
    <p>Aún no tienes inventario. Puedes añadir productos manualmente.</p>
    <a href="/vista-app/ai-agents">Abrir Inventario en AI Agents</a>
   </div>:<>
    {businesses.length>1?<label className={styles.selectLabel}>Negocio
      <span className={styles.selectWrap}>
       <select value={selectedBusinessId} onChange={e=>{setManual(false);onSelect(e.target.value);}}>
        <option value="">Selecciona el inventario</option>
        {businesses.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}
       </select><ChevronDown size={15} aria-hidden="true"/>
      </span>
     </label>:null}
    {!selectedBusinessId&&businesses.length===1?<button type="button" className={styles.connect}
     onClick={()=>{setManual(false);onSelect(businesses[0].id);}}>
     <Link2 size={17}/> Usar inventario de {businesses[0].name}
    </button>:null}
    {linked?<div className={styles.inventoryDetails}>
      <div className={styles.summary}>
       <strong>{products.length} {products.length===1?"producto aprobado":"productos aprobados"}</strong>
       <small>Se actualizarán automáticamente al publicar la web.</small>
      </div>
      {products.length>0?<div className={styles.preview}>
       {products.slice(0,8).map(product=><div key={product.id} className={styles.product}>
        {product.image?<img src={product.image} alt="" loading="lazy"/>:
          <span className={styles.placeholder}><ImageIcon size={20}/></span>}
        <span className={styles.productText}><strong>{product.title}</strong>
         <small>{product.price}</small></span>
       </div>)}
       {products.length>8?<small className={styles.extra}>+{products.length-8} productos más</small>:null}
      </div>:null}
      {!products.length?<p className={styles.help}>Cuando apruebes productos con precio en Inventario, aparecerán aquí.</p>:null}
      <button type="button" className={styles.disconnect} onClick={()=>{setManual(true);onSelect("");}}>
       <Unlink size={14}/> Usar productos manuales
      </button>
     </div>:null}
   </>}
  {error?<div className={styles.error} role="alert">{error}
   <button type="button" onClick={()=>setRetry(v=>v+1)}><RefreshCw size={14}/> Reintentar</button>
  </div>:null}
 </section>;
}
