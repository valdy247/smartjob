// AI Agents internal agenda. Server-authoritative slots; no external calendar claims.
import type {SupabaseClient} from "@supabase/supabase-js";
import {askAiAgent} from "@/lib/vmv-ai-agents/model";

type Session={call_sid:string;owner_id:string;agent_id:string;
 agent_snapshot:Record<string,unknown>;
 turns:{role:"user"|"assistant";content:string}[]};
type Service={id:string;business_id:string;name:string;description:string;
 price_cents:number|null;duration_minutes:number;time_zone:string;auto_confirm:boolean};
type Slot={id:string;service_id:string;start_at:string;capacity:number;active:boolean};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const mention=/\b(cita|citas|agenda|agendar|reservar|reserva|reservaci[oó]n|turno|appointment|booking|book|schedule)\b/i;
const acceptance=/^(s[ií]\b|yes\b|confirmo\b|acepto\b|i accept\b|i confirm\b)/i;
const rejects=/^(no\b|not yet\b|cancel\b|cancela\b|todav[ií]a no\b)/i;
const clean=(s:unknown,max=80)=>typeof s==="string"?s.trim().slice(0,max):"";
function when(s:Slot,service:Service,lang:"es"|"en"){
 return new Intl.DateTimeFormat(lang==="es"?"es-US":"en-US",{
  timeZone:service.time_zone,dateStyle:"medium",timeStyle:"short"
 }).format(new Date(s.start_at));
}
function price(service:Service){
 return service.price_cents==null?"precio por confirmar":
  "$"+(service.price_cents/100).toFixed(2)+" USD";
}
export async function phoneBookingTurn(db:SupabaseClient,session:Session,
 speech:string,lang:"es"|"en"):Promise<string|null>{
 const config=(session.agent_snapshot.configuration||{}) as Record<string,string>;
 if(config.cap_bookings!=="Sí")return null;
 const {data:pending}=await db.from("vmv_ai_booking_quotes")
  .select("call_sid,service_id,slot_id,customer_name,expires_at")
  .eq("call_sid",session.call_sid).eq("owner_id",session.owner_id).maybeSingle();
 const hasPending=Boolean(pending&&Date.parse(pending.expires_at)>Date.now());
 if(!hasPending&&!mention.test(speech))return null;
 const {data:agent}=await db.from("vmv_ai_agents").select("business_id")
  .eq("id",session.agent_id).eq("owner_id",session.owner_id).maybeSingle();
 if(!agent)return lang==="es"?"No puedo acceder a la agenda del negocio.":"I cannot access the business schedule.";
 const {data:list,error:serviceError}=await db.from("vmv_ai_booking_services")
  .select("id,business_id,name,description,price_cents,duration_minutes,time_zone,auto_confirm")
  .eq("owner_id",session.owner_id).eq("business_id",agent.business_id)
  .eq("active",true).eq("approved",true).limit(12);
 if(serviceError)return lang==="es"?"No pude verificar la agenda.":"I couldn't check the calendar.";
 const services=(list||[]) as Service[];
 if(!services.length)return lang==="es"?
  "El negocio todavía no tiene horarios aprobados para reservas. Puedo ayudarte con otra consulta.":
  "This business has no approved appointments available yet.";
 const {data:slotList,error:slotError}=await db.from("vmv_ai_booking_slots")
  .select("id,service_id,start_at,capacity,active")
  .eq("owner_id",session.owner_id).eq("business_id",agent.business_id)
  .eq("active",true).in("service_id",services.map(s=>s.id))
  .gt("start_at",new Date(Date.now()+5*60000).toISOString())
  .lt("start_at",new Date(Date.now()+14*86400000).toISOString())
  .order("start_at",{ascending:true}).limit(30);
 if(slotError)return lang==="es"?"No pude confirmar los horarios disponibles.":"I couldn't confirm the available times.";
 const slots=(slotList||[]) as Slot[];
 const {data:existing}=slots.length?await db.from("vmv_ai_bookings")
  .select("slot_id").eq("owner_id",session.owner_id)
  .in("slot_id",slots.map(s=>s.id)).in("status",["requested","confirmed"]):{data:[]};
 const used=new Map<string,number>();
 for(const item of existing||[])used.set(item.slot_id,(used.get(item.slot_id)||0)+1);
 const valid=slots.filter(s=>(used.get(s.id)||0)<s.capacity);
 if(!valid.length)return lang==="es"?
  "No tengo horarios libres confirmados para los próximos catorce días.":
  "There are no verified available slots in the next fourteen days.";
 const prior=Array.isArray(session.turns)?session.turns.filter(x=>x&&
  ["user","assistant"].includes(x.role)&&typeof x.content==="string").slice(-8):[];
 const system=[
  "Extract appointment-booking intent from a real telephone conversation. Return ONLY JSON.",
  'Required JSON: {"action":"list|quote|accept|human|none","service_id":"","slot_id":"","customer_name":""}.',
  "Choose service_id and slot_id ONLY from the supplied verified list. Never invent times, duration or payment.",
  "quote is an offer and pending action. accept only when caller explicitly accepts a previously offered slot.",
  "If a previous quote exists and the caller supplies their name, choose quote again with the same slot and that name.",
  "If no name was spoken, leave customer_name empty. Do not invent a person.",
  "Available confirmed services and slots: "+
   JSON.stringify(services.map(s=>({id:s.id,name:s.name,duration:s.duration_minutes,
    price_cents:s.price_cents,slots:valid.filter(x=>x.service_id===s.id).slice(0,8)
    .map(x=>({id:x.id,date_time:when(x,s,"en"),start_at:x.start_at}))}))),
  "Pending quote: "+JSON.stringify(hasPending?pending:null),
  "Recent dialogue: "+JSON.stringify(prior),
  "If unrelated to bookings choose none."
 ].join("\n");
 let proposal:{action?:string;service_id?:string;slot_id?:string;customer_name?:string};
 try{
  const text=await askAiAgent({system,messages:[{role:"user",content:speech}],
   maxOutputTokens:170,temperature:0,timeoutMs:6800});
  proposal=JSON.parse(text) as typeof proposal;
 }catch{return lang==="es"?"No pude consultar la agenda ahora; debe revisarla una persona.":
  "I couldn't check the calendar right now. A person should review it.";}
 const action=clean(proposal.action,24);
 if(action==="none")return null;
 if(action==="human")return lang==="es"?
  "Te pondremos en contacto con el negocio por su medio oficial para revisar la cita.":
  "Please contact the business directly so a person can review the appointment.";
 if(action==="accept"){
  if(!hasPending||!acceptance.test(speech)||rejects.test(speech))
   return lang==="es"?"Necesito tu aceptación expresa de la hora y las condiciones.":
    "Please explicitly accept the proposed time and terms.";
  if(!pending?.customer_name||pending.customer_name.trim().length<2)
   return lang==="es"?"Antes de confirmar, ¿cuál es tu nombre?":"Before booking, may I have your name?";
  const {data:id,error}=await db.rpc("vmv_ai_phone_booking_accept",{p_call_sid:session.call_sid});
  if(error||!uuid.test(String(id||"")))return lang==="es"?
   "Ese horario ya no está disponible. Podemos revisar otra opción.":
   "That time is no longer available. Let's look for another option.";
  const {data:booking}=await db.from("vmv_ai_bookings").select("id,status")
   .eq("id",id).eq("owner_id",session.owner_id).maybeSingle();
  if(!booking)return lang==="es"?"No se pudo consultar el resultado de la reserva.":
   "I couldn't retrieve the booking status.";
  return booking.status==="confirmed"?(lang==="es"?
   "Tu cita quedó confirmada en la agenda del negocio. No se ha realizado ningún cobro.":
   "Your appointment was confirmed in the business calendar. No payment was made."):
   (lang==="es"?"El negocio recibió tu solicitud de reserva y debe confirmarla. Todavía no está confirmada ni pagada.":
    "Your appointment request was saved for the business to review. It is not yet confirmed or paid.");
 }
 if(action==="list"){
  const options=services.flatMap(s=>valid.filter(slot=>slot.service_id===s.id).slice(0,2)
   .map(slot=>s.name+", "+when(slot,s,lang))).slice(0,4);
  return (lang==="es"?"Horarios disponibles verificados: ":"Verified available times: ")+
   options.join("; ")+".";
 }
 if(action==="quote"){
  const service=services.find(s=>s.id===proposal.service_id),slot=valid.find(s=>s.id===proposal.slot_id);
  if(!service||!slot||slot.service_id!==service.id)return lang==="es"?
   "Necesito elegir un horario de la agenda antes de reservar.":
   "We need to select a verified calendar time.";
  const name=clean(proposal.customer_name,80);
  const {data:ok,error}=await db.rpc("vmv_ai_phone_booking_quote",{
   p_call_sid:session.call_sid,p_service:service.id,p_slot:slot.id,p_customer_name:name
  });
  if(error||ok!==true)return lang==="es"?"Ese horario ya no está disponible.":"That time is no longer available.";
  return lang==="es"?
   "Puedo solicitar "+service.name+" el "+when(slot,service,lang)+
   ", duración "+service.duration_minutes+" minutos, "+price(service)+
   ". "+(name?"¿Aceptas esta cita y sus condiciones?":"¿A nombre de quién preparo la reserva?"):
   "I can offer "+service.name+" on "+when(slot,service,lang)+
   ", "+service.duration_minutes+" minutes, "+price(service)+
   ". "+(name?"Do you accept this appointment and its terms?":"May I have your name for the booking?");
 }
 return null;
}
