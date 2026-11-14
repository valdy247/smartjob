import type {Session} from "@supabase/supabase-js";
import {supabase} from "./session";
const db=()=>{if(!supabase)throw Error("Supabase no está disponible.");return supabase;};
const uuid=/^[0-9a-f-]{36}$/i;
export const timeZones=["America/New_York","America/Chicago","America/Denver",
 "America/Los_Angeles","America/Phoenix","America/Anchorage",
 "Pacific/Honolulu","America/Puerto_Rico"];
export type BookingService={
 id:string;owner_id:string;business_id:string;name:string;description:string;
 duration_minutes:number;price_cents:number|null;approved:boolean;active:boolean;
 auto_confirm:boolean;time_zone:string;updated_at:string;
};
export type BookingSlot={
 id:string;owner_id:string;business_id:string;service_id:string;
 start_at:string;end_at:string;capacity:number;active:boolean;
};
export type Booking={
 id:string;owner_id:string;service_id:string;slot_id:string;agent_id:string;
 customer_name:string;status:"requested"|"confirmed"|"canceled";
 source:string;created_at:string;
};
export type ServiceDraft={
 name:string;description:string;duration_minutes:number;price:string;
 approved:boolean;active:boolean;auto_confirm:boolean;time_zone:string;
};
const validPrice=(s:string)=>{
 if(!s.trim())return null;
 if(!/^(0|[1-9]\d{0,4})(\.\d{1,2})?$/.test(s.trim()))throw Error("Precio inválido. Ejemplo: 25.00");
 const [whole,part=""]=s.split(".");return Number(whole)*100+Number(part.padEnd(2,"0"));
};
export async function bookingOverview(session:Session,businessId:string){
 if(!uuid.test(businessId))throw Error("Negocio inválido");
 const owner=session.user.id;
 const [services,slots,bookings]=await Promise.all([
  db().from("vmv_ai_booking_services").select("*").eq("business_id",businessId)
   .eq("owner_id",owner).order("name").limit(80),
  db().from("vmv_ai_booking_slots").select("*").eq("business_id",businessId)
   .eq("owner_id",owner).gt("start_at",new Date().toISOString())
   .order("start_at").limit(100),
  db().from("vmv_ai_bookings").select("*").eq("business_id",businessId)
   .eq("owner_id",owner).order("created_at",{ascending:false}).limit(80)
 ]);
 if(services.error||slots.error||bookings.error)throw Error("No se pudo cargar la agenda del negocio.");
 return {services:(services.data||[]) as BookingService[],
  slots:(slots.data||[]) as BookingSlot[],
  bookings:(bookings.data||[]) as Booking[]};
}
export async function saveBookingService(session:Session,businessId:string,
 draft:ServiceDraft,previous?:BookingService|null){
 if(!uuid.test(businessId))throw Error("Negocio inválido.");
 const name=draft.name.trim();
 if(name.length<2||name.length>120)throw Error("Escribe el nombre del servicio.");
 if(!Number.isInteger(draft.duration_minutes)||draft.duration_minutes<15||
  draft.duration_minutes>240)throw Error("Duración entre 15 y 240 minutos.");
 if(!timeZones.includes(draft.time_zone))throw Error("Zona horaria no válida.");
 const values={owner_id:session.user.id,business_id:businessId,
  name,description:draft.description.trim().slice(0,700),
  duration_minutes:draft.duration_minutes,price_cents:validPrice(draft.price),currency:"usd",
  approved:draft.approved,active:draft.active,auto_confirm:draft.auto_confirm,
  time_zone:draft.time_zone,updated_at:new Date().toISOString()};
 if(previous){
  if(previous.business_id!==businessId||previous.owner_id!==session.user.id)throw Error("Servicio no autorizado.");
  const {data,error}=await db().from("vmv_ai_booking_services").update(values)
   .eq("id",previous.id).eq("owner_id",session.user.id)
   .eq("updated_at",previous.updated_at).select("id").maybeSingle();
  if(error)throw Error("No se pudo actualizar el servicio o tiene horarios incompatibles.");
  if(!data)throw Error("El servicio cambió en otro dispositivo. Recarga primero.");
 }else{
  const {error}=await db().from("vmv_ai_booking_services").insert(values);
  if(error)throw Error("No se pudo guardar el servicio.");
 }
}
export async function addBookingSlot(session:Session,service:BookingService,
 day:string,time:string,capacity:number){
 if(service.owner_id!==session.user.id||!uuid.test(service.id))throw Error("Servicio no autorizado.");
 const {data,error}=await db().rpc("vmv_ai_owner_add_booking_slot",{
  p_service_id:service.id,p_date:day,p_time:time,p_capacity:capacity
 });
 if(error||typeof data!=="string")throw Error("Horario inválido, en el pasado, duplicado o superpuesto. Comprueba la zona horaria.");
 return data;
}
export function serviceTime(iso:string,zone:string){
 try{return new Intl.DateTimeFormat("es-US",{
  timeZone:zone,dateStyle:"medium",timeStyle:"short"}).format(new Date(iso));}
 catch{return "Zona horaria inválida";}
}
