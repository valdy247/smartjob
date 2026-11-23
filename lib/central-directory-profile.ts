import type {CentralBusiness} from "./vmv-central-business";
import type {LocalProfile} from "../app/vista-app/marketing/LocalVisibilityStudio";

/** Public directory draft: never copy a private home address into its export. */
export function centralDirectoryProfile(b:CentralBusiness,industry:string,days:string[],closed:string):LocalProfile {
 return {business:b.name,industry:b.category_id==="other"?"":industry,website:b.website_url||"",phone:b.phone||"",city:b.city||"",region:b.region||"",postal:b.address_visibility==="public"&&b.kind!=="service_area"?b.postal||"":"",
 address:b.address_visibility==="public"&&b.kind!=="service_area"?[b.street,b.unit].filter(Boolean).join(", "):"",
 hours:b.hours_enabled&&b.hours?.length===7?b.hours.map((h,i)=>days[i]+": "+(h.closed?closed:h.start+"–"+h.end)).join("; "):"",
 description:b.description||""};
}
