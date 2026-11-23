import {NextRequest,NextResponse} from "next/server";
import {createHmac} from "node:crypto";
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
 if(body.action==="order"){
  if(body.acceptOrder!==true)return reply({error:"Confirma que deseas enviar el pedido."},400);
  const productId=typeof body.productId==="string"?body.productId:"";
  const requestId=typeof body.requestId==="string"?body.requestId:"";
  const qty=body.quantity;
  const name=typeof body.name==="string"?body.name.trim():"";
  const email=typeof body.email==="string"?body.email.trim():"";
  const phone=typeof body.phone==="string"?body.phone.trim():"";
  const validUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(!validUuid.test(productId)||!validUuid.test(requestId)||
     !Number.isInteger(qty)||qty<1||qty>50||name.length<2||name.length>80||
     email.length>180||phone.length>35||(!email&&!phone)||
     (email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||
     (phone&&!/^\+?[0-9 ()-]{7,35}$/.test(phone)))
   return reply({error:"Revisa producto, cantidad, nombre y contacto."},400);
  const [{data:agent},{data:settings}]=await Promise.all([
   db.from("vmv_ai_agents").select("id,business_id,configuration,status")
    .eq("id",session.agent_id).eq("owner_id",session.owner_id).eq("status","active").maybeSingle(),
   db.from("vmv_web_chat_settings").select("sales_enabled,sales_item_ids")
    .eq("agent_id",session.agent_id).eq("owner_id",session.owner_id).maybeSingle()
  ]);
  const permissions=agent?.configuration as Record<string,string>|undefined;
  if(!agent||!settings?.sales_enabled||!Array.isArray(settings.sales_item_ids)||
   !settings.sales_item_ids.includes(productId)||permissions?.cap_catalog!=="Sí"||
   permissions?.cap_sales!=="Sí"||permissions?.perm_prepare_order!=="Sí")
   return reply({error:"Este producto no está habilitado para pedidos."},409);
  const secret=process.env.SUPABASE_SECRET_KEY||"";
  if(!secret)return reply({error:"Pedidos temporalmente no disponibles."},503);
  const key="web-order-"+createHmac("sha256",secret)
   .update(session.id+":"+requestId).digest("hex").slice(0,48);
  const created=await db.rpc("vmv_ai_agent_capture_order",{
   p_owner:session.owner_id,p_business:agent.business_id,p_agent:session.agent_id,
   p_item:productId,p_qty:qty,p_key:key,p_mode:"live",
   p_source:"public_web_chat",p_session:session.id,
   p_name:name,p_email:email,p_phone:phone
  });
  if(created.error)return reply({error:"No se pudo registrar el pedido."},503);
  if(!created.data)return reply({error:"Revisa el producto o sus existencias con el negocio."},409);
  const {data:order,error:orderError}=await db.from("vmv_ai_orders")
   .select("order_no,status,payment_status,total_cents")
   .eq("id",created.data).eq("owner_id",session.owner_id).eq("mode","live").maybeSingle();
  if(orderError||!order)return reply({error:"No se pudo verificar el pedido."},503);
  return reply({saved:true,orderNo:order.order_no,
   totalCents:order.total_cents,status:"requires_review",paid:false});
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
