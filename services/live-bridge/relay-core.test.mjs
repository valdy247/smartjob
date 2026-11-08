import test from "node:test";
import assert from "node:assert/strict";
import {accountSid,callSid,e164,matchesRouteSignature,needsVerifiedTranslation,makeStreamingTokens,routeSignature} from "./relay-core.mjs";

const route = {
  bridge:"CA"+"1".repeat(32),customer:"+17065550101",twilio:"+17065550102",
  owner:"+17065550103",customerLanguage:"en-US",ownerLanguage:"es-ES"
};
test("signature binds both phones, role configuration, and call",()=>{
  const signature=routeSignature("test-secret",route);
  assert.equal(matchesRouteSignature("test-secret",route,signature),true);
  assert.equal(matchesRouteSignature("wrong",route,signature),false);
  assert.equal(matchesRouteSignature("test-secret",{...route,owner:"+17065550104"},signature),false);
  assert.equal(matchesRouteSignature("test-secret",{...route,bridge:"CA"+"2".repeat(32)},signature),false);
});
test("invalid phones and call identifiers fail closed",()=>{
  assert.ok(e164(route.customer)); assert.ok(callSid(route.bridge));
  assert.ok(accountSid("AC"+"1".repeat(32)));
  assert.equal(e164("555-1212"),false);
  assert.equal(callSid("CA123"),false);
});
test("high risk utterances must never stream before verification",()=>{
  for(const sample of ["I want 2 cakes","cuesta veinte dólares","I'm allergic to peanuts","un kilo de chocolate","What price?","alergia al maní","la entrega es el miércoles","january fifteenth","tres onzas de leche"]){
    assert.ok(needsVerifiedTranslation(sample),sample);
  }
  assert.equal(needsVerifiedTranslation("Good morning, how can I help?"),false);
});
test("stream tokens are ordered and only the last is final",()=>{
  const tokens=[],stream=makeStreamingTokens((token,last)=>tokens.push({token,last}));
  stream.next("Hola");stream.next(", ¿cómo");stream.next(" estás?");
  assert.equal(stream.finish(),3);
  assert.deepEqual(tokens,[{token:"Hola",last:false},{token:", ¿cómo",last:false},{token:" estás?",last:true}]);
  stream.finish(); assert.equal(tokens.length,3);
});
