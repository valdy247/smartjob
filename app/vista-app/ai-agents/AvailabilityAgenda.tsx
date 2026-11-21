"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {ArrowLeft,CalendarClock,CalendarPlus,CheckCircle2,Clock3,RefreshCw,Trash2} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import styles from "./AvailabilityAgenda.module.css";

type Service={id:string;name:string;duration_minutes:number;time_zone:string;approved:boolean;active:boolean};
type Window={id:string;day:string;start_local:string;end_local:string;time_zone:string};
type Slot={id:string;start_at:string;end_at:string;service_id:string};
type Booking={id:string;slot_id:string;service_id:string;status:string};
const zones=["America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
 "America/Phoenix","America/Anchorage","Pacific/Honolulu","America/Puerto_Rico"];
const isoDay=(zone:string)=>new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const advance=(day:string,n:number)=>new Date(Date.parse(day+"T12:00:00Z")+n*86400000).toISOString().slice(0,10);
const minutes=(s:string)=>{const [h,m]=s.slice(0,5).split(":").map(Number);return h*60+m;};
const displayTime=(n:number)=>String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");
const localClock=(iso:string,zone:string)=>{
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:zone,hour12:false,
  year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).formatToParts(new Date(iso));
 const part=(name:string)=>parts.find(p=>p.type===name)?.value||"";
 return {day:part("year")+"-"+part("month")+"-"+part("day"),time:part("hour")+":"+part("minute")};
};
function segments(window:Window,busy:{start:number;end:number}[]){
 const start=minutes(window.start_local),end=minutes(window.end_local);
 const spans=busy.map(x=>({start:Math.max(start,x.start),end:Math.min(end,x.end)}))
  .filter(x=>x.end>x.start).sort((a,b)=>a.start-b.start);
 const merged:{start:number;end:number}[]=[];
 for(const item of spans){const last=merged[merged.length-1];
  if(last&&item.start<=last.end)last.end=Math.max(last.end,item.end);
  else merged.push({...item});
 }
 let cursor=start;
 const rows:{from:number;to:number;busy:boolean}[]=[];
 for(const b of merged){
  if(b.start>cursor)rows.push({from:cursor,to:b.start,busy:false});
  rows.push({from:Math.max(cursor,b.start),to:b.end,busy:true});
  cursor=Math.max(cursor,b.end);
 }
 if(cursor<end)rows.push({from:cursor,to:end,busy:false});
 return rows;
}
export default function AvailabilityAgenda({business,owner,services,onBack,onAddService}:{
 business:string;owner:string;services:Service[];onBack:()=>void;onAddService:()=>void;
}){
 const initialZone=services.find(s=>s.active&&s.approved)?.time_zone||"America/New_York";
 const [zone,setZone]=useState(initialZone);
 const [day,setDay]=useState(()=>advance(isoDay(initialZone),1));
 const [start,setStart]=useState("11:00"),[end,setEnd]=useState("16:00");
 const [windows,setWindows]=useState<Window[]>([]);
 const [slots,setSlots]=useState<Slot[]>([]);
 const [bookings,setBookings]=useState<Booking[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [message,setMessage]=useState(""),[error,setError]=useState("");
 const today=isoDay(zone);
 const maxDay=advance(today,89);
 const load=useCallback(async()=>{
  const db=getSupabase();if(!db)throw Error("No se pudo conectar con VMV.");
  const {data:{user},error:authError}=await db.auth.getUser();
  if(authError||!user||user.is_anonymous||user.id!==owner)throw Error("Inicia sesión con la cuenta del negocio.");
  const startFrom=new Date(Date.now()-86400000).toISOString(),endAt=new Date(Date.now()+91*86400000).toISOString();
  const [a,b,c]=await Promise.all([
   db.from("vmv_ai_booking_availability").select("id,day,start_local,end_local,time_zone")
    .eq("owner_id",owner).eq("business_id",business)
    .gte("day",new Date(Date.now()-86400000).toISOString().slice(0,10))
    .order("day").order("start_local").limit(240),
   db.from("vmv_ai_booking_slots").select("id,start_at,end_at,service_id")
    .eq("owner_id",owner).eq("business_id",business)
    .gte("end_at",startFrom).lte("start_at",endAt).limit(450),
   db.from("vmv_ai_bookings").select("id,slot_id,service_id,status")
    .eq("owner_id",owner).eq("business_id",business)
    .in("status",["requested","confirmed"])
    .order("created_at",{ascending:false}).limit(450)
  ]);
  if(a.error||b.error||c.error)throw Error("No pudimos cargar la agenda. Comprueba que la disponibilidad esté configurada.");
  setWindows((a.data||[]) as Window[]);
  setSlots((b.data||[]) as Slot[]);
  setBookings((c.data||[]) as Booking[]);
 },[business,owner]);
 useEffect(()=>{
  let active=true;setLoading(true);
  void load().catch(e=>{if(active)setError(e instanceof Error?e.message:"No se pudo cargar la agenda.");})
   .finally(()=>{if(active)setLoading(false);});
  const refresh=()=>{if(document.visibilityState==="visible")void load().catch(()=>{});};
  const timer=window.setInterval(refresh,20000);
  window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
  return()=>{active=false;window.clearInterval(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};
 },[load]);
 useEffect(()=>{
  if(!zones.includes(initialZone))return;
  setZone(initialZone);
 },[initialZone]);
 async function addWindow(){
  if(busy)return;setBusy(true);setError("");setMessage("");
  try{
   if(day<today||day>maxDay||minutes(end)-minutes(start)<30)throw Error("Selecciona una fecha futura y al menos 30 minutos.");
   const db=getSupabase();if(!db)throw Error("VMV no está conectado.");
   const {data,error:writeError}=await db.rpc("vmv_ai_owner_add_availability",{
    p_business:business,p_date:day,p_start:start,p_end:end,p_zone:zone
   });
   if(writeError||typeof data!=="string")throw Error("No se pudo guardar. Revisa la fecha, horario o posibles rangos duplicados.");
   await load();setMessage("Disponibilidad guardada.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setBusy(false);}
 }
 async function removeWindow(id:string){
  if(busy||!window.confirm("¿Quitar esta disponibilidad? Las citas reservadas no se eliminarán."))return;
  setBusy(true);setError("");setMessage("");
  try{
   const db=getSupabase();if(!db)throw Error("VMV no está conectado.");
   const {data,error:deleteError}=await db.rpc("vmv_ai_owner_remove_availability",{p_window:id});
   if(deleteError||data!==true)throw Error("Este rango tiene citas ocupadas o ya cambió. Actualiza antes de quitarlo.");
   await load();setMessage("Horario retirado.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo quitar.");}
  finally{setBusy(false);}
 }
 const bookedSlotIds=useMemo(()=>new Set(bookings.map(b=>b.slot_id)),[bookings]);
 const booked=useMemo(()=>slots.filter(s=>bookedSlotIds.has(s.id)),[slots,bookedSlotIds]);
 const selected=windows.filter(w=>w.day===day&&w.time_zone===zone);
 const occupied=(w:Window)=>booked.map(slot=>{
  const begin=localClock(slot.start_at,w.time_zone),finish=localClock(slot.end_at,w.time_zone);
  return begin.day===w.day?{start:minutes(begin.time),end:finish.day===w.day?minutes(finish.time):1440}:null;
 }).filter((x):x is {start:number;end:number}=>Boolean(x));
 const planned=windows.filter(w=>w.day>=today).length;
 const dailyOccupied=selected.reduce((total,w)=>total+segments(w,occupied(w)).filter(row=>row.busy).length,0);
 return <section className={styles.root} aria-label="Mi disponibilidad">
  <header className={styles.header}>
   <button type="button" onClick={onBack} aria-label="Volver a Servicios"><ArrowLeft size={18}/></button>
   <div><h2>Mi disponibilidad</h2><p>Tu agenda, a tu ritmo.</p></div>
   <button type="button" className={styles.refresh} onClick={()=>void load().catch(e=>setError(String(e)))} aria-label="Actualizar agenda"><RefreshCw size={17}/></button>
  </header>
  <div className={styles.stats}><span><CalendarClock size={17}/>{planned} horarios futuros</span>
   <span><CheckCircle2 size={17}/>{dailyOccupied} bloques ocupados</span></div>
  {error?<p className={styles.error} role="alert">{error}</p>:null}
  {message?<p className={styles.message} role="status">{message}</p>:null}
  <section className={styles.editor}>
   <label className={styles.dateLabel}>Día<input type="date" min={today} max={maxDay} value={day}
    onChange={e=>setDay(e.target.value)}/></label>
   <div className={styles.timeRow}>
    <label>Desde<input type="time" value={start} step={900} onChange={e=>setStart(e.target.value)}/></label>
    <label>Hasta<input type="time" value={end} step={900} onChange={e=>setEnd(e.target.value)}/></label>
   </div>
   <label className={styles.zoneLabel}>Zona horaria<select value={zone} onChange={e=>setZone(e.target.value)}>
    {zones.map(z=><option value={z} key={z}>{z.replace("America/","").replace("Pacific/","")}</option>)}
   </select></label>
   <button className={styles.save} type="button" disabled={busy||loading||!day}
    onClick={()=>void addWindow()}><CalendarPlus size={17}/>{busy?"Guardando…":"Añadir disponibilidad"}</button>
  </section>
  <div className={styles.calendarHeader}><h3>{new Date(day+"T12:00:00Z").toLocaleDateString("es-US",{weekday:"long",month:"short",day:"numeric",timeZone:"UTC"})}</h3>
   <small>{zone.replace("America/","").replace("Pacific/","")}</small></div>
  {loading?<p className={styles.empty}>Cargando agenda…</p>:
   selected.length===0?<div className={styles.empty}><Clock3 size={23}/>
    <span>Sin horarios para este día.</span></div>:
   <div className={styles.windowList}>{selected.map(w=><article className={styles.windowCard} key={w.id}>
    <div className={styles.windowHeading}><strong>{shortTime(w.start_local)} – {shortTime(w.end_local)}</strong>
     <button type="button" disabled={busy} onClick={()=>void removeWindow(w.id)} aria-label="Quitar disponibilidad"><Trash2 size={15}/></button></div>
    <div className={styles.timeline}>{segments(w,occupied(w)).map((segment,i)=>
     <div key={i} className={segment.busy?styles.occupied:styles.free}>
      <span className={styles.indicator}/><span>{displayTime(segment.from)} – {displayTime(segment.to)}</span>
      <strong>{segment.busy?"Ocupado":"Disponible"}</strong>
     </div>)}</div>
   </article>)}</div>}
  {services.filter(s=>s.active&&s.approved).length===0?
   <button type="button" className={styles.addService} onClick={onAddService}>
    Agrega un servicio y su duración para recibir reservas.
   </button>:
   <p className={styles.hint}>El agente usará la duración guardada en cada servicio. Las citas reservadas aparecen como ocupadas.</p>}
 </section>;
}
