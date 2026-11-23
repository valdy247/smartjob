import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {PACKAGES,creditPurchasesEnabled} from "../credits/route";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const response=(x:Record<string,unknown>,status=200)=>NextResponse.json(x,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return response({error:"authentication_required"},401);
 if(!creditPurchasesEnabled())return response({error:"studio_credit_purchases_not_ready"},503);
 const input=await req.json().catch(()=>null);
 if(input?.confirmPurchase!==true)return response({error:"studio_credit_purchase_confirmation_required"},403);
 const pack=PACKAGES.find(p=>p.id===input?.pack);
 if(!pack)return response({error:"studio_invalid_credit_package"},400);
 // Stripe test mode ONLY: never start a live payment from this preview endpoint.
 const key=process.env.STRIPE_SECRET_KEY||"";
 if(!key.startsWith("sk_test_"))return response({error:"studio_credit_purchases_not_ready"},503);
 const base=req.nextUrl.origin;
 if(!base.startsWith("https://")||!new URL(base).hostname.endsWith(".vercel.app"))
  return response({error:"studio_checkout_origin_invalid"},400);
 const form=new URLSearchParams({
  mode:"payment",client_reference_id:owner,
  "line_items[0][quantity]":"1",
  "line_items[0][price_data][currency]":"usd",
  "line_items[0][price_data][unit_amount]":String(pack.usdCents),
  "line_items[0][price_data][product_data][name]":"VMV Video Studio · "+pack.credits+" créditos de prueba",
  "metadata[pack]":pack.id,"metadata[credits]":String(pack.credits),
  "success_url":base+"/vista-app/video-studio?credits=success",
  "cancel_url":base+"/vista-app/video-studio?credits=cancelled"
 });
 try{
  const result=await fetch("https://api.stripe.com/v1/checkout/sessions",{
   method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/x-www-form-urlencoded",
    "Idempotency-Key":"vmvstudio-checkout-"+owner+"-"+pack.id+"-"+(input?.clientKey||"")},body:form,
   signal:AbortSignal.timeout(16000),cache:"no-store"
  });
  const data=await result.json().catch(()=>null);
  if(!result.ok||typeof data?.url!=="string"||!data.url.startsWith("https://checkout.stripe.com/"))
   return response({error:"studio_stripe_checkout_unavailable"},503);
  return response({url:data.url,mode:"test"});
 }catch{return response({error:"studio_stripe_checkout_unavailable"},503);}
}
