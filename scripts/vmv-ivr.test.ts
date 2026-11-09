import assert from "node:assert/strict";
import {test} from "node:test";
import {languageDecision,selectionSignature,validSelectionSignature,menuResponse,directClientTwiml,ivrEligible} from "../lib/vmv-ivr";
import type {ActivePhoneRoute} from "../lib/phone-routes";

process.env.TWILIO_AUTH_TOKEN="test-signing-token-not-for-production";
process.env.SMARTJOB_IOS_VOICE_ENABLED="true";
process.env.TWILIO_IOS_PUSH_CREDENTIAL_SID="CR12345678901234567890123456789012";
process.env.TWILIO_WEBHOOK_BASE_URL="https://vmv-test.example";
const sid="CA"+"a".repeat(32);
const uid="abcdef12-3456-789a-bcde-abcdef123456";
const route:ActivePhoneRoute={
 id:"12345678-1234-1234-1234-123456789abc",user_id:uid,
 twilio_number:"+17065550100",destination_phone:"+17065550101",receive_method:"ios_app",
 customer_language:"en-US",owner_language:"es-ES",assistant_name:"VMV",enabled:true
};
const caller="+17065550102";

test("DTMF routing defaults to free-of-AI Spanish and reserves English for translation",()=>{
 assert.equal(languageDecision("1"),"translate");
 assert.equal(languageDecision("2"),"direct");
 assert.equal(languageDecision(""),"direct");
 assert.equal(languageDecision("9"),"retry");
 assert.equal(languageDecision("9",1),"hangup");
});

test("a signature is scoped to one bridge, tenant, caller and language",()=>{
 const proof=selectionSignature(sid,route.id,caller,"en");
 assert.equal(validSelectionSignature(sid,route.id,caller,"en",proof),true);
 assert.equal(validSelectionSignature(sid,route.id,caller,"es",proof),false);
 assert.equal(validSelectionSignature(sid.replace("a","b"),route.id,caller,"en",proof),false);
 assert.equal(validSelectionSignature(sid,route.id,"+17065550103","en",proof),false);
 assert.equal(validSelectionSignature(sid,route.id,caller,"en","0".repeat(64)),false);
});

test("IVR menu always asks English and Spanish and escapes custom greeting",async()=>{
 const xml=await menuResponse("Gracias & bienvenido <test>",0).text();
 assert.match(xml,/input="dtmf"/);
 assert.match(xml,/numDigits="1"/);
 assert.match(xml,/actionOnEmptyResult="true"/);
 assert.match(xml,/For English with live interpretation, press one/);
 assert.match(xml,/Para español, marque dos o permanezca/);
 assert.match(xml,/Gracias &amp; bienvenido &lt;test&gt;/);
});

test("Spanish direction dials the iOS client with no AI relay or minute claim",async()=>{
 const xml=await directClientTwiml(sid,route,caller).text();
 assert.match(xml,/<Dial answerOnBridge="true"/);
 assert.match(xml,/record="do-not-record"/);
 assert.match(xml,/<Identity>sj_abcdef123456789abcdeabcdef123456<\/Identity>/);
 assert.match(xml,/vmv_mode" value="direct"/);
 assert.doesNotMatch(xml,/ConversationRelay|claimCallMinutes|settleCallMinutes|<Number>/);
});

test("IVR is unavailable until the iOS receiver is explicitly enabled",()=>{
 assert.equal(ivrEligible(route),true);
 assert.equal(ivrEligible({...route,receive_method:"pstn"}),false);
 process.env.SMARTJOB_IOS_VOICE_ENABLED="false";
 assert.equal(ivrEligible(route),false);
 process.env.SMARTJOB_IOS_VOICE_ENABLED="true";
});
