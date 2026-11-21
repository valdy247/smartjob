import {NextRequest,NextResponse} from "next/server";
import {chatSameOrigin,visitorSession,webChatKind,webChatSlug,publicChatNoStore}
 from "@/lib/vmv-web-chat-session";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(data:Record<string,unknown>,status=200)=>
 NextResponse.json(data,{status,headers:publicChatNoStore});

export async function POST(req:NextRequest){
 if(!chatSameOrigin(req))return reply({error:"Origen no permitido."},403);
 if(!req.headers.get("content-type")?.startsWith("application/json")||
  Number(req.headers.get("content-length")||0)>2500)
  return reply({error:"Solicitud inválida."},400);
 const body=await req.json().catch(()=>null);
 if(!body||!webChatKind(body.kind)||!webChatSlug(body.slug)||body.consent!==true)
  return reply({error:"Consentimiento requerido."},400);
 const auth=await visitorSession(req,body.kind,body.slug);
 if(!auth)return reply({error:"Primero inicia una conversación con el agente."},401);
 const {db,session}=auth;
 if(body.action==="handoff"){
  const {data,error}=await db.from("vmv_web_chat_settings")
   .select("human_handoff").eq("agent_id",session.agent_id)
   .eq("owner_id",session.owner_id).maybeSingle();
  if(error||!data?.human_handoff)return reply({error:"Contacta al negocio por sus medios habituales."},409);
  const out=await db.rpc("vmv_web_chat_handoff",{p_owner:session.owner_id,
   p_session:session.id,p_reason:"handoff"});
  return out.error||out.data!==true?
   reply({error:"No se pudo solicitar ayuda humana."},503):
   reply({waiting:true,message:"Una persona del negocio atenderá tu conversación aquí."});
 }
 if(body.action!=="lead")return reply({error:"Acción inválida."},400);
 const {data:settings}=await db.from("vmv_web_chat_settings")
  .select("lead_capture").eq("agent_id",session.agent_id)
  .eq("owner_id",session.owner_id).maybeSingle();
 if(!settings?.lead_capture)return reply({error:"Captura de contactos desactivada."},409);
 const name=typeof body.name==="string"?body.name.trim():"";
 const email=typeof body.email==="string"?body.email.trim():"";
 const phone=typeof body.phone==="string"?body.phone.trim():"";
 if(name.length<2||name.length>80||email.length>180||phone.length>35||
  (!email&&!phone))return reply({error:"Indica nombre y teléfono o correo."},400);
 const saved=await db.rpc("vmv_web_chat_save_lead",{
  p_owner:session.owner_id,p_session:session.id,p_name:name,p_email:email,p_phone:phone
 });
 if(saved.error||!saved.data)return reply({error:"Revisa el correo o teléfono (incluye código de país)."},400);
 return reply({saved:true});
}
