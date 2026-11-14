import {getSupabase} from "@/lib/supabase";
import type {WizardDraft} from "./AgentSetupWizard";

export type PersistedAgent=WizardDraft&{
 id:string;revision:number;status:"draft"|"active"|"paused";owner_id:string;
 updated_at:string;business_id:string;
};
export type PhoneSelection={routeId:string;agentId:string|null;maskedNumber:string;serverEnrolled:boolean};
type DbAgent={
 id:string;revision:number;owner_id:string;business_id:string;name:string;kind:WizardDraft["kind"];
 purpose:string;personality:string;language:"es"|"en"|"both";
 instructions:string;knowledge:string;configuration:Record<string,string>;
 status:PersistedAgent["status"];updated_at:string;
};
const types=["calls","support","sales","bookings","inventory","operations","custom"];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function makeClient(){
 const client=getSupabase();
 if(!client)throw Error("No se pudo conectar con Supabase.");
 return client;
}
async function currentUser(){
 const client=makeClient();
 const {data,error}=await client.auth.getUser();
 if(error||!data.user||data.user.is_anonymous)throw Error("Inicia sesión en VMV para guardar tus agentes.");
 return {client,user:data.user};
}
function language(value:string):"es"|"en"|"both"{
 if(["en","English","Inglés"].includes(value))return "en";
 if(["both","Bilingüe","Bilingual"].includes(value))return "both";
 return "es";
}
function wizardLanguage(value:string){return value==="en"?"English":value==="both"?"Bilingüe":"Español";}
function asAgent(row:DbAgent):PersistedAgent{
 return {
  id:row.id,revision:row.revision||1,owner_id:row.owner_id,business_id:row.business_id,
  name:row.name,kind:row.kind,purpose:row.purpose,personality:row.personality,
  language:wizardLanguage(row.language),instructions:row.instructions||"",
  knowledge:row.knowledge||"",setup:row.configuration||{},status:row.status,updated_at:row.updated_at
 };
}
function normalized(input:WizardDraft){
 if(!types.includes(input.kind)||!input.name.trim())throw Error("Completa el nombre y tipo del agente.");
 const configuration=Object.fromEntries(Object.entries(input.setup||{})
  .filter(([k,v])=>/^[a-z0-9_]{1,50}$/i.test(k)&&typeof v==="string")
  .slice(0,80).map(([k,v])=>[k,v.slice(0,500)]));
 return {
  name:input.name.trim().slice(0,80),kind:input.kind,
  purpose:input.purpose.trim().slice(0,240),
  personality:(input.personality.trim()||"Amable y profesional").slice(0,60),
  language:language(input.language),
  instructions:input.instructions.trim().slice(0,2500),
  knowledge:input.knowledge.trim().slice(0,8000),configuration
 };
}
export async function loadAgents(){
 const {client,user}=await currentUser();
 const {data,error}=await client.from("vmv_ai_agents").select("*")
   .eq("owner_id",user.id).order("updated_at",{ascending:false}).limit(75);
 if(error)throw Error("No fue posible consultar los agentes guardados.");
 return (data||[]).map(r=>asAgent(r as DbAgent));
}
async function ensureBusiness(){
 const {client,user}=await currentUser();
 const {data:existing,error:lookupError}=await client.from("vmv_ai_businesses")
   .select("id").eq("owner_id",user.id).maybeSingle();
 if(lookupError)throw Error("No se pudo consultar tu negocio.");
 if(existing?.id)return {client,user,businessId:existing.id as string};
 const {data:created,error:insertError}=await client.from("vmv_ai_businesses")
  .insert({owner_id:user.id,name:"Mi negocio"}).select("id").single();
 if(created?.id)return {client,user,businessId:created.id as string};
 const {data:race}=await client.from("vmv_ai_businesses").select("id")
  .eq("owner_id",user.id).maybeSingle();
 if(race?.id)return {client,user,businessId:race.id as string};
 throw Error(insertError?.message?"No fue posible crear el negocio.":"Espacio del negocio no disponible.");
}
export async function storeAgent(input:WizardDraft,previous?:PersistedAgent|null):Promise<PersistedAgent>{
 const {client,user,businessId}=await ensureBusiness();
 const values=normalized(input);
 if(previous&&uuid.test(previous.id)){
  // Optimistic write prevents another device from silently overwriting edits.
  const {data,error}=await client.from("vmv_ai_agents").update(values)
   .eq("id",previous.id).eq("owner_id",user.id).eq("revision",previous.revision)
   .select("*").maybeSingle();
  if(error)throw Error("No se pudo guardar. Revisa tu conexión y vuelve a intentarlo.");
  if(!data)throw Error("Este agente cambió en otro dispositivo. Regresa a la lista y vuelve a cargar antes de editar.");
  return asAgent(data as DbAgent);
 }
 const {data,error}=await client.from("vmv_ai_agents")
  .insert({...values,owner_id:user.id,business_id:businessId,status:"draft"})
  .select("*").single();
 if(error||!data)throw Error("No se pudo crear el agente. Comprueba el estado de tu sesión.");
 return asAgent(data as DbAgent);
}
export async function setStudyStatus(agent:PersistedAgent,status:PersistedAgent["status"]){
 const {client,user}=await currentUser();
 const {data,error}=await client.from("vmv_ai_agents").update({status})
  .eq("id",agent.id).eq("revision",agent.revision).eq("owner_id",user.id)
  .select("*").maybeSingle();
 if(error)throw Error("No fue posible cambiar el estado.");
 if(!data)throw Error("El agente fue modificado en otro dispositivo. Actualiza la lista.");
 return asAgent(data as DbAgent);
}
const mask=(n:string)=>n.startsWith("+")?"••• "+n.slice(-4):"••••";
export async function loadPhoneSelection():Promise<PhoneSelection|null>{
 const {client,user}=await currentUser();
 const {data:routes,error}=await client.from("smartjob_phone_routes")
  .select("id,twilio_number").eq("user_id",user.id).eq("enabled",true).limit(2);
 if(error||!routes?.length)return null;
 if(routes.length!==1)throw Error("Esta cuenta tiene más de una línea: la selección requiere identificar el número exacto.");
 const route=routes[0];
 const {data:selected,error:selectionError}=await client.from("vmv_ai_phone_selections")
  .select("agent_id").eq("route_id",route.id).eq("owner_id",user.id).maybeSingle();
 if(selectionError)throw Error("No fue posible leer la selección telefónica.");
 const {data:bindings}=await client.from("vmv_ai_voice_routes").select("agent_id,enabled,verified_ownership")
  .eq("owner_id",user.id).eq("twilio_number",route.twilio_number).maybeSingle();
 return {
  routeId:String(route.id),
  maskedNumber:mask(String(route.twilio_number)),
  agentId:selected?.agent_id||null,
  serverEnrolled:!!(bindings?.enabled&&bindings?.verified_ownership&&bindings.agent_id===selected?.agent_id)
 };
}
export async function selectPhoneAgent(routeId:string,agent:PersistedAgent|null){
 const {client,user}=await currentUser();
 if(!uuid.test(routeId))throw Error("Línea no válida.");
 // Verify owner and exact line before a write, then let RLS revalidate.
 const {data:route}=await client.from("smartjob_phone_routes")
  .select("id").eq("id",routeId).eq("user_id",user.id).eq("enabled",true).maybeSingle();
 if(!route)throw Error("La línea no pertenece a esta cuenta o no está habilitada.");
 if(!agent){
  const {error}=await client.from("vmv_ai_phone_selections").delete()
   .eq("route_id",routeId).eq("owner_id",user.id);
  if(error)throw Error("No fue posible quitar la selección.");
  return;
 }
 if(!uuid.test(agent.id)||agent.owner_id!==user.id)throw Error("El agente no pertenece a tu cuenta.");
 const {data:verified}=await client.from("vmv_ai_agents").select("id")
  .eq("id",agent.id).eq("owner_id",user.id).maybeSingle();
 if(!verified)throw Error("No tienes acceso a ese agente.");
 const {error}=await client.from("vmv_ai_phone_selections")
  .upsert({route_id:routeId,owner_id:user.id,agent_id:agent.id,selected_at:new Date().toISOString()},
   {onConflict:"route_id"});
 if(error)throw Error("No se pudo guardar la selección telefónica.");
}
