import {getSupabase} from "@/lib/supabase";
import {parseUsd} from "./commerceStore";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type BusinessService={
 id:string;owner_id:string;business_id:string;name:string;description:string;
 price_cents:number|null;currency:"usd";image_path:string|null;
 approved:boolean;active:boolean;updated_at:string;
};
export type ServiceDraft={
 name:string;description:string;price:string;image_path:string;approved:boolean;active:boolean;
};
async function authorized(businessId:string){
 if(!uuid.test(businessId))throw Error("Selecciona un negocio válido.");
 const db=getSupabase();if(!db)throw Error("Servicio no disponible.");
 const {data,error}=await db.auth.getUser();
 if(error||!data.user||data.user.is_anonymous)throw Error("Inicia sesión para gestionar servicios.");
 const owner=data.user.id;
 const {data:business,error:businessError}=await db.from("vmv_ai_businesses")
  .select("id").eq("id",businessId).eq("owner_id",owner).maybeSingle();
 if(businessError||!business)throw Error("Este negocio no está disponible en tu cuenta.");
 return {db,owner};
}
export async function listBusinessServices(businessId:string):Promise<BusinessService[]>{
 const {db,owner}=await authorized(businessId);
 const {data,error}=await db.from("vmv_ai_services").select("*")
  .eq("owner_id",owner).eq("business_id",businessId)
  .order("name",{ascending:true}).limit(100);
 if(error)throw Error("No se pudo abrir el catálogo de servicios.");
 return (data||[]) as BusinessService[];
}
export async function saveBusinessService(
 businessId:string,draft:ServiceDraft,prior:BusinessService|null
):Promise<void>{
 const {db,owner}=await authorized(businessId);
 if(prior&&(prior.owner_id!==owner||prior.business_id!==businessId))
  throw Error("El servicio pertenece a otro negocio.");
 const name=draft.name.trim().slice(0,120);
 if(!name)throw Error("Escribe el nombre del servicio.");
 const amount=draft.price.trim()?parseUsd(draft.price):null;
 if(draft.price.trim()&&amount===null)throw Error("El precio debe ser válido en USD.");
 const photo=draft.image_path.trim();
 if(photo&&(!photo.startsWith(owner+"/"+businessId+"/")||
  !/^[a-f0-9-]{36}\.(jpg|png|webp)$/i.test(photo.slice((owner+"/"+businessId+"/").length))))
  throw Error("La fotografía debe pertenecer al negocio.");
 const patch={
  owner_id:owner,business_id:businessId,name,description:draft.description.trim().slice(0,700),
  price_cents:amount,currency:"usd",image_path:photo||null,
  approved:draft.approved,active:draft.active,updated_at:new Date().toISOString()
 };
 if(prior){
  const {data,error}=await db.from("vmv_ai_services")
   .update(patch).eq("id",prior.id).eq("owner_id",owner)
   .eq("business_id",businessId).eq("updated_at",prior.updated_at)
   .select("id").maybeSingle();
  if(error)throw Error("No se pudo actualizar el servicio.");
  if(!data)throw Error("El servicio cambió en otro dispositivo. Actualiza la lista.");
 }else{
  const {error}=await db.from("vmv_ai_services").insert(patch);
  if(error)throw Error("No se pudo añadir el servicio.");
 }
}
