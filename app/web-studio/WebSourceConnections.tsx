"use client";

import {useEffect,useState} from "react";
import {Check,Package,Store,RefreshCw} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {safeWebImageUrl} from "@/lib/web-services-site";
import type {SiteProduct} from "@/lib/web-builder-templates";
import styles from "./WebSourceConnections.module.css";

export type LinkStatus="idle"|"loading"|"ready"|"error";
type Kind="products"|"services";
type Business={id:string;name:string};
type RecordRow={id:string;name:string;description:string|null;price_cents:number|null;currency:string;image_path:string|null};
type Props={
 ownerId:string;businessName:string;
 inventoryId:string;servicesId:string;
 onInventory:(id:string)=>void;onServices:(id:string)=>void;
 onProducts:(items:SiteProduct[])=>void;onServiceItems:(items:SiteProduct[])=>void;
 onInventoryStatus:(v:LinkStatus)=>void;onServicesStatus:(v:LinkStatus)=>void;
 inventoryStatus:LinkStatus;servicesStatus:LinkStatus;
 onChooseType?:(kind:Kind)=>void;
};

const normalized=(s:string)=>s.normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("en-US");
function safeCatalogImage(path:string|null,owner:string,business:string,base:string){
 if(!path||!new RegExp("^"+owner+"/"+business+"/[a-f0-9-]{36}\\.(jpg|png|webp)$","i").test(path))return "";
 return safeWebImageUrl(base+"/storage/v1/object/public/vmv-catalog-images/"+path)||"";
}
function ConnectionRow({kind,businesses,businessName,selected,loading,busy,status,error,onChoose}:{
 kind:Kind;businesses:Business[];businessName:string;selected:string;
 loading:boolean;busy:boolean;status:LinkStatus;error:string;
 onChoose:(id:string)=>void;
}){
 const [choosing,setChoosing]=useState(false);
 const title=kind==="products"?"Conectar inventario":"Conectar servicios";
 const matches=businesses.filter(b=>normalized(b.name)===normalized(businessName));
 const compatible=matches.length===1?matches[0]:businesses.length===1?businesses[0]:null;
 const isOn=Boolean(selected);
 return <div className={styles.unit}>
  <div className={styles.card}>
   <span className={styles.icon}>{kind==="products"?<Package size={24}/>:<Store size={24}/>}</span>
   <span className={styles.name}>{title}</span>
   <button type="button" className={styles.switch} role="switch" aria-checked={isOn}
    aria-label={title} disabled={loading||busy} onClick={()=>{
     if(isOn){onChoose("");setChoosing(false);}
     else if(compatible){onChoose(compatible.id);setChoosing(false);}
     else setChoosing(true);
    }}>
    <span/>
   </button>
  </div>
  {choosing&&!isOn?<div className={styles.pick}>
   {businesses.length?<><label htmlFor={"vmv-"+kind+"-business"}>Selecciona el negocio</label>
    <select id={"vmv-"+kind+"-business"} defaultValue=""
     onChange={e=>{if(e.target.value){onChoose(e.target.value);setChoosing(false);}}}>
     <option value="">Elegir negocio</option>
     {businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
    </select></>:<p>Primero crea el negocio en AI Agents.</p>}
   <button type="button" onClick={()=>setChoosing(false)}>Cancelar</button>
  </div>:null}
  {isOn?<p className={styles.status} role="status">
   {status==="loading"?"Conectando…":
    status==="error"?"Error de conexión":
    <><Check size={14}/> {businesses.find(b=>b.id===selected)?.name||"Conectado"}</>}
  </p>:null}
  {error?<p className={styles.error} role="alert">{error}</p>:null}
 </div>;
}
export default function WebSourceConnections({
 ownerId,businessName,inventoryId,servicesId,
 onInventory,onServices,onProducts,onServiceItems,
 onInventoryStatus,onServicesStatus,inventoryStatus,servicesStatus,onChooseType
}:Props){
 const [businesses,setBusinesses]=useState<Business[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [issues,setIssues]=useState<{products:string;services:string}>({products:"",services:""});
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  let alive=true;setLoading(true);setError("");
  void(async()=>{
   try{
    const db=getSupabase();if(!db)throw Error("No se pudo abrir tu cuenta.");
    const {data:auth,error:authError}=await db.auth.getUser();
    if(authError||!auth.user||auth.user.is_anonymous||auth.user.id!==ownerId)
     throw Error("Inicia sesión para conectar tus catálogos.");
    const {data,error:readError}=await db.from("vmv_ai_businesses").select("id,name")
     .eq("owner_id",ownerId).order("created_at",{ascending:true}).limit(50);
    if(readError)throw Error("No se pudieron cargar los negocios.");
    if(alive)setBusinesses((data||[]) as Business[]);
   }catch(e){if(alive)setError(e instanceof Error?e.message:"No se pudieron cargar los negocios.");}
   finally{if(alive)setLoading(false);}
  })();
  return()=>{alive=false;};
 },[ownerId,retry]);
 useEffect(()=>{
  let alive=true;
  const load=async(kind:Kind,selected:string)=>{
   const onData=kind==="products"?onProducts:onServiceItems;
   const onStatus=kind==="products"?onInventoryStatus:onServicesStatus;
   onData([]);
   if(!selected){onStatus("idle");setIssues(old=>({...old,[kind]:""}));return;}
   onStatus("loading");
   try{
    const db=getSupabase();if(!db)throw Error("No hay conexión con VMV.");
    const {data:auth,error:authError}=await db.auth.getUser();
    if(authError||!auth.user||auth.user.is_anonymous||auth.user.id!==ownerId)
     throw Error("Inicia sesión para consultar el catálogo.");
    const table=kind==="products"?"vmv_ai_catalog_items":"vmv_ai_services";
    const {data,error:readError}=await db.from(table)
     .select("id,name,description,price_cents,currency,image_path")
     .eq("owner_id",ownerId).eq("business_id",selected)
     .eq("approved",true).eq("active",true)
     .order("name",{ascending:true}).limit(40);
    if(readError)throw Error("No se pudo leer el catálogo de "+(kind==="products"?"productos.":"servicios."));
    const base=process.env.NEXT_PUBLIC_SUPABASE_URL||"";
    const mapped=((data||[]) as RecordRow[]).filter(x=>x.name?.trim()&&x.currency==="usd"&&
     (kind==="services"||Number.isInteger(x.price_cents)&&Number(x.price_cents)>0))
     .map(x=>({
      id:x.id,title:x.name.slice(0,120),
      description:(x.description||"").slice(0,400),
      price:x.price_cents===null?"":"$"+(x.price_cents/100).toFixed(2),
      image:safeCatalogImage(x.image_path,ownerId,selected,base)
     }));
    if(alive){onData(mapped);onStatus("ready");setIssues(old=>({...old,[kind]:""}));}
   }catch(e){if(alive){onStatus("error");
    setIssues(old=>({...old,[kind]:e instanceof Error?e.message:"No se pudo conectar."}));}}
  };
  void load("products",inventoryId);
  void load("services",servicesId);
  return()=>{alive=false;};
 },[ownerId,inventoryId,servicesId,retry,onProducts,onServiceItems,onInventoryStatus,onServicesStatus]);
 function toggle(kind:Kind,id:string){
  if(id)onChooseType?.(kind);
  if(kind==="products")onInventory(id);else onServices(id);
 }
 return <section className={styles.root} aria-label="Conexiones de productos y servicios">
  <ConnectionRow kind="products" businesses={businesses} businessName={businessName}
   selected={inventoryId} loading={loading} busy={false}
   status={inventoryStatus} error={issues.products}
   onChoose={id=>toggle("products",id)}/>
  <ConnectionRow kind="services" businesses={businesses} businessName={businessName}
   selected={servicesId} loading={loading} busy={false}
   status={servicesStatus} error={issues.services}
   onChoose={id=>toggle("services",id)}/>
  {error?<div className={styles.error}>{error}
   <button type="button" onClick={()=>setRetry(v=>v+1)}><RefreshCw size={14}/> Reintentar</button>
  </div>:null}
  {!loading&&businesses.length===0?<a className={styles.manage} href="/vista-app/ai-agents">Crear negocio y catálogos</a>:null}
  {!loading&&businesses.length>0?<a className={styles.manage} href="/vista-app/ai-agents">Editar productos y servicios en AI Agents</a>:null}
 </section>;
}
