import {NextRequest} from "next/server";
import {verifiedLiveRequest,E164,baseUrl} from "@/lib/twilio-live";
import {findPhoneRoute,tenantsReady,reservePhoneSession} from "@/lib/phone-routes";
import {languageMenuEnabled,ivrEligible,menuResponse,selectionSignature,directClientTwiml,languageDecision} from "@/lib/vmv-ivr";
import {say,twiml,xmlEscape} from "@/lib/twilio-pilot";
import {paidServiceAllowed} from "@/lib/vmv-entitlements";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const fields=await verifiedLiveRequest(req,null);
 if(!fields)return twiml("<Hangup/>",403);
 if(!languageMenuEnabled()||!tenantsReady())return twiml("<Hangup/>",403);
 const from=E164(fields.get("From")||""),to=E164(fields.get("To")||"");
 const bridge=fields.get("CallSid")||"";
 if(!from||!to||!/^CA[a-f\d]{32}$/i.test(bridge))return twiml("<Hangup/>",403);
 const route=await findPhoneRoute(to);
 if(!route||!ivrEligible(route))return twiml(say("This line is not ready.","en-US")+"<Hangup/>");
 if(!await paidServiceAllowed(route.user_id,"direct_call"))return twiml("<Hangup/>");
 const digit=(fields.get("Digits")||"").trim();
 const attempt=req.nextUrl.searchParams.get("attempt")==="1"?1:0;

 const decision=languageDecision(digit,attempt);
 if(decision==="retry")return menuResponse(undefined,1);
 if(decision==="hangup")return twiml(say("Invalid selection. Goodbye.","en-US")+"<Hangup/>");
 if(decision==="translate"){
  if(!await paidServiceAllowed(route.user_id,"translated_call"))return twiml("<Hangup/>");
  const proof=selectionSignature(bridge,route.id,from,"en");
  const url=xmlEscape(baseUrl+"/api/twilio/live/voice?language=en&proof="+proof);
  return twiml('<Redirect method="POST">'+url+"</Redirect>");
 }
 // 2, or no input, is a direct Spanish call. It cannot spend translated minutes.
 if(!await reservePhoneSession(bridge,route,"direct"))
  return twiml(say("En este momento no podemos completar su llamada.","es-ES")+"<Hangup/>");
 return directClientTwiml(bridge,route,from);
}
