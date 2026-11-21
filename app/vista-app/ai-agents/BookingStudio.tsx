"use client";
import {useCallback,useEffect,useState} from "react";
import {ArrowLeft,CalendarDays,CalendarClock,CalendarPlus,CheckCircle2,Clock3,
 ClipboardList,Pencil,Plus,Save,Settings2,UserRoundCheck} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {storeAgent,type PersistedAgent} from "./agentStore";
import styles from "./CommerceStudio.module.css";
import {useAgentHeaderBack} from "./AgentHeaderBack";

type Service={
 id:string;owner_id:string;business_id:string;name:string;description:string;
 duration_minutes:number;price_cents:number|null;approved:boolean;active:boolean;
 auto_confirm:boolean;time_zone:string;updated_at:string
};
type Slot={id:string;service_id:string;business_id:string;start_at:string;end_at:string;capacity:number;active:boolean};
type Booking={id:string;service_id:string;slot_id:string;agent_id:string;customer_name:string;status:string;source:string;created_at:string};
type HumanRequest={id:string;owner_id:string;agent_id:string;status:"new"|"reviewed"|"closed";summary:string;created_at:string};
export type BookingTab="services"|"slots"|"bookings"|"requests"|"permissions";
type NavTab="services"|"bookings"|"requests";
type View="home"|"add"|"list"|"slots"|"permissions";
type Draft={name:string;description:string;duration_minutes:number;price:string;
 approved:boolean;active:boolean;auto_confirm:boolean;time_zone:string};
const empty:Draft={name:"",description:"",duration_minutes:30,price:"",approved:false,active:true,
 auto_confirm:false,time_zone:"America/New_York"};
const zones=["America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
 "America/Phoenix","America/Anchorage","Pacific/Honolulu","America/Puerto_Rico"];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function bookingTime(stamp:string,zone:string){
 try{return new Intl.DateTimeFormat("es-US",{timeZone:zone,dateStyle:"medium",
  timeStyle:"short"}).format(new Date(stamp));}
 catch{return new Date(stamp).toLocaleString("es-US");}
}

export default function BookingStudio({agent,onClose,onAgentUpdated,initialTab="services"}:{
 agent:PersistedAgent;onClose:()=>void;onAgentUpdated?:(agent:PersistedAgent)=>void;
 initialTab?:BookingTab;
}){
 const [current,setCurrent]=useState(agent);
 const [tab,setTab]=useState<NavTab>(initialTab==="bookings"?"bookings":initialTab==="requests"?"requests":"services");
 const [view,setView]=useState<View>(initialTab==="slots"?"slots":initialTab==="permissions"?"permissions":"home");
 const [services,setServices]=useState<Service[]>([]);
 const [slots,setSlots]=useState<Slot[]>([]);
 const [bookings,setBookings]=useState<Booking[]>([]);
 const [requests,setRequests]=useState<HumanRequest[]>([]);
 const [form,setForm]=useState<Draft>(empty);
 const [editing,setEditing]=useState<Service|null>(null);
 const [serviceId,setServiceId]=useState("");
 const [day,setDay]=useState(""),[time,setTime]=useState("10:00"),[capacity,setCapacity]=useState(1);
 const [enabled,setEnabled]=useState(agent.setup.cap_bookings==="Sí");
 const [allowConfirm,setAllowConfirm]=useState(agent.setup.perm_book_service==="Sí");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [notice,setNotice]=useState(""),[error,setError]=useState("");
 const workspace=current.business_id;
 const eligible=services.filter(s=>s.active&&s.approved);
 const selectedService=eligible.find(s=>s.id===serviceId)||eligible[0]||null;
 const pending=bookings.filter(b=>b.status==="requested");
 const confirmed=bookings.filter(b=>b.status!=="requested");
 const pendingHuman=requests.filter(r=>r.status!=="closed");
 const patch=<K extends keyof Draft>(key:K,value:Draft[K])=>setForm(old=>({...old,[key]:value}));
 const back=()=>{
  if(tab==="services"&&view!=="home"){
   setView("home");setEditing(null);setNotice("");return;
  }
  if(tab!=="services"){setTab("services");setView("home");return;}
  onClose();
 };
 const useSharedHeader=useAgentHeaderBack(back);
 const access=useCallback(async()=>{
  const db=getSupabase();if(!db)throw Error("No se pudo conectar con VMV.");
  const {data:{user},error:authError}=await db.auth.getUser();
  if(authError||!user||user.is_anonymous||user.id!==current.owner_id)
   throw Error("Inicia sesión en la cuenta propietaria de este negocio.");
  if(!uuid.test(workspace))throw Error("Negocio no válido.");
  return {db,owner:user.id};
 },[workspace,current.owner_id]);
 const refresh=useCallback(async()=>{
  const {db,owner}=await access();
  const [a,b,c,d]=await Promise.all([
   db.from("vmv_ai_booking_services").select("*").eq("owner_id",owner).eq("business_id",workspace)
    .order("name").limit(80),
   db.from("vmv_ai_booking_slots").select("*").eq("owner_id",owner).eq("business_id",workspace)
    .gt("start_at",new Date().toISOString()).order("start_at").limit(100),
   db.from("vmv_ai_bookings").select("*").eq("owner_id",owner).eq("business_id",workspace)
    .order("created_at",{ascending:false}).limit(80),
   db.from("vmv_ai_human_requests").select("id,owner_id,agent_id,status,summary,created_at")
    .eq("owner_id",owner).eq("agent_id",current.id)
    .order("created_at",{ascending:false}).limit(80)
  ]);
  if(a.error||b.error||c.error||d.error)
   throw Error("No se pudieron consultar los servicios, horarios y solicitudes.");
  const catalog=(a.data||[]) as Service[];
  setServices(catalog);
  setSlots((b.data||[]) as Slot[]);
  setBookings((c.data||[]) as Booking[]);
  setRequests((d.data||[]) as HumanRequest[]);
  setServiceId(old=>catalog.some(s=>s.id===old&&s.active&&s.approved)?old:
   catalog.find(s=>s.active&&s.approved)?.id||"");
 },[access,workspace,current.id]);
 useEffect(()=>{
  let mounted=true;setLoading(true);setError("");
  void refresh().catch(e=>{if(mounted)setError(e instanceof Error?e.message:"No se pudo abrir la agenda.");})
   .finally(()=>{if(mounted)setLoading(false);});
  return()=>{mounted=false;};
 },[refresh]);
 function beginAdd(){setEditing(null);setForm(empty);setView("add");setNotice("");}
 function beginEdit(item:Service){
  setEditing(item);
  setForm({name:item.name,description:item.description,duration_minutes:item.duration_minutes,
   price:item.price_cents===null?"":(item.price_cents/100).toFixed(2),approved:item.approved,
   active:item.active,auto_confirm:item.auto_confirm,time_zone:item.time_zone});
  setView("add");setNotice("");
 }
 function openSlots(item:Service){
  if(item.active&&item.approved){setServiceId(item.id);setView("slots");setNotice("");}
  else {beginEdit(item);setNotice("Activa y aprueba este servicio antes de crear horarios.");}
 }
 async function toggleConnection(){
  if(busy)return;setBusy(true);setNotice("");
  try{
   const next=!enabled;
   const saved=await storeAgent({...current,setup:{...current.setup,
    cap_bookings:next?"Sí":"No",perm_book_service:next&&allowConfirm?"Sí":"No",
    bookings_onboarded:"Sí"}},current);
   setCurrent(saved);setEnabled(next);if(!next)setAllowConfirm(false);
   onAgentUpdated?.(saved);
   setNotice(next?"Agente conectado a servicios y reservas.":"Agente desconectado. Los servicios y las reservas se conservan.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo cambiar la conexión.");}
  finally{setBusy(false);}
 }
 async function savePermissions(){
  if(busy)return;setBusy(true);setNotice("");
  try{
   if(allowConfirm&&!enabled)throw Error("Activa primero la conexión del agente.");
   const saved=await storeAgent({...current,setup:{...current.setup,
    cap_bookings:enabled?"Sí":"No",perm_book_service:enabled&&allowConfirm?"Sí":"No",
    bookings_onboarded:"Sí"}},current);
   setCurrent(saved);onAgentUpdated?.(saved);
   setNotice("Permisos guardados para este agente.");
   setView("home");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudieron guardar los permisos.");}
  finally{setBusy(false);}
 }
 async function saveService(){
  if(busy)return;setBusy(true);setNotice("");
  try{
   const {db,owner}=await access();
   const name=form.name.trim();
   if(name.length<2||name.length>120)throw Error("Escribe un nombre de 2 a 120 caracteres.");
   if(!Number.isInteger(form.duration_minutes)||form.duration_minutes<15||form.duration_minutes>240)
    throw Error("La duración debe ser de 15 a 240 minutos.");
   if(!zones.includes(form.time_zone))throw Error("Elige una zona horaria válida.");
   const price=form.price.trim();
   if(price&&!/^(0|[1-9]\d{0,4})(\.\d{1,2})?$/.test(price))
    throw Error("Precio USD no válido.");
   const values={owner_id:owner,business_id:workspace,name,description:form.description.trim().slice(0,700),
    duration_minutes:form.duration_minutes,price_cents:price?Math.round(Number(price)*100):null,
    currency:"usd",approved:form.approved,active:form.active,auto_confirm:form.auto_confirm,
    time_zone:form.time_zone,updated_at:new Date().toISOString()};
   if(editing){
    const {data,error:editError}=await db.from("vmv_ai_booking_services").update(values)
     .eq("id",editing.id).eq("owner_id",owner).eq("business_id",workspace)
     .eq("updated_at",editing.updated_at).select("id").maybeSingle();
    if(editError||!data)throw Error("Servicio modificado en otro dispositivo. Actualiza e inténtalo nuevamente.");
   }else{
    const {error:writeError}=await db.from("vmv_ai_booking_services").insert(values);
    if(writeError)throw Error("No se pudo guardar el servicio.");
   }
   await refresh();setForm(empty);setEditing(null);setView("list");
   setNotice(form.approved&&form.active?
    "Servicio guardado. Puedes administrar sus horarios desde Mis servicios.":
    "Servicio guardado. Actívalo y apruébalo antes de asignar disponibilidad.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setBusy(false);}
 }
 async function addSlot(){
  if(busy||!selectedService||!day)return;setBusy(true);setNotice("");
  try{
   if(!Number.isInteger(capacity)||capacity<1||capacity>20)throw Error("Capacidad de 1 a 20 personas.");
   const {db}=await access();
   const {data,error:slotError}=await db.rpc("vmv_ai_owner_add_booking_slot",{
    p_service_id:selectedService.id,p_date:day,p_time:time,p_capacity:capacity
   });
   if(slotError||typeof data!=="string")
    throw Error("No se pudo crear el horario. Comprueba la fecha, zona horaria y superposiciones.");
   await refresh();setNotice("Horario guardado en la agenda VMV.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo guardar el horario.");}
  finally{setBusy(false);}
 }
 async function reviewRequest(item:HumanRequest,status:"reviewed"|"closed"){
  if(busy)return;setBusy(true);setNotice("");
  try{
   const {db,owner}=await access();
   const {data,error:writeError}=await db.from("vmv_ai_human_requests").update({status})
    .eq("id",item.id).eq("owner_id",owner).eq("agent_id",current.id)
    .select("id").maybeSingle();
   if(writeError||!data)throw Error("No se pudo actualizar la solicitud.");
   await refresh();setNotice(status==="reviewed"?"Solicitud revisada.":"Solicitud cerrada.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo actualizar.");}
  finally{setBusy(false);}
 }
 const label=(title:string,field:React.ReactNode)=><label>{title}{field}</label>;
 const bookingSummary=(item:Booking)=>{
  const service=services.find(s=>s.id===item.service_id);
  const slot=slots.find(s=>s.id===item.slot_id);
  return {service:service?.name||"Servicio",stamp:slot?
   bookingTime(slot.start_at,service?.time_zone||"America/New_York"):
   new Date(item.created_at).toLocaleString("es-US")};
 };
 return <section className={styles.root}>
  {!useSharedHeader?<button type="button" className={styles.subBack} onClick={back}>
   <ArrowLeft size={16}/> {tab==="services"&&view!=="home"?"Servicios":"AI Agents"}</button>:null}
  {notice?<div className={styles.notice} role="status">{notice}</div>:null}
  {error?<div className={styles.warning} role="alert"><span>{error}</span></div>:null}
  {loading?<p className={styles.hint} role="status">Cargando servicios…</p>:null}
  <nav className={styles.tabs} aria-label="Servicios y reservas">
   <button type="button" className={tab==="services"?styles.on:styles.off}
    aria-current={tab==="services"?"page":undefined}
    onClick={()=>{setTab("services");setView("home");setNotice("");}}><CalendarDays size={15}/> Servicios</button>
   <button type="button" className={tab==="bookings"?styles.on:styles.off}
    aria-current={tab==="bookings"?"page":undefined}
    onClick={()=>{setTab("bookings");setNotice("");}}><CalendarClock size={15}/> Reservas ({confirmed.length})</button>
   <button type="button" className={tab==="requests"?styles.on:styles.off}
    aria-current={tab==="requests"?"page":undefined}
    onClick={()=>{setTab("requests");setNotice("");}}><UserRoundCheck size={15}/> Solicitudes</button>
  </nav>
  {tab==="services"?<>
   <div className={styles.catalogConnection}>
    <div className={styles.catalogConnectionInfo}>
     <strong>{current.name}</strong>
     <small>Agente · {enabled?"Conectado":"Desconectado"}</small>
     <button type="button" className={styles.configureLink} onClick={()=>{setView("permissions");setNotice("");}}>
      <Settings2 size={13}/> Permisos</button>
    </div>
    <label className={styles.catalogSwitch} aria-label="Conectar agente a los servicios">
     <input type="checkbox" role="switch" checked={enabled} disabled={busy}
      onChange={()=>void toggleConnection()}/><span aria-hidden="true"/>
    </label>
   </div>
   {view==="home"?<div className={styles.actionGrid}>
    <button type="button" className={styles.actionCard} onClick={beginAdd}>
     <span className={styles.actionIcon}><CalendarPlus size={24}/></span>
     <strong>Agregar servicio</strong><small>Nombre, precio y duración</small>
    </button>
    <button type="button" className={styles.actionCard} onClick={()=>{setView("list");setNotice("");}}>
     <span className={styles.actionIcon}><ClipboardList size={24}/></span>
     <strong>Mis servicios</strong><small>{services.length} guardado(s)</small>
    </button>
   </div>:view==="add"?<>
    {!useSharedHeader?<button type="button" className={styles.subBack}
     onClick={()=>{setView(editing?"list":"home");setEditing(null);}}><ArrowLeft size={16}/> Servicios</button>:null}
    <div className={styles.heading}><h2>{editing?"Editar servicio":"Agregar servicio"}</h2></div>
    <div className={styles.form}>
     {label("Nombre del servicio",<input maxLength={120} value={form.name}
      onChange={e=>patch("name",e.target.value)} placeholder="Ej. Consulta inicial"/>)}
     {label("Descripción",<textarea rows={2} maxLength={700} value={form.description}
      onChange={e=>patch("description",e.target.value)} placeholder="Qué incluye el servicio"/>)}
     {label("Duración",<select value={form.duration_minutes} onChange={e=>patch("duration_minutes",Number(e.target.value))}>
      {[15,30,45,60,90,120,180,240].map(x=><option key={x} value={x}>{x} minutos</option>)}</select>)}
     {label("Precio USD (opcional)",<input inputMode="decimal" placeholder="25.00"
      value={form.price} onChange={e=>patch("price",e.target.value)}/>)}
     {label("Zona horaria",<select value={form.time_zone} onChange={e=>patch("time_zone",e.target.value)}>
      {zones.map(zone=><option key={zone} value={zone}>{zone}</option>)}</select>)}
     <label className={styles.check}><input type="checkbox" checked={form.approved}
      onChange={e=>patch("approved",e.target.checked)}/> Servicio aprobado</label>
     <label className={styles.check}><input type="checkbox" checked={form.active}
      onChange={e=>patch("active",e.target.checked)}/> Servicio activo</label>
     <label className={styles.check}><input type="checkbox" checked={form.auto_confirm}
      onChange={e=>patch("auto_confirm",e.target.checked)}/>
      Confirmación automática solo con disponibilidad y autorización</label>
     <button type="button" disabled={busy||!form.name.trim()} className={styles.primary}
      onClick={()=>void saveService()}><Save size={16}/> {busy?"Guardando…":editing?"Guardar cambios":"Guardar servicio"}</button>
    </div>
   </>:view==="list"?<>
    {!useSharedHeader?<button type="button" className={styles.subBack} onClick={()=>setView("home")}>
     <ArrowLeft size={16}/> Servicios</button>:null}
    <div className={styles.heading}><h2>Mis servicios ({services.length})</h2>
     <button type="button" onClick={beginAdd}><Plus size={15}/> Añadir</button></div>
    {services.length===0&&!loading&&!error?<div className={styles.empty}>
     <CalendarDays size={25}/><p>Aún no hay servicios.</p>
     <button type="button" className={styles.primary} onClick={beginAdd}>Agregar servicio</button>
    </div>:<div className={styles.items}>{services.map(item=><article className={styles.item} key={item.id}>
     <div><strong>{item.name}</strong>
      <small>{item.duration_minutes} min · {item.price_cents===null?"Precio por confirmar":"$"+(item.price_cents/100).toFixed(2)}</small>
      <small>{item.active&&item.approved?"Activo y aprobado":item.active?"Pendiente de aprobación":"Inactivo"}
       {" · "}{slots.filter(slot=>slot.service_id===item.id&&slot.active).length} horario(s)</small>
     </div>
     <div className={styles.serviceRowActions}>
      <button type="button" onClick={()=>openSlots(item)}><Clock3 size={14}/> Horarios</button>
      <button type="button" onClick={()=>beginEdit(item)}><Pencil size={14}/> Editar</button>
     </div>
    </article>)}</div>}
   </>:view==="slots"?<>
    {!useSharedHeader?<button type="button" className={styles.subBack} onClick={()=>setView("list")}>
     <ArrowLeft size={16}/> Mis servicios</button>:null}
    <div className={styles.heading}><h2>Horarios disponibles</h2></div>
    {selectedService?<div className={styles.form}>
     <p className={styles.hint}>La disponibilidad utiliza la zona horaria del servicio.</p>
     {label("Servicio",<select value={selectedService.id} onChange={e=>setServiceId(e.target.value)}>
      {eligible.map(service=><option key={service.id} value={service.id}>{service.name}</option>)}</select>)}
     {label("Fecha",<input type="date" value={day} onChange={e=>setDay(e.target.value)}/>)}
     {label("Hora",<input type="time" step={1800} value={time} onChange={e=>setTime(e.target.value)}/>)}
     {label("Capacidad",<select value={capacity} onChange={e=>setCapacity(Number(e.target.value))}>
      {[1,2,3,4,5,6,8,10,12,20].map(x=><option key={x} value={x}>{x}</option>)}</select>)}
     <button type="button" disabled={busy||!day} className={styles.primary} onClick={()=>void addSlot()}>
      <Plus size={16}/> Añadir horario</button>
    </div>:<div className={styles.empty}><CalendarDays size={24}/>
     <p>Crear o aprobar servicio antes de añadir horarios.</p>
     <button type="button" className={styles.primary} onClick={()=>setView("list")}>Mis servicios</button>
    </div>}
    <div className={styles.items}>{slots.filter(slot=>slot.service_id===selectedService?.id)
     .map(slot=><article key={slot.id} className={styles.item}><div>
      <strong>{selectedService?.name}</strong>
      <small>{bookingTime(slot.start_at,selectedService?.time_zone||"America/New_York")}</small>
      <small>{slot.capacity} plaza(s) · {slot.active?"Disponible":"Inactivo"}</small>
     </div><Clock3 size={18}/></article>)}</div>
   </>:<>
    {!useSharedHeader?<button type="button" className={styles.subBack} onClick={()=>setView("home")}>
     <ArrowLeft size={16}/> Servicios</button>:null}
    <div className={styles.heading}><h2>Permisos del agente</h2></div>
    <div className={styles.form}>
     <label className={styles.check}><input type="checkbox" checked={enabled}
      onChange={e=>{setEnabled(e.target.checked);if(!e.target.checked)setAllowConfirm(false);}}/>
      Permitir consultar servicios y atender solicitudes de reserva</label>
     <label className={styles.check}><input type="checkbox" disabled={!enabled} checked={allowConfirm}
      onChange={e=>setAllowConfirm(e.target.checked)}/>
      Autorizar citas confirmadas solo con disponibilidad verificada</label>
     <button type="button" disabled={busy} className={styles.primary} onClick={()=>void savePermissions()}>
      <Save size={16}/> Guardar permisos</button>
     <p className={styles.hint}>La agenda VMV no activa pagos ni calendarios externos.</p>
    </div>
   </>}
  </>:tab==="bookings"?<>
   <div className={styles.heading}><h2>Reservas ({confirmed.length})</h2>
    <button type="button" disabled={busy} onClick={()=>void refresh()}>Actualizar</button></div>
   {confirmed.length===0&&!loading&&!error?<div className={styles.empty}><CalendarClock size={26}/>
    <p>Aún no hay reservas registradas. Configura servicios y horarios para recibir citas.</p>
    <button type="button" className={styles.primary} onClick={()=>{
     setTab("services");setView(eligible.length?"list":"add");
    }}>{eligible.length?"Mis servicios":"Crear servicio"}</button>
   </div>:<div className={styles.items}>{confirmed.map(item=>{
    const summary=bookingSummary(item);
    return <article key={item.id} className={styles.item}><div>
     <strong>{item.customer_name}</strong><small>{summary.service} · {summary.stamp}</small>
     <small>{item.status==="confirmed"?"Confirmada":item.status==="canceled"?"Cancelada":item.status}</small>
    </div><CheckCircle2 size={18}/></article>;
   })}</div>}
  </>:<>
   <div className={styles.heading}><h2>Solicitudes ({pending.length+pendingHuman.length})</h2>
    <button type="button" disabled={busy} onClick={()=>void refresh()}>Actualizar</button></div>
   {!pending.length&&!pendingHuman.length&&!loading&&!error?
    <div className={styles.empty}><UserRoundCheck size={26}/><p>Sin solicitudes pendientes.</p></div>:null}
   <div className={styles.items}>{pending.map(item=>{
    const summary=bookingSummary(item);
    return <article key={item.id} className={styles.item}>
     <div><strong>{item.customer_name}</strong><small>{summary.service} · {summary.stamp}</small>
      <small>Solicitud de reserva · Pendiente de revisión</small></div>
     <UserRoundCheck size={18}/>
    </article>;
   })}{pendingHuman.map(req=><article key={req.id} className={styles.item}>
    <div><strong>Atención humana</strong><small>{req.summary||"Solicita intervención del negocio"}</small>
     <small>{new Date(req.created_at).toLocaleString("es-US")} · {req.status==="new"?"Nueva":"Revisada"}</small></div>
    <button type="button" disabled={busy} onClick={()=>void reviewRequest(req,req.status==="new"?"reviewed":"closed")}>
     {req.status==="new"?"Revisar":"Cerrar"}</button>
   </article>)}</div>
   <p className={styles.hint}>Revisar una solicitud no envía una confirmación al cliente.</p>
  </>}
 </section>;
}
