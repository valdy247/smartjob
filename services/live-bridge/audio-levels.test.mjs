import test from "node:test";
import assert from "node:assert/strict";
import {pcm16Level} from "./audio-levels.mjs";
import {decodeMulaw,pcm24ToMulaw8} from "./media-codec.mjs";

test("silence in OpenAI PCM remains silent in Twilio u-law",()=>{
  const pcm=Buffer.alloc(9600,0);
  assert.deepEqual(pcm16Level(pcm),{meanAbs:0,peak:0});
  assert.ok(pcm24ToMulaw8(pcm).every(x=>x===0xff));
});

test("speech-like output PCM retains audible energy after Twilio conversion",()=>{
  const pcm=Buffer.alloc(9600);
  for(let i=0;i<pcm.length/2;i++){
    pcm.writeInt16LE(Math.round(11000*Math.sin(2*Math.PI*440*i/24000)),2*i);
  }
  const original=pcm16Level(pcm);
  assert.ok(original.meanAbs>5000);
  const mu=pcm24ToMulaw8(pcm);
  assert.equal(mu.length,1600);
  let total=0;
  for (const byte of mu) total+=Math.abs(decodeMulaw(byte));
  assert.ok(total/mu.length>4500,"The Twilio-coded speech must remain audible");
});

test("audio level statistics reject odd-length input",()=>{
  assert.throws(()=>pcm16Level(Buffer.alloc(3)),/invalid_pcm16/);
});
