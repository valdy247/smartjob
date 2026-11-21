import {createCipheriv,createDecipheriv,createHash,randomBytes} from "node:crypto";
import {billingAdmin} from "@/lib/vmv-billing";

export const META_GRAPH_VERSION="v27.0";
export const ADS_PILOT_ENABLED=()=>process.env.VERCEL_ENV==="preview"&&process.env.VMV_ADS_META_PILOT_ENABLED==="true";
export const noCache={"Cache-Control":"no-store"} as const;
const idPattern=/^[0-9]{5,30}$/;
export const metaId=(value:unknown):value is string=>typeof value==="string"&&idPattern.test(value);
export const uuid=(value:unknown):value is string=>typeof value==="string"&&
 /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
export const stateHash=(state:string)=>createHash("sha256").update(state).digest("hex");
export const newState=()=>randomBytes(32).toString("base64url");

export function adsOrigin(){
 const raw=process.env.VMV_ADS_PUBLIC_ORIGIN||"";
 try{
  const u=new URL(raw);
  if(u.protocol!=="https:"||u.pathname!=="/"||u.search||u.hash||
     !(u.hostname.endsWith(".vercel.app")||["vmvcall.com","www.vmvcall.com"].includes(u.hostname)))return null;
  return u.origin;
 }catch{return null;}
}
export const adsMetaReady=()=>Boolean(ADS_PILOT_ENABLED()&&
 /^\d{7,30}$/.test(process.env.META_APP_ID||"")&&
 (process.env.META_APP_SECRET||"").length>=16&&
 /^[a-f\d]{64}$/i.test(process.env.VMV_ADS_TOKEN_KEY||"")&&adsOrigin());

function key(){
 const raw=process.env.VMV_ADS_TOKEN_KEY||"";
 if(!/^[a-f\d]{64}$/i.test(raw))throw Error("ads_encryption_unavailable");
 return Buffer.from(raw,"hex");
}
export function encryptMetaToken(token:string){
 const iv=randomBytes(12), cipher=createCipheriv("aes-256-gcm",key(),iv);
 const bytes=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
 return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),bytes.toString("base64url")].join(".");
}
export function decryptMetaToken(encoded:string){
 const parts=encoded.split(".");
 if(parts.length!==3)throw Error("invalid_credential_format");
 const decipher=createDecipheriv("aes-256-gcm",key(),Buffer.from(parts[0],"base64url"));
 decipher.setAuthTag(Buffer.from(parts[1],"base64url"));
 return Buffer.concat([decipher.update(Buffer.from(parts[2],"base64url")),decipher.final()]).toString("utf8");
}
export type MetaConnection={
 id:string;owner_id:string;provider:"meta";provider_user_id:string;provider_name:string;
 selected_ad_account_id:string|null;selected_ad_account_name:string|null;token_expires_at:string|null;disconnected_at:string|null
};
export async function activeMeta(owner:string):Promise<{connection:MetaConnection;token:string}|null>{
 const db=billingAdmin();if(!db)throw Error("database_unavailable");
 const {data:connection,error}=await db.from("vmv_marketing_ads_connections").select("*")
  .eq("owner_id",owner).eq("provider","meta").is("disconnected_at",null).maybeSingle();
 if(error)throw Error("connection_query_failed");
 if(!connection)return null;
 if(connection.token_expires_at&&Date.parse(connection.token_expires_at)<Date.now()+60000)
  throw Error("meta_access_expired");
 const {data:secret,error:e}=await db.from("vmv_marketing_ads_credentials")
  .select("encrypted_access_token").eq("connection_id",connection.id).maybeSingle();
 if(e||!secret)throw Error("meta_token_missing");
 return {connection:connection as MetaConnection,token:decryptMetaToken(secret.encrypted_access_token)};
}
export class MetaApiError extends Error{
 constructor(public code:string,public httpStatus:number,public subcode:number|null=null,
  public providerMessage:string|null=null,public traceId:string|null=null){super(code);}
}
type Graph=Record<string,any>;
const graphBase="https://graph.facebook.com/"+META_GRAPH_VERSION+"/";
async function graphResponse(url:URL,opts:RequestInit):Promise<Graph>{
 const response=await fetch(url.toString(),{...opts,cache:"no-store",signal:AbortSignal.timeout(18000)});
 const body=await response.json().catch(()=>null);
 if(!response.ok||body?.error){
  const raw=body?.error?.code;
  const safeCode=Number.isInteger(raw)?String(raw):"unknown";
  const subcode=Number.isInteger(body?.error?.error_subcode)?Number(body.error.error_subcode):null;
  // Preserve Meta's human-readable diagnostic for the authenticated owner, never its token.
  const rawMessage=body?.error?.error_user_msg||body?.error?.message;
  const providerMessage=typeof rawMessage==="string"?rawMessage
   .replace(/access_token\s*[=:]\s*[^\s&]+/gi,"access_token=[redacted]")
   .replace(/Bearer\s+[^\s]+/gi,"Bearer [redacted]")
   .replace(/EAA[A-Za-z0-9_-]{20,}/g,"[redacted]")
   .replace(/[\r\n\t]+/g," ").trim().slice(0,360):null;
  const rawTrace=body?.error?.fbtrace_id;
  const traceId=typeof rawTrace==="string"&&/^[A-Za-z0-9_-]{6,80}$/.test(rawTrace)?rawTrace:null;
  throw new MetaApiError("meta_api_"+safeCode,response.status,subcode,providerMessage,traceId);
 }
 return body||{};
}
export async function metaGet(path:string,token:string,fields:Record<string,string>={}):Promise<Graph>{
 const url=new URL(graphBase+path);
 for(const [k,v] of Object.entries(fields))url.searchParams.set(k,v);
 // Credentials use the Authorization header, never a query string or browser response.
 return graphResponse(url,{headers:{Authorization:"Bearer "+token}});
}
export async function metaPost(path:string,token:string,fields:Record<string,string>):Promise<Graph>{
 const url=new URL(graphBase+path);
 return graphResponse(url,{method:"POST",headers:{
  Authorization:"Bearer "+token,"Content-Type":"application/x-www-form-urlencoded"
 },body:new URLSearchParams(fields)});
}

/** Single-image link ad spec shared by dry-run validation and real creative creation. */
export type MetaLinkCreativeDraft={
 name:string;pageId:string;placements:"facebook"|"facebook_instagram";
 instagramId:string|null;destination:string;message:string;headline:string;imageHash:string
};
export function metaLinkCreativeFields(draft:MetaLinkCreativeDraft):Record<string,string>{
 const story={
  page_id:draft.pageId,
  ...(draft.placements==="facebook_instagram"&&draft.instagramId?
   {instagram_user_id:draft.instagramId}:{}),
  link_data:{
   link:draft.destination,message:draft.message,name:draft.headline,
   image_hash:draft.imageHash,
   call_to_action:{type:"LEARN_MORE",value:{link:draft.destination}}
  }
 };
 return {name:draft.name+" — creativo",object_story_spec:JSON.stringify(story)};
}
export function metaCreativeReason(error:unknown){
 if(!(error instanceof MetaApiError))return "meta_creative_provider_unavailable";
 switch(error.subcode){
  case 1885183:return "meta_app_in_development_mode";
  case 2238281:return "meta_instagram_identity_deprecated";
  case 1487124:return "meta_creative_image_not_found";
 }
 if(error.code==="meta_api_190")return "meta_reconnect_required";
 if(error.code==="meta_api_200"||error.code==="meta_api_270")return "meta_creative_access_denied";
 return "meta_creative_parameters_rejected";
}
/** Meta's validate_only request uses POST but never creates a creative or an ad. */
export async function validateMetaLinkCreative(accountId:string,token:string,draft:MetaLinkCreativeDraft){
 if(!/^act_\d{5,30}$/.test(accountId))throw new Error("invalid_meta_account_id");
 return metaPost(accountId+"/adcreatives",token,{
  ...metaLinkCreativeFields(draft),execution_options:JSON.stringify(["validate_only"])
 });
}

/** A billing signal, not a guarantee of payment. Never disclose payment method details. */
export type MetaPaymentCheck={state:"ready"|"missing"|"unverified"|"inactive";checkedAt:string;
 reason:"funding_detected"|"funding_absent"|"funding_unavailable"|"provider_unavailable"|"account_inactive"};
export async function inspectMetaPayment(token:string,accountId:string):Promise<MetaPaymentCheck>{
 const checkedAt=new Date().toISOString();
 if(!/^act_\d{5,30}$/.test(accountId))return {state:"unverified",checkedAt,reason:"funding_unavailable"};
 try{
  const account=await metaGet(accountId,token,{fields:"id,account_status,currency,funding_source"});
  if(account.id!==accountId||Number(account.account_status)!==1||account.currency!=="USD")
   return {state:"inactive",checkedAt,reason:"account_inactive"};
  if(!Object.prototype.hasOwnProperty.call(account,"funding_source"))
   return {state:"unverified",checkedAt,reason:"funding_unavailable"};
  const funding=account.funding_source;
  if((typeof funding==="string"&&/^[1-9]\d*$/.test(funding))||
    (typeof funding==="number"&&Number.isSafeInteger(funding)&&funding>0))
   return {state:"ready",checkedAt,reason:"funding_detected"};
  if(funding===null||funding===""||funding===0||funding==="0")
   return {state:"missing",checkedAt,reason:"funding_absent"};
  return {state:"unverified",checkedAt,reason:"funding_unavailable"};
 }catch{
  return {state:"unverified",checkedAt,reason:"provider_unavailable"};
 }
}
export async function authorizedAccounts(token:string){
 const data=await metaGet("me/adaccounts",token,{fields:"id,name,account_status,currency,timezone_name",limit:"100"});
 return (Array.isArray(data.data)?data.data:[]).filter((item:any)=>typeof item.id==="string"&&
  /^act_\d{5,30}$/.test(item.id)).map((item:any)=>({
  id:String(item.id),name:String(item.name||item.id),currency:String(item.currency||""),
  status:Number(item.account_status||0),timezone:String(item.timezone_name||"")
 }));
}
export async function authorizedPages(token:string){
 const data=await metaGet("me/accounts",token,{fields:"id,name,instagram_business_account{id,username}",limit:"100"});
 return (Array.isArray(data.data)?data.data:[]).filter((item:any)=>metaId(item.id)).map((item:any)=>({
  id:String(item.id),name:String(item.name||""),
  instagramId:metaId(item.instagram_business_account?.id)?String(item.instagram_business_account.id):null,
  instagramUsername:String(item.instagram_business_account?.username||"")
 }));
}
export function validDestination(raw:unknown){
 if(typeof raw!=="string"||raw.length>500)return null;
 try{
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.username||url.password||url.port||!url.hostname.includes(".")||
   url.hostname==="localhost"||url.hostname.endsWith(".local")||
   /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname))return null;
  return url.toString();
 }catch{return null;}
}
