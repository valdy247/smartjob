import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {billingAdmin} from "@/lib/vmv-billing";
import {merchantTestEnabled,validConnectedAccount,verifyMerchantAccount,stripeMerchantApi}
 from "@/lib/vmv-ai-agents/stripe-commerce";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const fail=(message:string,status=400)=>NextResponse.json({error:message},{status,headers:{"Cache-Control":"no-store"}});

export async function POST(req:NextRequest){
 if(!merchantTestEnabled())return fail("El cobro de clientes aún no está conectado para este negocio.",503);
 const token=req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!token||!url||!key)return fail("Inicia sesión para revisar tu pedido.",401);
 const auth=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:identity,error:authError}=await auth.auth.getUser(token);
 if(authError||!identity.user||identity.user.is_anonymous)return fail("Sesión inválida.",401);
 const owner=identity.user.id;
 let orderId:string;
 try{
  const data=await req.json();
  orderId=String(data?.orderId||"");
 }catch{return fail("Solicitud inválida.");}
 if(!uuid.test(orderId))return fail("Pedido inválido.");
 const db=billingAdmin();if(!db)return fail("El servicio de cobros no está configurado.",503);
 const {data:order}=await db.from("vmv_ai_orders")
  .select("id,owner_id,business_id,mode,status,total_cents,currency,order_no,payment_status")
  .eq("id",orderId).eq("owner_id",owner).eq("mode","test").maybeSingle();
 if(!order||order.status!=="awaiting_payment"||order.payment_status==="paid"||
    !Number.isInteger(order.total_cents)||order.total_cents<1)return fail("El pedido no está listo para cobrar.",409);
 const {data:merchant}=await db.from("vmv_ai_merchant_payments").select("*")
  .eq("business_id",order.business_id).eq("owner_id",owner)
  .eq("provider","stripe_connect").eq("livemode",false)
  .eq("verified_by_server",true).eq("can_accept_payments",true).maybeSingle();
 const account=String(merchant?.provider_account_id||"");
 if(!validConnectedAccount(account)||!await verifyMerchantAccount(account))
  return fail("La cuenta de cobros del negocio no está autorizada.",409);
 const {data:held}=await db.from("vmv_ai_inventory_holds").select("state,expires_at")
  .eq("order_id",orderId);
 if(held?.some((h:{state:string;expires_at:string})=>h.state!=="held"||Date.parse(h.expires_at)<=Date.now()))
  return fail("La reserva de existencias expiró; debes recalcular el pedido.",409);
 const {data:previous}=await db.from("vmv_ai_payment_attempts")
  .select("provider_session_id,checkout_url").eq("order_id",orderId)
  .eq("owner_id",owner).eq("state","pending").order("created_at",{ascending:false}).limit(1);
 if(previous?.length&&previous[0].provider_session_id){
  try{
   const current=await stripeMerchantApi("checkout/sessions/"+encodeURIComponent(previous[0].provider_session_id),account);
   if(current.status==="open"&&Number(current.expires_at)>Date.now()/1000&&typeof previous[0].checkout_url==="string")
    return NextResponse.json({test:true,checkoutUrl:previous[0].checkout_url,status:"pending"});
  }catch{/* existing session couldn't be checked; do not falsely report a payment */}
 }
 const origin=process.env.VMV_AI_TEST_BASE_URL||"";
 if(!/^https:\/\/[a-z0-9.-]+$/i.test(origin))return fail("Dominio de retorno no configurado.",503);
 const expiresAt=Math.floor(Date.now()/1000)+1800;
 const body=new URLSearchParams({
  mode:"payment",success_url:origin+"/vista-app/ai-agents?checkout=test&order="+orderId+
   "&session_id={CHECKOUT_SESSION_ID}",
  cancel_url:origin+"/vista-app/ai-agents?checkout=cancel&order="+orderId,
  "line_items[0][price_data][currency]":"usd",
  "line_items[0][price_data][unit_amount]":String(order.total_cents),
  "line_items[0][price_data][product_data][name]":"Pedido de prueba #"+order.order_no,
  "line_items[0][quantity]":"1",
  "metadata[vmv_ai_order_id]":orderId,"metadata[vmv_ai_mode]":"test",
  expires_at:String(expiresAt)
 });
 let checkout:Record<string,unknown>;
 try{
  checkout=await stripeMerchantApi("checkout/sessions",account,"POST",body,
    "vmv-ai-merchant-test-"+orderId+"-"+(previous?.length||0));
 }catch{return fail("Stripe no pudo crear el checkout. No se realizó ningún cobro.",502);}
 const session=String(checkout.id||""),paymentUrl=String(checkout.url||"");
 if(!/^cs_test_/.test(session)||!paymentUrl.startsWith("https://checkout.stripe.com/"))
  return fail("Sesión de pago no válida.",502);
 const {data:attached,error:attachError}=await db.rpc("vmv_ai_test_assign_checkout",{
  p_owner:owner,p_order:orderId,p_account:account,p_session:session,p_url:paymentUrl,
  p_expires:new Date(expiresAt*1000).toISOString()
 });
 if(attachError||attached!==true){
  try{await stripeMerchantApi("checkout/sessions/"+encodeURIComponent(session)+"/expire",account,"POST",new URLSearchParams());}catch{}
  return fail("No se pudo reservar el pedido para esta sesión de pago.",409);
 }
 return NextResponse.json({test:true,checkoutUrl:paymentUrl,status:"pending"},{
  headers:{"Cache-Control":"no-store"}
 });
}
