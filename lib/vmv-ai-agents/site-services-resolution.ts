import type {SupabaseClient} from "@supabase/supabase-js";

/** A public website can access only its owner's explicitly enabled service catalog. */
export async function resolveServicesForPublishedSite(
 db:SupabaseClient,siteId:string,ownerId:string
):Promise<string|null>{
 const {data:site,error}=await db.from("smartjob_builder_sites")
  .select("services_business_id,services_connection_enabled")
  .eq("id",siteId).eq("owner_id",ownerId).maybeSingle();
 if(error||!site||site.services_connection_enabled!==true||!site.services_business_id)return null;
 const {data:business,error:businessError}=await db.from("vmv_ai_businesses")
  .select("id").eq("id",site.services_business_id).eq("owner_id",ownerId).maybeSingle();
 return business&&!businessError?String(business.id):null;
}
