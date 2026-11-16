"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,CheckCircle2,ExternalLink,Sparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import type {SiteIntake,SiteProposal} from "@/lib/web-builder-templates";
import WebAiWizard from "./WebAiWizard";
import styles from "./WebBuilderWorkspace.module.css";

function slugify(name:string){
 return name.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,33).replace(/-$/g,"");
}
/**
 * Keep AI business intake independent from the heavy Puck editor. This route
 * can collect choices even when the editor runtime fails to initialize.
 */
export default function WebAiStandalone(){
 const [ownerId,setOwnerId]=useState("");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [created,setCreated]=useState("");
 useEffect(()=>{
  let live=true;
  void(async()=>{
   try{
    const db=getSupabase();
    if(!db)throw Error("No se pudo conectar con VMV.");
    const {data,error}=await db.auth.getUser();
    if(error||!data.user||data.user.is_anonymous)throw Error("Inicia sesión en VMV Business para continuar.");
    if(live)setOwnerId(data.user.id);
   }catch(e){if(live)setError(e instanceof Error?e.message:"No se pudo iniciar.");}
   finally{if(live)setLoading(false);}
  })();
  return()=>{live=false;};
 },[]);
 async function createSite(input:SiteIntake,proposal:SiteProposal){
  if(busy||!ownerId)return;
  const name=input.business.trim().slice(0,100);
  if(name.length<2){setError("Escribe el nombre del negocio.");return;}
  setBusy(true);setError("");
  try{
   const db=getSupabase();
   if(!db)throw Error("No se pudo conectar con VMV.");
   const {data:auth,error:authError}=await db.auth.getUser();
   if(authError||auth.user?.id!==ownerId)throw Error("Tu sesión expiró. Inicia sesión de nuevo.");
   // Lazy-load editor normalization only after a user accepts the proposal.
   const {normalizeBuilderDocument}=await import("@/lib/web-builder-puck");
   const slug=(slugify(name)||"mi-negocio")+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,8);
   const {data:ids,error:rpcError}=await db.rpc("smartjob_builder_create_site",{
    p_name:name,p_slug:slug,p_category_id:input.categoryId,
    p_home_draft:normalizeBuilderDocument(proposal.data),
    p_home_description:(proposal.seoDescription||input.about).slice(0,300),p_legacy_source_slug:null
   });
   if(rpcError||!ids?.siteId||!ids?.pageId)
    throw Error(/límite de cinco sitios/i.test(String(rpcError?.message||""))?
     "Has alcanzado el límite de sitios de tu cuenta.":
     "No se pudo crear el sitio. Tus preferencias siguen disponibles para volver a intentarlo.");
   if(input.inventoryBusinessId){
    const {error:linkError}=await db.from("smartjob_builder_sites")
     .update({inventory_business_id:input.inventoryBusinessId})
     .eq("id",ids.siteId).eq("owner_id",ownerId);
    if(linkError)throw Error("Sitio creado, pero no se pudo conectar el inventario. Abre los ajustes del sitio para conectarlo.");
   }
   if(proposal.seoTitle){
    const page=await db.from("smartjob_builder_pages").select("revision")
     .eq("id",ids.pageId).eq("owner_id",ownerId).maybeSingle();
    if(!page.error&&page.data){
     await db.from("smartjob_builder_pages").update({
      title:proposal.seoTitle.slice(0,100),
      description:(proposal.seoDescription||"").slice(0,300),
      revision:page.data.revision+1,updated_at:new Date().toISOString()
     }).eq("id",ids.pageId).eq("owner_id",ownerId).eq("revision",page.data.revision);
    }
   }
   setCreated(slug);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo crear el sitio.");}
  finally{setBusy(false);}
 }
 return <div className={styles.workspace}>
  <header className={styles.topbar}>
   <a href="/vista-app" className={styles.brand}>VMV <span>Web Studio</span></a>
   <a href="/web-studio?mode=templates" style={{display:"inline-flex",alignItems:"center",gap:7,color:"#8053b9",fontSize:12,fontWeight:750,textDecoration:"none"}}><ArrowLeft size={15}/> Mis sitios</a>
  </header>
  <main className={styles.landing}>
   {loading?<p role="status">Abriendo creador con IA…</p>:!ownerId?
    <section style={{padding:25,borderRadius:18,background:"#fff",maxWidth:650}}>
     <h2>Inicia sesión para crear tu web</h2>
     <p>{error}</p><a href="/vista-app?returnTo=web-studio">Iniciar sesión en VMV Business</a>
    </section>:
    created?<section style={{padding:25,borderRadius:18,background:"#fff",maxWidth:650,display:"flex",flexDirection:"column",gap:14}}>
     <CheckCircle2 color="#23946b" size={35}/>
     <h1 style={{fontSize:24,margin:0}}>¡Tu diseño ya está guardado!</h1>
     <p style={{margin:0,lineHeight:1.6}}>Creaste un borrador. La página todavía no es pública y podrás modificarla en Editor 2.0.</p>
     <a href={"/web-studio?mode=templates&open="+encodeURIComponent(created)}
      style={{display:"inline-flex",alignItems:"center",gap:8,color:"#7e51c9",fontWeight:850,fontSize:14}}>Abrir mi sitio en el editor <ExternalLink size={17}/></a>
    </section>:
    <WebAiWizard ownerId={ownerId} busy={busy} onChoose={(input,proposal)=>void createSite(input,proposal)}/>
   }
   {error&&ownerId?<div className={styles.error} role="alert">{error}</div>:null}
  </main>
 </div>;
}
