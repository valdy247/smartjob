export type Shortcut={id:string;es:string;en:string;href:string;group:string;terms?:string};
export type HiddenService={id:string;scope:string};
export type ShortcutState={enabled:boolean;quick:string[];home:string[];custom:Shortcut[];hidden:HiddenService[];updatedAt:number};
export const SHORTCUTS_META_KEY="vmv_shortcuts_v1";
export const SHORTCUT_LIMIT=24;
export const HIDDEN_LIMIT=60;
export const validHiddenScope=(scope:string)=>/^\/vista-app(?:\/[a-z0-9/_-]*)?(?:#[a-z0-9_-]+)?$/.test(scope)&&scope.length<=125;
export const items:Shortcut[]=[
 ["home","Home","Home","/vista-app?tab=home","General","inicio"],
 ["services","Todos los servicios","All services","/vista-app?tab=services","General","catálogo"],
 ["account","Mi cuenta","My account","/vista-app?tab=account","General","perfil"],
 ["settings","Configuración","Settings","/vista-app?tab=account&settings=shortcuts","General","acceso directo"],
 ["calls","Llamadas","Calls","/vista-app?tab=calls&view=dial","Comunicación","teléfono"],
 ["call-history","Historial de llamadas","Call history","/vista-app?tab=calls&view=history","Comunicación",""],
 ["contacts","Contactos","Contacts","/vista-app?tab=calls&view=contacts","Comunicación","agenda"],
 ["translator","Traductor","Translator","/vista-app?tab=translator","Comunicación","intérprete"],
 ["smart-call","Smart Call","Smart Call","/vista-app?tab=services&open=call","Comunicación",""],
 ["web","Web Services","Web Services","/vista-app?tab=services&focus=web","Negocio","páginas web"],
 ["web-studio","Web Studio","Web Studio","/web-studio","Negocio","editor"],
 ["ai-agents","AI Agents","AI Agents","/vista-app/ai-agents","IA","agentes"],
 ["agent-calls","Agente telefónico","Phone agent","/vista-app/ai-agents?service=call","IA",""],
 ["agent-video","Agente de video","Video agent","/vista-app/ai-agents?service=video","IA",""],
 ["agent-quote","Agente de cotizaciones","Quote agent","/vista-app/ai-agents?service=quote","IA",""],
 ["smart-quote","Smart Quote","Smart Quote","/vista-app/smart-quote","Negocio","cotizaciones"],
 ["video-generator","Video Generator","Video Generator","/vista-app/video-generator","IA","video"],
 ["marketing","Marketing","Marketing","/vista-app/marketing","Marketing",""],
 ["google-profile","Aparecer en Google","Appear on Google","/vista-app/marketing?service=google_profile","Marketing","google business"],
 ["seo","Mejorar web","Improve website","/vista-app/marketing?service=seo_improvement","Marketing","seo auditoría"],
 ["reputation","Reputación","Reputation","/vista-app/marketing?service=review_strategy","Marketing","reseñas"],
 ["social-captions","Descripciones para redes","Social media captions","/vista-app/marketing?tool=captions","Marketing","instagram tiktok"],
 ["marketing-requests","Solicitudes de Marketing","Marketing requests","/vista-app/marketing/requests","Marketing","casos progreso"],
 ["marketing-business","Mis negocios","My businesses","/vista-app/marketing/negocios","Marketing","perfil central"],
 ["marketing-strategy","Diagnóstico de Marketing","Marketing diagnosis","/vista-app/marketing?section=strategy","Marketing",""],
 ["marketing-presence","Visibilidad local","Local visibility","/vista-app/marketing?section=presence","Marketing",""],
 ["marketing-campaign","Campañas de Marketing","Marketing campaigns","/vista-app/marketing?section=campaign","Marketing",""],
 ["marketing-roi","Rentabilidad de Marketing","Marketing profitability","/vista-app/marketing?section=numbers","Marketing",""],
 ["marketing-retention","Clientes y retención","Customer retention","/vista-app/marketing?section=retention","Marketing",""],
 ["ads","Ads Studio","Ads Studio","/vista-app/marketing/ads","Anuncios","meta facebook"],
 ["ads-create","Crear anuncio","Create ad","/vista-app/marketing/ads/create","Anuncios",""],
 ["ads-campaigns","Mis campañas","My campaigns","/vista-app/marketing/ads/campaigns","Anuncios",""],
 ["ads-platforms","Plataformas publicitarias","Ad platforms","/vista-app/marketing/ads/platforms","Anuncios",""],
 ["finance","Finanzas","Finances","/vista-app/finanzas","Negocio","pagos"],
 ["support","Soporte VMV","VMV Support","/vista-app/soporte","General","ayuda"]
].map(([id,es,en,href,group,terms])=>({id,es,en,href,group,terms}));
export const fresh=():ShortcutState=>({enabled:false,quick:[],home:[],custom:[],hidden:[],updatedAt:0});
export function safePath(raw:string){
 try{
  if(!raw||raw.length>700||!raw.startsWith("/")||raw.startsWith("//")||raw.includes("\\"))return false;
  const url=new URL(raw,"https://vmv.example");
  return url.origin==="https://vmv.example"&&!url.username&&!url.password&&
   (url.pathname==="/vista-app"||url.pathname.startsWith("/vista-app/")||url.pathname==="/web-studio"||url.pathname.startsWith("/web-studio/"));
 }catch{return false;}
}
export function parseState(raw:unknown):ShortcutState{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return fresh();
 const obj=raw as Record<string,unknown>;
 const custom=Array.isArray(obj.custom)?obj.custom.filter((x):x is Shortcut=>{
  if(!x||typeof x!=="object")return false;
  const v=x as Record<string,unknown>;
  return typeof v.id==="string"&&/^custom:[a-z0-9-]{5,72}$/.test(v.id)&&
   typeof v.es==="string"&&v.es.length>0&&v.es.length<=72&&
   typeof v.en==="string"&&v.en.length>0&&v.en.length<=72&&
   typeof v.href==="string"&&safePath(v.href)&&
   typeof v.group==="string"&&v.group.length<=32;
 }).slice(0,HIDDEN_LIMIT):[];
 const accepted=new Set([...items.map(x=>x.id),...custom.map(x=>x.id)]);
 const list=(v:unknown)=>Array.isArray(v)?[...new Set(v.filter((id):id is string=>typeof id==="string"&&accepted.has(id)))].slice(0,SHORTCUT_LIMIT):[];
 const seen=new Set<string>();
 const hidden:HiddenService[]=Array.isArray(obj.hidden)?obj.hidden.filter((raw):raw is HiddenService=>{
  if(!raw||typeof raw!=="object")return false;
  const entry=raw as Record<string,unknown>;
  if(typeof entry.id!=="string"||!accepted.has(entry.id)||
     typeof entry.scope!=="string"||!validHiddenScope(entry.scope))return false;
  const key=entry.scope+"::"+entry.id;
  if(seen.has(key))return false;
  seen.add(key);return true;
 }).slice(0,HIDDEN_LIMIT):[];
 return {enabled:obj.enabled===true,quick:list(obj.quick),home:list(obj.home),custom,hidden,
  updatedAt:typeof obj.updatedAt==="number"&&Number.isFinite(obj.updatedAt)&&obj.updatedAt>0?obj.updatedAt:0};
}
export const findShortcut=(state:ShortcutState,id:string)=>items.find(x=>x.id===id)||state.custom.find(x=>x.id===id);
export const labelFor=(item:Shortcut,en:boolean)=>en?item.en:item.es;
export const hiddenKey=(scope:string,id:string)=>scope+"::"+id;
export const findMatching=(item:Shortcut,q:string)=>{
 const normalized=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 return normalized([item.es,item.en,item.group,item.terms||""].join(" ")).includes(normalized(q.trim()));
};
