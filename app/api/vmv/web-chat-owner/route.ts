import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {billingAdmin} from "@/lib/vmv-billing";
import {publicChatNoStore} from "@/lib/vmv-web-chat-session";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const id=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const reply=(data:Record<string,unknown>,status=200)=>
 NextResponse.json(data,{status,headers:publicChatNoStore});
export async function POST(req:NextRequest){
 const bearer=req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!bearer||!url||!pub)return reply({error:"Inicia sesión."},401);
 const identity=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await identity.auth.getUser(bearer);
 if(authError||!user||user.is_anonymous)return reply({error:"Sesión no válida."},401);
 const body=await req.json().catch(()=>null);
 const sessionId=body?.sessionId,action=body?.action;
 if(!id.test(String(sessionId||""))||!["reply","resolve","claim"].includes(String(action)))
  return reply({error:"Acción inválida."},400);
 const message=typeof body?.message==="string"?body.message.trim():"";
 if(action==="reply"&&(message.length<1||message.length>800))
  return reply({error:"Escribe un mensaje breve."},400);
 const db=billingAdmin();if(!db)return reply({error:"Servicio no disponible."},503);
 const {data:session,error:sessionError}=await db.from("vmv_web_public_chat_sessions")
  .select("id,owner_id,agent_id,handoff_status,site_slug,site_kind")
  .eq("id",sessionId).eq("owner_id",user.id).maybeSingle();
 if(sessionError||!session)return reply({error:"Conversación no disponible."},404);
 const {data:link}=await db.from("vmv_web_chat_site_links")
  .select("public_chat_enabled").eq("owner_id",user.id)
  .eq("agent_id",session.agent_id).eq("site_slug",session.site_slug)
  .eq("site_kind",session.site_kind).maybeSingle();
 if(!link?.public_chat_enabled)return reply({error:"Activa primero el chat de esta web."},409);
 if(session.handoff_status==="bot")return reply({error:"El visitante no ha solicitado atención humana."},409);
 if(action==="resolve"){
  const update=await db.from("vmv_web_public_chat_sessions")
   .update({handoff_status:"bot",handoff_at:null,updated_at:new Date().toISOString()})
   .eq("id",session.id).eq("owner_id",user.id).neq("handoff_status","bot");
  if(update.error)return reply({error:"No se pudo finalizar."},503);
  await db.from("vmv_web_chat_alerts").update({read_at:new Date().toISOString()})
   .eq("owner_id",user.id).eq("session_id",session.id);
  return reply({resolved:true});
 }
 const updated=await db.from("vmv_web_public_chat_sessions")
  .update({handoff_status:"human",updated_at:new Date().toISOString()})
  .eq("id",session.id).eq("owner_id",user.id).neq("handoff_status","bot");
 if(updated.error)return reply({error:"No se pudo atender."},503);
 if(action==="reply"){
  const {error:msgError}=await db.from("vmv_web_public_chat_messages").insert({
   owner_id:user.id,session_id:session.id,role:"human",content:message
  });
  if(msgError)return reply({error:"No se pudo enviar la respuesta."},503);
 }
 await db.from("vmv_web_chat_alerts").update({read_at:new Date().toISOString()})
  .eq("owner_id",user.id).eq("session_id",session.id);
 return reply({sent:action==="reply",claimed:true});
}
