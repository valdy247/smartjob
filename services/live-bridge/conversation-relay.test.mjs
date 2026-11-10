import test from "node:test";
import assert from "node:assert/strict";
import {routeSignature} from "./relay-core.mjs";
import {verifiedSetup,cleanPrompt,peerRole,textMessage} from "./conversation-relay.mjs";

const secret="test-auth-secret",account="AC"+"a".repeat(32);
const route={
  bridge:"CA"+"1".repeat(32),customer:"+17065550101",twilio:"+17065550102",
  owner:"client:sj_"+"f".repeat(32),
  customerLanguage:"en-US",ownerLanguage:"es-ES"
};
function setup(role,overrides={}){
  const sid=role==="customer"?route.bridge:"CA"+"2".repeat(32);
  return {
    type:"setup",sessionId:"VX"+"3".repeat(32),accountSid:account,callSid:sid,
    from:role==="customer"?route.customer:route.twilio,
    to:role==="customer"?route.twilio:route.owner,
    customParameters:{role,...route,routeSignature:routeSignature(secret,route)},
    ...overrides
  };
}
test("incoming customer leg is authorized and translates English to Spanish",()=>{
  const result=verifiedSetup(setup("customer"),account,secret);
  assert.equal(result.role,"customer");
  assert.equal(result.bridge,route.bridge);
  assert.equal(result.sourceLanguage,"en-US");
  assert.equal(result.targetLanguage,"es-ES");
});
test("Twilio Voice iOS client leg is authorized and translates Spanish to English",()=>{
  const result=verifiedSetup(setup("professional"),account,secret);
  assert.equal(result.role,"professional");
  assert.equal(result.sourceLanguage,"es-ES");
  assert.equal(result.targetLanguage,"en-US");
  assert.equal(verifiedSetup(setup("professional",{to:route.owner.slice(7)}),account,secret).role,"professional");
});
test("PSTN owner leg also works, with signed phone parameters",()=>{
  const pstn={...route,owner:"+17065550103"};
  const msg=setup("professional",{
    to:pstn.owner,customParameters:{role:"professional",...pstn,routeSignature:routeSignature(secret,pstn)}
  });
  assert.equal(verifiedSetup(msg,account,secret).role,"professional");
});
test("reversed interpretation languages are supported",()=>{
  const reversed={...route,customerLanguage:"es-ES",ownerLanguage:"en-US"};
  const msg=setup("customer",{
    customParameters:{role:"customer",...reversed,routeSignature:routeSignature(secret,reversed)}
  });
  assert.equal(verifiedSetup(msg,account,secret).targetLanguage,"en-US");
});
test("forged setups, numbers, account, session, and call legs are rejected",()=>{
  const cases=[
    setup("customer",{from:"+17065550199"}),
    setup("customer",{to:"+17065550199"}),
    setup("professional",{from:"+17065550199"}),
    setup("professional",{callSid:route.bridge}),
    setup("customer",{callSid:"CA"+"4".repeat(32)}),
    setup("customer",{accountSid:"AC"+"0".repeat(32)}),
    setup("customer",{sessionId:"invalid"}),
    setup("customer",{customParameters:{...setup("customer").customParameters,routeSignature:"0".repeat(64)}}),
    setup("customer",{customParameters:{...setup("customer").customParameters,customerLanguage:"es-ES"}}),
    setup("customer",{customParameters:{...setup("customer").customParameters,owner:"client:evil"}}),
    setup("customer",{customParameters:{...setup("customer").customParameters,role:"admin"}})
  ];
  for(const item of cases)assert.equal(verifiedSetup(item,account,secret),null);
  assert.equal(verifiedSetup(setup("customer"),account,"wrong-secret"),null);
});
test("only completed, bounded speech turns are translated",()=>{
  assert.equal(cleanPrompt({type:"prompt",last:true,voicePrompt:"  Hello  "}),"Hello");
  for(const item of [
    {type:"prompt",last:false,voicePrompt:"Part"},
    {type:"prompt",last:true,voicePrompt:"   "},
    {type:"prompt",last:true,voicePrompt:"x".repeat(501)},
    {type:"text",last:true,voicePrompt:"ignore"}
  ])assert.equal(cleanPrompt(item),null);
});
test("translated text uses documented Twilio ConversationRelay text messages",()=>{
  assert.equal(peerRole("customer"),"professional");
  assert.equal(peerRole("professional"),"customer");
  assert.deepEqual(textMessage("Hola"),{
    type:"text",token:"Hola",last:true,interruptible:false,preemptible:false
  });
});
