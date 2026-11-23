import {NextRequest} from "next/server";
import {createHmac,timingSafeEqual} from "node:crypto";
import {billingAdmin} from "@/lib/vmv-billing";

export type WebChatKind="classic"|"builder";
export const webChatSlug=(s:unknown):s is string=>typeof s==="string"&&
 s.length<=64&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
export const webChatKind=(s:unknown):s is WebChatKind=>s==="classic"||s==="builder";
const secret=()=>process.env.SUPABASE_SECRET_KEY||"";
const mac=(text:string)=>createHmac("sha256",secret()).update(text).digest("hex");
export const chatVisitorHash=(kind:WebChatKind,slug:string,token:string)=>
 mac("visitor:"+kind+":"+slug+":"+token);
export const chatSameOrigin=(req:NextRequest)=>{
 const origin=req.headers.get("origin");
 if(!origin)return false;
 try{
  const u=new URL(origin);
  const host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||"").split(",")[0].trim();
  return (u.protocol==="https:"||u.protocol==="http:")&&u.host===host&&
   req.headers.get("sec-fetch-site")!=="cross-site";
 }catch{return false;}
};
export async function visitorSession(req:NextRequest,kind:WebChatKind,slug:string){
 const raw=req.cookies.get("vmv_public_chat")?.value||"";
 const parts=raw.split(".");
 if(parts.length!==2||!/^[a-zA-Z0-9_-]{32}$/.test(parts[0])||
   !/^[a-f0-9]{64}$/.test(parts[1])||!secret())return null;
 const expected=mac("cookie:"+kind+":"+slug+":"+parts[0]);
 if(!timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(parts[1],"hex")))return null;
 const db=billingAdmin();if(!db)return null;
 const {data,error}=await db.from("vmv_web_public_chat_sessions")
  .select("id,owner_id,agent_id,site_kind,site_slug,handoff_status")
  .eq("site_kind",kind).eq("site_slug",slug)
  .eq("visitor_hash",chatVisitorHash(kind,slug,parts[0])).maybeSingle();
 if(error||!data)return null;
 const {data:link}=await db.from("vmv_web_chat_site_links")
  .select("owner_id,agent_id,public_chat_enabled")
  .eq("owner_id",data.owner_id).eq("site_slug",slug).eq("site_kind",kind)
  .eq("agent_id",data.agent_id).eq("public_chat_enabled",true).maybeSingle();
 return link?{db,session:data}:null;
}
export const publicChatNoStore={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"} as const;
