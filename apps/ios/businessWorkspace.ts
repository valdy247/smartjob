/**
 * VMV Business module discovery and safe app -> web handoff.
 *
 * The website and native app use the SAME Supabase project. Browser and
 * iOS sessions remain isolated; no access tokens, session IDs, phone
 * numbers or personal information are added to the URL.
 *
 * This catalog is public product metadata, NEVER an entitlement source.
 */
import {Linking} from "react-native";

export const BUSINESS_WEB_ORIGIN="https://vmv-business-design.vercel.app";
const catalogUrl=BUSINESS_WEB_ORIGIN+"/service-catalog.json";

export type BusinessModule={
  id:string;
  name:string;
  group:string;
  state:"pilot-separate"|"planned";
  publicPath:string;
  workspacePath:string;
};

const allowedIds=[
  "smart-call","ai-agents","web-services","inventory","scheduling",
  "crm-leads","business-operations","marketing-analytics","automations"
] as const;
export type BusinessModuleId=typeof allowedIds[number];

const labels:Record<BusinessModuleId,string>={
  "smart-call":"Smart Call",
  "ai-agents":"AI Agents",
  "web-services":"Web Services",
  inventory:"Inventory",
  scheduling:"Scheduling",
  "crm-leads":"CRM & Leads",
  "business-operations":"Business Management",
  "marketing-analytics":"Marketing & Analytics",
  automations:"Automations"
};

export const FALLBACK_MODULES:BusinessModule[]=allowedIds.map(id=>({
  id,name:labels[id],
  group:({
    "smart-call":"communication","ai-agents":"intelligence",
    "web-services":"digital-presence",inventory:"operations",
    scheduling:"operations","crm-leads":"customers",
    "business-operations":"operations","marketing-analytics":"growth",
    automations:"intelligence"
  } as Record<BusinessModuleId,string>)[id],
  state:id==="smart-call"?"pilot-separate":"planned",
  publicPath:"/"+id+"/",
  workspacePath:"/workspace/?service="+id
}));

const isAllowed=(id:string):id is BusinessModuleId=>
  (allowedIds as readonly string[]).includes(id);

export async function loadBusinessModules():Promise<BusinessModule[]> {
  try {
    const response=await fetch(catalogUrl,{headers:{"Accept":"application/json"}});
    if(!response.ok) return FALLBACK_MODULES;
    const result:unknown=await response.json();
    if(!result||typeof result!=="object")return FALLBACK_MODULES;
    const data=result as {schemaVersion?:unknown;modules?:unknown};
    if(data.schemaVersion!=="1.0.0"||!Array.isArray(data.modules))return FALLBACK_MODULES;
    const fromWeb=new Map<string,BusinessModule>();
    for(const entry of data.modules) {
      if(!entry||typeof entry!=="object")continue;
      const value=entry as Partial<BusinessModule>;
      if(typeof value.id!=="string"||!isAllowed(value.id))continue;
      // Ignore unexpected paths/names/statuses from remote metadata.
      if(value.publicPath!=="/"+value.id+"/"||
         value.workspacePath!=="/workspace/?service="+value.id)continue;
      if(value.state!=="planned"&&value.state!=="pilot-separate")continue;
      fromWeb.set(value.id,{
        id:value.id,
        name:labels[value.id],
        group:typeof value.group==="string"?value.group.slice(0,40):"other",
        state:value.state,
        publicPath:value.publicPath,
        workspacePath:value.workspacePath
      });
    }
    return FALLBACK_MODULES.map(original=>fromWeb.get(original.id)||original);
  }catch{
    // Offline phones still show descriptive catalog entries, not fake access.
    return FALLBACK_MODULES;
  }
}

export async function openBusinessWorkspace(serviceId?:string):Promise<void> {
  const allowed=serviceId && isAllowed(serviceId)?serviceId:null;
  const path="/workspace/"+(allowed?"?service="+encodeURIComponent(allowed):"");
  // Browser independently verifies the user's Supabase session and RLS.
  // Native SecureStore tokens are NEVER transported across app/browser.
  await Linking.openURL(BUSINESS_WEB_ORIGIN+path);
}
