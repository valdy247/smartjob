import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {billingAdmin,stripeTestReady} from "@/lib/vmv-billing";
import {callbackOrigin,noStore,stripePost} from "@/lib/vmv-stripe";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const id=(value:unknown)=>typeof value==="string"&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);

/** Charges only VMV's approved service fee, NEVER the Meta/Google ad budget. Test preview only. */
export async function POST(req:NextRequest){
 if(process.env.VERCEL_ENV!=="preview"||!stripeTestReady()||process.env.VMV_MARKETING_CAMPAIGN_TEST_CHECKOUT!=="true")
  return NextResponse.json({error:"campaign_checkout_test_disabled"},{status:503,headers:noStore});
 const owner=await authenticatedUser(req);
 if(!owner)return NextResponse.json({error:"unauthorized"},{status:401,headers:noStore});
 const input=await req.json().catch(()=>null);
 if(!id(input?.request_id))return NextResponse.json({error:"invalid_request"},{status:400,headers:noStore});
 const db=billingAdmin(),origin=callbackOrigin(req.url);
 if(!db||!origin)return NextResponse.json({error:"checkout_not_configured"},{status:503,headers:noStore});
 const {data:request,error:requestError}=await db.from("vmv_marketing_requests")
  .select("id,owner_id,service_code,status,quoted_price_cents,quote_revision,quote_note")
  .eq("id",input.request_id).eq("owner_id",owner).maybeSingle();
 if(requestError||!request||request.service_code!=="campaign_setup"||request.status!=="quoted")
  return NextResponse.json({error:"approved_campaign_quote_required"},{status:409,headers:noStore});
 const cents=request.quoted_price_cents,revision=request.quote_revision;
 if(!Number.isInteger(cents)||cents<50||cents>500000||!Number.isInteger(revision)||revision<1)
  return NextResponse.json({error:"invalid_quote_amount"},{status:409,headers:noStore});
 const {data:acceptance,error:acceptError}=await db.from("vmv_marketing_quote_acceptances")
  .select("id").eq("request_id",request.id).eq("owner_id",owner)
  .eq("quote_revision",revision).eq("quoted_price_cents",cents).maybeSingle();
 if(acceptError||!acceptance)
  return NextResponse.json({error:"quote_acceptance_required"},{status:409,headers:noStore});
 const {data:paid,error:paidError}=await db.from("vmv_marketing_campaign_test_payments")
  .select("id").eq("request_id",request.id).eq("quote_revision",revision).maybeSingle();
 if(paidError)return NextResponse.json({error:"payment_records_unavailable"},{status:503,headers:noStore});
 if(paid)return NextResponse.json({error:"already_paid_test"},{status:409,headers:noStore});
 const fields:Record<string,string>={
  mode:"payment","payment_method_types[0]":"card",
  "line_items[0][price_data][currency]":"usd",
  "line_items[0][price_data][unit_amount]":String(cents),
  "line_items[0][price_data][product_data][name]":"VMV Marketing — campaña (servicio de prueba)",
  "line_items[0][quantity]":"1",
  client_reference_id:owner,
  "metadata[vmv_payment_kind]":"campaign_setup",
  "metadata[vmv_campaign_request_id]":request.id,
  "metadata[vmv_campaign_quote_revision]":String(revision),
  "metadata[vmv_campaign_amount_cents]":String(cents),
  "metadata[smartjob_user_id]":owner,
  success_url:origin+"/vista-app/marketing/requests?campaign_payment=processing",
  cancel_url:origin+"/vista-app/marketing/requests?campaign_payment=canceled",
  billing_address_collection:"required"
 };
 try{
  const result=await stripePost("checkout/sessions",fields);
  if(typeof result.url!=="string"||!result.url.startsWith("https://checkout.stripe.com/"))
   throw new Error("checkout_url_unavailable");
  return NextResponse.json({url:result.url,mode:"test",amount_cents:cents,currency:"usd",note:"VMV service fee only; ad spend is separate"},{headers:noStore});
 }catch{return NextResponse.json({error:"checkout_unavailable"},{status:502,headers:noStore});}
}
