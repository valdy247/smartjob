import {NextRequest,NextResponse} from "next/server";
import {billingAdmin,stripeTestReady} from "@/lib/vmv-billing";
import {noStore,verifyStripeWebhook} from "@/lib/vmv-stripe";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const uuid=(value:unknown):value is string=>typeof value==="string"&&
 /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
const stripeId=(value:unknown,prefix:string)=>typeof value==="string"&&
 value.startsWith(prefix+"_")&&/^[A-Za-z0-9_]+$/.test(value);

export async function POST(req:NextRequest){
 if(process.env.VERCEL_ENV!=="preview"||!stripeTestReady()||
    process.env.VMV_MARKETING_CAMPAIGN_TEST_CHECKOUT!=="true")
  return NextResponse.json({error:"test_webhook_disabled"},{status:503,headers:noStore});
 const secret=process.env.VMV_MARKETING_STRIPE_WEBHOOK_SECRET||"";
 if(!secret.startsWith("whsec_"))return NextResponse.json({error:"webhook_not_configured"},{status:503,headers:noStore});
 const raw=await req.text();
 if(!verifyStripeWebhook(raw,req.headers.get("stripe-signature")||"",secret))
  return NextResponse.json({error:"invalid_signature"},{status:400,headers:noStore});
 let event:Record<string,any>;
 try{event=JSON.parse(raw);}catch{return NextResponse.json({error:"invalid_event"},{status:400,headers:noStore});}
 if(event.livemode!==false||!stripeId(event.id,"evt"))
  return NextResponse.json({error:"test_mode_only"},{status:400,headers:noStore});
 if(!["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type))
  return NextResponse.json({received:true},{headers:noStore});
 const session=event.data?.object||{},meta=session.metadata||{};
 const owner=meta.smartjob_user_id,requestId=meta.vmv_campaign_request_id;
 const revision=Number(meta.vmv_campaign_quote_revision),cents=Number(meta.vmv_campaign_amount_cents);
 if(meta.vmv_payment_kind!=="campaign_setup"||session.mode!=="payment"||
    session.payment_status!=="paid"||!stripeId(session.id,"cs_test")||
    !uuid(owner)||!uuid(requestId)||session.client_reference_id!==owner||
    !Number.isInteger(revision)||revision<1||
    !Number.isInteger(cents)||cents<50||cents>500000||
    session.currency!=="usd"||session.amount_total!==cents||
    session.amount_subtotal!==cents||session.total_details?.amount_discount>0||
    session.livemode!==false){
   return NextResponse.json({error:"invalid_campaign_payment"},{status:422,headers:noStore});
 }
 const db=billingAdmin();
 if(!db)return NextResponse.json({error:"database_unavailable"},{status:503,headers:noStore});
 const {data:request,error:requestError}=await db.from("vmv_marketing_requests")
   .select("id,owner_id,service_code,quote_revision,quoted_price_cents")
   .eq("id",requestId).eq("owner_id",owner).maybeSingle();
 if(requestError)return NextResponse.json({error:"request_unavailable"},{status:503,headers:noStore});
 if(!request||request.service_code!=="campaign_setup"||request.quote_revision!==revision||
    request.quoted_price_cents!==cents)
  return NextResponse.json({error:"quote_changed_or_missing"},{status:409,headers:noStore});
 const {data:approval,error:approvalError}=await db.from("vmv_marketing_quote_acceptances")
   .select("id").eq("request_id",requestId).eq("owner_id",owner)
   .eq("quote_revision",revision).eq("quoted_price_cents",cents).maybeSingle();
 if(approvalError)return NextResponse.json({error:"approval_unavailable"},{status:503,headers:noStore});
 if(!approval)return NextResponse.json({error:"no_customer_approval"},{status:409,headers:noStore});
 const paymentIntent=stripeId(session.payment_intent,"pi")?session.payment_intent:null;
 const {error:insertError}=await db.from("vmv_marketing_campaign_test_payments").insert({
   request_id:requestId,owner_id:owner,quote_revision:revision,amount_cents:cents,
   stripe_checkout_session_id:session.id,stripe_payment_intent_id:paymentIntent,
   stripe_event_id:event.id
 });
 if(insertError){
  if(insertError.code==="23505"){
   // A Stripe retry can carry a different event id. Accept only an identical already-paid checkout.
   const {data:existing,error:readError}=await db.from("vmv_marketing_campaign_test_payments")
    .select("stripe_checkout_session_id,owner_id,amount_cents")
    .eq("request_id",requestId).eq("quote_revision",revision).maybeSingle();
   if(!readError&&existing&&existing.stripe_checkout_session_id===session.id&&
      existing.owner_id===owner&&existing.amount_cents===cents)
    return NextResponse.json({received:true,duplicate:true},{headers:noStore});
   return NextResponse.json({error:"duplicate_or_conflicting_payment"},{status:409,headers:noStore});
  }
  console.error("VMV Marketing test receipt save failed",insertError.code);
  return NextResponse.json({error:"receipt_unavailable"},{status:503,headers:noStore});
 }
 return NextResponse.json({received:true,test_payment_recorded:true},{headers:noStore});
}
