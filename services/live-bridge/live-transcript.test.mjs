import test from "node:test";
import assert from "node:assert/strict";
import {
  appendOwnerTranscript,verifyTranscriptRequest,transcriptSignature,
  snapshotOwnerTranscript,MAX_TRANSCRIPT_TURNS
} from "./live-transcript.mjs";

const bridge="CA"+"a".repeat(32),outbound="CA"+"b".repeat(32),secret="not-an-api-key";
const room=()=>({created:Date.now()-3000,closing:false,nextTranscriptSequence:0,transcript:[],
  legs:{customer:{callSid:bridge},professional:{callSid:outbound,sourceLanguage:"es-ES"}}});
test("only signed and fresh owner-bound requests can inspect a room",()=>{
  const stamp=String(Math.floor(Date.now()/1000));
  const signature=transcriptSignature(secret,stamp,bridge,outbound);
  assert.equal(verifyTranscriptRequest(secret,{stamp,bridge,outbound,signature}),true);
  for(const v of [
    {stamp,bridge,outbound:"CA"+"0".repeat(32),signature},
    {stamp,bridge,outbound,signature:"0".repeat(64)},
    {stamp:String(Number(stamp)-61),bridge,outbound,signature},
    {stamp,bridge:"invalid",outbound,signature},
  ])assert.equal(verifyTranscriptRequest(secret,v),false);
});
test("shows customer translated text, owner original text, ordered by sequence",()=>{
  const r=room();
  assert.equal(appendOwnerTranscript(r,{role:"customer",text:"Buenos días."}),true);
  assert.equal(appendOwnerTranscript(r,{role:"professional",text:"¿Cómo le ayudo?"}),true);
  assert.deepEqual(snapshotOwnerTranscript(r,outbound,0).turns.map(t=>[t.seq,t.speaker,t.text]),
    [[1,"customer","Buenos días."],[2,"professional","¿Cómo le ayudo?"]]);
  assert.deepEqual(snapshotOwnerTranscript(r,outbound,1).turns.map(t=>t.seq),[2]);
  assert.equal(snapshotOwnerTranscript(r,bridge,0),null);
  assert.equal(snapshotOwnerTranscript({...r,legs:{...r.legs,customer:null}},outbound,0),null);
  assert.equal(snapshotOwnerTranscript({...r,closing:true},outbound,0),null);
});
test("caption memory is bounded and reports truncation",()=>{
  const r=room();
  for(let i=0;i<MAX_TRANSCRIPT_TURNS+8;i++)
    appendOwnerTranscript(r,{role:"customer",text:"Frase "+i});
  assert.equal(r.transcript.length,MAX_TRANSCRIPT_TURNS);
  const result=snapshotOwnerTranscript(r,outbound,0);
  assert.equal(result.truncated,true);
  assert.equal(result.hasMore,true);
  assert.equal(result.turns.length,80);
});
test("refuses bad roles, empty or oversized captions",()=>{
  const r=room();
  assert.equal(appendOwnerTranscript(r,{role:"admin",text:"Wrong"}),false);
  assert.equal(appendOwnerTranscript(r,{role:"customer",text:""}),false);
  assert.equal(appendOwnerTranscript(r,{role:"customer",text:"x".repeat(801)}),false);
  assert.equal(r.transcript.length,0);
});
