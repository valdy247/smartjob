import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {speechTimeline} from "../services/vmv-studio-worker/speech-timeline.mjs";

test("visual shots cover the audio timeline without imposing sentence boundaries",()=>{
 const scenes=Array.from({length:12},(_,i)=>({
  speech:Array.from({length:11},(_,j)=>"palabra"+(i*11+j)).join(" ")
 }));
 const words=scenes.flatMap(s=>s.speech.split(" ")).map((word,i)=>({
  word,start:.10+i*.43,end:.42+i*.43
 }));
 const duration=58.0;
 const result=speechTimeline(scenes,duration,{words});
 assert.equal(result.segments.length,12);
 assert.equal(result.alignmentSource,"whisper_words");
 for(let i=0;i<12;i++){
  assert.ok(Math.abs(result.segments[i].start-duration*i/12)<.0001);
  assert.ok(Math.abs(result.segments[i].duration-duration/12)<.0001);
 }
 assert.ok(result.cues.length>10);
 assert.equal(result.cues[0].start,.1);
 assert.equal(result.cues[0].text.split(" ").length,5);
 assert.equal(result.cues.at(-1).end,Math.min(duration,words.at(-1).end));
});
test("real character timestamps synchronize uninterrupted ElevenLabs narration",()=>{
 const scenes=[{speech:"uno de los beneficios"},{speech:"es estudiar en el army"}];
 const text=scenes.map(s=>s.speech).join(" ");
 const characters=Array.from(text);
 const starts=characters.map((_,i)=>i*.07),ends=starts.map(v=>v+.06);
 const result=speechTimeline(scenes,4,{characters,
  character_start_times_seconds:starts,character_end_times_seconds:ends});
 assert.equal(result.alignmentSource,"elevenlabs_characters");
 assert.equal(result.segments[0].end,2);
 assert.equal(result.segments[1].start,2);
 assert.ok(result.cues.every(c=>c.text.length>0&&c.end>c.start));
});
test("incomplete real alignment is rejected instead of inventing synchronized cues",()=>{
 const scenes=[{speech:"una narración que tiene muchas palabras diferentes y debe durar muchos segundos"}];
 assert.throws(()=>speechTimeline(scenes,6,{words:[
  {word:"una",start:0,end:.3},{word:"narración",start:.3,end:.7}
 ]}),/voice_alignment_incomplete/);
});
test("new Render assembly does not time-stretch the narration and preflights audio",()=>{
 const source=readFileSync(new URL("../services/vmv-studio-worker/worker.mjs",import.meta.url),"utf8");
 const process=source.slice(source.indexOf("async function processJob(job){"));
 assert.doesNotMatch(source,/atempo=/);
 assert.ok(process.indexOf('phase:"Preparando narración continua"')<process.indexOf("startMotionClip("));
 assert.match(process,/transcribeWordTimings\(job,narration\)/);
 assert.match(source,/requiresReview:!visuallyValid/);
});
