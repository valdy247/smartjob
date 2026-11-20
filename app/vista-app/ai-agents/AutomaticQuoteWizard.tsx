"use client";
import {useCallback,useEffect,useState} from "react";
import {ArrowLeft,ArrowRight,Bot,Check,FileText,LoaderCircle,Pencil,Plus,ShieldCheck,Sparkles,Package,CalendarCheck,RefreshCw,Send,Download,Bookmark,Palette} from "lucide-react";
import ShareQuotePdf from "../smart-quote/ShareQuotePdf";
import {getSupabase} from "@/lib/supabase";
import type {CentralBusiness} from "./centralBusiness";
import type {PersistedAgent} from "./agentStore";
import theme from "./AgentServiceFlow.module.css";
import styles from "./AutomaticWebWizard.module.css";
import extra from "./AutomaticQuoteWizard.module.css";
type QuoteService={id:string;name:string;description:string;unit_name:string;unit_price_cents:number;active:boolean;source_kind:"product"|"service"|null;source_id:string|null};
type QuoteKind="product"|"service";
type Step="business"|"services"|"customer"|"charges"|"design"|"review";
type Design="modern"|"elegant"|"classic";
const designs:{id:Design;label:string;hint:string;color:string}[]=[
 {id:"modern",label:"Moderna",hint:"Minimalista",color:"#7853ba"},
 {id:"elegant",label:"Elegante",hint:"Sofisticada",color:"#b07857"},
 {id:"classic",label:"Clásica",hint:"Profesional",color:"#285c73"}
];
const questions:Record<Step,string>={
 business:"¿Esta cotización es para tu negocio?",
 services:"¿Qué productos o servicios cotizaremos?",
 customer:"¿A quién prepararemos la cotización?",
 charges:"¿Qué condiciones tendrá?",
 design:"¿Cómo diseñaremos la cotización?",
 review:"Revisa y elige qué quieres hacer"
};
const steps:Step[]=["business","services","customer","charges","design","review"];
const money=(c:number)=>new Intl.NumberFormat("es-US",{style:"currency",currency:"USD"}).format(c/100);
const parseUsd=(v:string)=>/^\d{1,7}(?:\.\d{1,2})?$/.test(v.trim())?Math.round(Number(v)*100):null;
const validPercent=(v:string)=>/^\d{1,3}(?:\.\d{1,2})?$/.test(v)&&Number(v)>=0&&Number(v)<=100;
function localDate(offset=0){
 const d=new Date();d.setDate(d.getDate()+offset);
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
}
function expiry(){return localDate(7);}
export default function AutomaticQuoteWizard({business,agent,workspaceId,onClose,businesses,onChooseBusiness}:{
 business:CentralBusiness;agent:PersistedAgent;workspaceId:string;onClose:()=>void;
 businesses:CentralBusiness[];onChooseBusiness:(id:string)=>void;
}){
 const [step,setStep]=useState<Step>("business"),[editing,setEditing]=useState(false);
 const [businessConfirmed,setBusinessConfirmed]=useState(false);
 const [showBusinesses,setShowBusinesses]=useState(false);
 const [design,setDesign]=useState<Design>("modern");
 const [message,setMessage]=useState("");
 const [emailReady,setEmailReady]=useState(false);
 const [savedOutcome,setSavedOutcome]=useState<"draft"|"approved"|"sent">("draft");
 const [owner,setOwner]=useState(""),[catalog,setCatalog]=useState<QuoteService[]>([]);
 const [connected,setConnected]=useState({product:false,service:false});
 const [refreshing,setRefreshing]=useState(false);
 const [qty,setQty]=useState<Record<string,string>>({});
 const [customer,setCustomer]=useState({name:"",email:"",phone:""});
 const [charges,setCharges]=useState({tax:"0",discount:"0",delivery:"0",deposit:"0",until:expiry(),notes:""});
 const [newItem,setNewItem]=useState({kind:"product" as QuoteKind,name:"",price:"",description:"",duration:"60"});
 const [adding,setAdding]=useState(false),[approved,setApproved]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState("");
 const [savedId,setSavedId]=useState("");
 useEffect(()=>{let live=true;void fetch("/api/vmv/smart-quote/dispatch",{cache:"no-store"})
  .then(r=>r.json()).then(d=>{if(live)setEmailReady(d.enabled===true);})
  .catch(()=>{});return()=>{live=false;};},[]);
 const index=steps.indexOf(step);
 const visibleCatalog=catalog.filter(x=>x.active&&
  (x.source_kind===null||connected[x.source_kind]));
 const chosen=visibleCatalog.filter(x=>Number(qty[x.id])>0);
 const sourceCounts={
  product:catalog.filter(x=>x.active&&x.source_kind==="product").length,
  service:catalog.filter(x=>x.active&&x.source_kind==="service").length
 };
 const subTotal=chosen.reduce((sum,x)=>sum+x.unit_price_cents*Number(qty[x.id]||0),0);
 const discount=parseUsd(charges.discount),delivery=parseUsd(charges.delivery);
 const tax=validPercent(charges.tax)?Math.round(Math.max(0,subTotal-(discount||0))*Number(charges.tax)/100):0;
 const total=discount!==null&&delivery!==null?subTotal-discount+delivery+tax:0;
 const valid=step==="business"?businessConfirmed:
  step==="services"?chosen.length>0&&chosen.length<=25&&chosen.every(x=>
   Number.isSafeInteger(Number(qty[x.id]))&&Number(qty[x.id])>=1&&Number(qty[x.id])<=9999):
  step==="customer"?customer.name.trim().length>=2&&customer.name.length<=120&&
   (!customer.email.trim()||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())):
  step==="charges"?discount!==null&&delivery!==null&&discount<=subTotal&&
   validPercent(charges.tax)&&validPercent(charges.deposit)&&
   charges.until>=localDate(0)&&charges.until<=localDate(365):
  true;
 const reloadCatalog=useCallback(async(userId:string)=>{
  const db=getSupabase();if(!db)throw Error("No se pudo consultar Smart Quote.");
  const {data,error}=await db.from("vmv_smart_quote_catalog")
   .select("id,name,description,unit_name,unit_price_cents,active,source_kind,source_id")
   .eq("business_id",business.id).eq("owner_id",userId)
   .order("updated_at",{ascending:false}).limit(200);
  if(error)throw Error("No se pudo sincronizar el catálogo de este negocio.");
  const latest=(data||[]) as QuoteService[];
  setCatalog(latest);return latest;
 },[business.id]);
 useEffect(()=>{
  let live=true;
  void(async()=>{
   try{
    const db=getSupabase();if(!db)throw Error("No se pudo abrir Smart Quote.");
    const {data:{user},error}=await db.auth.getUser();
    if(error||!user||user.is_anonymous||user.id!==business.owner_id||
     user.id!==agent.owner_id||agent.business_id!==workspaceId)
     throw Error("Debes utilizar el agente principal de tu negocio.");
    const [central,linked]=await Promise.all([
     db.from("vmv_marketing_businesses").select("id")
      .eq("id",business.id).eq("owner_id",user.id).maybeSingle(),
     db.from("vmv_ai_businesses").select("id")
      .eq("id",workspaceId).eq("owner_id",user.id)
      .eq("central_business_id",business.id).maybeSingle()
    ]);
    if(central.error||!central.data||linked.error||!linked.data)
     throw Error("Vincula este negocio con Mi agente para usar sus productos y servicios.");
    if(!live)return;
    await reloadCatalog(user.id);
    if(live)setOwner(user.id);
   }catch(e){if(live)setError(e instanceof Error?e.message:"No se pudo cargar Smart Quote.");}
   finally{if(live)setLoading(false);}
  })();return()=>{live=false;};
 },[business.id,business.owner_id,agent.id,agent.owner_id,agent.business_id,workspaceId,reloadCatalog]);
 useEffect(()=>{
  if(!owner)return;
  const refresh=()=>{if(document.visibilityState==="visible")
   void reloadCatalog(owner).catch(()=>setError("No se pudo actualizar el catálogo. Prueba de nuevo."));};
  window.addEventListener("focus",refresh);
  return()=>window.removeEventListener("focus",refresh);
 },[owner,reloadCatalog]);
 const refreshManually=async()=>{
  if(refreshing||!owner)return;
  setRefreshing(true);setError("");
  try{await reloadCatalog(owner);}
  catch(e){setError(e instanceof Error?e.message:"No se pudo actualizar.");}
  finally{setRefreshing(false);}
 };
 const next=()=>{
  if(!valid||busy)return;setError("");
  if(editing){setEditing(false);setStep("review");return;}
  setStep(steps[Math.min(index+1,steps.length-1)]);
 };
 const back=()=>{
  if(editing){setEditing(false);setStep("review");return;}
  if(!index){onClose();return;}setStep(steps[index-1]);
 };
 const edit=(s:Step)=>{setEditing(true);setStep(s);};
 const createService=async()=>{
  if(busy||!owner)return;
  const price=parseUsd(newItem.price);
  const kind=newItem.kind;
  const minutes=Number(newItem.duration);
  if(newItem.name.trim().length<2||price===null||price<1||price>10000000||
   (kind==="service"&&(!Number.isInteger(minutes)||minutes<15||minutes>240)))return;
  if(!window.confirm("¿Confirmas este precio real? El artículo quedará activo y aprobado en AI Agents y también podrá aparecer en las webs conectadas a su catálogo."))return;
  setBusy("service");setError("");
  let created=false;
  try{
   const db=getSupabase();if(!db)throw Error("No se pudo conectar.");
   const {data:{user}}=await db.auth.getUser();
   if(!user||user.id!==owner)throw Error("Tu sesión cambió.");
   const shared={owner_id:owner,business_id:workspaceId,
    name:newItem.name.trim().slice(0,120),
    description:newItem.description.trim().slice(0,500),
    price_cents:price,currency:"usd",approved:true,active:true};
   const table=kind==="product"?"vmv_ai_catalog_items":"vmv_ai_booking_services";
   const fields=kind==="product"?
    {...shared,sku:"SQ-"+crypto.randomUUID().replace(/-/g,"").slice(0,18).toUpperCase(),
     stock_mode:"manual",available_qty:null}:
    {...shared,duration_minutes:minutes,auto_confirm:false};
   const {data,error}=await db.from(table).insert(fields).select("id").single();
   if(error||!data?.id)throw Error("No se pudo guardar en el catálogo de AI Agents.");
   created=true;
   const latest=await reloadCatalog(owner);
   const mirror=latest.find(x=>x.active&&x.source_kind===kind&&x.source_id===data.id);
   if(!mirror)throw Error("Guardado en AI Agents, pero falta actualizar Smart Quote. Actualiza la lista antes de volver a guardar.");
   setConnected(v=>({...v,[kind]:true}));
   setQty(v=>({...v,[mirror.id]:"1"}));
   setAdding(false);
   setNewItem({kind,name:"",price:"",description:"",duration:"60"});
  }catch(e){
   setError(e instanceof Error?e.message:
    created?"El catálogo se guardó; actualiza antes de intentar otra vez.":"No se pudo agregar.");
  }finally{setBusy("");}
 };
 const downloadPdf=async(id:string)=>{
  const db=getSupabase();if(!db)return;
  setBusy("pdf");setError("");
  try{
   const {data:{session}}=await db.auth.getSession();
   if(!session?.access_token)throw Error("Tu sesión expiró.");
   const r=await fetch("/api/vmv/smart-quote/dispatch",{
    method:"POST",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},
    body:JSON.stringify({quoteId:id,action:"pdf"})});
   if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(d.error||"No se pudo preparar el PDF.");}
   const url=URL.createObjectURL(await r.blob());
   const a=document.createElement("a");a.href=url;a.download="cotizacion-"+id.slice(0,8)+".pdf";
   document.body.appendChild(a);a.click();a.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),1500);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo descargar el PDF.");}
  finally{setBusy("");}
 };
 const save=async(intent:"draft"|"send")=>{
  if(busy||!owner||!valid||!chosen.length||savedId)return;
  if(intent==="send"&&(!emailReady||!customer.email.trim()||
   !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim()))){
   setError("Para enviar necesitas un correo válido y el proveedor de correo conectado.");return;
  }
  if(!window.confirm(intent==="send"?
   "¿Aprobar esta cotización y enviarla al correo "+customer.email+" con el PDF? No se cobrará nada.":
   "¿Guardar esta cotización como borrador para continuar después? No se enviará ni se cobrará nada."))return;
  setBusy("save");setError("");
  try{
   const db=getSupabase();if(!db)throw Error("No hay conexión.");
   const {data:{user}}=await db.auth.getUser();
   if(!user||user.id!==owner)throw Error("Tu sesión cambió.");
   const latest=await reloadCatalog(owner);
   if(chosen.some(previous=>{
    const current=latest.find(item=>item.id===previous.id);
    return !current||!current.active||current.unit_price_cents!==previous.unit_price_cents||
     current.name!==previous.name;
   })){
    setStep("services");
    throw Error("El catálogo o algún precio cambió en AI Agents. Revisa los importes actualizados.");
   }
   if(discount===null||delivery===null||discount>subTotal||
    !validPercent(charges.tax)||!validPercent(charges.deposit))
    throw Error("Corrige impuestos y cargos antes de guardar.");
   const {data,error}=await db.rpc("vmv_smart_quote_save",{
    p_business_id:business.id,p_quote_id:null,p_customer_name:customer.name.trim(),
    p_customer_email:customer.email.trim(),p_customer_phone:customer.phone.trim(),
    p_items:chosen.map(x=>({catalog_item_id:x.id,quantity:Number(qty[x.id])})),
    p_tax_bps:Math.round(Number(charges.tax)*100),
    p_delivery_cents:delivery,p_discount_cents:discount,
    p_deposit_bps:Math.round(Number(charges.deposit)*100),
    p_valid_until:charges.until,p_notes:charges.notes.trim().slice(0,1500)
   });
   if(error||!data)throw Error(error?.message||"No se pudo crear la cotización.");
   const id=String(data);setSavedId(id);setSavedOutcome("draft");
   const designResult=await db.rpc("vmv_smart_quote_set_design",{
    p_quote_id:id,p_template:design});
   if(designResult.error||designResult.data!==true)
    throw Error("Se guardó el borrador, pero no se pudo guardar el diseño. Revísalo desde Mis cotizaciones.");
   if(intent==="draft")return;
   const approval=await db.rpc("vmv_smart_quote_set_status",{p_quote_id:id,p_action:"approve"});
   if(approval.error||approval.data!==true)
    throw Error("El borrador quedó guardado, pero falta aprobarlo. Revísalo desde Mis cotizaciones.");
   setSavedOutcome("approved");
   const {data:{session}}=await db.auth.getSession();
   if(!session?.access_token)throw Error("La cotización se aprobó, pero tu sesión expiró. Revísala antes de reenviar.");
   const result=await fetch("/api/vmv/smart-quote/dispatch",{
    method:"POST",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},
    body:JSON.stringify({quoteId:id,action:"send",message})});
   const body=await result.json().catch(()=>({}));
   if(!result.ok)throw Error(body.error||"La cotización quedó aprobada, pero no pudo enviarse.");
   if(body.accepted===true&&body.recorded===true)setSavedOutcome("sent");
   else if(body.accepted===true)throw Error(body.message||
    "El correo fue aceptado, pero el historial todavía no lo refleja. No lo reenvíes sin verificar.");
   else throw Error("No se confirmó el envío. Revísalo en Mis cotizaciones.");
  }catch(e){setError(e instanceof Error?e.message:
   "No se pudo completar. Revisa Mis cotizaciones antes de intentarlo de nuevo.");}
  finally{setBusy("");}
 };
 const card=(label:string,value:string,to:Step)=><div key={label} className={styles.reviewCard}>
  <span><small>{label}</small><strong>{value||"Pendiente"}</strong></span>
  <button type="button" className={styles.edit} aria-label={"Editar "+label}
   onClick={()=>edit(to)}><Pencil size={17}/></button>
 </div>;
 return <section className={styles.root+" "+theme.flow} aria-label="Smart Quote con AI Agents">
  <header className={styles.top}><button type="button" onClick={back} aria-label="Volver">
   <ArrowLeft size={19}/></button><span>Smart Quote · Mi agente</span>
   <span>{index+1}/{steps.length}</span></header>
  <div className={styles.track}><span className={theme.agentProgress}
   style={{width:(index+1)/steps.length*100+"%"}}/></div>
  <div className={styles.robot+" "+theme.agentRobot}><Bot size={35}/><Sparkles size={16}/></div>
  <h1 className={styles.question+" "+theme.agentHeading}>{questions[step]}</h1>
  {loading?<p role="status" className={styles.note}><LoaderCircle size={17}/> Consultando tu negocio…</p>:null}
  {!loading&&owner&&step==="business"?<div className={styles.panel}>
   <strong className={styles.emphasis+" "+theme.agentText}>{business.name}</strong>
   <button type="button" aria-pressed={businessConfirmed}
    className={businessConfirmed?styles.optionActive:styles.option}
    onClick={()=>setBusinessConfirmed(true)}><Check size={16}/> Sí, este negocio</button>
   <button type="button" className={styles.option} aria-expanded={showBusinesses}
    onClick={()=>setShowBusinesses(value=>!value)}>
    {showBusinesses?"Ocultar negocios":"Cambiar negocio"}</button>
   {showBusinesses?<div className={styles.optionsVertical} aria-label="Otros negocios disponibles">
    {businesses.filter(b=>b.id!==business.id).length===0?
     <p className={styles.note}>No tienes otros negocios registrados para seleccionar.</p>:
     businesses.filter(b=>b.id!==business.id).map(b=>
      <button type="button" key={b.id} className={styles.option}
       onClick={()=>{
        if((chosen.length>0||customer.name.trim())&&
         !window.confirm("Cambiar de negocio descartará la cotización sin guardar. ¿Continuar?"))return;
        onChooseBusiness(b.id);
       }}>{b.name}</button>)}
   </div>:null}
   <p className={styles.note}>La cotización usará precios de tu catálogo real de Smart Quote, no precios imaginados por IA.</p>
  </div>:null}
  {!loading&&owner&&step==="services"?<div className={styles.panel}>
   <p className={styles.note}>Conecta el inventario o los servicios de Mi agente. También puedes añadir uno aquí; quedará disponible en AI Agents y Smart Quote.</p>
   <div className={extra.switches} role="group" aria-label="Conectar catálogos de Mi agente">
    <label className={extra.switchRow}><span><strong>Conectar inventario</strong>
     <small>{sourceCounts.product} producto(s) activo(s) y aprobado(s)</small></span>
     <input type="checkbox" role="switch" checked={connected.product}
      onChange={e=>setConnected(v=>({...v,product:e.target.checked}))}/>
     <span className={extra.switchTrack} aria-hidden="true"/></label>
    <label className={extra.switchRow}><span><strong>Conectar servicios</strong>
     <small>{sourceCounts.service} servicio(s) con precio confirmado</small></span>
     <input type="checkbox" role="switch" checked={connected.service}
      onChange={e=>setConnected(v=>({...v,service:e.target.checked}))}/>
     <span className={extra.switchTrack} aria-hidden="true"/></label>
   </div>
   <button type="button" className={extra.refresh} disabled={refreshing||Boolean(busy)}
    onClick={()=>void refreshManually()}><RefreshCw size={15}/>
    {refreshing?"Actualizando…":"Actualizar desde AI Agents"}</button>
   <div className={extra.serviceList}>{visibleCatalog.map(item=><div key={item.id} className={extra.service}>
    <label><input type="checkbox" checked={Number(qty[item.id])>0}
     onChange={e=>setQty(v=>({...v,[item.id]:e.target.checked?"1":"0"}))}/>
     <span><strong>{item.name}</strong>
      <small>{money(item.unit_price_cents)} / {item.unit_name} · {item.source_kind==="product"?"Inventario de Mi agente":
       item.source_kind==="service"?"Servicios de Mi agente":"Smart Quote"}</small></span></label>
    {Number(qty[item.id])>0?<input type="number" min={1} max={9999} inputMode="numeric"
     aria-label={"Cantidad de "+item.name} value={qty[item.id]}
     onChange={e=>setQty(v=>({...v,[item.id]:e.target.value}))}/>:null}
   </div>)}</div>
   {!visibleCatalog.length?<p className={styles.note}>
    {sourceCounts.product+sourceCounts.service>0?
     "Selecciona «Conectar inventario» o «Conectar servicios» para usar los artículos existentes.":
     "Aún no hay artículos aprobados con precio. Añade un producto o servicio aquí para compartirlo con Mi agente."}
   </p>:null}
   <button type="button" className={styles.option} onClick={()=>setAdding(x=>!x)}>
    <Plus size={17}/> {adding?"Cerrar formulario":"Añadir producto o servicio"}</button>
   {adding?<div className={extra.serviceForm}>
    <div className={extra.kindSwitch} role="group" aria-label="Tipo de artículo">
     <button type="button" aria-pressed={newItem.kind==="product"} className={newItem.kind==="product"?extra.kindOn:extra.kindOff}
      onClick={()=>setNewItem(v=>({...v,kind:"product"}))}>Producto</button>
     <button type="button" aria-pressed={newItem.kind==="service"} className={newItem.kind==="service"?extra.kindOn:extra.kindOff}
      onClick={()=>setNewItem(v=>({...v,kind:"service"}))}>Servicio</button>
    </div>
    <label className={styles.field}>Nombre<input maxLength={120} value={newItem.name}
     onChange={e=>setNewItem(v=>({...v,name:e.target.value}))}/></label>
    <label className={styles.field}>Precio unitario USD<input inputMode="decimal" value={newItem.price}
     onChange={e=>setNewItem(v=>({...v,price:e.target.value}))} placeholder="50.00"/></label>
    {newItem.kind==="service"?<label className={styles.field}>Duración del servicio (minutos)
     <select value={newItem.duration} onChange={e=>setNewItem(v=>({...v,duration:e.target.value}))}>
      {[15,30,45,60,90,120,180,240].map(minutes=><option key={minutes} value={minutes}>{minutes} minutos</option>)}
     </select></label>:null}
    <label className={styles.field}>Descripción<textarea rows={2} maxLength={500} value={newItem.description}
     onChange={e=>setNewItem(v=>({...v,description:e.target.value}))}/></label>
    <p className={styles.note}>Quedará activo y aprobado en AI Agents. Si tu web usa este catálogo, también podrá mostrarse allí. Puedes editarlo después en Mi agente.</p>
    <button type="button" className={styles.optionActive}
     disabled={Boolean(busy)||newItem.name.trim().length<2||parseUsd(newItem.price)===null||
      Number(newItem.price)>100000}
     onClick={()=>void createService()}>{busy==="service"?"Guardando…":"Guardar y sincronizar con Mi agente"}</button>
   </div>:null}
   <strong className={extra.total}>Subtotal: {money(subTotal)}</strong>
  </div>:null}
  {!loading&&owner&&step==="customer"?<div className={styles.panel}>
   <label className={styles.field}>Nombre del cliente<input value={customer.name} maxLength={120}
    onChange={e=>setCustomer(v=>({...v,name:e.target.value}))}/></label>
   <label className={styles.field}>Correo del cliente (opcional)<input type="email" value={customer.email} maxLength={180}
    onChange={e=>setCustomer(v=>({...v,email:e.target.value}))}/></label>
   <label className={styles.field}>Teléfono del cliente (opcional)<input type="tel" value={customer.phone} maxLength={35}
    onChange={e=>setCustomer(v=>({...v,phone:e.target.value}))}/></label>
  </div>:null}
  {!loading&&owner&&step==="charges"?<div className={styles.panel}>
   <p className={styles.note}>Los importes y porcentajes los defines tú. El agente no inventará impuestos ni descuentos.</p>
   <div className={extra.pair}>
    <label className={styles.field}>Impuestos (%)<input inputMode="decimal" value={charges.tax}
     onChange={e=>setCharges(v=>({...v,tax:e.target.value}))}/></label>
    <label className={styles.field}>Depósito (%)<input inputMode="decimal" value={charges.deposit}
     onChange={e=>setCharges(v=>({...v,deposit:e.target.value}))}/></label>
    <label className={styles.field}>Descuento (USD)<input inputMode="decimal" value={charges.discount}
     onChange={e=>setCharges(v=>({...v,discount:e.target.value}))}/></label>
    <label className={styles.field}>Entrega/cargos (USD)<input inputMode="decimal" value={charges.delivery}
     onChange={e=>setCharges(v=>({...v,delivery:e.target.value}))}/></label>
   </div>
   <label className={styles.field}>Válida hasta<input type="date" value={charges.until}
    onChange={e=>setCharges(v=>({...v,until:e.target.value}))}/></label>
   <label className={styles.field}>Condiciones adicionales (opcional)
    <textarea rows={3} value={charges.notes} maxLength={1500}
     onChange={e=>setCharges(v=>({...v,notes:e.target.value}))}/></label>
   <strong className={extra.total}>Total estimado: {money(Math.max(0,total))}</strong>
  </div>:null}
  {!loading&&owner&&step==="design"?<div className={styles.panel}>
   <p className={styles.note}>Elige una de tres plantillas para el PDF. Es una cotización, no una factura ni un comprobante de pago.</p>
   <div className={extra.templates} role="group" aria-label="Plantillas de cotización">
    {designs.map(d=><button type="button" key={d.id} aria-pressed={design===d.id}
     className={design===d.id?extra.templateSelected:extra.template} onClick={()=>setDesign(d.id)}>
     <span className={extra.miniSheet} style={{"--document-accent":d.color} as React.CSSProperties}><i/><i/><i/></span>
     <strong>{d.label}</strong><small>{d.hint}</small>
    </button>)}
   </div>
   <label className={styles.field}>Mensaje para el cliente (editable)
    <textarea rows={4} maxLength={1000} value={message}
     onChange={e=>setMessage(e.target.value)}
     placeholder="Gracias por tu interés. Adjunto encontrarás la cotización solicitada."/>
   </label>
   <button type="button" className={styles.option} onClick={()=>
    setMessage("Hola "+customer.name.trim()+",\n\nGracias por tu interés en "+business.name+
     ". Te compartimos nuestra cotización por "+money(Math.max(0,total))+
     ", válida hasta "+charges.until+".\n\nQuedamos atentos a tus preguntas.\n"+business.name)}>
    <Sparkles size={16}/> Sugerir mensaje profesional
   </button>
   <p className={styles.note}>El texto sugerido no utiliza IA generativa; puedes revisarlo antes de enviarlo.</p>
  </div>:null}
  {!loading&&owner&&step==="review"?<div className={styles.panel}>
   {savedId?<div className={extra.success}><Check size={25}/>
    <strong>{savedOutcome==="sent"?"Envío aceptado":savedOutcome==="approved"?"Cotización aprobada":"Borrador guardado"}</strong>
    <p>{savedOutcome==="sent"?
     "El proveedor aceptó el correo. La recepción final puede estar pendiente.":
     savedOutcome==="approved"?"Aprobada, pero el correo no quedó confirmado. Revisa el historial.":
     "Se guardó para más tarde. No se envió ni se cobró."}</p>
    <button type="button" className={styles.option} disabled={Boolean(busy)}
     onClick={()=>void downloadPdf(savedId)}><Download size={16}/> Descargar PDF</button>
    <ShareQuotePdf key={savedId} quoteId={savedId} className={styles.option} disabled={Boolean(busy)}/>
    <a href="/vista-app/smart-quote">Ver en Mis cotizaciones</a>
   </div>:<div className={styles.review}>
    {card("Negocio",business.name,"business")}
    {card("Productos y servicios",chosen.map(x=>x.name+" × "+qty[x.id]).join(", "),"services")}
    {card("Cliente",customer.name+" · "+customer.email,"customer")}
    {card("Impuestos",charges.tax+" %","charges")}
    {card("Descuento",money(discount||0),"charges")}
    {card("Entrega/cargos",money(delivery||0),"charges")}
    {card("Depósito",charges.deposit+" %","charges")}
    {card("Vigencia",charges.until,"charges")}
    {card("Total estimado",money(Math.max(0,total)),"charges")}
    {card("Plantilla",designs.find(x=>x.id===design)?.label||"Moderna","design")}
   </div>}
   <p className={styles.note}>Los precios se validan en Supabase. «Enviar» requiere tu confirmación y un correo configurado; «Guardar» crea un borrador. Ninguna acción cobra dinero.</p>
  </div>:null}
  {error?<div className={styles.error} role="alert">{error}</div>:null}
  {!loading&&owner?<div className={styles.footer}>
   {step==="review"?(!savedId?<div className={extra.deliveryActions}>
    <button type="button" className={styles.primary+" "+theme.agentButton}
     disabled={Boolean(busy)||!chosen.length||!emailReady||!customer.email.trim()}
     onClick={()=>void save("send")}><Send size={17}/>
     {busy==="save"?"Procesando…":"Enviar cotización"}</button>
    <button type="button" className={extra.secondaryAction}
     disabled={Boolean(busy)||!chosen.length} onClick={()=>void save("draft")}>
     <Bookmark size={17}/> Guardar para más tarde</button>
    {!emailReady?<p className={styles.note}>Para habilitar el envío, configura el proveedor de correo del servidor. Guardar y descargar PDF ya está disponible.</p>:null}
   </div>:null):
   <button type="button" className={styles.primary+" "+theme.agentButton}
    disabled={!valid||Boolean(busy)} onClick={next}>
    {editing?"Guardar y volver a Revisión":"Continuar"} <ArrowRight size={17}/></button>}
  </div>:null}
  <p className={styles.footnote}><ShieldCheck size={14}/> Nunca se envía ni se cobra sin aprobación.</p>
 </section>;
}
