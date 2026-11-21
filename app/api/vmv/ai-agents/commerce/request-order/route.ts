import {NextRequest,NextResponse} from "next/server";
import {createHmac} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {billingAdmin} from "@/lib/vmv-billing";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const json=(data:Record<string,unknown>,status=200)=>
 NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(req:NextRequest){
 const token=req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const secret=process.env.SUPABASE_SECRET_KEY||"";
 if(!token||!url||!key)return json({error:"Inicia sesión."},401);
 if(!secret)return json({error:"Pedidos temporalmente no disponibles."},503);
 const client=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:{user},error:userError}=await client.auth.getUser(token);
 if(userError||!user||user.is_anonymous)return json({error:"Sesión inválida."},401);
 if(!req.headers.get("content-type")?.startsWith("application/json")||
  Number(req.headers.get("content-length")||0)>2400)return json({error:"Solicitud inválida."},400);
 const body=await req.json().catch(()=>null) as Record<string,unknown>|null;
 if(!body||body.acceptOrder!==true)return json({error:"Confirma la solicitud del pedido."},400);
 const agentId=typeof body.agentId==="string"?body.agentId:"";
 const conversationId=typeof body.conversationId==="string"?body.conversationId:"";
 const productId=typeof body.productId==="string"?body.productId:"";
 const requestId=typeof body.requestId==="string"?body.requestId:"";
 const quantity=body.quantity;
 const name=typeof body.name==="string"?body.name.trim():"";
 const email=typeof body.email==="string"?body.email.trim():"";
 const phone=typeof body.phone==="string"?body.phone.trim():"";
 if(![agentId,conversationId,productId,requestId].every(x=>uuid.test(x))||
  !Number.isInteger(quantity)||!(typeof quantity==="number"&&quantity>=1&&quantity<=50)||
  name.length<2||name.length>80||email.length>180||phone.length>35||
  (!email&&!phone)||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||
  (phone&&!/^\+?[0-9 ()-]{7,35}$/.test(phone)))
  return json({error:"Revisa producto, cantidad, nombre y contacto."},400);
 const db=billingAdmin();if(!db)return json({error:"Pedidos no disponibles."},503);
 const [{data:agent},{data:conversation},{data:settings}]=await Promise.all([
  db.from("vmv_ai_agents").select("id,business_id,configuration")
   .eq("id",agentId).eq("owner_id",user.id).maybeSingle(),
  db.from("vmv_ai_conversations").select("id")
   .eq("id",conversationId).eq("owner_id",user.id).eq("agent_id",agentId).maybeSingle(),
  db.from("vmv_web_chat_settings").select("sales_enabled,sales_item_ids")
   .eq("agent_id",agentId).eq("owner_id",user.id).maybeSingle()
 ]);
 const config=agent?.configuration as Record<string,string>|undefined;
 if(!agent||!conversation||!settings?.sales_enabled||
  !Array.isArray(settings.sales_item_ids)||!settings.sales_item_ids.includes(productId)||
  config?.cap_catalog!=="Sí"||config?.cap_sales!=="Sí"||
  config?.perm_prepare_order!=="Sí")
  return json({error:"El agente no tiene autorización para preparar este pedido."},403);
 const idem="sim-order-"+createHmac("sha256",secret)
  .update(user.id+":"+conversationId+":"+requestId).digest("hex").slice(0,48);
 const result=await db.rpc("vmv_ai_agent_capture_order",{
  p_owner:user.id,p_business:agent.business_id,p_agent:agentId,
  p_item:productId,p_qty:quantity,p_key:idem,p_mode:"test",
  p_source:"owner_preview",p_session:conversationId,
  p_name:name,p_email:email,p_phone:phone
 });
 if(result.error)return json({error:"No se pudo preparar el pedido."},503);
 if(!result.data)return json({error:"Producto no disponible o datos sin verificar."},409);
 const {data:order,error:readError}=await db.from("vmv_ai_orders")
  .select("order_no,total_cents").eq("id",result.data).eq("owner_id",user.id)
  .eq("mode","test").maybeSingle();
 if(readError||!order)return json({error:"No se pudo verificar el pedido."},503);
 return json({saved:true,mode:"test",orderNo:order.order_no,totalCents:order.total_cents,
  status:"requires_review",paid:false});
}
