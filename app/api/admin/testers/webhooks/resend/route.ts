import {NextRequest,NextResponse} from "next/server";
import {validResendWebhook,registerProviderEvent,updateProviderDelivery} from "@/lib/vmv-tester-webhooks";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const raw=await req.text();
 if(raw.length>120000||!validResendWebhook(req.headers,raw))
  return NextResponse.json({error:"Unauthorized"},{status:403});
 let event:{type?:string;data?:{email_id?:string;id?:string}};
 try{event=JSON.parse(raw);}catch{return NextResponse.json({error:"Invalid payload"},{status:400});}
 const id=req.headers.get("svix-id")||"";
 const providerId=event.data?.email_id||event.data?.id||"";
 if(!providerId)return NextResponse.json({ok:true});
 const state=event.type==="email.delivered"?"delivered":
  ["email.bounced","email.failed","email.complained"].includes(String(event.type))?"failed":null;
 if(state&&!await updateProviderDelivery("resend",providerId,state))
  return NextResponse.json({error:"Delivery update unavailable"},{status:503});
 const saved=await registerProviderEvent("resend",id);
 if(!saved.db)return NextResponse.json({error:"Unavailable"},{status:503});
 return NextResponse.json({ok:true,duplicate:!saved.fresh});
}
