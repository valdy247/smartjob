import {NextRequest,NextResponse} from "next/server";
import {callbackDb,callbackEnabled,validUuid,verifiedCallbackWebhook} from "@/lib/vmv-callback";
import {nationalPilotFor,settleNational} from "@/lib/vmv-national-minutes";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
const ok=()=>new NextResponse(null,{status:204,headers});
export async function POST(req:NextRequest){
 if(!callbackEnabled())return new NextResponse(null,{status:503,headers});
 const fields=await verifiedCallbackWebhook(req);
 if(!fields)return new NextResponse(null,{status:403,headers});
 const id=req.nextUrl.searchParams.get("intent");
 if(!validUuid(id))return new NextResponse(null,{status:400,headers});
 const db=callbackDb();
 if(!db)return new NextResponse(null,{status:503,headers});
 const {data,error}=await db.from("smartjob_callback_requests")
  .select("owner_id,business_phone,twilio_leg_sid,status,claimed_at").eq("id",id).maybeSingle();
 if(error||!data)return new NextResponse(null,{status:404,headers});
 const client="client:sj_"+String(data.owner_id).replaceAll("-","");
 const sid=fields.get("CallSid")||"";
 if(fields.get("To")!==client||fields.get("From")!==data.business_phone||
    (data.twilio_leg_sid&&data.twilio_leg_sid!==sid))
  return new NextResponse(null,{status:403,headers});
 const state=fields.get("CallStatus")||"";
 const completed=state==="completed";
 const failed=["failed","busy","no-answer","canceled"].includes(state);
 if(!completed&&!failed)return ok();
 // If the owner never accepted, there was no customer conversation.
 // Once bridged, the signed <Dial action> owns final minute settlement.
 if(!data.claimed_at&&nationalPilotFor(data.owner_id)){
  if(!await settleNational("out:"+id,0))
   return new NextResponse(null,{status:503,headers});
 }
 // Never turn an already-finalized request back into pending.
 await db.from("smartjob_callback_requests")
  .update({status:completed?"completed":"failed",twilio_leg_sid:sid,
    finished_at:new Date().toISOString()})
  .eq("id",id).eq("owner_id",data.owner_id).in("status",["pending","ringing","bridged"]);
 return ok();
}
