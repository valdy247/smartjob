import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {getBillingAccount,isPlan,priceEnv,stripeTestReady} from "@/lib/vmv-billing";
import {callbackOrigin,noStore,stripePost} from "@/lib/vmv-stripe";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const uid=await authenticatedUser(req);
 if(!uid)return NextResponse.json({error:"unauthorized"},{status:401,headers:noStore});
 const body=await req.json().catch(()=>null);
 if(!body||!isPlan(body.plan))return NextResponse.json({error:"invalid_plan"},{status:400,headers:noStore});
 const tax=process.env.SMARTJOB_TAX_MODE;
 const price=priceEnv(body.plan);
 const origin=callbackOrigin(req.url);
 if(!stripeTestReady()||!origin||!/^price_[a-zA-Z0-9]+$/.test(price)||
    !["automatic","not_collected"].includes(tax||""))
    return NextResponse.json({error:"checkout_not_configured"},{status:503,headers:noStore});
 const current=await getBillingAccount(uid);
 if(current&&["active","trialing","past_due"].includes(current.status))
   return NextResponse.json({error:"manage_existing_subscription"},{status:409,headers:noStore});
 const fields:Record<string,string>={
  mode:"subscription",
  "line_items[0][price]":price,"line_items[0][quantity]":"1",
  client_reference_id:uid,
  "metadata[smartjob_user_id]":uid,
  "subscription_data[metadata][smartjob_user_id]":uid,
  success_url:origin+"/?vmv_checkout=success",
  cancel_url:origin+"/?vmv_checkout=canceled",
  billing_address_collection:"required",
  "allow_promotion_codes":"true"
 };
 if(tax==="automatic")fields["automatic_tax[enabled]"]="true";
 if(current?.stripe_customer_id)fields.customer=current.stripe_customer_id;
 try{
  const result=await stripePost("checkout/sessions",fields);
  if(typeof result.url!=="string"||!result.url.startsWith("https://checkout.stripe.com/"))
   throw new Error("invalid_checkout_url");
  return NextResponse.json({url:result.url,mode:"test"},{headers:noStore});
 }catch{return NextResponse.json({error:"checkout_unavailable"},{status:502,headers:noStore});}
}
