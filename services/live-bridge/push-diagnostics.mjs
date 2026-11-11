// One-time operational audit. Reports only APNs environment and Twilio error codes.
// Never logs credentials, certificates, call identifiers, phone numbers or transcripts.
const credential=/^CR[a-f\d]{32}$/i;
// Short, non-secret fingerprint from the owner-only Preview Push Credential.
// Never store the full SID or certificate in a log.
export const expectedPushSuffix="dc058bd3";
const account=/^AC[a-f\d]{32}$/i;
export async function auditTwilioPush({
  sid=process.env.TWILIO_ACCOUNT_SID,
  token=process.env.TWILIO_AUTH_TOKEN,
  pushSid=process.env.TWILIO_IOS_PUSH_CREDENTIAL_SID,
  fetcher=fetch,
  logger=console
}={}){
  if(!account.test(sid||"")||!token){
    logger.warn("VMV push audit unavailable",{reason:"missing_configuration"});
    return {ok:false,reason:"missing_configuration"};
  }
  const headers={Authorization:"Basic "+Buffer.from(sid+":"+token).toString("base64")};
  const safeGet=async(url)=>{
    try{
      const res=await fetcher(url,{headers,cache:"no-store",signal:AbortSignal.timeout(6000)});
      if(!res.ok)return {ok:false,status:res.status};
      const body=await res.json();
      return {ok:true,body};
    }catch(e){return {ok:false,error:e instanceof Error?e.name:"network_error"};}
  };
  const [credentialCheck,alertsCheck]=await Promise.all([
    safeGet(credential.test(pushSid||"")
      ?"https://conversations.twilio.com/v1/Credentials/"+pushSid
      :"https://conversations.twilio.com/v1/Credentials?PageSize=100"),
    safeGet("https://monitor.twilio.com/v1/Alerts?"+new URLSearchParams({
      StartDate:new Date(Date.now()-2*60*60*1000).toISOString().replace(/\.\d{3}Z$/,"Z"),
      PageSize:"100"
    }))
  ]);
  let push=null,alerts=[];
  if(credentialCheck.ok){
    const collection=Array.isArray(credentialCheck.body?.credentials)?credentialCheck.body.credentials:null;
    const matched=collection
      ?collection.find(x=>typeof x.sid==="string"&&x.sid.endsWith(expectedPushSuffix))
      :credentialCheck.body;
    const type=matched?.type;
    const raw=matched?.sandbox;
    const sandbox=raw===true||String(raw).toLowerCase()==="true";
    push={credentialFound:!!matched,type:type==="apn"?"apn":"other",sandbox};
    if(!matched)logger.warn("VMV iOS push credential not found in Twilio account");
    else if(!push.sandbox&&push.type==="apn")
      logger.info("VMV iOS APNs credential",{result:"production_compatible",type:push.type});
    else if(push.sandbox)
      logger.error("VMV iOS APNs mismatch",{result:"sandbox_credential_for_production_signed_app"});
    else logger.warn("VMV iOS APNs credential",{result:"credential_type_unexpected"});
  }else{
    push={credentialFound:false,http:credentialCheck.status||null,reason:credentialCheck.error||null};
    logger.warn("VMV iOS push credential could not be inspected",push);
  }
  if(alertsCheck.ok){
    const entries=Array.isArray(alertsCheck.body?.alerts)?alertsCheck.body.alerts:[];
    alerts=entries.filter(a=>/^\d{5}$/.test(String(a.error_code||"")))
      .slice(0,30).map(a=>({
        errorCode:String(a.error_code),level:String(a.log_level||"unknown").slice(0,15),
        timestamp:String(a.date_created||"").slice(0,19)
      }));
    logger.info("VMV Twilio recent error codes",{count:alerts.length,alerts});
  }else{
    logger.warn("VMV Twilio monitor audit unavailable",{
      http:alertsCheck.status||null,reason:alertsCheck.error||null});
  }
  return {ok:credentialCheck.ok,push,alerts};
}