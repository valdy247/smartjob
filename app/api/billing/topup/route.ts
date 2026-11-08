import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {TOPUP_CATALOG,getBillingAccount,eligible,isPlan,stripeTestReady,topupPriceEnv} from "@/lib/vmv-billing";
import {callbackOrigin,noStore,stripePost} from "@/lib/vmv-stripe";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const uid=await authenticatedUser(req);
 if(!uid)return NextResponse.json({error:"unauthorized"},{status:401,headers:noStore});
 const body=await req.json().catch(()=>null);
 if(!body||!isPlan(body.plan))return NextResponse.json({error:"invalid_plan"},{status:400,headers:noStore});
 const account=await getBillingAccount(uid),origin=callbackOrigin(req.url);
 if(!eligible(account)||account?.plan_code!==body.plan||!account.stripe_customer_id)
  return NextResponse.json({error:"active_plan_required"},{status:403,headers:noStore});
 const price=topupPriceEnv(body.plan),tax=process.env.SMARTJOB_TAX_MODE;
 if(!stripeTestReady()||!origin||!/^price_[a-zA-Z0-9]+$/.test(price)||
    !["automatic","not_collected"].includes(tax||""))
  return NextResponse.json({error:"topup_not_configured"},{status:503,headers:noStore});
 const bundle=TOPUP_CATALOG[body.plan];
 const fields:Record<string,string>={
  mode:"payment",customer:account.stripe_customer_id,
  "line_items[0][price]":price,"line_items[0][quantity]":"1",
  client_reference_id:uid,"metadata[smartjob_user_id]":uid,
  "metadata[vmv_topup_plan]":body.plan,
  "metadata[vmv_topup_minutes]":String(bundle.minutes),
  success_url:origin+"/?vmv_topup=success",
  cancel_url:origin+"/?vmv_topup=canceled",
  billing_address_collection:"required"
 };
 if(tax==="automatic")fields["automatic_tax[enabled]"]="true";
 try{
  const session=await stripePost("checkout/sessions",fields);
  if(typeof session.url!=="string"||!session.url.startsWith("https://checkout.stripe.com/"))
   throw new Error("invalid_checkout_url");
  return NextResponse.json({url:session.url,mode:"test"},{headers:noStore});
 }catch{return NextResponse.json({error:"topup_unavailable"},{status:502,headers:noStore});}
}
