import {NextRequest,NextResponse} from "next/server";
import {createHmac,timingSafeEqual} from "node:crypto";
import {videoDb,validUuid} from "@/lib/vmv-video-generator";
import {PACKAGES} from "../credits/route";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(ok:boolean,status=200)=>NextResponse.json(ok?{received:true}:{error:"invalid_webhook"},{status});
function verifiedStripeSignature(raw:string,header:string,secret:string){
 const fields=header.split(",").map(x=>x.trim());
 const timestamp=fields.find(x=>x.startsWith("t="))?.slice(2)||"";
 const sigs=fields.filter(x=>x.startsWith("v1=")).map(x=>x.slice(3));
 const now=Math.floor(Date.now()/1000),time=Number(timestamp);
 if(!Number.isInteger(time)||Math.abs(now-time)>300||sigs.length<1)return false;
 const expected=createHmac("sha256",secret).update(timestamp+"."+raw).digest();
 return sigs.some(s=>{
  if(!/^[0-9a-f]{64}$/.test(s))return false;
  return timingSafeEqual(Buffer.from(s,"hex"),expected);
 });
}
export async function POST(req:NextRequest){
 if(process.env.VERCEL_ENV!=="preview"||process.env.VMV_STUDIO_CREDIT_PURCHASES_ENABLED!=="true"||
  !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_"))return reply(false,503);
 const secret=process.env.VMV_STUDIO_STRIPE_WEBHOOK_SECRET||"";
 if(!secret.startsWith("whsec_"))return reply(false,503);
 const contentLength=Number(req.headers.get("content-length")||0);
 if(contentLength>200000)return reply(false,413);
 const raw=await req.text();
 if(raw.length>200000||!verifiedStripeSignature(raw,req.headers.get("stripe-signature")||"",secret))
  return reply(false,400);
 let event:Record<string,any>;
 try{event=JSON.parse(raw);}catch{return reply(false,400);}
 if(event.livemode!==false||typeof event.id!=="string"||!event.id.startsWith("evt_"))
  return reply(false,400);
 if(event.type!=="checkout.session.completed")return reply(true);
 const session=event.data?.object;
 if(session?.object!=="checkout.session"||session.mode!=="payment"||
  session.payment_status!=="paid"||session.currency!=="usd"||
  !validUuid(session.client_reference_id)||typeof session.id!=="string")
  return reply(false,400);
 const pack=PACKAGES.find(p=>p.id===session.metadata?.pack);
 if(!pack||Number(session.metadata?.credits)!==pack.credits||
  session.amount_total!==pack.usdCents||session.livemode!==false)
  return reply(false,400);
 try{
  const {error}=await videoDb().rpc("vmv_studio_credit_purchase",{
   p_owner:session.client_reference_id,p_credits:pack.credits,p_session:session.id
  });
  return error?reply(false,503):reply(true);
 }catch{return reply(false,503);}
}
