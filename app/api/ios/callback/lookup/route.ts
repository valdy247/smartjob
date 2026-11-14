import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {paidServiceAllowed} from "@/lib/vmv-entitlements";
import {callbackDb,callbackEnabled,callerPhone,validCallSid} from "@/lib/vmv-callback";
import {resolveOriginalCaller} from "@/lib/vmv-caller-lookup";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store, max-age=0"};
const answer=(value:object,status=200)=>NextResponse.json(value,{status,headers});
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return answer({error:"unauthorized"},401);
 if(!callbackEnabled())return answer({error:"callback_not_enabled"},503);
 const body=await req.json().catch(()=>null);
 const sid=body?.bridgeSid;
 if(!validCallSid(sid))return answer({error:"invalid_call"},400);
 const db=callbackDb();
 if(!db)return answer({error:"service_unavailable"},503);
 if(!await paidServiceAllowed(owner,"direct_call"))return answer({error:"active_plan_required"},403);
 const {data:route,error}=await db.from("smartjob_phone_routes").select("twilio_number")
  .eq("user_id",owner).eq("enabled",true).eq("receive_method","ios_app").limit(1).maybeSingle();
 if(error)return answer({error:"service_unavailable"},503);
 const business=route?.twilio_number;
 if(!callerPhone(business)||business!==process.env.TWILIO_NUMBER)
  return answer({error:"line_not_ready"},403);
 const phone=await resolveOriginalCaller(db,owner,sid,business);
 if(!phone)return answer({error:"caller_unavailable"},404);
 return answer({phone,verified:true});
}
