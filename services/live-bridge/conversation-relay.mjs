import {accountSid,callSid,e164,validReceiver,matchesRouteSignature} from "./relay-core.mjs";

export function verifiedSetup(message,account,token){
  const p=message?.customParameters||{};
  const role=p.role;
  if(message?.type!=="setup"||!accountSid(message.accountSid)||
     message.accountSid!==account||!callSid(message.callSid)||
     !/^VX[a-f\d]{32}$/i.test(message.sessionId||"")||
     (role!=="customer"&&role!=="professional"))return null;
  const route={
    bridge:p.bridge,customer:p.customer,twilio:p.twilio,owner:p.owner,
    customerLanguage:p.customerLanguage,ownerLanguage:p.ownerLanguage
  };
  if(!callSid(route.bridge)||!e164(route.customer)||!e164(route.twilio)||
     !validReceiver(route.owner)||!["en-US","es-ES"].includes(route.customerLanguage)||
     !["en-US","es-ES"].includes(route.ownerLanguage)||
     route.customerLanguage===route.ownerLanguage||
     !matchesRouteSignature(token,route,p.routeSignature))return null;
  if(role==="customer"){
    if(message.callSid!==route.bridge||message.from!==route.customer||
       message.to!==route.twilio)return null;
  }else{
    // Twilio Voice Client may report its identity with or without "client:".
    const clientIdentity=route.owner.startsWith("client:")?route.owner.slice(7):null;
    if(message.callSid===route.bridge||message.from!==route.twilio||
       (message.to!==route.owner&&message.to!==clientIdentity))return null;
  }
  return {role,callSid:message.callSid,bridge:route.bridge,sessionId:message.sessionId,
    sourceLanguage:role==="customer"?route.customerLanguage:route.ownerLanguage,
    targetLanguage:role==="customer"?route.ownerLanguage:route.customerLanguage};
}
export function cleanPrompt(message){
  if(message?.type!=="prompt"||message.last!==true||
     typeof message.voicePrompt!=="string"||message.voicePrompt.length>500)return null;
  const result=message.voicePrompt.trim();
  return result||null;
}
export function peerRole(role){return role==="customer"?"professional":"customer";}
export function textMessage(token){
  return {type:"text",token,last:true,interruptible:false,preemptible:false};
}
