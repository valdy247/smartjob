import {NextRequest} from "next/server";
import {baseUrl,bridgeSignature,bridgeTwiML,E164,liveReady,notReady,verifiedLiveRequest,validatedConfig,type RelayOptions} from "@/lib/twilio-live";
import {findPhoneRoute,partnerSignature,reservePhoneSession,assignOutboundCall,updatePhoneSession,tenantsReady} from "@/lib/phone-routes";
import {say,twiml} from "@/lib/twilio-pilot";
export const runtime="nodejs";
export const dynamic="force-dynamic";

const callSid=/^CA[a-f\d]{32}$/i,accountSid=/^AC[a-f\d]{32}$/i;
const maxDuration=Math.min(1800,Math.max(60,Number(process.env.SMARTJOB_MAX_CALL_SECONDS||600)));
async function dial(sid:string,token:string,to:string,from:string,url:string,callback:string){
  const payload=new URLSearchParams({
    To:to,From:from,Url:url,Method:"POST",Timeout:"25",TimeLimit:String(maxDuration),
    StatusCallback:callback,StatusCallbackMethod:"POST",StatusCallbackEvent:"completed"
  });
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
export async function POST(req:NextRequest){
  const fields=await verifiedLiveRequest(req);
  if(!fields)return twiml(say("Unauthenticated call.","en-US")+"<Hangup/>",403);
  if(!liveReady())return notReady();
  const from=fields.get("From")||"",to=fields.get("To")||"",bridge=fields.get("CallSid")||"",
    sid=fields.get("AccountSid")||"",token=process.env.TWILIO_AUTH_TOKEN||"";
  if(!callSid.test(bridge)||!accountSid.test(sid)||!token)return twiml("<Hangup/>",403);
  if(process.env.TWILIO_ACCOUNT_SID&&sid!==process.env.TWILIO_ACCOUNT_SID)return twiml("<Hangup/>",403);
  if(!E164(from)||!E164(to))return twiml(say("Unsupported telephone number.","en-US")+"<Hangup/>");

  const pilot=to===E164(process.env.TWILIO_NUMBER)&&from===E164(process.env.SMARTJOB_DUO_EN_PHONE);
  let owner=E164(process.env.SMARTJOB_DUO_ES_PHONE),config:RelayOptions|undefined;
  let tenantId:string|undefined;
  let route:Awaited<ReturnType<typeof findPhoneRoute>>=null;
  if(!pilot){
    // Public multi-tenant routing is gated separately from the known-good pilot.
    if(!tenantsReady())return twiml(say("This telephone number is not yet enabled.","en-US")+"<Hangup/>");
    route=await findPhoneRoute(to);
    if(!route)return twiml(say("This telephone number is not yet enabled.","en-US")+"<Hangup/>");
    owner=route.destination_phone;tenantId=route.id;
    config={
      customer:from,twilio:to,owner,
      customerLanguage:route.customer_language,ownerLanguage:route.owner_language,
      assistantName:route.assistant_name
    };
    if(!validatedConfig(config)||!await reservePhoneSession(bridge,route)){
      return twiml(say("All interpreters are currently busy. Please try again later.","en-US")+"<Hangup/>");
    }
  }
  const signature=tenantId?partnerSignature(bridge,tenantId,from):bridgeSignature(bridge);
  const partnerUrl=baseUrl+"/api/twilio/live/partner?bridge="+bridge+"&sig="+signature+
    (tenantId?"&route="+encodeURIComponent(tenantId)+"&caller="+encodeURIComponent(from):"");
  const callback=baseUrl+"/api/twilio/live/ended?bridge="+bridge+"&sig="+bridgeSignature(bridge);
  try{
    const outbound=await dial(sid,token,owner,to,partnerUrl,callback);
    if(!outbound){
      if(route)await updatePhoneSession(bridge,"failed");
      return twiml(say("We cannot connect your interpreter right now. Please try again.","en-US")+"<Hangup/>");
    }
    if(route&&!await assignOutboundCall(bridge,outbound)){
      await stopOutbound(sid,outbound,token);
      await updatePhoneSession(bridge,"failed");
      return twiml(say("Unable to connect. Please call again.","en-US")+"<Hangup/>");
    }
    console.info("Smart Job live outbound call accepted",route?"tenant":"pilot");
    return bridgeTwiML("customer",bridge,config);
  }catch(e){
    if(route)await updatePhoneSession(bridge,"failed");
    console.error("Smart Job live dial failed",e instanceof Error?e.name:"unknown");
    return twiml(say("Connection unavailable. Please try again.","en-US")+"<Hangup/>");
  }
}
