import type {Profile} from "./types";

/** Shared registration-to-profile mapping for web and native.
 * Metadata supplies presentation defaults only, never paid access or permissions.
 * Insert with ignoreDuplicates so logging in cannot overwrite an existing account.
 */
export function initialAccountProfile(id:string,metadata:Record<string,unknown>):Profile|null {
 const text=(key:string,max=250)=>typeof metadata[key]==="string"?(metadata[key] as string).trim().slice(0,max):"";
 const first=text("first_name",120),last=text("last_name",120),phone=text("phone",40),occupation=text("occupation",120);
 if(!first||!last||!phone||!occupation)return null;
 return {
  id,first_name:first,last_name:last,phone,occupation,
  city:text("city",120),state:text("state",120),country:(text("country",2)||"US").toUpperCase(),
  assistant_name:text("assistant_name",40)||"Juan",
  owner_language:metadata.owner_language==="en"?"en":"es",
  customer_language:metadata.customer_language==="es"?"es":"en",
  account_type:metadata.account_type==="personal"?"personal":"business",
  occupation_code:text("occupation_code",24)||null,use_case:text("use_case",50)||null,
  business_name:text("business_name",120)||null,website_url:text("website_url",250)||null,
  theme_color:metadata.theme_color==="blue"||metadata.theme_color==="violet"?metadata.theme_color:"mint",
  font_scale:metadata.font_scale==="small"||metadata.font_scale==="large"?metadata.font_scale:"normal",
  appearance:metadata.appearance==="dark"||metadata.appearance==="system"?metadata.appearance:"light",
  reduce_motion:metadata.reduce_motion===true,line_choice:metadata.line_choice==="new"?"new":"keep",
  line_carrier:"other",preferred_plan:null,plan_prompt_seen:false,line_setup_completed:false
 };
}
