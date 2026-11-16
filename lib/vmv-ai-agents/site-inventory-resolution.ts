import type {SupabaseClient} from "@supabase/supabase-js";

/** Shared by published rendering and the public revision endpoint.
 * Never mutate a site. Prefer the owner's explicit choice; otherwise match
 * exactly one inventory workspace by canonical business name and owner.
 * Ambiguous or missing matches fail closed instead of exposing another catalog.
 */
export async function resolveInventoryForPublishedSite(
 db:SupabaseClient,
 siteId:string,ownerId:string,siteName:string
):Promise<string|null>{
 const {data:site,error}=await db.from("smartjob_builder_sites")
  .select("inventory_business_id").eq("id",siteId).eq("owner_id",ownerId).maybeSingle();
 if(error||!site)return null;
 if(site.inventory_business_id){
  const {data:authorized,error:authError}=await db.from("vmv_ai_businesses")
   .select("id").eq("id",site.inventory_business_id)
   .eq("owner_id",ownerId).maybeSingle();
  return !authError&&authorized?String(authorized.id):null;
 }
 const normalized=siteName.trim().normalize("NFKC").toLocaleLowerCase("en-US");
 if(!normalized||normalized.length>140)return null;
 const {data:businesses,error:matchError}=await db.from("vmv_ai_businesses")
  .select("id,name").eq("owner_id",ownerId).limit(100);
 if(matchError||!businesses||businesses.length===100)return null;
 const matches=businesses.filter(b=>typeof b.name==="string"&&
  b.name.trim().normalize("NFKC").toLocaleLowerCase("en-US")===normalized);
 return matches.length===1?String(matches[0].id):null;
}
