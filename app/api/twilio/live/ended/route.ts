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
  console.info("Smart Job paired leg callback",{isInbound:callbackSid===bridge,status:state,duration:Number.isFinite(seconds)?seconds:null});
  if(terminal.includes(state)||callbackSid===bridge){
    await updatePhoneSession(bridge,terminal.includes(state)?state:"completed",
      Number.isInteger(seconds)&&seconds>=0?seconds:undefined);
  }
  // Always settle an already-reserved call even if the test feature toggle
  // changes while the call is connected. Ignore extra Twilio zero callbacks,
  // and rely on the atomic database settlement for replay protection.
  const pair=await getPairedCallSids(bridge);
  if(pair&&pair.reservedMinutes>0&&!pair.billingSettled&&
     callbackSid!==bridge&&terminal.includes(state)){
    if(Number.isInteger(seconds)&&seconds>0)await settleCallMinutes(bridge,seconds);
    else if(["failed","busy","no-answer","canceled"].includes(state))
      await settleCallMinutes(bridge,0);
  }
  // A caller hanging up must immediately cancel the separately-created
  // outbound phone call. Render's WebSocket room may not exist yet.
  const other=callbackSid===bridge?pair?.outboundSid:bridge;
  if(other&&other!==callbackSid&&terminal.includes(state)){
    const account=process.env.TWILIO_ACCOUNT_SID||p.get("AccountSid")||"";
    const token=process.env.TWILIO_AUTH_TOKEN||"";
    if(/^AC[a-f\\d]{32}$/i.test(account)&&token){
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
