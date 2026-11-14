import {createHmac,timingSafeEqual} from "node:crypto";
import {billingAdmin} from "@/lib/vmv-billing";
const compare=(a:string,b:string)=>{
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
};
export const validResendWebhook=(headers:Headers,raw:string)=>{
 const secret=process.env.RESEND_WEBHOOK_SECRET||"",id=headers.get("svix-id")||"",
  stamp=headers.get("svix-timestamp")||"",sig=headers.get("svix-signature")||"";
 if(!secret.startsWith("whsec_")||!id||!/^[0-9]{10,15}$/.test(stamp)||!sig)return false;
 if(Math.abs(Date.now()/1000-Number(stamp))>300)return false;
 const digest=createHmac("sha256",Buffer.from(secret.slice(6),"base64"))
  .update(id+"."+stamp+"."+raw).digest("base64");
 return sig.split(" ").some(s=>s.startsWith("v1,")&&compare(s.slice(3),digest));
};
export const validTwilioWebhook=(headers:Headers,params:URLSearchParams,endpoint:string)=>{
 const token=process.env.TWILIO_AUTH_TOKEN||"",received=headers.get("x-twilio-signature")||"";
 if(!token||!received||!/^https:\/\//.test(endpoint))return false;
 // Twilio signs the literal callback URL followed by lexically sorted form keys/values.
 const entries=[...params.entries()].sort(([a],[b])=>a.localeCompare(b,"en"));
 const payload=endpoint+entries.map(([key,value])=>key+value).join("");
 return compare(received,createHmac("sha1",token).update(payload).digest("base64"));
};
export async function registerProviderEvent(provider:"resend"|"twilio",eventId:string){
 const db=billingAdmin();
 if(!db||eventId.length<3||eventId.length>200)return {db:null,fresh:false};
 const r=await db.from("vmv_admin_tester_webhook_events").insert({provider,event_id:eventId});
 if(r.error)return {db:r.error.code==="23505"?db:null,fresh:false};
 return {db,fresh:true};
}
export async function updateProviderDelivery(provider:"resend"|"twilio",providerId:string,state:"accepted"|"delivered"|"failed"){
 const db=billingAdmin();
 if(!db||!providerId||providerId.length>120)return false;
 const query=db.from("vmv_admin_tester_deliveries").update({
  state,updated_at:new Date().toISOString(),...(state==="delivered"?{delivered_at:new Date().toISOString()}:{})
 }).eq("provider",provider).eq("provider_id",providerId)
   .in("state",state==="accepted"?["accepted","processing","unknown"]:["accepted","unknown","processing","failed"]);
 const r=await query.select("id,tester_id");
 if(r.error)return false;
 for(const row of r.data||[]){
  await db.from("vmv_admin_tester_events").insert({tester_id:row.tester_id,delivery_id:row.id,
   operation:"provider_"+state,context:{provider}});
 }
 return true;
}
