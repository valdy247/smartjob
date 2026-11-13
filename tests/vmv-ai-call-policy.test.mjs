import test from "node:test";
import assert from "node:assert/strict";
import {initialCallPolicy,decideCall,inWeek,businessWeek,validWeek,
 localParts,localPreview,checkCallPolicy} from "../lib/vmv-ai-agents/call-policy.ts";

const policy=()=>structuredClone(initialCallPolicy);
const date=(s)=>new Date(s);
test("default preserved menu when both services are available",()=>{
 const p=policy();
 const r=decideCall(p,localPreview("mon","10:00"));
 assert.equal(r.action,"menu");
 assert.equal(r.agentAvailable,true);
 assert.equal(r.translationAvailable,true);
});
test("agent-first bypasses menu; translation-first reuses Smart Call",()=>{
 const p=policy();p.coexistence="agent_first";
 assert.equal(decideCall(p,localPreview("mon","10:00")).action,"agent");
 p.coexistence="translation_first";
 assert.equal(decideCall(p,localPreview("mon","10:00")).action,"translation");
});
test("pausing agent leaves translation available",()=>{
 const p=policy();p.agent_enabled=false;
 assert.equal(decideCall(p,localPreview("mon","10:00")).action,"translation");
});
test("only AI enabled routes directly to agent",()=>{
 const p=policy();p.translation_enabled=false;p.outside_action="message";
 assert.equal(decideCall(p,localPreview("mon","10:00")).action,"agent");
});
test("scheduled agent outside hours falls back to enabled translation",()=>{
 const p=policy();p.agent_mode="schedule";
 assert.equal(decideCall(p,localPreview("sun","13:00")).action,"translation");
 assert.equal(decideCall(p,localPreview("mon","10:00")).action,"menu");
});
test("both services scheduled off hours safely close",()=>{
 const p=policy();p.agent_mode="schedule";p.translation_mode="schedule";
 assert.equal(decideCall(p,localPreview("sun","10:00")).action,"message");
 assert.equal(decideCall(p,localPreview("mon","10:00")).action,"menu");
});
test("overnight Monday schedule continues into Tuesday, not beyond closing",()=>{
 const p=policy();
 for(const d of Object.keys(p.schedule))p.schedule[d].enabled=false;
 p.schedule.mon={enabled:true,start:"22:00",end:"02:00"};
 assert.equal(inWeek(p.schedule,"mon",21*60+59),false);
 assert.equal(inWeek(p.schedule,"mon",22*60),true);
 assert.equal(inWeek(p.schedule,"tue",60),true);
 assert.equal(inWeek(p.schedule,"tue",119),true);
 assert.equal(inWeek(p.schedule,"tue",120),false);
});
test("overnight Sunday continues across the week boundary",()=>{
 const p=policy();for(const d of Object.keys(p.schedule))p.schedule[d].enabled=false;
 p.schedule.sun={enabled:true,start:"23:30",end:"01:30"};
 assert.equal(inWeek(p.schedule,"mon",45),true);
 assert.equal(inWeek(p.schedule,"mon",90),false);
});
test("US timezone conversion and daylight saving shift",()=>{
 const before=localParts(date("2026-07-01T14:00:00Z"),"America/New_York");
 assert.equal(before.day,"wed");assert.equal(before.minutes,10*60);
 const winter=localParts(date("2026-12-01T15:00:00Z"),"America/New_York");
 assert.equal(winter.day,"tue");assert.equal(winter.minutes,10*60);
 const chicago=localParts(date("2026-07-01T14:00:00Z"),"America/Chicago");
 assert.equal(chicago.minutes,9*60);
});
test("after no answer only if agent is available",()=>{
 const p=policy();p.agent_mode="after_no_answer";p.coexistence="agent_first";
 assert.equal(decideCall(p,localPreview("mon","10:00")).action,"ring_owner");
 p.agent_enabled=false;assert.equal(decideCall(p,localPreview("mon","10:00")).action,"translation");
});
test("validates complete days, 24-hour times and errors",()=>{
 const p=policy();assert.equal(validWeek(p.schedule),true);
 assert.equal(checkCallPolicy(p).ring_seconds,18);
 p.schedule.mon.start="24:60";assert.equal(validWeek(p.schedule),false);
 assert.throws(()=>checkCallPolicy(p));
});
test("requires a functioning route and explicit fallback",()=>{
 const p=policy();p.agent_enabled=false;p.translation_enabled=false;
 assert.throws(()=>checkCallPolicy(p));
 p.agent_enabled=true;p.translation_enabled=false;
 p.outside_action="message";
 assert.equal(checkCallPolicy(p).translation_enabled,false);
 p.ring_seconds=99;assert.throws(()=>checkCallPolicy(p));
});
test("business working hours are reused instead of invented",()=>{
 const config={};
 for(const d of ["sun","mon","tue","wed","thu","fri","sat"]){
  config["h_"+d+"_active"]=d==="sun"?"No":"Sí";
  config["h_"+d+"_open"]="09:00";
  config["h_"+d+"_close"]="17:00";
 }
 const w=businessWeek(config);assert.ok(w);
 assert.equal(w.sun.enabled,false);
 assert.equal(businessWeek({h_mon_active:"Sí"}),null);
});
