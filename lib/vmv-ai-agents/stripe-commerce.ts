import {createHmac,timingSafeEqual} from "node:crypto";

// Merchant money must never flow through VMV's SaaS subscription Stripe account.
export const merchantTestEnabled=()=>process.env.VERCEL_ENV==="preview"&&
 process.env.VMV_AI_COMMERCE_TEST_ENABLED==="true"&&
 /^sk_test_[A-Za-z0-9]+$/.test(process.env.VMV_AI_COMMERCE_STRIPE_SECRET_KEY||"");
const key=()=>process.env.VMV_AI_COMMERCE_STRIPE_SECRET_KEY||"";
const accountPattern=/^acct_[A-Za-z0-9]+$/;
export function validConnectedAccount(account:string){return accountPattern.test(account);}
export async function stripeMerchantApi(path:string,account:string,method:"GET"|"POST"="GET",
 fields?:URLSearchParams,idempotencyKey?:string){
 if(!merchantTestEnabled()||!validConnectedAccount(account))throw Error("Merchant test mode is not configured");
 const headers:Record<string,string>={
  Authorization:"Bearer "+key(),"Stripe-Account":account
 };
 if(method==="POST")headers["Content-Type"]="application/x-www-form-urlencoded";
 if(idempotencyKey)headers["Idempotency-Key"]=idempotencyKey;
 const response=await fetch("https://api.stripe.com/v1/"+path,{
  method,headers,body:method==="POST"?fields?.toString():undefined,cache:"no-store",
  signal:AbortSignal.timeout(7500)
 });
 if(!response.ok)throw Error("Checkout provider unavailable");
 return response.json() as Promise<Record<string,unknown>>;
}
export async function verifyMerchantAccount(account:string){
 if(!merchantTestEnabled()||!validConnectedAccount(account))return false;
 // Account lookup is on the platform context, not on the connected account.
 const res=await fetch("https://api.stripe.com/v1/accounts/"+encodeURIComponent(account),{
  headers:{Authorization:"Bearer "+key()},cache:"no-store",signal:AbortSignal.timeout(5000)
 });
 if(!res.ok)return false;
 const x=await res.json();
 return x.id===account&&x.charges_enabled===true&&x.details_submitted===true;
}
export function verifiedStripeWebhook(raw:string,signature:string){
 const secret=process.env.VMV_AI_COMMERCE_STRIPE_WEBHOOK_SECRET||"";
 if(!/^whsec_[A-Za-z0-9]+$/.test(secret)||raw.length>150000||!signature)return null;
 const tokens=signature.split(",").map(p=>p.trim());
 const t=tokens.find(x=>x.startsWith("t="))?.slice(2)||"";
 const signatures=tokens.filter(x=>x.startsWith("v1=")).map(x=>x.slice(3));
 const time=Number(t);
 if(!Number.isSafeInteger(time)||Math.abs(Date.now()/1000-time)>300)return null;
 const expected=createHmac("sha256",secret).update(t+"."+raw).digest();
 const valid=signatures.some(sig=>{
  if(!/^[a-f0-9]{64}$/i.test(sig))return false;
  const received=Buffer.from(sig,"hex");
  return received.length===expected.length&&timingSafeEqual(received,expected);
 });
 if(!valid)return null;
 try{const event=JSON.parse(raw);
  return event&&typeof event==="object"?event as Record<string,unknown>:null;
 }catch{return null;}
}
