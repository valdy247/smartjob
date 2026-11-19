"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,ArrowRight,Bot,Check,LoaderCircle,Pencil,ShieldCheck,ShoppingBag,Sparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {setAgentCatalogReadAccess,type PersistedAgent} from "./agentStore";
import {saveCommerceAgentPermissions,type CatalogItem,type CommerceAgentPermissions} from "./commerceStore";
import AgentWebCatalogEditor from "./AgentWebCatalogEditor";
import type {CentralBusiness} from "./centralBusiness";
import theme from "./AgentServiceFlow.module.css";
import styles from "./AutomaticWebWizard.module.css";
type Mode="inventory"|"sales";
type Step="business"|"access"|"catalog"|"permissions"|"review";
const title:Record<Step,string>={
 business:"¿Este servicio es para tu negocio?",
 access:"¿Qué quieres conectar con Mi agente?",
 catalog:"Este es tu inventario real",
 permissions:"¿Qué podrá hacer Mi agente?",
 review:"Revisa los permisos del servicio"
};
export default function AutomaticCommerceWizard({mode,business,agent,onAgentUpdated,onClose,onOpenStudio}:{
 mode:Mode;business:CentralBusiness;agent:PersistedAgent;
 onAgentUpdated:(v:PersistedAgent)=>void;onClose:()=>void;onOpenStudio:()=>void;
}){
 const [step,setStep]=useState<Step>("business"),[returnReview,setReturnReview]=useState(false);
 const [owner,setOwner]=useState(""),[busy,setBusy]=useState(""),[error,setError]=useState("");
 const [loading,setLoading]=useState(true),[done,setDone]=useState(false);
 const [inventoryRead,setInventoryRead]=useState(agent.setup.cap_catalog==="Sí");
 const [catalog,setCatalog]=useState<CatalogItem[]>([]);
 const [permission,setPermission]=useState<CommerceAgentPermissions>({
  channel:agent.setup.channel==="Teléfono"||agent.setup.channel==="Teléfono y chat"?
   agent.setup.channel:"Chat",
  cap_sales:agent.setup.cap_sales==="Sí",
  perm_prepare_order:agent.setup.perm_prepare_order==="Sí",
  perm_confirm_order:agent.setup.perm_confirm_order==="Sí",
  perm_payment_link:agent.setup.perm_payment_link==="Sí"
 });
 const steps:Step[]=mode==="inventory"?["business","access","catalog","review"]:
  ["business","access","permissions","review"];
 const index=steps.indexOf(step);
 useEffect(()=>{let mounted=true;(async()=>{
  try{
   const db=getSupabase();if(!db)throw Error("No hay conexión.");
   const {data:{user},error}=await db.auth.getUser();
   if(error||!user||user.is_anonymous||user.id!==agent.owner_id||
    user.id!==business.owner_id)throw Error("Selecciona el agente principal del negocio.");
   const {data:central}=await db.from("vmv_marketing_businesses").select("id")
    .eq("id",business.id).eq("owner_id",user.id).maybeSingle();
   if(!central)throw Error("Negocio no autorizado.");
   if(mounted)setOwner(user.id);
  }catch(e){if(mounted)setError(e instanceof Error?e.message:"No se pudo abrir.");}
  finally{if(mounted)setLoading(false);}
 })();return()=>{mounted=false;};},[business.id,agent.id]);
 const next=()=>{setError("");
  if(returnReview){setReturnReview(false);setStep("review");return;}
  setStep(steps[Math.min(index+1,steps.length-1)]);
 };
 const back=()=>{if(returnReview){setReturnReview(false);setStep("review");return;}
  if(!index){onClose();return;}setStep(steps[index-1]);};
 const edit=(value:Step)=>{setDone(false);setReturnReview(true);setStep(value);};
 const save=async()=>{
  if(busy||!owner||done)return;
  if(!window.confirm("¿Guardar los permisos de "+(mode==="inventory"?"inventario":"ventas")+
   " de Mi agente? Esto no inicia ventas ni cobros automáticamente."))return;
  setBusy("save");setError("");
  try{
   const updated=mode==="inventory"?
    await setAgentCatalogReadAccess(agent,inventoryRead):
    await saveCommerceAgentPermissions(agent,permission);
   onAgentUpdated(updated);setDone(true);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setBusy("");}
 };
 const card=(label:string,value:string,target:Step)=><div className={styles.reviewCard} key={label}>
  <span><small>{label}</small><strong>{value}</strong></span>
  <button type="button" aria-label={"Editar "+label} className={styles.edit}
   onClick={()=>edit(target)}><Pencil size={17}/></button>
 </div>;
 return <section className={styles.root+" "+theme.flow} aria-label="Inventario y Ventas con AI Agents">
  <header className={styles.top}><button type="button" onClick={back} aria-label="Volver"><ArrowLeft size={19}/></button>
   <span>{mode==="inventory"?"Inventario":"Ventas"} · Mi agente</span><span>{index+1}/{steps.length}</span></header>
  <div className={styles.track}><span className={theme.agentProgress} style={{width:(index+1)/steps.length*100+"%"}}/></div>
  <div className={styles.robot+" "+theme.agentRobot}><Bot size={35}/><Sparkles size={16}/></div>
  <h1 className={styles.question+" "+theme.agentHeading}>{title[step]}</h1>
  {loading?<p role="status" className={styles.note}><LoaderCircle size={17}/> Cargando negocio…</p>:null}
  {!loading&&owner&&step==="business"?<div className={styles.panel}>
   <strong className={styles.emphasis+" "+theme.agentText}>{business.name}</strong>
   <button type="button" className={styles.optionActive} onClick={next}><Check size={17}/> Sí, este negocio</button>
  </div>:null}
  {!loading&&owner&&step==="access"?<div className={styles.panel}>
   {mode==="inventory"?<>
    <p className={styles.note}>El inventario existe independientemente de Mi agente. Tú eliges si podrá consultarlo en el chat.</p>
    <div className={styles.optionsVertical}>
     <button type="button" className={inventoryRead?styles.optionActive:styles.option}
      onClick={()=>setInventoryRead(true)}>Sí, conectar el inventario al chat</button>
     <button type="button" className={!inventoryRead?styles.optionActive:styles.option}
      onClick={()=>setInventoryRead(false)}>No, mantenerlo privado</button>
    </div>
   </>:<div className={styles.optionsVertical}>
    <p className={styles.note}>¿Quieres que el agente informe precios de catálogo y pueda preparar pedidos de prueba?</p>
    <button type="button" className={permission.cap_sales?styles.optionActive:styles.option}
     onClick={()=>setPermission(p=>({...p,cap_sales:true}))}>Sí, activar ventas</button>
    <button type="button" className={!permission.cap_sales?styles.optionActive:styles.option}
     onClick={()=>setPermission(p=>({...p,channel:"Chat",cap_sales:false,perm_prepare_order:false,
      perm_confirm_order:false,perm_payment_link:false}))}>No, mantener ventas desactivadas</button>
   </div>}
  </div>:null}
  {!loading&&owner&&step==="catalog"&&mode==="inventory"?<div className={styles.panel}>
   <AgentWebCatalogEditor workspaceId={agent.business_id} onChange={setCatalog}/>
   <p className={styles.note}>La lista se mantiene sincronizada con el inventario comercial del mismo negocio.</p>
  </div>:null}
  {!loading&&owner&&step==="permissions"&&mode==="sales"?<div className={styles.panel}>
   <label className={styles.field}>¿Dónde atenderá las ventas?
    <select value={permission.channel}
     onChange={e=>setPermission(p=>({...p,channel:e.target.value as CommerceAgentPermissions["channel"]}))}>
     <option value="Chat">Chat web</option>
     <option value="Teléfono">Teléfono</option>
     <option value="Teléfono y chat">Teléfono y chat</option>
    </select></label>
   <label className={styles.checkLine}><input type="checkbox" disabled={!permission.cap_sales}
    checked={permission.perm_prepare_order}
    onChange={e=>setPermission(p=>({...p,perm_prepare_order:e.target.checked,
     perm_confirm_order:e.target.checked?p.perm_confirm_order:false,
     perm_payment_link:e.target.checked?p.perm_payment_link:false}))}/>
    Preparar pedidos de prueba con precios verificados</label>
   <label className={styles.checkLine}><input type="checkbox" disabled={!permission.perm_prepare_order}
    checked={permission.perm_confirm_order}
    onChange={e=>setPermission(p=>({...p,perm_confirm_order:e.target.checked}))}/>
    Registrar aceptación del comprador en pruebas</label>
   <label className={styles.checkLine}><input type="checkbox" disabled={!permission.perm_prepare_order}
    checked={permission.perm_payment_link}
    onChange={e=>setPermission(p=>({...p,perm_payment_link:e.target.checked}))}/>
    Ofrecer enlace de pago de prueba cuando corresponda</label>
   <a className={styles.option} href={"/vista-app/finanzas?business="+encodeURIComponent(business.id)}>
    Conectar Stripe en Finanzas</a>
   <p className={styles.note}>La configuración de pagos exige verificación independiente. Activar este permiso no inicia cobros reales.</p>
  </div>:null}
  {!loading&&owner&&step==="review"?<div className={styles.panel}>
   {done?<div className={styles.info}><Check size={18}/> Permisos guardados en Mi agente.
    <button type="button" className={styles.option} onClick={onOpenStudio}>
     Abrir {mode==="inventory"?"Inventario":"Pedidos y Ventas"} <ArrowRight size={17}/></button>
   </div>:<div className={styles.review}>
    {card("Negocio",business.name,"business")}
    {mode==="inventory"?<>
     {card("Catálogo en chat",inventoryRead?"Conectado":"Privado","access")}
     {card("Productos",catalog.filter(p=>p.approved&&p.active).length+" activos y aprobados","catalog")}
    </>:<>
     {card("Ventas",permission.cap_sales?"Habilitadas":"Desactivadas","access")}
     {card("Canal",permission.channel,"permissions")}
     {card("Pedidos de prueba",permission.perm_prepare_order?"Sí":"No","permissions")}
     {card("Confirmación",permission.perm_confirm_order?"Sí":"No","permissions")}
     {card("Enlaces de prueba",permission.perm_payment_link?"Sí":"No","permissions")}
    </>}
   </div>}
   <p className={styles.note}>No se crean compras, pagos ni reservas automáticamente.</p>
  </div>:null}
  {error?<p role="alert" className={styles.error}>{error}</p>:null}
  {!loading&&owner?<div className={styles.footer}>
   {step==="review"?<button type="button" className={styles.primary+" "+theme.agentButton}
    onClick={()=>void save()} disabled={Boolean(busy)||done}>
    {busy?<LoaderCircle size={17}/>:<ShieldCheck size={18}/>}
    {done?"Guardado":"Confirmar y guardar"} <ArrowRight size={17}/></button>:
   step!=="business"?<button type="button" className={styles.primary+" "+theme.agentButton}
    onClick={next} disabled={Boolean(busy)}>
    {returnReview?"Volver a Revisión":"Continuar"} <ArrowRight size={17}/></button>:null}
  </div>:null}
  <p className={styles.footnote}><ShieldCheck size={14}/> Control de permisos por el propietario.</p>
 </section>;
}
