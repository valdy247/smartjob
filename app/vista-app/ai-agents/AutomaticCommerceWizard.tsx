"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,ArrowRight,Bot,Check,LoaderCircle,ShieldCheck,Sparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {listCatalog,saveCommerceSetup,type CatalogItem} from "./commerceStore";
import AgentWebCatalogEditor from "./AgentWebCatalogEditor";
import type {PersistedAgent} from "./agentStore";
import type {CentralBusiness} from "./centralBusiness";
import theme from "./AgentServiceFlow.module.css";
import styles from "./AutomaticWebWizard.module.css";

type Step="access"|"orders"|"product"|"review";
const steps:Step[]=["access","orders","product","review"];
const labels:Record<Step,string>={
 access:"¿Conectamos el catálogo?",
 orders:"¿Preparará pedidos de prueba?",
 product:"Añade tus productos",
 review:"Revisa y guarda"
};
export default function AutomaticCommerceWizard({business,agent,onAgentUpdated,onClose,onOpenStudio}:{
 business:CentralBusiness;agent:PersistedAgent;
 onAgentUpdated:(value:PersistedAgent)=>void;onClose:()=>void;onOpenStudio:()=>void;
}){
 const [step,setStep]=useState<Step>("access");
 const [catalogRead,setCatalogRead]=useState(agent.setup.cap_catalog==="Sí");
 const [orders,setOrders]=useState(agent.setup.cap_sales==="Sí"&&agent.setup.perm_prepare_order==="Sí");
 const [accept,setAccept]=useState(agent.setup.perm_confirm_order==="Sí");
 const [products,setProducts]=useState<CatalogItem[]>([]);
 const [loading,setLoading]=useState(true);
 const [authorized,setAuthorized]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const index=steps.indexOf(step);
 useEffect(()=>{
  let live=true;
  void(async()=>{
   try{
    const db=getSupabase();if(!db)throw Error("Sin conexión.");
    const {data:{user},error:authError}=await db.auth.getUser();
    if(authError||!user||user.is_anonymous||user.id!==business.owner_id||
       user.id!==agent.owner_id)throw Error("Inicia sesión con el dueño del negocio.");
    const {data:workspace,error:workspaceError}=await db.from("vmv_ai_businesses")
     .select("central_business_id").eq("id",agent.business_id)
     .eq("owner_id",user.id).maybeSingle();
    if(workspaceError||workspace?.central_business_id!==business.id)
     throw Error("Elige el agente principal de este negocio.");
    const catalog=await listCatalog(agent.business_id);
    if(live){setProducts(catalog);setAuthorized(true);}
   }catch(e){if(live)setError(e instanceof Error?e.message:"No se pudo abrir.");}
   finally{if(live)setLoading(false);}
  })();
  return()=>{live=false;};
 },[agent.id,agent.business_id,agent.owner_id,business.id,business.owner_id]);
 const next=()=>{setError("");setStep(steps[Math.min(index+1,steps.length-1)]);};
 const back=()=>{setError("");if(!index)onClose();else setStep(steps[index-1]);};
 const save=async()=>{
  if(!authorized||busy)return;
  setBusy(true);setError("");
  try{
   const updated=await saveCommerceSetup(agent,{
    catalog:catalogRead,orders:catalogRead&&orders,accept:catalogRead&&orders&&accept
   });
   onAgentUpdated(updated);
   onOpenStudio();
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setBusy(false);}
 };
 return <section className={styles.root+" "+theme.flow} aria-label="Configurar Productos y Pedidos">
  <header className={styles.top}>
   <button type="button" aria-label="Volver" onClick={back}><ArrowLeft size={19}/></button>
   <span>Productos/Pedidos · Configuración inicial</span><span>{index+1}/4</span>
  </header>
  <div className={styles.track}><span className={theme.agentProgress} style={{width:(index+1)*25+"%"}}/></div>
  <div className={styles.robot+" "+theme.agentRobot}><Bot size={35}/><Sparkles size={16}/></div>
  <h1 className={styles.question+" "+theme.agentHeading}>{labels[step]}</h1>
  {loading?<p className={styles.note} role="status"><LoaderCircle size={17}/> Cargando…</p>:null}
  {!loading&&authorized&&step==="access"?<div className={styles.panel}>
   <p className={styles.note}>{agent.name} · {business.name}</p>
   <div className={styles.optionsVertical}>
    <button type="button" className={catalogRead?styles.optionActive:styles.option}
     onClick={()=>setCatalogRead(true)}><Check size={17}/> Sí, conectar</button>
    <button type="button" className={!catalogRead?styles.optionActive:styles.option}
     onClick={()=>{setCatalogRead(false);setOrders(false);setAccept(false);}}>No, dejar desconectado</button>
   </div>
  </div>:null}
  {!loading&&authorized&&step==="orders"?<div className={styles.panel}>
   <p className={styles.note}>Solo pruebas. Sin cobros reales.</p>
   <div className={styles.optionsVertical}>
    <button type="button" disabled={!catalogRead}
     className={orders?styles.optionActive:styles.option}
     onClick={()=>setOrders(true)}><Check size={17}/> Sí, preparar pedidos</button>
    <button type="button" className={!orders?styles.optionActive:styles.option}
     onClick={()=>{setOrders(false);setAccept(false);}}>No, solo mostrar productos</button>
   </div>
   {catalogRead&&orders?<label className={styles.checkLine}>
    <input type="checkbox" checked={accept} onChange={e=>setAccept(e.target.checked)}/>
    Registrar aceptación expresa en pruebas
   </label>:null}
   {!catalogRead?<p className={styles.note}>Conecta el catálogo en el paso anterior.</p>:null}
  </div>:null}
  {!loading&&authorized&&step==="product"?<div className={styles.panel}>
   <p className={styles.note}>{products.length} producto(s). Puedes añadirlos ahora o después.</p>
   <AgentWebCatalogEditor workspaceId={agent.business_id} onChange={setProducts}/>
  </div>:null}
  {!loading&&authorized&&step==="review"?<div className={styles.panel}>
   <div className={styles.review}>
    <div className={styles.reviewCard}><span><small>Agente y catálogo</small>
     <strong>{catalogRead?"Conectados":"Desconectados"}</strong></span></div>
    <div className={styles.reviewCard}><span><small>Pedidos de prueba</small>
     <strong>{catalogRead&&orders?"Permitidos":"Desactivados"}</strong></span></div>
    <div className={styles.reviewCard}><span><small>Productos guardados</small>
     <strong>{products.length}</strong></span></div>
   </div>
   <p className={styles.note}><ShieldCheck size={15}/> Esto no publica un chat ni activa cobros reales.</p>
  </div>:null}
  {error?<p className={styles.error} role="alert">{error}</p>:null}
  {!loading&&authorized?<div className={styles.footer}>
   <button type="button" className={styles.primary+" "+theme.agentButton}
    disabled={busy} onClick={step==="review"?()=>void save():next}>
    {busy?<LoaderCircle size={17}/>:step==="review"?<ShieldCheck size={17}/>:<ArrowRight size={17}/>}
    {step==="review"?"Guardar y abrir":null}
   </button>
  </div>:null}
 </section>;
}
