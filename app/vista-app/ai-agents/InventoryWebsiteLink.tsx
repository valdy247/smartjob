"use client";

import {useEffect,useState} from "react";
import {CheckCircle2,ChevronDown,Globe2,Link2,LoaderCircle,Unlink} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import styles from "./CommerceStudio.module.css";

type Website={id:string;name:string;slug:string;inventory_business_id:string|null;published:boolean};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The merchant connects an owned site to their catalog, never an AI agent.
 * Keep details collapsed; show only the actual connection and how to change it.
 */
export default function InventoryWebsiteLink({businessId}:{businessId:string}){
 const [sites,setSites]=useState<Website[]>([]);
 const [selected,setSelected]=useState("");
 const [expanded,setExpanded]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 useEffect(()=>{
  let live=true;
  setLoading(true);setError("");setSites([]);setSelected("");setExpanded(false);
  if(!uuid.test(businessId)){setLoading(false);return;}
  void(async()=>{
   try{
    const db=getSupabase();if(!db)throw Error("Conexión no disponible.");
    const {data:auth,error:authError}=await db.auth.getUser();
    if(authError||!auth.user||auth.user.is_anonymous)throw Error("Vuelve a iniciar sesión.");
    const owner=auth.user.id;
    const [result,published]=await Promise.all([
     db.from("smartjob_builder_sites")
      .select("id,name,slug,inventory_business_id").eq("owner_id",owner)
      .order("created_at",{ascending:false}).limit(40),
     db.from("smartjob_builder_public_pages")
      .select("site_id").eq("owner_id",owner).limit(100)
    ]);
    if(result.error||published.error)throw Error("No se pudieron consultar tus webs.");
    const publishedIds=new Set((published.data||[]).map(item=>String(item.site_id)));
    const websites=(result.data||[]).map(site=>({...site,published:publishedIds.has(site.id)})) as Website[];
    if(live){
     setSites(websites);
     setSelected(websites.find(site=>site.published&&site.inventory_business_id===businessId)?.id||
      websites.find(site=>site.inventory_business_id===businessId)?.id||
      websites.find(site=>site.published)?.id||websites[0]?.id||"");
    }
   }catch(e){if(live)setError(e instanceof Error?e.message:"No se pudieron consultar las webs.");}
   finally{if(live)setLoading(false);}
  })();
  return()=>{live=false;};
 },[businessId]);
 const chosen=sites.find(site=>site.id===selected);
 const connected=Boolean(chosen?.inventory_business_id===businessId);
 async function changeLink(link:boolean){
  if(busy||!chosen||!uuid.test(businessId)||(!link&&!connected))return;
  const prompt=link?
   "Los productos aprobados de este inventario sustituirán los productos de la sección de ventas de esta web. ¿Conectar?":
   "La web volverá a mostrar los productos guardados en su última publicación. ¿Desconectar?";
  if(!window.confirm(prompt))return;
  setError("");setMessage("");setBusy(true);
  try{
   const db=getSupabase();if(!db)throw Error("Conexión no disponible.");
   const {data:auth,error:authError}=await db.auth.getUser();
   if(authError||!auth.user||auth.user.is_anonymous)throw Error("Tu sesión expiró.");
   const {data:updated,error:linkError}=await db.from("smartjob_builder_sites")
    .update({inventory_business_id:link?businessId:null,updated_at:new Date().toISOString()})
    .eq("id",chosen.id).eq("owner_id",auth.user.id)
    .select("id,inventory_business_id").maybeSingle();
   if(linkError||!updated)throw Error("No se pudo cambiar la conexión.");
   setSites(previous=>previous.map(site=>site.id===chosen.id?{
    ...site,inventory_business_id:updated.inventory_business_id
   }:site));
   setExpanded(false);
   setMessage(link?"Inventario conectado con la web.":"Inventario desconectado de la web.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setBusy(false);}
 }
 return <div className={styles.connectionUnit} aria-label="Inventario de la web">
  <div className={styles.connectionRow}>
   <span className={styles.connectionIcon}><Globe2 size={19}/></span>
   <div className={styles.connectionIdentity}>
    <strong>Inventario de la web</strong>
    <small>{loading?"Buscando webs…":chosen?.name?
     chosen.name+" · "+(chosen.published?"Publicada":"Borrador"):
     "Sin web seleccionada"}</small>
   </div>
   <div className={styles.connectionControls}>
    <span className={connected?styles.connectionOnline:styles.connectionOffline}>
     {connected?<CheckCircle2 size={13}/>:null}
     {connected?"Conectado":"Sin conectar"}
    </span>
    <button type="button" className={styles.connectionChange}
     aria-expanded={expanded} aria-controls="vmv-inventory-web-settings"
     disabled={loading||busy||sites.length===0}
     onClick={()=>{setExpanded(current=>!current);setError("");setMessage("");}}>
     {expanded?"Cerrar":connected?"Cambiar":"Conectar"}<ChevronDown size={14} aria-hidden/>
    </button>
   </div>
  </div>
  {expanded?<div id="vmv-inventory-web-settings" className={styles.connectionEditor}>
   <label>Seleccionar web
    <select value={selected} disabled={busy} onChange={event=>{
     setSelected(event.target.value);setMessage("");setError("");
    }}>
     {sites.map(site=><option key={site.id} value={site.id}>
      {site.name} · {site.published?"Publicada":"Borrador"}
     </option>)}
    </select>
   </label>
   {chosen?.inventory_business_id&&chosen.inventory_business_id!==businessId?
    <small>Esta web usa otro inventario. Conectarla reemplazará esa relación.</small>:null}
   <div className={styles.connectionActions}>
    {connected?<button type="button" disabled={busy} onClick={()=>void changeLink(false)}>
     <Unlink size={15}/> Desconectar
    </button>:<button type="button" disabled={busy} onClick={()=>void changeLink(true)}>
     <Link2 size={15}/> {busy?"Conectando…":"Conectar a esta web"}
    </button>}
   </div>
  </div>:null}
  {message?<small role="status" className={styles.connectionSuccess}>{message}</small>:null}
  {error?<small role="alert" className={styles.connectionError}>{error}</small>:null}
 </div>;
}
