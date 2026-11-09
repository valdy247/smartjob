import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {getBillingAccount,stripeTestReady} from "@/lib/vmv-billing";
import {callbackOrigin,noStore,stripePost} from "@/lib/vmv-stripe";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const uid=await authenticatedUser(req);
 if(!uid)return NextResponse.json({error:"unauthorized"},{status:401,headers:noStore});
 const account=await getBillingAccount(uid),origin=callbackOrigin(req.url);
 if(!stripeTestReady()||!origin||!account?.stripe_customer_id)
  return NextResponse.json({error:"portal_unavailable"},{status:503,headers:noStore});
 try{
  const session=await stripePost("billing_portal/sessions",{
    customer:account.stripe_customer_id,return_url:origin+"/?vmv_billing=return"
  });
  if(typeof session.url!=="string"||
     !/^https:\/\/billing\.stripe\.com\//.test(session.url))
   throw new Error("invalid_portal_url");
  return NextResponse.json({url:session.url},{headers:noStore});
 }catch{return NextResponse.json({error:"portal_unavailable"},{status:502,headers:noStore});}
}
