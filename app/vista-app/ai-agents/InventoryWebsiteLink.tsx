"use client";

import {useEffect,useState} from "react";
import {CheckCircle2,Globe2,Link2,LoaderCircle,ShieldCheck,Unlink} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import styles from "./CommerceStudio.module.css";

type Website={id:string;name:string;slug:string;inventory_business_id:string|null;published:boolean};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Only the authenticated merchant can select the site and link its inventory.
 * This control never grants catalog write access to AI agents.
 */
export default function InventoryWebsiteLink({businessId}:{businessId:string}){
 const [sites,setSites]=useState<Website[]>([]);
 const [selected,setSelected]=useState("");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 useEffect(()=>{
  let live=true;
  setLoading(true);setError("");setSites([]);setSelected("");
  if(!uuid.test(businessId)){setLoading(false);return;}
  void(async()=>{
   try{
    const db=getSupabase();
    if(!db)throw Error("Conexión no disponible.");
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
    const websites=(result.data||[]).map(site=>({
     ...site,published:publishedIds.has(site.id)
    })) as Website[];
    if(live){
     setSites(websites);
     setSelected(websites.find(site=>site.published&&site.inventory_business_id===businessId)?.id||

      websites.find(site=>site.published)?.id||
      websites[0]?.id||"");
    }
   }catch(e){if(live)setError(e instanceof Error?e.message:"No se pudieron consultar las webs.");}
   finally{if(live)setLoading(false);}
  })();
  return()=>{live=false;};
 },[businessId]);
 const chosen=sites.find(site=>site.id===selected);
 const connected=chosen?.inventory_business_id===businessId;
 async function changeLink(link:boolean){
  if(busy||!chosen||!uuid.test(businessId))return;
  if(!link&&!connected)return;
  const message=link?
   "La web mostrará los productos activos y aprobados de este inventario y sus fotografías originales. La lista anterior de productos del sitio será sustituida. ¿Conectar inventario?":
   "La web volverá a mostrar los productos que tenía al publicar. ¿Desconectar inventario?";
  if(!window.confirm(message))return;
  setError("");setMessage("");setBusy(true);
  try{
   const db=getSupabase();if(!db)throw Error("Conexión no disponible.");
   const {data:auth,error:authError}=await db.auth.getUser();
   if(authError||!auth.user||auth.user.is_anonymous)throw Error("Tu sesión expiró.");
   const {data:updated,error:linkError}=await db.from("smartjob_builder_sites")
    .update({inventory_business_id:link?businessId:null,updated_at:new Date().toISOString()})
    .eq("id",chosen.id).eq("owner_id",auth.user.id)
    .select("id,inventory_business_id").maybeSingle();
   if(linkError||!updated)throw Error("No se pudo actualizar la conexión. Inténtalo de nuevo.");
   setSites(previous=>previous.map(site=>site.id===chosen.id?{
    ...site,inventory_business_id:updated.inventory_business_id
   }:site));
   setMessage(link?
    "Inventario conectado. La web mostrará los productos aprobados y actualizará sus cambios sin volver a publicar.":
    "Inventario desconectado de esta web.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setBusy(false);}
 }
 return <section className={styles.inventoryWebLink} aria-label="Inventario conectado con la web">
  <div className={styles.inventoryWebLinkHeader}>
   <span className={styles.inventoryWebLinkIcon}><Globe2 size={19}/></span>
   <div><strong>Conectar inventario con mi web</strong>
    <small>Productos y fotografías originales, sin edición de IA</small></div>
   {connected?<span className={styles.inventoryWebConnected}><CheckCircle2 size={14}/> Conectado</span>:null}
  </div>
  {loading?<p><LoaderCircle size={15}/> Buscando tus webs…</p>:
   sites.length===0?<p>Todavía no tienes una web de Web Studio para conectar.</p>:<>
    <label className={styles.inventoryWebLabel}>Seleccionar web
     <select value={selected} disabled={busy} onChange={event=>{setSelected(event.target.value);setMessage("");setError("");}}>
      {sites.map(site=><option key={site.id} value={site.id}>{site.name} · {site.published?"Publicada":"Borrador"}</option>)}
     </select>
    </label>
    {chosen?<p>{connected?
     "Esta web ya está vinculada. Los productos aprobados aparecerán automáticamente.":
     chosen.inventory_business_id?
      "Esta web está vinculada a otro inventario. Puedes cambiarlo con autorización.":
      "Esta web todavía no tiene inventario vinculado."}</p>:null}
    <div className={styles.inventoryWebActions}>
     {connected?<button type="button" disabled={busy} onClick={()=>void changeLink(false)}>
      <Unlink size={15}/> {busy?"Guardando…":"Desconectar"}
     </button>:<button type="button" disabled={busy} onClick={()=>void changeLink(true)}>
      <Link2 size={15}/> {busy?"Conectando…":"Conectar inventario"}
     </button>}
    </div>
   </>}
  <small className={styles.inventoryWebSecurity}><ShieldCheck size={14}/> Solo tú puedes conectar la web y cambiar las fotos. La IA no tiene permiso.</small>
  {message?<p role="status" className={styles.inventoryWebSuccess}>{message}</p>:null}
  {error?<p role="alert" className={styles.inventoryWebError}>{error}</p>:null}
 </section>;
}
