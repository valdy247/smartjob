"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,ArrowRight,Bot,CalendarDays,Check,LoaderCircle,Pencil,ShieldCheck,Sparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {storeAgent,type PersistedAgent} from "./agentStore";
import type {CentralBusiness} from "./centralBusiness";
import theme from "./AgentServiceFlow.module.css";
import styles from "./AutomaticWebWizard.module.css";
type Step="business"|"goal"|"permissions"|"review";
type Goal="services"|"slots"|"bookings";
const labels:Record<Step,string>={
 business:"¿La agenda es para tu negocio?",
 goal:"¿Qué necesitas hacer con las reservas?",
 permissions:"¿Qué podrá hacer Mi agente?",
 review:"Revisa los permisos de reservas"
};
export default function AutomaticBookingWizard({business,agent,onClose,onAgentUpdated,onOpenStudio,initialStep="business"}:{
 business:CentralBusiness;agent:PersistedAgent;onClose:()=>void;
 onAgentUpdated:(agent:PersistedAgent)=>void;onOpenStudio:(section:Goal|"permissions"|"availability")=>void;
 initialStep?:Step;
}){
 const [step,setStep]=useState<Step>(initialStep),[editing,setEditing]=useState(false);
 const [businessConfirmed,setBusinessConfirmed]=useState(initialStep!=="business");
 const [owner,setOwner]=useState(""),[loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[done,setDone]=useState(false);
 const [serviceCount,setServiceCount]=useState<number|null>(null);
 const [approvedCount,setApprovedCount]=useState<number|null>(null);
 const [bookingCount,setBookingCount]=useState<number|null>(null);
 const [slotCount,setSlotCount]=useState<number|null>(null);
 const [goal,setGoal]=useState<Goal>("services");
 const [enabled,setEnabled]=useState(agent.setup.cap_bookings==="Sí");
 const [confirm,setConfirm]=useState(agent.setup.perm_book_service==="Sí");
 const steps:Step[]=["business","goal","permissions","review"];
 const index=steps.indexOf(step);
 useEffect(()=>{let live=true;void(async()=>{
  try{
   const db=getSupabase();if(!db)throw Error("No hay conexión.");
   const {data:{user},error}=await db.auth.getUser();
   if(error||!user||user.is_anonymous||user.id!==agent.owner_id||
    user.id!==business.owner_id)throw Error("Debes elegir el agente principal de tu negocio.");
   const {data:workspace}=await db.from("vmv_ai_businesses")
    .select("id").eq("id",agent.business_id).eq("owner_id",user.id)
    .eq("central_business_id",business.id).maybeSingle();
   if(!workspace)throw Error("No hay una agenda vinculada a este negocio.");
   if(!live)return;setOwner(user.id);
   const [services,approved,slots,bookings]=await Promise.all([
    db.from("vmv_ai_booking_services").select("id",{count:"exact",head:true})
     .eq("owner_id",user.id).eq("business_id",agent.business_id),
    db.from("vmv_ai_booking_services").select("id",{count:"exact",head:true})
     .eq("owner_id",user.id).eq("business_id",agent.business_id)
     .eq("active",true).eq("approved",true),
    db.from("vmv_ai_booking_availability").select("id",{count:"exact",head:true})
     .eq("owner_id",user.id).eq("business_id",agent.business_id)
     .gte("day",new Date().toISOString().slice(0,10)),
    db.from("vmv_ai_bookings").select("id",{count:"exact",head:true})
     .eq("owner_id",user.id).eq("business_id",agent.business_id)
   ]);
   if(services.error||approved.error||slots.error||bookings.error)
    throw Error("No se pudo consultar la agenda actual.");
   if(live){
    setServiceCount(services.count||0);setApprovedCount(approved.count||0);
    setSlotCount(slots.count||0);setBookingCount(bookings.count||0);
    setGoal((approved.count||0)>0?"slots":"services");
   }
  }catch(e){if(live)setError(e instanceof Error?e.message:"No se pudo abrir la agenda.");}
  finally{if(live)setLoading(false);}
 })();return()=>{live=false;};},[business.id,agent.id]);
 const openGoal=(nextGoal:Goal)=>{
  setError("");setGoal(nextGoal);setStep("permissions");
 };
 const next=()=>{if(step==="business"&&!businessConfirmed)return;
  setError("");if(editing){setEditing(false);setStep("review");return;}
  setStep(steps[Math.min(index+1,steps.length-1)]);
 };
 const back=()=>{if(editing){setEditing(false);setStep("review");return;}
  if(!index){onClose();return;}setStep(steps[index-1]);};
 const edit=(value:Step)=>{setEditing(true);setStep(value);setDone(false);};
 const save=async()=>{
  if(busy||!owner||done)return;
  if(!window.confirm("¿Guardar estos permisos de reservas? El calendario no se publica ni se cobra automáticamente."))return;
  setBusy(true);setError("");
  try{
   const next=await storeAgent({...agent,setup:{...agent.setup,
    cap_bookings:enabled?"Sí":"No",
    perm_book_service:enabled&&confirm?"Sí":"No",bookings_onboarded:"Sí"
   }},agent);
   onAgentUpdated(next);setDone(true);
  }catch(e){setError(e instanceof Error?e.message:"No se pudieron guardar los permisos.");}
  finally{setBusy(false);}
 };
 const card=(label:string,value:string,to:Step)=><div className={styles.reviewCard} key={label}>
  <span><small>{label}</small><strong>{value}</strong></span>
  <button type="button" aria-label={"Editar "+label} className={styles.edit}
   onClick={()=>edit(to)}><Pencil size={17}/></button>
 </div>;
 return <section className={styles.root+" "+theme.flow} aria-label="Reservas con AI Agents">
  <header className={styles.top}><button type="button" onClick={back} aria-label="Volver">
   <ArrowLeft size={19}/></button><span>Reservas · Mi agente</span>
   <span>{index+1}/{steps.length}</span></header>
  <div className={styles.track}><span className={theme.agentProgress}
   style={{width:(index+1)/steps.length*100+"%"}}/></div>
  <div className={styles.robot+" "+theme.agentRobot}><Bot size={35}/><Sparkles size={16}/></div>
  <h1 className={styles.question+" "+theme.agentHeading}>{labels[step]}</h1>
  {loading?<p className={styles.note} role="status"><LoaderCircle size={17}/> Consultando tu agenda…</p>:null}
  {!loading&&owner&&step==="business"?<div className={styles.panel}>
   <strong className={styles.emphasis+" "+theme.agentText}>{business.name}</strong>
   <button type="button" aria-pressed={businessConfirmed}
    className={businessConfirmed?styles.optionActive:styles.option}
    onClick={()=>setBusinessConfirmed(true)}><Check size={17}/> Sí, este negocio</button>
  </div>:null}
  {!loading&&owner&&step==="goal"?<div className={styles.panel}>
   <p className={styles.note}>Esta agenda tiene {serviceCount??"…"} servicio(s) registrado(s),
    {approvedCount??"…"} activo(s) y aprobado(s), {slotCount??"…"} rango(s) disponible(s)
    y {bookingCount??"…"} cita(s). Elige una opción para abrirla directamente.</p>
   <div className={styles.optionsVertical}>
    <button type="button" className={styles.option} onClick={()=>openGoal("services")}>
     <CalendarDays size={17}/> Crear o editar servicios <ArrowRight size={16}/></button>
    <button type="button" className={styles.option} onClick={()=>openGoal("slots")}>
     <CalendarDays size={17}/> Mi disponibilidad <ArrowRight size={16}/></button>
    <button type="button" className={styles.option} onClick={()=>openGoal("bookings")}>
     <CalendarDays size={17}/> Consultar solicitudes y citas <ArrowRight size={16}/></button>
   </div>
   {!approvedCount?<p className={styles.note}>Todavía no hay servicios activos y aprobados.
    Puedes crear uno o activar un servicio existente. Las opciones se pueden abrir aunque la agenda esté vacía.</p>:null}
   <p className={styles.note}>Elige qué deseas preparar. Al terminar, entrarás directamente a Servicios/Reservas.</p>
  </div>:null}
  {!loading&&owner&&step==="permissions"?<div className={styles.panel}>
   <label className={styles.checkLine}><input type="checkbox" checked={enabled}
    onChange={e=>{setEnabled(e.target.checked);if(!e.target.checked)setConfirm(false);}}/>
    Permitir que Mi agente consulte los servicios y atienda solicitudes de reserva</label>
   <label className={styles.checkLine}><input type="checkbox" disabled={!enabled}
    checked={confirm} onChange={e=>setConfirm(e.target.checked)}/>
    Autorizar la confirmación solo cuando la disponibilidad esté verificada</label>
   <p className={styles.note}>La agenda no está sincronizada con calendarios externos y no activa cobros.</p>
  </div>:null}
  {!loading&&owner&&step==="review"?<div className={styles.panel}>
   {done?<div className={styles.info}>Permisos guardados.
    <button type="button" className={styles.option} onClick={()=>onOpenStudio(goal==="slots"?"availability":goal)}>
     <CalendarDays size={16}/> Abrir {goal==="services"?"Mis servicios":goal==="slots"?"Mi disponibilidad":"Reservas"}
    </button></div>:<div className={styles.review}>
    {card("Negocio",business.name,"business")}
    {card("Acción","Gestionar reservas desde la agenda","goal")}
    {card("Atención de citas",enabled?"Permitida":"Desactivada","permissions")}
    {card("Confirmar reservas",enabled&&confirm?"Con disponibilidad verificada":"No","permissions")}
   </div>}
   <p className={styles.note}>El agente conserva el mismo negocio. Después podrás crear servicios y horarios sin volver a este asistente.</p>
  </div>:null}
  {error?<p role="alert" className={styles.error}>{error}</p>:null}
  {!loading&&owner?<div className={styles.footer}>
   {step==="review"?<button type="button" className={styles.primary+" "+theme.agentButton}
    disabled={busy||done} onClick={()=>void save()}>
    {busy?<LoaderCircle size={17}/>:<ShieldCheck size={17}/>}
    {done?"Guardado":"Confirmar permisos"} <ArrowRight size={17}/></button>:
   <button type="button" className={styles.primary+" "+theme.agentButton}
    onClick={next} disabled={busy||(step==="business"&&!businessConfirmed)}>
    {editing?"Volver a Revisión":step==="goal"?"Continuar: permisos del agente":"Continuar"} <ArrowRight size={17}/></button>}
  </div>:null}
  <p className={styles.footnote}><ShieldCheck size={14}/> Reservas bajo control del propietario.</p>
 </section>;
}
