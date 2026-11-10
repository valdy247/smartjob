import {createHmac} from "node:crypto";
import {NextRequest} from "next/server";
import {twiml} from "@/lib/twilio-pilot";
import {verifiedBridge,verifiedLiveRequest} from "@/lib/twilio-live";
import {updatePhoneSession,getPairedCallSids} from "@/lib/phone-routes";
import {settleCallMinutes} from "@/lib/vmv-billing";
export const runtime="nodejs";
export const dynamic="force-dynamic";

// Twilio invokes this after <Connect> returns or the outbound leg reaches a
// terminal state. It never includes transcripts, and only a valid Twilio call
// and a server-generated bridge signature can terminate the paired session.
export async function POST(req:NextRequest){
  const p=await verifiedLiveRequest(req,null);
  if(!p){console.error("Smart Job paired end webhook authentication rejected");return twiml("<Hangup/>",403);}
  const q=req.nextUrl.searchParams;
  const bridge=q.get("bridge")||"",sig=q.get("sig")||"";
  if(!verifiedBridge(bridge,sig)){console.error("Smart Job paired end signature rejected");return twiml("<Hangup/>",403);}
  const callbackSid=p.get("CallSid")||"";
  if(!/^CA[a-f\d]{32}$/i.test(callbackSid))return twiml("<Hangup/>",403);
  const state=p.get("CallStatus")||"";
  const seconds=Number(p.get("CallDuration")||"");
  const terminal=["completed","busy","failed","no-answer","canceled"];
  // Twilio issues non-terminal progress callbacks when the iPhone starts
  // ringing. They must never be treated as a call hangup or close the bridge.
  if(callbackSid!==bridge&&["initiated","ringing","in-progress","answered","queued"].includes(state)){
    console.info("Smart Job iOS outbound progress",{state});
    return twiml("<Hangup/>");
  }
  // ConversationRelay <Connect action> callbacks include session diagnostics
  // even when the phone leg itself reports CallStatus=in-progress. No PII.
  const sessionStatus=p.get("SessionStatus")||"";
  const sessionErrorCode=p.get("ErrorCode")||"";
  const sessionDuration=p.get("SessionDuration")||"";
  console.info("Smart Job paired leg callback",{
    isInbound:callbackSid===bridge,
    status:state,
    duration:Number.isFinite(seconds)?seconds:null,
    relayStatus:/^(ended|completed|failed)$/.test(sessionStatus)?sessionStatus:null,
    relayError:/^\d{5}$/.test(sessionErrorCode)?sessionErrorCode:null,
    relaySeconds:/^\d{1,5}$/.test(sessionDuration)?Number(sessionDuration):null
  });
  // Only the outbound (answered owner) leg represents billable translation.
  // The inbound caller may wait on an IVR/hold for a long time without an
  // interpreter. Never overwrite the session's billed duration with that wait.
  const pair=await getPairedCallSids(bridge);
  const ownerLeg=Boolean(pair?.outboundSid&&callbackSid===pair.outboundSid);
  if(terminal.includes(state)||callbackSid===bridge){
    await updatePhoneSession(bridge,terminal.includes(state)?state:"completed",
      ownerLeg&&Number.isInteger(seconds)&&seconds>0?seconds:undefined);
  }
  // Twilio can send an early completed callback with CallDuration=0 and
  // a later completed callback with the true duration. Never settle that
  // first zero prematurely: it would release all paid minutes without
  // recording actual usage. The existing 5-minute DB reaper releases a
  // zero-duration completed call if no positive duration ever follows.
  // Other terminal failure states are settled with zero immediately.
  if(pair&&pair.reservedMinutes>0&&!pair.billingSettled&&
     callbackSid===pair.outboundSid&&terminal.includes(state)){
    const measured=Number.isInteger(seconds)&&seconds>0?seconds:0;
    if(measured>0||state!=="completed"){
      if(!await settleCallMinutes(bridge,measured))
        console.error("VMV completed call minute settlement failed",{status:state});
    }else{
      console.info("VMV awaiting final Twilio duration to settle reserved call");
    }
  }
  // A caller hanging up must immediately cancel the separately-created
  // outbound phone call. Render's WebSocket room may not exist yet.
  const other=callbackSid===bridge?pair?.outboundSid:bridge;
  if(other&&other!==callbackSid&&terminal.includes(state)){
    const account=process.env.TWILIO_ACCOUNT_SID||p.get("AccountSid")||"";
    const token=process.env.TWILIO_AUTH_TOKEN||"";
    if(/^AC[a-f\d]{32}$/i.test(account)&&token){
      try{
        const reply=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+account+"/Calls/"+other+".json",{
          method:"POST",cache:"no-store",signal:AbortSignal.timeout(4500),
          headers:{"Content-Type":"application/x-www-form-urlencoded",
            Authorization:"Basic "+Buffer.from(account+":"+token).toString("base64")},
          body:"Status=completed"
        });
        console.info("Smart Job paired leg canceled",{isInbound:callbackSid===bridge,http:reply.status});
      }catch(e){console.error("Smart Job paired leg cancel failed",e instanceof Error?e.name:"unknown");}
    }
  }
  const stamp=String(Math.floor(Date.now()/1000));
  const signature=createHmac("sha256",process.env.TWILIO_AUTH_TOKEN||"")
    .update("smartjob-end-v1\n"+stamp+"\n"+bridge).digest("hex");
  const url=(process.env.SMARTJOB_LIVE_WS_URL||"").replace(/^wss:\/\//,"https://").replace(/\/relay$/,"/internal/end");
  try{
    const res=await fetch(url,{method:"POST",headers:{"Content-Type":"text/plain","x-smartjob-timestamp":stamp,"x-smartjob-signature":signature},
      body:bridge,signal:AbortSignal.timeout(4500),cache:"no-store"});
    if(!res.ok)console.error("Smart Job paired hangup callback HTTP",res.status);
  }catch(e){console.error("Smart Job paired hangup callback unavailable",e instanceof Error?e.name:"unknown");}
  return twiml("<Hangup/>");
}
