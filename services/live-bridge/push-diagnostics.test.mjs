import test from "node:test";
import assert from "node:assert/strict";
import {auditTwilioPush,expectedPushSuffix} from "./push-diagnostics.mjs";

const sid="AC"+"a".repeat(32),pushSid="CR"+"b".repeat(32),token="secret-only-for-test";
const fakeLogger=()=>{
  const events=[];
  return {events,log:{
    info:(msg,payload)=>events.push({level:"info",msg,payload}),
    warn:(msg,payload)=>events.push({level:"warn",msg,payload}),
    error:(msg,payload)=>events.push({level:"error",msg,payload})
  }};
};
test("rejects missing Twilio push credential without making requests",async()=>{
  let calls=0;const {events,log}=fakeLogger();
  const result=await auditTwilioPush({sid:"",token,pushSid:"",logger:log,
    fetcher:async()=>{calls++;throw Error("unexpected")}});
  assert.equal(result.ok,false);
  assert.equal(calls,0);
  assert.equal(events[0].payload.reason,"missing_configuration");
});
test("detects sandbox-vs-production APNs mismatch without logging secrets",async()=>{
  const {events,log}=fakeLogger();
  const result=await auditTwilioPush({sid,token,pushSid,logger:log,
    fetcher:async(url)=>({ok:true,json:async()=>url.includes("/Credentials/")
      ?{type:"apn",sandbox:"True",private_key:"must-not-leak",certificate:"must-not-leak"}
      :{alerts:[{error_code:"52134",log_level:"error",date_created:"2026-11-11T00:17:00Z",
        alert_text:"private phone number must-not-leak"}]}})});
  assert.equal(result.push.sandbox,true);
  assert.equal(result.alerts[0].errorCode,"52134");
  assert.equal(events.some(e=>e.msg==="VMV iOS APNs mismatch"),true);
  const emitted=JSON.stringify(events);
  assert.equal(emitted.includes(token),false);
  assert.equal(emitted.includes(sid),false);
  assert.equal(emitted.includes(pushSid),false);
  assert.equal(emitted.includes("must-not-leak"),false);
});
test("recognizes production APNs credential and no error events",async()=>{
  const {events,log}=fakeLogger();
  const result=await auditTwilioPush({sid,token,pushSid,logger:log,
    fetcher:async(url)=>({ok:true,json:async()=>url.includes("/Credentials/")
      ?{type:"apn",sandbox:false}:{alerts:[]}})});
  assert.equal(result.push.sandbox,false);
  assert.equal(result.alerts.length,0);
  assert.equal(events.some(e=>e.payload?.result==="production_compatible"),true);
});

test("audit discovers only Preview Push Credential when Render has no SID",async()=>{
  const {events,log}=fakeLogger();
  const matchingSid="CR"+"a".repeat(24)+expectedPushSuffix;
  const result=await auditTwilioPush({sid,token,pushSid:"",logger:log,
    fetcher:async url=>({ok:true,json:async()=>
      url.includes("Credentials")
        ?{credentials:[{sid:"CR"+"0".repeat(32),type:"apn",sandbox:false},
                       {sid:matchingSid,type:"apn",sandbox:"true"}]}
        :{alerts:[{error_code:"52134",log_level:"error",date_created:"2026-11-11T00:17:00Z"}]}
    })}
  });
  assert.equal(result.push.credentialFound,true);
  assert.equal(result.push.sandbox,true);
  assert.equal(result.alerts[0].errorCode,"52134");
  assert.equal(JSON.stringify(events).includes(matchingSid),false);
});
