"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,CalendarDays,CheckCircle2,Clock3,Plus,Save,ShieldCheck} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {storeAgent,type PersistedAgent} from "./agentStore";
import styles from "./CommerceStudio.module.css";

type Service={
 id:string;owner_id:string;business_id:string;name:string;description:string;
 duration_minutes:number;price_cents:number|null;approved:boolean;active:boolean;
 auto_confirm:boolean;time_zone:string;updated_at:string;
};
type Slot={id:string;service_id:string;business_id:string;start_at:string;end_at:string;capacity:number;active:boolean};
type Booking={id:string;service_id:string;slot_id:string;agent_id:string;customer_name:string;status:string;created_at:string};
type Tab="services"|"slots"|"bookings"|"permissions";
type Draft={name:string;description:string;duration_minutes:number;price:string;approved:boolean;active:boolean;auto_confirm:boolean;time_zone:string};
const zones=["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Phoenix","America/Anchorage","Pacific/Honolulu","America/Puerto_Rico"];
const empty:Draft={name:"",description:"",duration_minutes:30,price:"",approved:false,active:true,auto_confirm:false,time_zone:"America/New_York"};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const format=(stamp:string,zone:string)=>{
 try{return new Intl.DateTimeFormat("es-US",{timeZone:zone,dateStyle:"medium",timeStyle:"short"}).format(new Date(stamp));}
 catch{return "Zona horaria no válida";}
};
export default function BookingStudio({agent,onClose,onAgentUpdated}:{
 agent:PersistedAgent;onClose:()=>void;onAgentUpdated?:(agent:PersistedAgent)=>void;
}){
 const [current,setCurrent]=useState(agent);
 const [tab,setTab]=useState<Tab>("services");
 const [services,setServices]=useState<Service[]>([]);
 const [slots,setSlots]=useState<Slot[]>([]);
 const [bookings,setBookings]=useState<Booking[]>([]);
 const [form,setForm]=useState<Draft>(empty);
 const [editing,setEditing]=useState<Service|null>(null);
 const [showForm,setShowForm]=useState(false);
 const [serviceId,setServiceId]=useState("");
 const [day,setDay]=useState("");
 const [time,setTime]=useState("10:00");
 const [capacity,setCapacity]=useState(1);
 const [enabled,setEnabled]=useState(agent.setup.cap_bookings==="Sí");
 const [allowConfirm,setAllowConfirm]=useState(agent.setup.perm_book_service==="Sí");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const workspace=current.business_id;
 const selectedService=services.find(x=>x.id===serviceId)||services[0]||null;
 const patch=<K extends keyof Draft>(key:K,value:Draft[K])=>setForm(old=>({...old,[key]:value}));
 const access=async()=>{
  const db=getSupabase();if(!db)throw Error("No se pudo conectar con VMV.");
  const {data,error}=await db.auth.getUser();
  if(error||!data.user||data.user.is_anonymous||data.user.id!==current.owner_id)
   throw Error("Inicia sesión en la cuenta propietaria de este negocio.");
  if(!uuid.test(workspace))throw Error("Negocio inválido.");
  return {db,owner:data.user.id};
 };
 const refresh=async()=>{
  const {db,owner}=await access();
  const [a,b,c]=await Promise.all([
   db.from("vmv_ai_booking_services").select("*").eq("business_id",workspace).eq("owner_id",owner).order("name").limit(80),
   db.from("vmv_ai_booking_slots").select("*").eq("business_id",workspace).eq("owner_id",owner).gt("start_at",new Date().toISOString()).order("start_at").limit(100),
   db.from("vmv_ai_bookings").select("*").eq("business_id",workspace).eq("owner_id",owner).order("created_at",{ascending:false}).limit(80)
  ]);
  if(a.error||b.error||c.error)throw Error("No se pudo consultar la agenda de este negocio.");
  const items=(a.data||[]) as Service[];
  setServices(items);setSlots((b.data||[]) as Slot[]);setBookings((c.data||[]) as Booking[]);
  setServiceId(old=>items.some(x=>x.id===old)?old:items[0]?.id||"");
 };
 useEffect(()=>{let alive=true;setLoading(true);
  void refresh().catch(e=>{if(alive)setNotice(e instanceof Error?e.message:"Agenda no disponible.");})
   .finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
  // The business is fixed for this mounted panel; never mix another workspace.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[workspace]);
 const savePermissions=async()=>{
  if(busy)return;setBusy(true);
  try{
   if(allowConfirm&&!enabled)throw Error("Primero activa la capacidad de reservas.");
   const saved=await storeAgent({...current,setup:{...current.setup,
    cap_bookings:enabled?"Sí":"No",perm_book_service:enabled&&allowConfirm?"Sí":"No"}},current);
   setCurrent(saved);onAgentUpdated?.(saved);
   setNotice("Permisos de reservas guardados en este agente. Las llamadas iniciadas conservan su configuración.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudieron guardar los permisos.");}
  finally{setBusy(false);}
 };
 const saveService=async()=>{
  if(busy)return;setBusy(true);
  try{
   const {db,owner}=await access();
   if(form.name.trim().length<2||form.name.trim().length>120)throw Error("Escribe el nombre del servicio (2–120 caracteres).");
   if(!Number.isInteger(form.duration_minutes)||form.duration_minutes<15||form.duration_minutes>240)throw Error("La duración debe estar entre 15 y 240 minutos.");
   if(!zones.includes(form.time_zone))throw Error("Elige una zona horaria válida.");
   const cost=form.price.trim();
   if(cost&&!/^(0|[1-9]\d{0,4})(\.\d{1,2})?$/.test(cost))throw Error("Precio USD no válido.");
   const cents=cost?Math.round(Number(cost)*100):null;
   const values={owner_id:owner,business_id:workspace,name:form.name.trim(),
    description:form.description.trim().slice(0,700),duration_minutes:form.duration_minutes,
    price_cents:cents,currency:"usd",approved:form.approved,active:form.active,
    auto_confirm:form.auto_confirm,time_zone:form.time_zone,updated_at:new Date().toISOString()};
   if(editing){
    const {data,error}=await db.from("vmv_ai_booking_services").update(values)
     .eq("id",editing.id).eq("business_id",workspace).eq("owner_id",owner)
     .eq("updated_at",editing.updated_at).select("id").maybeSingle();
    if(error||!data)throw Error("Servicio modificado en otro dispositivo o no autorizado. Recarga la agenda.");
   }else{
    const {error}=await db.from("vmv_ai_booking_services").insert(values);
    if(error)throw Error("No se pudo guardar el servicio.");
   }
   await refresh();setForm(empty);setEditing(null);setShowForm(false);
   setNotice("Servicio guardado. Añade horarios antes de recibir reservas.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setBusy(false);}
 };
 const addSlot=async()=>{
  if(busy||!selectedService||!day)return;setBusy(true);
  try{
   const {db}=await access();
   if(!Number.isInteger(capacity)||capacity<1||capacity>20)throw Error("Capacidad de 1 a 20 personas.");
   const {data,error}=await db.rpc("vmv_ai_owner_add_booking_slot",{
    p_service_id:selectedService.id,p_date:day,p_time:time,p_capacity:capacity
   });
   if(error||typeof data!=="string")throw Error("Horario duplicado, superpuesto, pasado o inválido para la zona horaria.");
   await refresh();setNotice("Horario guardado en la agenda VMV.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo guardar el horario.");}
  finally{setBusy(false);}
 };
 const label=(s:string,children:React.ReactNode)=><label>{s}{children}</label>;
 return <section className={styles.root}>
  <button type="button" onClick={onClose} className={styles.back}><ArrowLeft size={17}/> AI Agents</button>
  <div className={styles.hero}><div><small>AGENTE PRINCIPAL · AGENDA VMV</small>
   <h1>Reservas</h1><p>{current.name}</p></div><CalendarDays size={30}/></div>
  <div className={styles.warning}><ShieldCheck size={18}/><p>Agenda VMV sin sincronización externa. Sin cobros.</p></div>
  {notice?<div className={styles.notice} role="status">{notice}</div>:null}
  <div className={styles.tabs} role="tablist">{([["services","Servicios"],["slots","Horarios"],["bookings","Citas"],["permissions","Permisos"]] as [Tab,string][]).map(([id,name])=>
   <button type="button" role="tab" aria-selected={tab===id} key={id}
    className={tab===id?styles.on:styles.off} onClick={()=>setTab(id)}>{name}</button>)}</div>
  {loading?<p className={styles.hint}>Cargando agenda del negocio…</p>:null}
  {tab==="services"?<>
   <div className={styles.heading}><h2>Servicios reservables</h2><button type="button" onClick={()=>{setEditing(null);setForm(empty);setShowForm(v=>!v);}}><Plus size={15}/> Añadir</button></div>
   {showForm?<div className={styles.form}>
    {label("Nombre del servicio",<input maxLength={120} value={form.name} onChange={e=>patch("name",e.target.value)}/>)}
    {label("Descripción",<textarea rows={2} maxLength={700} value={form.description} onChange={e=>patch("description",e.target.value)}/>)}
    {label("Duración",<select value={form.duration_minutes} onChange={e=>patch("duration_minutes",Number(e.target.value))}>{[15,30,45,60,90,120,180,240].map(x=><option key={x} value={x}>{x} minutos</option>)}</select>)}
    {label("Precio USD aprobado (opcional)",<input inputMode="decimal" placeholder="25.00" value={form.price} onChange={e=>patch("price",e.target.value)}/>)}
    {label("Zona horaria",<select value={form.time_zone} onChange={e=>patch("time_zone",e.target.value)}>{zones.map(x=><option key={x} value={x}>{x}</option>)}</select>)}
    <label className={styles.check}><input type="checkbox" checked={form.approved} onChange={e=>patch("approved",e.target.checked)}/> Aprobar información comercial del servicio</label>
    <label className={styles.check}><input type="checkbox" checked={form.active} onChange={e=>patch("active",e.target.checked)}/> Servicio activo</label>
    <label className={styles.check}><input type="checkbox" checked={form.auto_confirm} onChange={e=>patch("auto_confirm",e.target.checked)}/> Permitir confirmación automática solo con plaza y autorización del agente</label>
    <button type="button" disabled={busy} className={styles.primary} onClick={()=>void saveService()}><Save size={16}/> Guardar servicio</button>
   </div>:null}
   {services.length===0&&!loading?<div className={styles.empty}><CalendarDays size={24}/><p>Sin servicios. Añade uno para empezar.</p></div>:null}
   <div className={styles.items}>{services.map(x=><div className={styles.item} key={x.id}><div><strong>{x.name}</strong>
    <small>{x.duration_minutes} min · {x.price_cents===null?"Precio por confirmar":"$"+(x.price_cents/100).toFixed(2)} · {x.approved?"Aprobado":"Pendiente"}</small>
    <small>{x.time_zone} · {x.active?"Activo":"Inactivo"}</small></div>
    <button type="button" onClick={()=>{setEditing(x);setForm({name:x.name,description:x.description,duration_minutes:x.duration_minutes,price:x.price_cents===null?"":(x.price_cents/100).toFixed(2),approved:x.approved,active:x.active,auto_confirm:x.auto_confirm,time_zone:x.time_zone});setShowForm(true);}}>Editar</button></div>)}</div>
  </>:null}
  {tab==="slots"?<><div className={styles.heading}><h2>Horarios disponibles</h2></div>
   {selectedService?<div className={styles.form}>
    {label("Servicio",<select value={selectedService.id} onChange={e=>setServiceId(e.target.value)}>{services.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select>)}
    {label("Fecha",<input type="date" value={day} onChange={e=>setDay(e.target.value)}/>)}
    {label("Hora local del servicio",<input type="time" step={1800} value={time} onChange={e=>setTime(e.target.value)}/>)}
    {label("Plazas",<select value={capacity} onChange={e=>setCapacity(Number(e.target.value))}>{[1,2,3,4,5,6,8,10,12,20].map(x=><option key={x} value={x}>{x}</option>)}</select>)}
    <button type="button" disabled={busy||!day} className={styles.primary} onClick={()=>void addSlot()}><Plus size={16}/> Añadir horario</button>
   </div>:<p className={styles.hint}>Primero registra un servicio en la pestaña Servicios.</p>}
   <div className={styles.items}>{slots.map(x=>{const service=services.find(y=>y.id===x.service_id);return <div key={x.id} className={styles.item}><div><strong>{service?.name||"Servicio"}</strong><small>{format(x.start_at,service?.time_zone||"America/New_York")}</small><small>{x.capacity} plaza(s) · {x.active?"Disponible":"Inactivo"}</small></div><Clock3 size={17}/></div>;})}</div>
  </>:null}
  {tab==="bookings"?<><div className={styles.heading}><h2>Solicitudes y citas</h2></div>
   {bookings.length===0?<div className={styles.empty}><CalendarDays size={22}/><p>Aún no hay reservas en este negocio.</p></div>:null}
   <div className={styles.items}>{bookings.map(b=><div key={b.id} className={styles.item}><div><strong>{b.customer_name}</strong><small>{services.find(s=>s.id===b.service_id)?.name||"Servicio"} · {b.status}</small><small>{new Date(b.created_at).toLocaleString("es-US")} · {b.agent_id===current.id?"Tu agente":"Agente anterior del negocio"}</small></div><CheckCircle2 size={17}/></div>)}</div>
  </>:null}
  {tab==="permissions"?<div className={styles.form}>
   <p className={styles.hint}>Los permisos de {current.name} se verifican antes de reservar.</p>
   <label className={styles.check}><input type="checkbox" checked={enabled} onChange={e=>{setEnabled(e.target.checked);if(!e.target.checked)setAllowConfirm(false);}}/> Permitir a este agente atender solicitudes de reserva</label>
   <label className={styles.check}><input type="checkbox" disabled={!enabled} checked={allowConfirm} onChange={e=>setAllowConfirm(e.target.checked)}/> Autorizar registro de citas aceptadas, solo con disponibilidad confirmada</label>
   <button type="button" disabled={busy} className={styles.primary} onClick={()=>void savePermissions()}><Save size={16}/> Guardar permisos del agente</button>
  </div>:null}
 </section>;
}
