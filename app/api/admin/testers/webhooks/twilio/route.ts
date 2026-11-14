import {NextRequest,NextResponse} from "next/server";
import {validTwilioWebhook,registerProviderEvent,updateProviderDelivery} from "@/lib/vmv-tester-webhooks";
import {billingAdmin} from "@/lib/vmv-billing";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const text=await req.text();
 if(text.length>50000||!req.headers.get("content-type")?.includes("application/x-www-form-urlencoded"))
  return new NextResponse("",{status:400});
 const params=new URLSearchParams(text),base=process.env.VMV_TESTER_PUBLIC_BASE_URL||"";
 let endpoint="";
 try{endpoint=new URL("/api/admin/testers/webhooks/twilio",base).toString();}
 catch{return new NextResponse("",{status:503});}
 if(!validTwilioWebhook(req.headers,params,endpoint))return new NextResponse("",{status:403});
 const sid=params.get("MessageSid")||params.get("SmsSid")||"";
 const status=(params.get("MessageStatus")||params.get("SmsStatus")||"").toLowerCase();
 const from=params.get("From")||"",body=(params.get("Body")||"").trim().toUpperCase();
 // This is the callback destination for the sender. Inbound STOP is accepted
 // only after Twilio's signature validates, and only for an exact E.164 match.
 if(["STOP","STOPALL","UNSUBSCRIBE","CANCEL","END","QUIT"].includes(body)&&/^\+[1-9][0-9]{7,14}$/.test(from)){
  const db=billingAdmin();
  if(!db)return new NextResponse("",{status:503});
  const updated=await db.from("vmv_admin_testers").update({sms_opted_out_at:new Date().toISOString(),updated_at:new Date().toISOString()})
   .eq("phone_e164",from).select("id");
  if(updated.error)return new NextResponse("",{status:503});
  const event=await registerProviderEvent("twilio","inbound-"+sid);
  if(!event.db)return new NextResponse("",{status:503});
  return new NextResponse("<Response></Response>",{status:200,headers:{"Content-Type":"text/xml"}});
 }
 if(sid&&status){
  const state=status==="delivered"?"delivered":["failed","undelivered"].includes(status)?"failed":
   ["sent","queued","sending","accepted"].includes(status)?"accepted":null;
  if(state&&!await updateProviderDelivery("twilio",sid,state))
   return new NextResponse("",{status:503});
  const event=await registerProviderEvent("twilio",sid+":"+status);
  if(!event.db)return new NextResponse("",{status:503});
 }
 return new NextResponse("<Response></Response>",{status:200,headers:{"Content-Type":"text/xml"}});
}
