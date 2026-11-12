import type {Session} from "@supabase/supabase-js";
import type React from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {api,supabase} from "./session";
import {inspectAgent} from "./aiAgentQuality";

export type AgentKind="calls"|"support"|"sales"|"bookings"|"inventory"|"operations"|"custom";
export type AgentStatus="draft"|"active"|"paused";
export type Language="es"|"en"|"both";
export type AgentDraft={
  name:string;kind:AgentKind;purpose:string;personality:string;
  language:Language;instructions:string;knowledge:string;configuration:Record<string,string>;status:AgentStatus;
};
export type Agent=AgentDraft&{
  id:string;owner_id:string;business_id:string;created_at:string;updated_at:string;revision:number;
};
export type AgentConversation={id:string;agent_id:string;owner_id:string;title:string;created_at:string};
export type AgentMessage={id:string;role:"user"|"assistant";content:string;created_at:string};
type Ico=React.ComponentProps<typeof Ionicons>["name"];
export const AI_AGENT_TEMPLATES:{kind:AgentKind;title:string;subtitle:string;purpose:string;icon:Ico;bg:string;fg:string}[]=[
  {kind:"calls",title:"Llamadas",subtitle:"Atención telefónica futura",purpose:"Atender llamadas con cortesía y derivar las solicitudes que requieran una persona.",icon:"call-outline",bg:"#EDE3FF",fg:"#7450C7"},
  {kind:"support",title:"Clientes",subtitle:"Consultas y preguntas",purpose:"Responder las preguntas habituales de los clientes sobre el negocio.",icon:"headset-outline",bg:"#DDF8ED",fg:"#217D63"},
  {kind:"sales",title:"Ventas",subtitle:"Productos y servicios",purpose:"Explicar productos y servicios, y descubrir qué necesita cada cliente.",icon:"bag-handle-outline",bg:"#FFF0BF",fg:"#97700F"},
  {kind:"bookings",title:"Reservas",subtitle:"Citas y disponibilidad",purpose:"Informar sobre servicios y el proceso de agendar citas.",icon:"calendar-outline",bg:"#DDEEFE",fg:"#3F77B1"},
  {kind:"inventory",title:"Inventario",subtitle:"Productos y existencias",purpose:"Responder sobre productos e inventario usando la información aprobada.",icon:"cube-outline",bg:"#FFE1ED",fg:"#A34D76"},
  {kind:"operations",title:"Administración",subtitle:"Procesos y solicitudes",purpose:"Orientar sobre procesos internos y organizar solicitudes del negocio.",icon:"briefcase-outline",bg:"#E1F4FF",fg:"#427A9C"},
  {kind:"custom",title:"A mi medida",subtitle:"Tu propio objetivo",purpose:"Ayudar al negocio con un propósito definido por su propietario.",icon:"sparkles-outline",bg:"#F0E7FF",fg:"#784CCB"}
];
export function emptyAgent(kind:AgentKind):AgentDraft{
  const template=AI_AGENT_TEMPLATES.find(t=>t.kind===kind)||AI_AGENT_TEMPLATES[6];
  return {kind,name:template.title==="A mi medida"?"Mi agente":"Agente de "+template.title,
    purpose:template.purpose,personality:"Amable y profesional",language:"es",
    instructions:"",knowledge:"",configuration:{},status:"draft"};
}
function db(){
  if(!supabase)throw new Error("Configura Supabase para utilizar AI Agents.");
  return supabase;
}
export async function getAgents(session:Session):Promise<Agent[]>{
  const {data,error}=await db().from("vmv_ai_agents").select("*")
    .eq("owner_id",session.user.id).order("updated_at",{ascending:false}).limit(50);
  if(error)throw new Error("AI Agents todavía no está habilitado para esta cuenta.");
  return (data||[]) as Agent[];
}
async function ensureBusiness(session:Session):Promise<string>{
  const client=db();
  const {data:existing,error:lookupError}=await client.from("vmv_ai_businesses")
    .select("id").eq("owner_id",session.user.id).maybeSingle();
  if(lookupError)throw new Error("No se pudo consultar tu empresa.");
  if(existing?.id)return existing.id;
  const raw=String(session.user.user_metadata?.business_name||"Mi negocio").trim();
  const {data:created,error:insertError}=await client.from("vmv_ai_businesses")
    .insert({owner_id:session.user.id,name:(raw||"Mi negocio").slice(0,100)})
    .select("id").single();
  if(created?.id)return created.id;
  // Another device may have created the business concurrently.
  const {data:concurrent}=await client.from("vmv_ai_businesses")
    .select("id").eq("owner_id",session.user.id).maybeSingle();
  if(concurrent?.id)return concurrent.id;
  throw new Error(insertError?.message?"No se pudo crear el espacio de tu negocio.":"No se pudo crear tu negocio.");
}
export async function saveAgent(session:Session,draft:AgentDraft,existingId?:string,expectedRevision?:number):Promise<Agent>{
  const normalized={name:draft.name.trim().slice(0,80),kind:draft.kind,
    purpose:draft.purpose.trim().slice(0,240),personality:draft.personality.trim().slice(0,60),
    language:draft.language,instructions:draft.instructions.trim().slice(0,2500),
    knowledge:draft.knowledge.trim().slice(0,8000),configuration:Object.fromEntries(Object.entries(draft.configuration||{}).filter(([key,val])=>key.length<=50&&typeof val==="string").slice(0,60).map(([key,val])=>[key,val.slice(0,500)])),status:draft.status==="active"&&!inspectAgent(draft).requiredPassed?"paused":draft.status,
    updated_at:new Date().toISOString()};
  if(!normalized.name)throw new Error("El agente necesita un nombre.");
  if(existingId){
    const {data,error}=await db().from("vmv_ai_agents").update(normalized)
      .eq("id",existingId).eq("owner_id",session.user.id)
      .eq("revision",expectedRevision??-1).select("*").maybeSingle();
    if(error)throw new Error("No fue posible guardar este agente.");
    if(!data)throw new Error("El agente cambió en otro dispositivo. Vuelve a cargar para evitar sobrescribir.");
    return data as Agent;
  }
  const business_id=await ensureBusiness(session);
  const {data,error}=await db().from("vmv_ai_agents")
    .insert({...normalized,business_id,owner_id:session.user.id}).select("*").single();
  if(error||!data)throw new Error("No fue posible crear el agente.");
  return data as Agent;
}
export async function updateAgentStatus(session:Session,agent:Agent,status:AgentStatus):Promise<Agent>{
  const {data,error}=await db().from("vmv_ai_agents").update({status})
    .eq("id",agent.id).eq("owner_id",session.user.id)
    .eq("revision",agent.revision).select("*").maybeSingle();
  if(error||!data)throw new Error("El estado no se pudo guardar o cambió en otro dispositivo. Actualiza la lista.");
  return data as Agent;
}
export async function getConversations(session:Session,agentId:string):Promise<AgentConversation[]>{
  const {data,error}=await db().from("vmv_ai_conversations").select("*")
    .eq("owner_id",session.user.id).eq("agent_id",agentId)
    .order("created_at",{ascending:false}).limit(30);
  if(error)throw new Error("No se pudo consultar el historial.");
  return (data||[]) as AgentConversation[];
}
export async function createConversation(session:Session,agentId:string,title:string):Promise<string>{
  const {data,error}=await db().from("vmv_ai_conversations")
    .insert({owner_id:session.user.id,agent_id:agentId,title:title.trim().slice(0,90)||"Simulación"})
    .select("id").single();
  if(error||!data?.id)throw new Error("No se pudo comenzar la simulación.");
  return data.id as string;
}
export async function getMessages(session:Session,id:string):Promise<AgentMessage[]>{
  const {data,error}=await db().from("vmv_ai_messages")
    .select("id,role,content,created_at").eq("conversation_id",id).eq("owner_id",session.user.id)
    .order("created_at",{ascending:true}).limit(100);
  if(error)throw new Error("No se pudieron leer los mensajes.");
  return (data||[]) as AgentMessage[];
}
export async function simulateAgent(session:Session,agentId:string,conversationId:string,message:string):Promise<string>{
  // A dedicated preview URL avoids silently calling the live Smart Call backend.
  const agentApi=process.env.EXPO_PUBLIC_VMV_AI_API||api;
  const response=await fetch(agentApi+"/api/vmv/ai-agents/simulate",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
    body:JSON.stringify({agentId,conversationId,message})
  });
  let payload:{reply?:string;error?:string}={};
  try{payload=await response.json();}catch{}
  if(!response.ok)throw new Error(payload.error||"El simulador no está disponible en este despliegue.");
  if(!payload.reply)throw new Error("El agente no devolvió una respuesta.");
  return payload.reply;
}

export type NativePhoneSelection={routeId:string;maskedNumber:string;agentId:string|null;prepared:boolean};
export async function getPhoneSelection(session:Session):Promise<NativePhoneSelection|null>{
 const {data:routes,error}=await db().from("smartjob_phone_routes")
  .select("id,twilio_number").eq("user_id",session.user.id).eq("enabled",true).limit(2);
 if(error||!routes?.length)return null;
 if(routes.length!==1)throw new Error("Hay varias líneas; selecciona un número específico.");
 const route=routes[0];
 const {data:selected,error:pickError}=await db().from("vmv_ai_phone_selections")
  .select("agent_id").eq("route_id",route.id).eq("owner_id",session.user.id).maybeSingle();
 if(pickError)throw new Error("No fue posible leer tu elección telefónica.");
 const {data:provisioned}=await db().from("vmv_ai_voice_routes")
  .select("agent_id,enabled,verified_ownership").eq("owner_id",session.user.id)
  .eq("twilio_number",route.twilio_number).maybeSingle();
 return {routeId:route.id,maskedNumber:"••• "+String(route.twilio_number).slice(-4),
  agentId:selected?.agent_id||null,
  prepared:Boolean(provisioned?.enabled&&provisioned?.verified_ownership&&
   provisioned.agent_id===selected?.agent_id)};
}
export async function choosePhoneAgent(session:Session,routeId:string,agent:Agent|null):Promise<void>{
 const {data:route}=await db().from("smartjob_phone_routes").select("id")
  .eq("id",routeId).eq("user_id",session.user.id).eq("enabled",true).maybeSingle();
 if(!route)throw new Error("Línea no autorizada.");
 if(!agent){
  const {error}=await db().from("vmv_ai_phone_selections").delete()
   .eq("route_id",routeId).eq("owner_id",session.user.id);
  if(error)throw new Error("No se pudo retirar el agente telefónico.");return;
 }
 if(agent.owner_id!==session.user.id)throw new Error("Este agente no pertenece a tu cuenta.");
 const {data:verified}=await db().from("vmv_ai_agents").select("id")
  .eq("id",agent.id).eq("owner_id",session.user.id).maybeSingle();
 if(!verified)throw new Error("Agente no autorizado.");
 const {error}=await db().from("vmv_ai_phone_selections")
  .upsert({route_id:routeId,owner_id:session.user.id,agent_id:agent.id,selected_at:new Date().toISOString()},
   {onConflict:"route_id"});
 if(error)throw new Error("No se pudo guardar la selección telefónica.");
}
