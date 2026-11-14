import {getSupabase} from "@/lib/supabase";
import {BUSINESS_CATEGORIES} from "@/lib/vmv-business-categories";
import type {WizardDraft} from "./AgentSetupWizard";

export type CentralBusiness={
 id:string;owner_id:string;name:string;category_id:string;description:string|null;
 city:string;region:string;country:string;service_areas:string;
 website_url:string|null;booking_url:string;
 address_visibility:"private"|"public";hours_enabled:boolean;
 hours:unknown;phone:string;updated_at:string;
};
export type AiWorkspace={id:string;owner_id:string;name:string;central_business_id:string|null;primary_agent_id:string|null};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function authorized(){
 const db=getSupabase();if(!db)throw Error("No se pudo conectar con VMV.");
 const {data,error}=await db.auth.getUser();
 if(error||!data.user||data.user.is_anonymous)throw Error("Tu cuenta no está disponible.");
 return {db,owner:data.user.id};
}
/** The central Marketing business is authoritative. Never read administrative notes,
 * street/unit/postal or legal name into the phone agent knowledge. */
export async function loadBusinessChoices():Promise<{
 businesses:CentralBusiness[];workspaces:AiWorkspace[];owner:string;
}>{
 const {db,owner}=await authorized();
 const [central,legacy]=await Promise.all([
  db.from("vmv_marketing_businesses")
   .select("id,owner_id,name,category_id,description,city,region,country,service_areas,website_url,booking_url,address_visibility,hours_enabled,hours,phone,updated_at")
   .eq("owner_id",owner).order("created_at",{ascending:false}).limit(80),
  db.from("vmv_ai_businesses").select("id,owner_id,name,central_business_id,primary_agent_id")
   .eq("owner_id",owner).limit(80)
 ]);
 if(central.error||legacy.error)throw Error("No se pudieron consultar los negocios de tu cuenta.");
 return {businesses:(central.data||[]) as CentralBusiness[],
  workspaces:(legacy.data||[]) as AiWorkspace[],owner};
}
export async function provisionAiWorkspace(centralId:string):Promise<string>{
 if(!uuid.test(centralId))throw Error("Selecciona un negocio válido.");
 const {db}=await authorized();
 const {data,error}=await db.rpc("vmv_ai_workspace_for_central_business",{
  p_central_business_id:centralId
 });
 if(error||typeof data!=="string"||!uuid.test(data))
  throw Error("No se pudo preparar ese negocio. Actualiza la lista y revisa tu acceso.");
 return data;
}
export async function linkLegacyWorkspace(workspaceId:string,centralId:string):Promise<void>{
 if(!uuid.test(workspaceId)||!uuid.test(centralId))throw Error("Negocio no válido.");
 const {db}=await authorized();
 const {data,error}=await db.rpc("vmv_ai_link_existing_workspace",{
  p_workspace_id:workspaceId,p_central_business_id:centralId
 });
 if(error||data!==true)throw Error("No se pudo vincular. Comprueba que ambos negocios sean tuyos y no estén vinculados.");
}
const hoursKeys=["mon","tue","wed","thu","fri","sat","sun"] as const;
const timeOk=(s:unknown):s is string=>typeof s==="string"&&/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(s);
/** Only documented public-facing Marketing fields. No private address or phone,
 * even when they exist in the owner's account, without separate disclosure approval. */
export function centralPrefill(b:CentralBusiness,input:WizardDraft):WizardDraft{
 const additions:Record<string,string>={
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
  ...(b.website_url&&/^https:\/\//i.test(b.website_url)?{website:b.website_url.slice(0,500)}:{})
 };
 // Marketing stores hours Monday-first in an array of {closed,start,end}.
 if(b.hours_enabled&&Array.isArray(b.hours)&&b.hours.length===7){
  for(let i=0;i<7;i++){
   const record=b.hours[i] as Record<string,unknown>|null;
   if(!record||typeof record.closed!=="boolean")continue;
   const key=hoursKeys[i];
   if(record.closed){
    additions["h_"+key+"_active"]="No";
    additions["h_"+key+"_open"]="09:00";
    additions["h_"+key+"_close"]="17:00";
   }else if(timeOk(record.start)&&timeOk(record.end)&&record.start!==record.end){
    additions["h_"+key+"_active"]="Sí";
    additions["h_"+key+"_open"]=record.start;
    additions["h_"+key+"_close"]=record.end;
   }
  }
  additions.hours_mode="Personalizado";
 }
 const setup={...input.setup};
 const fromCentral:string[]=[];
 for(const [key,value] of Object.entries(additions)){
  if(key==="central_business_id"||key==="central_source_updated_at"||!setup[key]?.trim()){
   setup[key]=value;
   if(!key.startsWith("central_")&&key!=="hours_mode"&&!key.startsWith("h_"))
    fromCentral.push(key);
  }
 }
 if(additions.hours_mode&&hoursKeys.every(k=>setup["h_"+k+"_active"]))
  fromCentral.push("hours");
 setup.central_prefill_fields=fromCentral.join("|");
 return {...input,setup};
}
export function businessMissing(b:CentralBusiness):string[]{
 const missing:string[]=[];
 if(!b.name.trim())missing.push("Nombre comercial");
 if(!b.description?.trim())missing.push("Descripción");
 if(!b.city.trim())missing.push("Ciudad");
 if(!b.region.trim())missing.push("Estado o región");
 if(!b.hours_enabled)missing.push("Horarios");
 return missing;
}

/** Explicit, owner-authorized choice; never changes vmv_ai_phone_selections. */
export async function choosePrincipalAgent(
 workspaceId:string,agentId:string|null,expectedId:string|null
):Promise<void>{
 if(!uuid.test(workspaceId)||(agentId!==null&&!uuid.test(agentId))||
    (expectedId!==null&&!uuid.test(expectedId)))throw Error("Selección de agente inválida.");
 const {db}=await authorized();
 const {data,error}=await db.rpc("vmv_ai_select_primary_agent",{
  p_workspace_id:workspaceId,p_agent_id:agentId,p_expected_id:expectedId
 });
 if(error||data!==true)throw Error("El agente principal cambió o no pertenece a este negocio. Actualiza la lista.");
}
