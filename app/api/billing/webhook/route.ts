import {NextRequest,NextResponse} from "next/server";
import {billingAdmin,priceEnv,stripeTestReady,TOPUP_CATALOG,isPlan,topupPriceEnv,type PlanCode} from "@/lib/vmv-billing";
import {noStore,verifyStripeWebhook} from "@/lib/vmv-stripe";
export const runtime="nodejs";export const dynamic="force-dynamic";
const ids=(s:unknown,prefix:string)=>typeof s==="string"&&new RegExp("^"+prefix+"_[a-zA-Z0-9_]+$").test(s);
const uuid=(s:unknown):s is string=>typeof s==="string"&&
 /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(s);
const time=(n:unknown)=>typeof n==="number"&&Number.isInteger(n)&&
 n>1700000000&&n<4102444800?new Date(n*1000).toISOString():null;
export async function POST(req:NextRequest){
 const secret=process.env.STRIPE_WEBHOOK_SECRET||"";
 if(!stripeTestReady()||!secret)return NextResponse.json({error:"stripe_disabled"},{status:503,headers:noStore});
 const raw=await req.text();
 if(!verifyStripeWebhook(raw,req.headers.get("stripe-signature")||"",secret))
  return NextResponse.json({error:"invalid_signature"},{status:400,headers:noStore});
 let event:Record<string,any>;
 try{event=JSON.parse(raw);}catch{return NextResponse.json({error:"invalid_event"},{status:400,headers:noStore});}
 if(event.livemode!==false||!ids(event.id,"evt"))
  return NextResponse.json({error:"invalid_mode"},{status:400,headers:noStore});
 if(["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type)){
  const session=event.data?.object||{},meta=session.metadata||{};
  if(session.mode!=="payment"||!ids(session.id,"cs_test")||
     session.payment_status!=="paid")return NextResponse.json({received:true},{headers:noStore});
  const plan=meta.vmv_topup_plan,uid=meta.smartjob_user_id;
  if(!isPlan(plan)||!uuid(uid)||session.client_reference_id!==uid||
     !ids(session.customer,"cus")||!/^price_/.test(topupPriceEnv(plan)))
   return NextResponse.json({error:"invalid_topup"},{status:422,headers:noStore});
  const bundle=TOPUP_CATALOG[plan];
  if(Number(meta.vmv_topup_minutes)!==bundle.minutes||
     session.amount_subtotal!==bundle.usdCents||session.currency!=="usd")
   return NextResponse.json({error:"topup_mismatch"},{status:422,headers:noStore});
  const db=billingAdmin();
  if(!db)return NextResponse.json({error:"billing_unavailable"},{status:503,headers:noStore});
  const {data,error}=await db.rpc("smartjob_apply_stripe_topup",{
   p_checkout_id:session.id,p_event_id:event.id,p_user_id:uid,
   p_customer_id:session.customer,p_plan:plan,p_minutes:bundle.minutes
  });
  if(error||data!==true){
   console.error("VMV topup sync failed",error?.code||"rejected");
   return NextResponse.json({error:"topup_sync_unavailable"},{status:503,headers:noStore});
  }
  return NextResponse.json({received:true},{headers:noStore});
 }
 if(!["customer.subscription.created","customer.subscription.updated",
       "customer.subscription.deleted"].includes(event.type))
  return NextResponse.json({received:true},{headers:noStore});
 const sub=event.data?.object||{};
 if(!ids(sub.id,"sub")||!ids(sub.customer,"cus"))
  return NextResponse.json({error:"bad_subscription"},{status:400,headers:noStore});
 const db=billingAdmin();
 if(!db)return NextResponse.json({error:"billing_unavailable"},{status:503,headers:noStore});
 let userId:unknown=sub.metadata?.smartjob_user_id;
 if(!uuid(userId)){
  const {data}=await db.from("smartjob_billing_accounts")
    .select("user_id").eq("stripe_subscription_id",sub.id).maybeSingle();
  userId=data?.user_id;
 }
 if(!uuid(userId))return NextResponse.json({error:"account_unlinked"},{status:422,headers:noStore});
 const item=sub.items?.data?.[0]||{};
 const price=item.price?.id;
 const found=(["starter","pro","premium"] as PlanCode[]).find(p=>priceEnv(p)===price&&
    /^price_[a-zA-Z0-9]+$/.test(priceEnv(p)));
 if(!found)return NextResponse.json({error:"unrecognized_price"},{status:422,headers:noStore});
 const start=time(item.current_period_start??sub.current_period_start);
 const end=time(item.current_period_end??sub.current_period_end);
 if(!start||!end||!Number.isInteger(event.created))
  return NextResponse.json({error:"invalid_period"},{status:422,headers:noStore});
 const status=event.type==="customer.subscription.deleted"?"canceled":String(sub.status||"");
 const {data,error}=await db.rpc("smartjob_apply_stripe_subscription",{
  p_event_id:event.id,p_event_created:event.created,p_user_id:userId,
  p_customer_id:sub.customer,p_subscription_id:sub.id,p_price_id:price,
  p_plan:found,p_status:status,p_period_start:start,p_period_end:end
 });
 if(error||data!==true){
  console.error("VMV Stripe subscription sync failed",error?.code||"rejected");
  return NextResponse.json({error:"sync_unavailable"},{status:503,headers:noStore});
 }
 return NextResponse.json({received:true},{headers:noStore});
}
