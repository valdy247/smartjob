import type {SupabaseClient} from "@supabase/supabase-js";
import {BUSINESS_CATEGORIES} from "@/lib/vmv-business-categories";

export type PublicCentralBusiness={
 id:string;name:string;category_id:string;description:string|null;
 country:string;city:string;region:string;service_areas:string;
 website_url:string|null;booking_url:string;hours_enabled:boolean;
 hours:unknown;updated_at:string;
};
const days=["mon","tue","wed","thu","fri","sat","sun"] as const;
const validTime=(s:unknown):s is string=>
 typeof s==="string"&&/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(s);
/** Marketing hours are Monday-first. Never infer open hours if the field is absent. */
export function publicMarketingWeek(central:Pick<PublicCentralBusiness,"hours_enabled"|"hours">):
 Record<string,string>|null{
 if(!central.hours_enabled||!Array.isArray(central.hours)||central.hours.length!==7)return null;
 const mapped:Record<string,string>={};
 for(let i=0;i<7;i++){
  const row=central.hours[i] as {closed?:unknown;start?:unknown;end?:unknown}|null;
  if(!row||typeof row.closed!=="boolean")return null;
  const key=days[i];
  mapped["h_"+key+"_active"]=row.closed?"No":"Sí";
  if(row.closed){
   mapped["h_"+key+"_open"]="09:00";mapped["h_"+key+"_close"]="17:00";
  }else{
   if(!validTime(row.start)||!validTime(row.end)||row.start===row.end)return null;
   mapped["h_"+key+"_open"]=row.start;mapped["h_"+key+"_close"]=row.end;
  }
 }
 return mapped;
}
/** Only owner-authenticated and brand/public-facing fields are collected.
 * No street, unit, postal, legal_name, secondary phone, email, notes or documents.
 * Marketing remains the single source of these values. */
export async function centralPublicBusiness(
 db:SupabaseClient,owner:string,aiWorkspaceId:string
):Promise<PublicCentralBusiness|null>{
 const {data:workspace,error:wError}=await db.from("vmv_ai_businesses")
  .select("central_business_id").eq("id",aiWorkspaceId)
  .eq("owner_id",owner).maybeSingle();
 if(wError||!workspace)throw Error("AI business context unavailable");
 if(!workspace.central_business_id)return null; // Legacy phone pilot remains unchanged.
 const {data:central,error:cError}=await db.from("vmv_marketing_businesses")
  .select("id,name,category_id,description,country,city,region,service_areas,website_url,booking_url,hours_enabled,hours,updated_at")
  .eq("id",workspace.central_business_id).eq("owner_id",owner).maybeSingle();
 if(cError||!central)throw Error("Central business context unavailable");
 return central as PublicCentralBusiness;
}
export function approvedCentralSnapshot(
 original:Record<string,unknown>,central:PublicCentralBusiness|null
):Record<string,unknown>{
 if(!central)return original;
 const previous=(original.configuration||{}) as Record<string,unknown>;
 const category=BUSINESS_CATEGORIES.find(x=>x.id===central.category_id)?.label;
 const config:Record<string,unknown>={...previous,
  business_name:central.name,
  central_business_id:central.id,
  central_source_updated_at:central.updated_at,
  ...(category?{industry:category}:{}),
  ...(central.description?.trim()?{business_description:central.description.trim().slice(0,900)}:{}),
  ...(central.city?.trim()?{city:central.city.trim()}:{}),
  ...(central.region?.trim()?{state:central.region.trim()}:{}),
  ...(central.country==="US"?{country:"Estados Unidos"}:{}),
  ...(central.service_areas?.trim()?{service_areas:central.service_areas.trim().slice(0,600)}:{}),
  ...(central.website_url?.startsWith("https://")?{website:central.website_url.slice(0,500)}:{}),
  ...(central.booking_url?.startsWith("https://")?{booking_url:central.booking_url.slice(0,500)}:{})
 };
 // A deleted or unpublished Marketing field must not leak back into a new call
 // through an older agent revision. Keep agent-specific rules untouched.
 const authoritativeFields=[
  ["industry",category],
  ["business_description",central.description?.trim()],
  ["city",central.city?.trim()],
  ["state",central.region?.trim()],
  ["service_areas",central.service_areas?.trim()],
  ["website",central.website_url?.startsWith("https://")?central.website_url:null],
  ["booking_url",central.booking_url?.startsWith("https://")?central.booking_url:null]
 ] as const;
 for(const [key,current] of authoritativeFields)
  if(!current)delete config[key];
 if(central.country!=="US")delete config.country;
 // Never answer with former public hours after the business disables them.
 for(const day of days)
  for(const field of ["active","open","close"])
   delete config[`h_${day}_${field}`];
 const week=publicMarketingWeek(central);
 if(week)Object.assign(config,week);
 return {
  ...original,business_name:central.name,
  central_profile_version:central.updated_at,
  central_business_id:central.id,
  configuration:config
 };
}
