import {NextRequest} from "next/server";
import {bridgeTwiML,E164,liveReady,notReady,verifiedBridge,verifiedLiveRequest,validatedConfig,type RelayOptions} from "@/lib/twilio-live";
import {findPhoneRouteById,tenantsReady,verifyPartnerSignature} from "@/lib/phone-routes";
import {twiml} from "@/lib/twilio-pilot";
export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(req:NextRequest){
  const fields=await verifiedLiveRequest(req);
  if(!fields)return twiml("<Hangup/>",403);
  if(!liveReady())return notReady();
  const q=new URL(req.url).searchParams;
  const bridge=q.get("bridge")||"",sig=q.get("sig")||"",id=q.get("route"),caller=q.get("caller")||"";
  const from=fields.get("From")||"",to=fields.get("To")||"";
  if(id){
    if(!tenantsReady()||!verifyPartnerSignature(bridge,id,caller,sig))return twiml("<Hangup/>",403);
    const route=await findPhoneRouteById(id);
    if(!route||from!==route.twilio_number||to!==route.destination_phone)return twiml("<Hangup/>",403);
    const config:RelayOptions={
      customer:caller,twilio:route.twilio_number,owner:route.destination_phone,
      customerLanguage:route.customer_language,ownerLanguage:route.owner_language,
      assistantName:route.assistant_name
    };
    if(!validatedConfig(config))return twiml("<Hangup/>",403);
    return bridgeTwiML("professional",bridge,config);
  }
  if(!verifiedBridge(bridge,sig)||from!==E164(process.env.TWILIO_NUMBER)||to!==E164(process.env.SMARTJOB_DUO_ES_PHONE))
    return twiml("<Hangup/>",403);
  return bridgeTwiML("professional",bridge);
}
