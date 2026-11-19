"use client";
import {useEffect,useMemo,useState} from "react";
import {ArrowLeft,ArrowRight,Bot,Check,FileText,LoaderCircle,Pencil,Plus,ShieldCheck,Sparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import type {CentralBusiness} from "./centralBusiness";
import type {PersistedAgent} from "./agentStore";
import theme from "./AgentServiceFlow.module.css";
import styles from "./AutomaticWebWizard.module.css";
import extra from "./AutomaticQuoteWizard.module.css";
type QuoteService={id:string;name:string;description:string;unit_name:string;unit_price_cents:number;active:boolean};
type Step="business"|"services"|"customer"|"charges"|"review";
const questions:Record<Step,string>={
 business:"¿Esta cotización es para tu negocio?",
 services:"¿Qué productos o servicios cotizaremos?",
 customer:"¿A quién prepararemos la cotización?",
 charges:"¿Qué condiciones tendrá?",
 review:"Revisa la cotización antes de crearla"
};
const steps:Step[]=["business","services","customer","charges","review"];
const money=(c:number)=>new Intl.NumberFormat("es-US",{style:"currency",currency:"USD"}).format(c/100);
const parseUsd=(v:string)=>/^\d{1,7}(?:\.\d{1,2})?$/.test(v.trim())?Math.round(Number(v)*100):null;
const validPercent=(v:string)=>/^\d{1,3}(?:\.\d{1,2})?$/.test(v)&&Number(v)>=0&&Number(v)<=100;
function expiry(){
 const d=new Date();d.setDate(d.getDate()+7);
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
}
export default function AutomaticQuoteWizard({business,agent,workspaceId,onClose}:{
 business:CentralBusiness;agent:PersistedAgent;workspaceId:string;onClose:()=>void;
}){
 const [step,setStep]=useState<Step>("business"),[editing,setEditing]=useState(false);
 const [owner,setOwner]=useState(""),[catalog,setCatalog]=useState<QuoteService[]>([]);
 const [qty,setQty]=useState<Record<string,string>>({});
 const [customer,setCustomer]=useState({name:"",email:"",phone:""});
 const [charges,setCharges]=useState({tax:"0",discount:"0",delivery:"0",deposit:"0",until:expiry(),notes:""});
 const [newItem,setNewItem]=useState({name:"",price:"",unit:"unidad",description:""});
 const [adding,setAdding]=useState(false),[approved,setApproved]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState("");
 const [savedId,setSavedId]=useState("");
 const index=steps.indexOf(step);
 const chosen=catalog.filter(x=>x.active&&Number(qty[x.id])>0);
 const subTotal=chosen.reduce((sum,x)=>sum+x.unit_price_cents*Number(qty[x.id]||0),0);
 const discount=parseUsd(charges.discount),delivery=parseUsd(charges.delivery);
 const tax=validPercent(charges.tax)?Math.round(Math.max(0,subTotal-(discount||0))*Number(charges.tax)/100):0;
 const total=discount!==null&&delivery!==null?subTotal-discount+delivery+tax:0;
 const valid=step==="services"?chosen.length>0&&chosen.length<=25&&chosen.every(x=>
   Number.isSafeInteger(Number(qty[x.id]))&&Number(qty[x.id])>=1&&Number(qty[x.id])<=9999):
  step==="customer"?customer.name.trim().length>=2&&customer.name.length<=120&&
   (!customer.email.trim()||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())):
  step==="charges"?discount!==null&&delivery!==null&&discount<=subTotal&&
   validPercent(charges.tax)&&validPercent(charges.deposit)&&
   charges.until>=expiry().replace(/.$/,"0")&&charges.until<=
    (()=>{const d=new Date();d.setDate(d.getDate()+365);return d.toISOString().slice(0,10);})():
  true;
 useEffect(()=>{
  let live=true;
  void(async()=>{
   try{
    const db=getSupabase();if(!db)throw Error("No se pudo abrir Smart Quote.");
    const {data:{user},error}=await db.auth.getUser();
    if(error||!user||user.is_anonymous||user.id!==business.owner_id||
     user.id!==agent.owner_id||agent.business_id!==workspaceId)
     throw Error("Debes utilizar el agente principal de tu negocio.");
    if(!live)return;setOwner(user.id);
    const {data:allowed}=await db.from("vmv_marketing_businesses").select("id")
     .eq("id",business.id).eq("owner_id",user.id).maybeSingle();
    if(!allowed)throw Error("El negocio no está disponible.");
    const {data,error:catalogError}=await db.from("vmv_smart_quote_catalog")
     .select("id,name,description,unit_name,unit_price_cents,active")
     .eq("business_id",business.id).eq("owner_id",user.id)
     .order("created_at",{ascending:false}).limit(100);
    if(catalogError)throw Error("No se pudo consultar el catálogo de cotizaciones.");
    if(live)setCatalog((data||[]) as QuoteService[]);
   }catch(e){if(live)setError(e instanceof Error?e.message:"No se pudo cargar Smart Quote.");}
   finally{if(live)setLoading(false);}
  })();return()=>{live=false;};
 },[business.id,agent.id,workspaceId]);
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
  if(!newItem.name.trim()||newItem.name.trim().length<2||price===null||
   price<1||price>100000000||!newItem.unit.trim())return;
  if(!window.confirm("¿Confirmas que el nombre, precio y unidad de este servicio son reales y autorizados?"))return;
  setBusy("service");setError("");
  try{
   const db=getSupabase();if(!db)throw Error("No se pudo conectar.");
   const {data:{user}}=await db.auth.getUser();
   if(!user||user.id!==owner)throw Error("Tu sesión cambió.");
   const {data,error}=await db.from("vmv_smart_quote_catalog")
    .insert({owner_id:owner,business_id:business.id,name:newItem.name.trim().slice(0,120),
     description:newItem.description.trim().slice(0,700),unit_name:newItem.unit.trim().slice(0,35),
     unit_price_cents:price,active:true}).select("id,name,description,unit_name,unit_price_cents,active").single();
   if(error||!data)throw Error("No se pudo crear este servicio.");
   setCatalog(v=>[data as QuoteService,...v]);
   setQty(v=>({...v,[data.id]:"1"}));setAdding(false);
   setNewItem({name:"",price:"",unit:"unidad",description:""});
  }catch(e){setError(e instanceof Error?e.message:"No se pudo agregar el servicio.");}
  finally{setBusy("");}
 };
 const save=async()=>{
  if(busy||!owner||!valid||!chosen.length||savedId)return;
  if(!window.confirm("¿Guardar esta cotización como BORRADOR? El precio final se calculará en la base de datos; no se enviará ni se cobrará nada."))return;
  setBusy("save");setError("");
  try{
   const db=getSupabase();if(!db)throw Error("No hay conexión.");
   const {data:{user}}=await db.auth.getUser();
   if(!user||user.id!==owner)throw Error("Tu sesión cambió.");
   if(discount===null||delivery===null||discount>subTotal||
    !validPercent(charges.tax)||!validPercent(charges.deposit))throw Error("Corrige impuestos y cargos.");
   const {data,error}=await db.rpc("vmv_smart_quote_save",{
    p_business_id:business.id,p_quote_id:null,p_customer_name:customer.name.trim(),
    p_customer_email:customer.email.trim(),p_customer_phone:customer.phone.trim(),
    p_items:chosen.map(x=>({catalog_item_id:x.id,quantity:Number(qty[x.id])})),
    p_tax_bps:Math.round(Number(charges.tax)*100),
    p_delivery_cents:delivery,p_discount_cents:discount,
    p_deposit_bps:Math.round(Number(charges.deposit)*100),
    p_valid_until:charges.until,p_notes:charges.notes.trim().slice(0,1500)
   });
   if(error||!data)throw Error(error?.message||"No se pudo crear el borrador.");
   setSavedId(String(data));
  }catch(e){setError(e instanceof Error?e.message:
   "No se pudo guardar. Revisa tus borradores de Smart Quote antes de reintentar.");}
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
   <button type="button" className={styles.optionActive} onClick={next}><Check size={16}/> Sí, este negocio</button>
   <p className={styles.note}>La cotización usará precios de tu catálogo real de Smart Quote, no precios imaginados por IA.</p>
  </div>:null}
  {!loading&&owner&&step==="services"?<div className={styles.panel}>
   <p className={styles.note}>Selecciona los servicios y cantidades. Puedes elegir varios o añadir uno con precio confirmado.</p>
   <div className={extra.serviceList}>{catalog.filter(x=>x.active).map(item=><div key={item.id} className={extra.service}>
    <label><input type="checkbox" checked={Number(qty[item.id])>0}
     onChange={e=>setQty(v=>({...v,[item.id]:e.target.checked?"1":"0"}))}/>
     <span><strong>{item.name}</strong><small>{money(item.unit_price_cents)} / {item.unit_name}</small></span></label>
    {Number(qty[item.id])>0?<input type="number" min={1} max={9999} inputMode="numeric"
     aria-label={"Cantidad de "+item.name} value={qty[item.id]}
     onChange={e=>setQty(v=>({...v,[item.id]:e.target.value}))}/>:null}
   </div>)}</div>
   {!catalog.some(x=>x.active)?<p className={styles.warning}>
    Todavía no hay servicios para cotizar. Añade uno con su precio real para continuar.</p>:null}
   <button type="button" className={styles.option} onClick={()=>setAdding(x=>!x)}>
    <Plus size={17}/> Añadir nuevo servicio</button>
   {adding?<div className={extra.serviceForm}>
    <label className={styles.field}>Nombre<input maxLength={120} value={newItem.name}
     onChange={e=>setNewItem(v=>({...v,name:e.target.value}))}/></label>
    <label className={styles.field}>Precio unitario USD<input inputMode="decimal" value={newItem.price}
     onChange={e=>setNewItem(v=>({...v,price:e.target.value}))} placeholder="50.00"/></label>
    <label className={styles.field}>Unidad<input maxLength={35} value={newItem.unit}
     onChange={e=>setNewItem(v=>({...v,unit:e.target.value}))}/></label>
    <label className={styles.field}>Descripción<textarea rows={2} maxLength={700} value={newItem.description}
     onChange={e=>setNewItem(v=>({...v,description:e.target.value}))}/></label>
    <button type="button" className={styles.optionActive} disabled={Boolean(busy)||!newItem.name.trim()||parseUsd(newItem.price)===null}
     onClick={()=>void createService()}>Guardar servicio aprobado</button>
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
  {!loading&&owner&&step==="review"?<div className={styles.panel}>
   {savedId?<div className={extra.success}><Check size={25}/>
    <strong>Borrador creado</strong><p>La cotización no se envió ni se cobró.</p>
    <a href="/vista-app/smart-quote">Abrir Smart Quote para revisarla y aprobarla</a>
   </div>:<div className={styles.review}>
    {card("Negocio",business.name,"business")}
    {card("Servicios",chosen.map(x=>x.name+" × "+qty[x.id]).join(", "),"services")}
    {card("Cliente",customer.name+" · "+customer.email,"customer")}
    {card("Impuestos",charges.tax+" %","charges")}
    {card("Descuento",money(discount||0),"charges")}
    {card("Entrega/cargos",money(delivery||0),"charges")}
    {card("Depósito",charges.deposit+" %","charges")}
    {card("Vigencia",charges.until,"charges")}
    {card("Total estimado",money(Math.max(0,total)),"charges")}
   </div>}
   <p className={styles.note}>Los cálculos definitivos se hacen en Supabase utilizando precios aprobados. Crear un borrador no envía una cotización al cliente ni confirma un cobro.</p>
  </div>:null}
  {error?<div className={styles.error} role="alert">{error}</div>:null}
  {!loading&&owner?<div className={styles.footer}>
   {step==="review"?<button type="button" className={styles.primary+" "+theme.agentButton}
    disabled={Boolean(busy)||Boolean(savedId)||!chosen.length}
    onClick={()=>void save()}>{busy==="save"?<LoaderCircle size={17}/>:<FileText size={17}/>}
    {busy==="save"?"Guardando…":savedId?"Borrador guardado":"Crear borrador de cotización"} <ArrowRight size={17}/></button>:
   step!=="business"?<button type="button" className={styles.primary+" "+theme.agentButton}
    disabled={!valid||Boolean(busy)} onClick={next}>
    {editing?"Guardar y volver a Revisión":"Continuar"} <ArrowRight size={17}/></button>:null}
  </div>:null}
  <p className={styles.footnote}><ShieldCheck size={14}/> Nunca se envía ni se cobra sin aprobación.</p>
 </section>;
}
