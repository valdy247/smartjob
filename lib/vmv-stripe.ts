import {createHmac,timingSafeEqual} from "node:crypto";
import {stripeTestReady} from "@/lib/vmv-billing";

const noStore={"Cache-Control":"no-store"};
export {noStore};
export async function stripePost(path:string,fields:Record<string,string>){
 if(!stripeTestReady())throw new Error("stripe_test_not_configured");
 const result=await fetch("https://api.stripe.com/v1/"+path,{
  method:"POST",cache:"no-store",signal:AbortSignal.timeout(12000),
  headers:{Authorization:"Bearer "+process.env.STRIPE_SECRET_KEY,
    "Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams(fields).toString()
 });
 const data=await result.json().catch(()=>({}));
 if(!result.ok){
  console.error("VMV Stripe response",path,result.status,
    typeof data?.error?.code==="string"?data.error.code:"stripe_error");
  throw new Error("stripe_request_failed");
 }
 return data as Record<string,unknown>;
}
export function verifyStripeWebhook(body:string,signature:string,secret:string){
 if(!secret.startsWith("whsec_")||body.length>300000||!signature)return false;
 const parts=signature.split(",").map(x=>x.trim().split("="));
 const t=parts.find(x=>x[0]==="t")?.[1]||"";
 const validSigs=parts.filter(x=>x[0]==="v1").map(x=>x[1]);
 if(!/^\d{10}$/.test(t)||Math.abs(Date.now()/1000-Number(t))>300)return false;
 const digest=createHmac("sha256",secret).update(t+"."+body).digest("hex");
 return validSigs.some(s=>/^[a-f\d]{64}$/i.test(s)&&
   timingSafeEqual(Buffer.from(s,"hex"),Buffer.from(digest,"hex")));
}
export function callbackOrigin(reqUrl:string){
 const configured=process.env.SMARTJOB_PUBLIC_APP_URL||"";
 const raw=configured||new URL(reqUrl).origin;
 try{
  const url=new URL(raw);
  if(url.protocol!=="https:")return null;
  if(!url.hostname.endsWith(".vercel.app")&&
     !["vmvcall.com","www.vmvcall.com","smartjob-xi.vercel.app"].includes(url.hostname))
    return null;
  return url.origin;
 }catch{return null;}
}
