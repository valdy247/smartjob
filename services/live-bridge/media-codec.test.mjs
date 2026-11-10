import test from "node:test";
import assert from "node:assert/strict";
import {decodeMulaw,encodeMulaw,mulaw8ToPcm24,pcm24ToMulaw8,safePcm24Chunk} from "./media-codec.mjs";

test("ulaw codec has correct neutral values and lawful bounds",()=>{
  assert.equal(decodeMulaw(0xff),0);
  assert.equal(decodeMulaw(0x7f),0);
  assert.equal(encodeMulaw(0),0xff);
  for(const x of [-32768,-12000,-1000,0,1000,12000,32767]){
    const y=decodeMulaw(encodeMulaw(x));
    assert.ok(Math.abs(y-x)<2600,"mu-law quantization "+x+" -> "+y);
  }
});
test("twilio 20ms frame becomes 24k pcm16 and returns to 8k",()=>{
  const frame=Buffer.alloc(160,0xff);
  const pcm=mulaw8ToPcm24(frame);
  assert.equal(pcm.length,960);
  assert.ok(pcm.equals(Buffer.alloc(960)));
  assert.deepEqual(pcm24ToMulaw8(pcm),frame);
});
test("200ms frames are precisely 4800 samples at 24kHz",()=>{
  const input=Buffer.alloc(1600,0xff);
  const pcm=mulaw8ToPcm24(input);
  assert.equal(pcm.length,9600);
  assert.equal(pcm24ToMulaw8(pcm).length,1600);
});
test("rejects oversized and malformed packets",()=>{
  assert.throws(()=>mulaw8ToPcm24(Buffer.alloc(16001)),/bad_ulaw/);
  assert.throws(()=>pcm24ToMulaw8(Buffer.alloc(7)),/bad_pcm/);
  assert.throws(()=>safePcm24Chunk(Buffer.alloc(3)),/invalid_pcm/);
});
