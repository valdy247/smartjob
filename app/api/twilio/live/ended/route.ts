import {createHmac} from "node:crypto";
import {NextRequest} from "next/server";
import {twiml} from "@/lib/twilio-pilot";
import {verifiedBridge,verifiedLiveRequest} from "@/lib/twilio-live";
import {updatePhoneSession} from "@/lib/phone-routes";
export const runtime="nodejs";
export const dynamic="force-dynamic";

// Twilio invokes this after <Connect> returns or the outbound leg reaches a
// terminal state. It never includes transcripts, and only a valid Twilio call
// and a server-generated bridge signature can terminate the paired session.
export async function POST(req:NextRequest){
  const p=await verifiedLiveRequest(req,null);
  if(!p)return twiml("<Hangup/>",403);
  const q=req.nextUrl.searchParams;
  const bridge=q.get("bridge")||"",sig=q.get("sig")||"";
  if(!verifiedBridge(bridge,sig))return twiml("<Hangup/>",403);
  const callbackSid=p.get("CallSid")||"";
  if(!/^CA[a-f\d]{32}$/i.test(callbackSid))return twiml("<Hangup/>",403);
  const state=p.get("CallStatus")||"";
  const seconds=Number(p.get("CallDuration")||"");
  const terminal=["completed","busy","failed","no-answer","canceled"];
  if(terminal.includes(state)||callbackSid===bridge){
    await updatePhoneSession(bridge,terminal.includes(state)?state:"completed",
      Number.isInteger(seconds)&&seconds>=0?seconds:undefined);
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
