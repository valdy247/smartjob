import type {Session} from "@supabase/supabase-js";
import {supabase} from "./session";
import {BUSINESS_CATEGORIES} from "../../lib/vmv-business-categories";
import type {AgentDraft} from "./aiAgentsData";

export type NativeCentralBusiness={
 id:string;owner_id:string;name:string;category_id:string;description:string|null;
 city:string;region:string;country:string;service_areas:string;
 website_url:string|null;hours_enabled:boolean;hours:unknown;updated_at:string;
};
export type NativeAiWorkspace={
 id:string;owner_id:string;name:string;central_business_id:string|null;primary_agent_id:string|null;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const database=()=>{if(!supabase)throw Error("Supabase no está disponible.");return supabase;};
export async function centralChoices(session:Session):Promise<{
 businesses:NativeCentralBusiness[];workspaces:NativeAiWorkspace[]
}>{
 const owner=session.user.id;
 const [profiles,work]=await Promise.all([
  database().from("vmv_marketing_businesses")
   .select("id,owner_id,name,category_id,description,city,region,country,service_areas,website_url,hours_enabled,hours,updated_at")
   .eq("owner_id",owner).order("created_at",{ascending:false}).limit(80),
  database().from("vmv_ai_businesses").select("id,owner_id,name,central_business_id,primary_agent_id")
   .eq("owner_id",owner).limit(80)
 ]);
 if(profiles.error||work.error)throw Error("No se pudieron cargar los negocios de VMV.");
 return {businesses:(profiles.data||[]) as NativeCentralBusiness[],
  workspaces:(work.data||[]) as NativeAiWorkspace[]};
}
export async function provisionWorkspace(session:Session,centralId:string):Promise<string>{
 if(!uuid.test(centralId))throw Error("Negocio inválido.");
 const {data,error}=await database().rpc("vmv_ai_workspace_for_central_business",{
  p_central_business_id:centralId
 });
 if(error||typeof data!=="string"||!uuid.test(data))
  throw Error("No pudimos preparar el negocio que seleccionaste.");
 return data;
}
export async function linkLegacyAgentWorkspace(session:Session,workspaceId:string,centralId:string){
 if(!uuid.test(workspaceId)||!uuid.test(centralId))throw Error("Negocio inválido.");
 const {data,error}=await database().rpc("vmv_ai_link_existing_workspace",{
  p_workspace_id:workspaceId,p_central_business_id:centralId
 });
 if(error||data!==true)throw Error("No se pudo vincular. Revisa que ambos negocios sean tuyos.");
}
const hoursKeys=["mon","tue","wed","thu","fri","sat","sun"] as const;
const validTime=(v:unknown):v is string=>typeof v==="string"&&
 /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
export function prefillNativeAgent(b:NativeCentralBusiness,input:AgentDraft):AgentDraft{
 const additional:Record<string,string>={
  central_business_id:b.id,central_source_updated_at:b.updated_at,
  business_name:b.name,
  ...(b.category_id&&b.category_id!=="other"?{
   industry:BUSINESS_CATEGORIES.find(x=>x.id===b.category_id)?.label||b.category_id
  }:{}),
  ...(b.country==="US"?{country:"Estados Unidos"}:{}),
  ...(b.city?{city:b.city}:{}),
  ...(b.region?{state:b.region}:{}),
  ...(b.description?{business_description:b.description.slice(0,500)}:{}),
  ...(b.service_areas?{service_areas:b.service_areas.slice(0,500)}:{}),
  ...(b.website_url?.startsWith("https://")?{website:b.website_url.slice(0,500)}:{})
 };
 if(b.hours_enabled&&Array.isArray(b.hours)&&b.hours.length===7){
  for(let i=0;i<7;i++){
   const rec=b.hours[i] as {closed?:unknown;start?:unknown;end?:unknown}|null;
   if(!rec||typeof rec.closed!=="boolean")continue;
   const key=hoursKeys[i];
   if(rec.closed){
    additional["h_"+key+"_active"]="No";
    additional["h_"+key+"_open"]="09:00";
    additional["h_"+key+"_close"]="17:00";
   }else if(validTime(rec.start)&&validTime(rec.end)&&rec.start!==rec.end){
    additional["h_"+key+"_active"]="Sí";
    additional["h_"+key+"_open"]=rec.start;
    additional["h_"+key+"_close"]=rec.end;
   }
  }
  additional.hours_mode="Personalizado";
 }
 const config={...input.configuration};
 const prefilled:string[]=[];
 for(const [key,value] of Object.entries(additional)){
  if(key.startsWith("central_")||!config[key]?.trim()){
   config[key]=value;
   if(!key.startsWith("central_")&&!key.startsWith("h_")&&key!=="hours_mode")
    prefilled.push(key);
  }
 }
 if(additional.hours_mode&&hoursKeys.every(key=>config["h_"+key+"_active"]))prefilled.push("hours");
 config.central_prefill_fields=prefilled.join("|");
 return {...input,configuration:config};
}

/** The principal identity is separate from the active Twilio phone selection. */
export async function chooseNativePrincipal(
 session:Session,workspaceId:string,agentId:string|null,expectedId:string|null
):Promise<void>{
 if(!uuid.test(workspaceId)||(agentId!==null&&!uuid.test(agentId))||
    (expectedId!==null&&!uuid.test(expectedId)))throw Error("Selección de agente inválida.");
 const {data,error}=await database().rpc("vmv_ai_select_primary_agent",{
  p_workspace_id:workspaceId,p_agent_id:agentId,p_expected_id:expectedId
 });
 if(error||data!==true)throw Error("El agente principal cambió o pertenece a otro negocio. Actualiza la pantalla.");
}
