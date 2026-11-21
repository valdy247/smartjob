import {NextRequest,NextResponse} from "next/server";
import {billingAdmin} from "@/lib/vmv-billing";
import {merchantTestEnabled,stripeMerchantApi,validConnectedAccount,verifiedStripeWebhook}
 from "@/lib/vmv-ai-agents/stripe-commerce";
import {checkedAccount,stripeStatus} from "@/lib/vmv-finances/connect";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const ok=(status:string)=>NextResponse.json({received:true,status},{headers:{"Cache-Control":"no-store"}});
export async function POST(req:NextRequest){
 if(!merchantTestEnabled())return NextResponse.json({error:"Merchant pilot unavailable"},{status:503});
 const raw=await req.text();
 const event=verifiedStripeWebhook(raw,req.headers.get("stripe-signature")||"");
 if(!event)return NextResponse.json({error:"Invalid signature"},{status:400});
 if(event.livemode!==false)return NextResponse.json({error:"Live payments not supported"},{status:400});
 const type=String(event.type||"");
 if(type==="account.updated"){
  const obj=(event.data as {object?:Record<string,unknown>}|undefined)?.object;
  const id=String(event.account||obj?.id||"");
  if(!validConnectedAccount(id))return ok("ignored");
  const db=billingAdmin();if(!db)return NextResponse.json({error:"Server not available"},{status:503});
  const {data:merchant}=await db.from("vmv_ai_merchant_payments")
   .select("business_id,owner_id,provider_account_id").eq("provider","stripe_connect")
   .eq("provider_account_id",id).eq("livemode",false).maybeSingle();
  if(!merchant)return ok("unknown_merchant");
  const {data:workspace}=await db.from("vmv_ai_businesses")
   .select("central_business_id").eq("id",merchant.business_id)
   .eq("owner_id",merchant.owner_id).maybeSingle();
  if(!workspace?.central_business_id)return ok("unlinked_business");
  try{
   // A signed event alone is insufficient: reread current Stripe state and
   // verify its immutable owner/business metadata before updating readiness.
   const current=await checkedAccount(id,merchant.owner_id,workspace.central_business_id);
   const state=stripeStatus(current);
   const {error}=await db.from("vmv_ai_merchant_payments")
    .update({verified_by_server:state.ready,can_accept_payments:state.ready,updated_at:new Date().toISOString()})
    .eq("business_id",merchant.business_id).eq("owner_id",merchant.owner_id)
    .eq("provider_account_id",id).eq("livemode",false);
   if(error)return NextResponse.json({error:"Could not record account status"},{status:503});
   return ok(state.ready?"merchant_ready":"merchant_pending");
  }catch{return NextResponse.json({error:"Could not verify account state"},{status:503});}
 }
 if(!["checkout.session.completed","checkout.session.async_payment_succeeded",
       "checkout.session.async_payment_failed"].includes(type))return ok("ignored");
 const account=String(event.account||"");
 if(!validConnectedAccount(account))return NextResponse.json({error:"Missing connected merchant"},{status:400});
 const stripeData=event.data as {object?:Record<string,unknown>}|undefined;
 const sessionId=String(stripeData?.object?.id||"");
 if(!/^cs_test_[a-zA-Z0-9_]+$/.test(sessionId))return NextResponse.json({error:"Invalid Checkout Session"},{status:400});
 const db=billingAdmin();if(!db)return NextResponse.json({error:"Server not available"},{status:503});
 const {data:attempt}=await db.from("vmv_ai_payment_attempts")
  .select("order_id,owner_id,amount_cents,currency,provider")
  .eq("provider_session_id",sessionId).eq("mode","test").eq("provider","stripe_connect").maybeSingle();
 if(!attempt)return ok("unknown_attempt");
 const {data:order}=await db.from("vmv_ai_orders")
  .select("id,owner_id,business_id,total_cents,currency,mode")
  .eq("id",attempt.order_id).eq("owner_id",attempt.owner_id).eq("mode","test").maybeSingle();
 if(!order||order.total_cents!==attempt.amount_cents||order.currency!==attempt.currency)
  return NextResponse.json({error:"Order does not match attempt"},{status:409});
 const {data:merchant}=await db.from("vmv_ai_merchant_payments").select("provider_account_id,verified_by_server,can_accept_payments,livemode")
  .eq("business_id",order.business_id).eq("owner_id",order.owner_id)
  .eq("provider","stripe_connect").maybeSingle();
 if(!merchant||!merchant.verified_by_server||!merchant.can_accept_payments||
   merchant.livemode||merchant.provider_account_id!==account)
  return NextResponse.json({error:"Merchant mismatch"},{status:409});
 let actual:Record<string,unknown>;
 try{actual=await stripeMerchantApi("checkout/sessions/"+encodeURIComponent(sessionId),account);}
 catch{return NextResponse.json({error:"Stripe verification unavailable"},{status:503});}
 const meta=actual.metadata as Record<string,unknown>|undefined;
 const verified=actual.id===sessionId && actual.livemode===false &&
   meta?.vmv_ai_order_id===order.id&&meta?.vmv_ai_mode==="test"&&
   Number(actual.amount_total)===order.total_cents &&
   String(actual.currency||"").toLowerCase()===order.currency;
 if(!verified)return NextResponse.json({error:"Checkout does not match order"},{status:409});
 if(type==="checkout.session.async_payment_failed"){
  const {error}=await db.rpc("vmv_ai_test_failed_payment",{p_session:sessionId});
  if(error)return NextResponse.json({error:"Could not record failed payment"},{status:503});
  return ok("failed");
 }
 // Checkout completed is not enough: payment_status must really be paid.
 if(actual.payment_status!=="paid")return ok("pending");
 const {data:result,error}=await db.rpc("vmv_ai_test_verified_payment",{
  p_order:order.id,p_session:sessionId,p_account:account,
  p_amount:order.total_cents,p_currency:order.currency
 });
 if(error)return NextResponse.json({error:"Could not reconcile payment"},{status:503});
 if(result==="paid"||result==="already_paid"||result==="paid_requires_review")
   return ok(String(result));
 return NextResponse.json({error:"Could not validate settlement"},{status:409});
}
