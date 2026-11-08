import {NextRequest} from "next/server";
import {bridgeTwiML,E164,liveReady,notReady,verifiedBridge,verifiedLiveRequest,validatedConfig,type RelayOptions} from "@/lib/twilio-live";
import {findPhoneRouteById,tenantsReady,verifyPartnerSignature} from "@/lib/phone-routes";
import {twiml} from "@/lib/twilio-pilot";
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
    const receiver=route.receive_method==="ios_app"
      ?"client:sj_"+route.user_id.replaceAll("-",""):route.destination_phone;
    if(to!==receiver||(route.receive_method==="ios_app"&&process.env.SMARTJOB_IOS_VOICE_ENABLED!=="true")){
      console.error("Smart Job partner receiver mismatch",{receiverMatches:to===receiver,method:route.receive_method});
      return twiml("<Hangup/>",403);
    }
    const config:RelayOptions={
      customer:caller,twilio:route.twilio_number,owner:receiver,
      customerLanguage:route.customer_language,ownerLanguage:route.owner_language,
      assistantName:route.assistant_name
    };
    if(!validatedConfig(config)){console.error("Smart Job partner config invalid");return twiml("<Hangup/>",403);}
    console.info("Smart Job partner PSTN leg acknowledged");
    return bridgeTwiML("professional",bridge,config);
  }
  if(!verifiedBridge(bridge,sig)||from!==E164(process.env.TWILIO_NUMBER)||to!==E164(process.env.SMARTJOB_DUO_ES_PHONE))
    return twiml("<Hangup/>",403);
  return bridgeTwiML("professional",bridge);
}
