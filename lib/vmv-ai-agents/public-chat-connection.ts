import type {SupabaseClient} from "@supabase/supabase-js";
import {resolveInventoryForPublishedSite} from "@/lib/vmv-ai-agents/site-inventory-resolution";

export type PublicChatAgent={
 id:string;owner_id:string;business_id:string;name:string;kind:string;purpose:string;
 personality:string;language:string;instructions:string;knowledge:string;
 configuration:Record<string,string>;business_name:string;
};

/** Returns only the owner's selected, active and explicitly opted-in agent.
 * Linking inventory to the website never grants AI chat permission by itself.
 */
export async function findPublicChatAgent(db:SupabaseClient,
 site:{site_id:string;owner_id:string;site_name:string}
):Promise<PublicChatAgent|null>{
 const businessId=await resolveInventoryForPublishedSite(
  db,site.site_id,site.owner_id,site.site_name);
 if(!businessId)return null;
 const {data:business,error:businessError}=await db.from("vmv_ai_businesses")
  .select("id,name,primary_agent_id").eq("id",businessId)
  .eq("owner_id",site.owner_id).maybeSingle();
 if(businessError||!business?.primary_agent_id)return null;
 const {data:agent,error}=await db.from("vmv_ai_agents")
  .select("id,owner_id,business_id,name,kind,purpose,personality,language,instructions,knowledge,configuration,status")
  .eq("id",business.primary_agent_id).eq("owner_id",site.owner_id)
  .eq("business_id",businessId).maybeSingle();
 if(error||!agent||agent.status!=="active"||
  (agent.configuration as Record<string,string>|null)?.cap_chat!=="Sí")return null;
 return {...agent,configuration:agent.configuration as Record<string,string>,
  business_name:String(business.name)} as PublicChatAgent;
}
