import test from "node:test";
import assert from "node:assert/strict";
import {encodeMulaw} from "./media-codec.mjs";
import {compactOutputAudio,createOutputState} from "./output-audio.mjs";

const quiet=n=>Buffer.alloc(n*160,0xff);
const voiced=n=>Buffer.alloc(n*160,encodeMulaw(7000));

test("drops digital silence in output without flooding Twilio",()=>{
  const state=createOutputState();
  const a=compactOutputAudio(quiet(40),state);
  assert.equal(a.audio.length,0);
  assert.equal(a.suppressedMs,760);
  assert.equal(state.preRoll.length,2);
});

test("preserves 40ms leading and trailing speech context",()=>{
  const state=createOutputState();
  compactOutputAudio(quiet(40),state);
  const a=compactOutputAudio(Buffer.concat([voiced(3),quiet(8)]),state);
  assert.equal(a.audio.length,7*160); // 40ms pre, 60ms voice, 40ms tail
  assert.equal(a.suppressedMs,80); // 4 of 8 quiet frames skipped
  assert.ok(a.audio.subarray(0,320).every(v=>v===0xff));
  assert.ok(a.audio.subarray(320,800).every(v=>v!==0xff));
});

test("keeps all speech and short pauses intact",()=>{
  const state=createOutputState();
  const a=compactOutputAudio(Buffer.concat([voiced(3),quiet(2),voiced(2)]),state);
  assert.equal(a.audio.length,7*160);
  assert.equal(a.suppressedMs,0);
});

test("handles fragments across chunk boundaries without losing audio",()=>{
  const state=createOutputState();
  const a=compactOutputAudio(voiced(1).subarray(0,80),state);
  assert.equal(a.audio.length,0);
  const b=compactOutputAudio(voiced(1).subarray(80),state);
  assert.equal(b.audio.length,160);
  assert.equal(state.remainder.length,0);
});

test("rejects invalid output buffers",()=>{
  assert.throws(()=>compactOutputAudio("fake",createOutputState()),/invalid_output_audio/);
});
