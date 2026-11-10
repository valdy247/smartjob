import {NextRequest} from "next/server";
import {bridgeTwiML,E164,liveReady,notReady,verifiedBridge,verifiedLiveRequest,validatedConfig,type RelayOptions} from "@/lib/twilio-live";
import {findPhoneRouteById,hasReservedPartnerCall,tenantsReady,verifyPartnerSignature} from "@/lib/phone-routes";
import {twiml} from "@/lib/twilio-pilot";
import {getPaidCallPreferences,selectedVoice} from "@/lib/vmv-voices";
import {interpretedLanguagesFor} from "@/lib/vmv-ivr";
export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(req:NextRequest){
  const fields=await verifiedLiveRequest(req,null);
  if(!fields){console.error("Smart Job partner webhook authentication rejected");return twiml("<Hangup/>",403);}
  if(!liveReady()){console.error("Smart Job partner live not ready");return notReady();}
  const q=new URL(req.url).searchParams;
  const bridge=q.get("bridge")||"",sig=q.get("sig")||"",id=q.get("route"),caller=q.get("caller")||"";
  const from=fields.get("From")||"",to=fields.get("To")||"";
  if(id){
    if(!tenantsReady()||!verifyPartnerSignature(bridge,id,caller,sig)){console.error("Smart Job partner tenant auth rejected");return twiml("<Hangup/>",403);}
    const route=await findPhoneRouteById(id);
    if(!route||from!==route.twilio_number){console.error("Smart Job partner route mismatch",{routeFound:Boolean(route),fromMatches:route?from===route.twilio_number:false});return twiml("<Hangup/>",403);}
    if(!await hasReservedPartnerCall(bridge,fields.get("CallSid")||"",route)){
      console.error("Smart Job partner reservation invalid for this outbound leg");
      return twiml("<Hangup/>",403);
    }
    const receiver=route.receive_method==="ios_app"
      ?"client:sj_"+route.user_id.replaceAll("-",""):route.destination_phone;
    if(to!==receiver||(route.receive_method==="ios_app"&&process.env.SMARTJOB_IOS_VOICE_ENABLED!=="true")){
      console.error("Smart Job partner receiver mismatch",{receiverMatches:to===receiver,method:route.receive_method});
      return twiml("<Hangup/>",403);
    }
    const selectedEnglish=req.nextUrl.searchParams.get("ivr")==="en";
    const config:RelayOptions={
      customer:caller,twilio:route.twilio_number,owner:receiver,
      ...interpretedLanguagesFor(route,selectedEnglish),
      assistantName:route.assistant_name
    };
    if(!validatedConfig(config)){console.error("Smart Job partner config invalid");return twiml("<Hangup/>",403);}
    const prefs=await getPaidCallPreferences(route.user_id);
    if(prefs){
      config.greetingCustomer=selectedEnglish?undefined:(prefs.greeting_customer||undefined);
      config.greetingOwner=prefs.greeting_owner||undefined;
      config.voiceCustomer=selectedVoice(prefs.voice_customer,config.customerLanguage)||undefined;
      config.voiceOwner=selectedVoice(prefs.voice_owner,config.ownerLanguage)||undefined;
    }
    console.info("Smart Job partner PSTN leg acknowledged");
    return bridgeTwiML("professional",bridge,config);
  }
  // Calls without a tenant route have no payer to charge. Fail closed.
  return twiml("<Hangup/>");
}
