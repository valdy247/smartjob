/** Client-side handoff contract for Marketing Ads Studio. No passwords, customer
 * records, secrets, advertising tokens, or unapproved inventory are included.
 * Producer: AI Agents. Marketing owns validation, creative and publication. */
export const AD_HANDOFF_KEY="vmv-agent-ad-brief-v1";
export type AgentAdBrief={
 version:1;ownerId:string;businessId:string;workspaceId:string;agentId:string;
 createdAt:number;businessName:string;website:string;offer:string;
 city:string;region:string;audience:string;goal:"visits"|"messages"|"sales";
 goals?:Array<"visits"|"messages"|"sales">;
 imageChoice:"business"|"product"|"upload";imageProductId?:string;
 productId?:string;priceCents?:number;currency?:string;
 notes:string;
};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const safeSite=(v:string)=>{try{const u=new URL(v);return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&
 !["localhost","127.0.0.1"].includes(u.hostname)&&!u.hostname.endsWith(".local")?u.toString():"";}catch{return "";}};
export function saveAgentAdBrief(value:AgentAdBrief):boolean{
 if(typeof window==="undefined"||!uuid.test(value.ownerId)||!uuid.test(value.businessId)||
  !uuid.test(value.workspaceId)||!uuid.test(value.agentId)||!value.offer.trim()||
  !value.businessName.trim()||Date.now()-value.createdAt>30000)return false;
 const stored={...value,businessName:value.businessName.slice(0,100),
  offer:value.offer.slice(0,220),audience:value.audience.slice(0,130),
  goals:(value.goals||[value.goal]).filter(goal=>["visits","messages","sales"].includes(goal)).slice(0,3),
  city:value.city.slice(0,100),region:value.region.slice(0,90),
  website:safeSite(value.website),notes:value.notes.slice(0,300)};
 try{sessionStorage.setItem(AD_HANDOFF_KEY+":"+value.ownerId,JSON.stringify(stored));return true;}
 catch{return false;}
}
/** Marketing must read only with its OWN authenticated owner/business scope and
 * validate every field. Reading consumes this one-time, 30-minute brief. */
export function consumeAgentAdBrief(ownerId:string,businessId:string):AgentAdBrief|null{
 if(typeof window==="undefined"||!uuid.test(ownerId)||!uuid.test(businessId))return null;
 const key=AD_HANDOFF_KEY+":"+ownerId;
 try{
  const raw=sessionStorage.getItem(key);if(!raw)return null;
  sessionStorage.removeItem(key);
  const x=JSON.parse(raw) as AgentAdBrief;
  if(x.version!==1||x.ownerId!==ownerId||x.businessId!==businessId||
    !Number.isFinite(x.createdAt)||x.createdAt>Date.now()+30000||
    Date.now()-x.createdAt>30*60*1000||!x.businessName||!x.offer)return null;
  return {...x,website:safeSite(x.website)};
 }catch{return null;}
}
