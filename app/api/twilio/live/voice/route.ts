import {NextRequest} from "next/server";
import {baseUrl,bridgeSignature,bridgeTwiML,E164,liveReady,notReady,verifiedLiveRequest,validatedConfig,type RelayOptions} from "@/lib/twilio-live";
import {findPhoneRoute,partnerSignature,reservePhoneSession,assignOutboundCall,updatePhoneSession,tenantsReady} from "@/lib/phone-routes";
import {say,twiml,xmlEscape} from "@/lib/twilio-pilot";
import {getPaidCallPreferences,selectedVoice} from "@/lib/vmv-voices";
import {languageMenuEnabled,ivrEligible,menuResponse,validSelectionSignature,interpretedLanguagesFor,testSpanishToEnglishFor} from "@/lib/vmv-ivr";
import {testCallCapSecondsFor,claimCallMinutes,settleCallMinutes} from "@/lib/vmv-billing";
import {paidServiceAllowed} from "@/lib/vmv-entitlements";
export const runtime="nodejs";
export const dynamic="force-dynamic";

const callSid=/^CA[a-f\d]{32}$/i,accountSid=/^AC[a-f\d]{32}$/i;
const configuredCallSeconds=Number(process.env.SMARTJOB_MAX_CALL_SECONDS||14400);
const maxDuration=Number.isFinite(configuredCallSeconds)?
  Math.min(14400,Math.max(60,Math.floor(configuredCallSeconds))):14400;
async function dial(sid:string,token:string,to:string,from:string,url:string,callback:string,seconds=maxDuration,ringTimeout=12){
  const payload=new URLSearchParams({
    To:to,From:from,Url:url,Method:"POST",Timeout:String(ringTimeout),TimeLimit:String(Math.min(maxDuration,Math.max(60,seconds))),
    StatusCallback:callback,StatusCallbackMethod:"POST"
  });
  // Record all call-progress milestones to identify APNs/PushKit delivery
  // failures without recording phone numbers or speech transcripts.
  for(const event of ["initiated","ringing","answered","completed"])
    payload.append("StatusCallbackEvent",event);
  const res=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+sid+"/Calls.json",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Authorization:"Basic "+Buffer.from(sid+":"+token).toString("base64")},
    body:payload.toString(),signal:AbortSignal.timeout(4500),cache:"no-store"
  });
  if(!res.ok){console.error("Smart Job outbound dial HTTP",res.status);return null;}
  const response=await res.json();
  return callSid.test(response.sid||"")?String(response.sid):null;
}
async function stopOutbound(sid:string,outbound:string,token:string){
  try{await fetch("https://api.twilio.com/2010-04-01/Accounts/"+sid+"/Calls/"+outbound+".json",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Authorization:"Basic "+Buffer.from(sid+":"+token).toString("base64")},
    body:"Status=completed",signal:AbortSignal.timeout(4000),cache:"no-store"
  });}catch{}
}
async function inboundAlive(sid:string,token:string,bridge:string){
 try{
  const response=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+sid+"/Calls/"+bridge+".json",{
   headers:{Authorization:"Basic "+Buffer.from(sid+":"+token).toString("base64")},
   signal:AbortSignal.timeout(3500),cache:"no-store"
  });
  if(!response.ok)return false;
  const call=await response.json();
  return ["in-progress","ringing","queued"].includes(String(call.status||""));
 }catch{return false;}
}
export async function POST(req:NextRequest){
  const fields=await verifiedLiveRequest(req,null);
  if(!fields)return twiml(say("Unauthenticated call.","en-US")+"<Hangup/>",403);
  const from=fields.get("From")||"",to=fields.get("To")||"",bridge=fields.get("CallSid")||"",
    sid=fields.get("AccountSid")||"",token=process.env.TWILIO_AUTH_TOKEN||"";
  if(!callSid.test(bridge)||!accountSid.test(sid)||!token)return twiml("<Hangup/>",403);
  if(process.env.TWILIO_ACCOUNT_SID&&sid!==process.env.TWILIO_ACCOUNT_SID)return twiml("<Hangup/>",403);
  if(!E164(from)||!E164(to))return twiml(say("Unsupported telephone number.","en-US")+"<Hangup/>");

  const pilot=to===E164(process.env.TWILIO_NUMBER)&&from===E164(process.env.SMARTJOB_DUO_EN_PHONE);
  let owner=E164(process.env.SMARTJOB_DUO_ES_PHONE),config:RelayOptions|undefined;
  let tenantId:string|undefined;
  let route:Awaited<ReturnType<typeof findPhoneRoute>>=null;
  // The menu runs only for activated iOS receiver routes and only when enabled.
  // Pilot calls keep the existing, tested path. Spanish never touches the relay.
  // The shared legacy pilot has no subscriber entitlement to charge against.
  if(pilot)return twiml("<Hangup/>");
  const ivr=languageMenuEnabled()&&!pilot&&tenantsReady();
  const chosenLanguage=req.nextUrl.searchParams.get("language")||"";
  if(ivr){
    route=await findPhoneRoute(to);
    if(!route)return twiml(say("This line is not active.","en-US")+"<Hangup/>");
    if(!ivrEligible(route))return twiml(say("Mobile reception is unavailable.","en-US")+"<Hangup/>");
    // Even a direct Spanish call uses a paid Twilio leg. No plan = no menu or dial.
    if(!await paidServiceAllowed(route.user_id,"direct_call"))return twiml("<Hangup/>");
    if(!chosenLanguage){
      const prefs=await getPaidCallPreferences(route.user_id);
      return menuResponse(prefs?.greeting_customer||undefined,0,testSpanishToEnglishFor(route.user_id));
    }
    if(chosenLanguage!=="en"||!validSelectionSignature(bridge,route.id,from,"en",
      req.nextUrl.searchParams.get("proof")||"")){
      return twiml("<Hangup/>",403);
    }
  }
  if(!liveReady())return notReady();
  if(!pilot){
    // Public multi-tenant routing is gated separately from the known-good pilot.
    if(!tenantsReady())return twiml(say("This telephone number is not yet enabled.","en-US")+"<Hangup/>");
    route=route||await findPhoneRoute(to);
    if(!route)return twiml(say("This telephone number is not yet enabled.","en-US")+"<Hangup/>");
    if(!await paidServiceAllowed(route.user_id,"translated_call"))return twiml("<Hangup/>");
    // The original forwarded Verizon number must never be dialed again.
    // Only provisioned, enabled routes can ring the native Twilio Voice client.
    if(route.receive_method==="ios_app"){
      if(process.env.SMARTJOB_IOS_VOICE_ENABLED!=="true"||
         !process.env.TWILIO_IOS_PUSH_CREDENTIAL_SID)
        return twiml(say("Mobile interpretation is not available yet.","en-US")+"<Hangup/>");
      owner="client:sj_"+route.user_id.replaceAll("-","");
    }else{
      owner=route.destination_phone;
    }
    tenantId=route.id;
    config={
      customer:from,twilio:to,owner,
      ...interpretedLanguagesFor(route,ivr),
      assistantName:route.assistant_name
    };
    if(!validatedConfig(config)){
      return twiml(say("All interpreters are currently busy. Please try again later.","en-US")+"<Hangup/>");
    }
    const prefs=await getPaidCallPreferences(route.user_id);
    if(prefs){
      config.greetingCustomer=ivr?undefined:(prefs.greeting_customer||undefined);
      config.greetingOwner=prefs.greeting_owner||undefined;
      config.voiceCustomer=selectedVoice(prefs.voice_customer,config.customerLanguage)||undefined;
      config.voiceOwner=selectedVoice(prefs.voice_owner,config.ownerLanguage)||undefined;
    }
  }
  // On Render's free plan, waking the idle WebSocket host can take longer than
  // Twilio's ConversationRelay handshake. Keep the caller on a bounded TwiML
  // hold loop until /health confirms the audio server is actually ready.
  // No outgoing PSTN leg or billable interpreter reservation is made while cold.
  const attemptRaw=req.nextUrl.searchParams.get("warm");
  const attempt=attemptRaw&&/^[0-8]$/.test(attemptRaw)?Number(attemptRaw):0;
  const healthUrl="https://"+new URL(process.env.SMARTJOB_LIVE_WS_URL||"wss://invalid.example/relay").host+"/health";
  let bridgeReady=false,atCapacity=false;
  try{
    const health=await fetch(healthUrl,{cache:"no-store",signal:AbortSignal.timeout(1700)});
    if(health.ok){
      const body=await health.json().catch(()=>null);
      bridgeReady=body?.ok===true&&body?.service==="smartjob-live-bridge";
      atCapacity=body?.accepting===false;
    }
  }catch{}
  if(!bridgeReady){
    if(attempt>=8){
      console.error("Smart Job bridge did not wake before call timeout");
      return twiml(say("Our interpreter is temporarily unavailable. Please try again shortly.","en-US")+"<Hangup/>");
    }
    console.info("Smart Job waiting for audio bridge to wake",{attempt});
    const ivrContinuation=ivr?"&language=en&proof="+encodeURIComponent(req.nextUrl.searchParams.get("proof")||""):"";
    const retry=xmlEscape(baseUrl+"/api/twilio/live/voice?warm="+(attempt+1)+ivrContinuation);
    return twiml((attempt===0?say("Smart Job is connecting your interpreter. Please hold.","en-US"):"")+
      '<Pause length="9"/><Redirect method="POST">'+retry+"</Redirect>");
  }
  if(atCapacity){
    return twiml(say("All interpreters are currently busy. Please try again shortly.","en-US")+"<Hangup/>");
  }
  if(route&&!await reservePhoneSession(bridge,route)){
    return twiml(say("All interpreters are currently busy. Please try again later.","en-US")+"<Hangup/>");
  }
  let reservedMinutes=0;
  if(route){
    reservedMinutes=await claimCallMinutes(bridge,route.user_id,Math.min(240,Math.ceil(maxDuration/60)));
    if(reservedMinutes<1){
      await updatePhoneSession(bridge,"failed");
      return twiml(say("Your available translated minutes have been used. Please renew or recharge your plan.","en-US")+"<Hangup/>");
    }
  }
  const signature=tenantId?partnerSignature(bridge,tenantId,from):bridgeSignature(bridge);
  const partnerUrl=baseUrl+"/api/twilio/live/partner?bridge="+bridge+"&sig="+signature+(ivr?"&ivr=en":"")+
    (tenantId?"&route="+encodeURIComponent(tenantId)+"&caller="+encodeURIComponent(from):"");
  const callback=baseUrl+"/api/twilio/live/ended?bridge="+bridge+"&sig="+bridgeSignature(bridge);
  try{
    if(!await inboundAlive(sid,token,bridge)){
      console.info("Smart Job caller disconnected before PSTN dial");
      if(reservedMinutes)await settleCallMinutes(bridge,0);
      if(route)await updatePhoneSession(bridge,"canceled");
      return twiml("<Hangup/>");
    }
    // A phone timeout and the minute-billing switch are distinct controls.
    // Preview test calls must end at 60s even when charging is paused.
    const previewCap=route?testCallCapSecondsFor(route.user_id):null;
    const callLimit=Math.min(reservedMinutes>0?reservedMinutes*60:maxDuration,
      previewCap||maxDuration);
    const outbound=await dial(sid,token,owner,to,partnerUrl,callback,
      callLimit,route?.receive_method==="ios_app"?30:12);
    if(!outbound){
      if(route)await updatePhoneSession(bridge,"failed");
      if(reservedMinutes)await settleCallMinutes(bridge,0);
      return twiml(say("We cannot connect your interpreter right now. Please try again.","en-US")+"<Hangup/>");
    }
    if(route&&!await assignOutboundCall(bridge,outbound)){
      await stopOutbound(sid,outbound,token);
      await updatePhoneSession(bridge,"failed");
      if(reservedMinutes)await settleCallMinutes(bridge,0);
      return twiml(say("Unable to connect. Please call again.","en-US")+"<Hangup/>");
    }
    console.info("Smart Job live outbound call accepted",route?"tenant":"pilot");
    return bridgeTwiML("customer",bridge,config);
  }catch(e){
    if(route)await updatePhoneSession(bridge,"failed");
    if(reservedMinutes)await settleCallMinutes(bridge,0);
    console.error("Smart Job live dial failed",e instanceof Error?e.name:"unknown");
    return twiml(say("Connection unavailable. Please try again.","en-US")+"<Hangup/>");
  }
}
