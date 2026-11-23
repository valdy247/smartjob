import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {speechTimeline,silentTimeline} from "../services/vmv-studio-worker/speech-timeline.mjs";

test("scene cut timing follows real word boundaries, not uniform scene durations",()=>{
 const scenes=[
  {speech:"Hola humano"},
  {speech:"Soy una fruta y mi historia es realmente fascinante"},
  {speech:"Conozco muchas otras plantas"},
  {speech:"Y esta es la gran sorpresa que nadie esperaba"}
 ];
 const spoken=scenes.flatMap(scene=>scene.speech.split(" "));
 let at=0;
 const words=spoken.map((word,i)=>{const start=at;at+=i%4===0?.51:.34;return {word,start,end:at-.05};});
 const duration=at+.7;
 const output=speechTimeline(scenes,duration,{words});
 assert.equal(output.alignmentSource,"whisper_words");
 assert.equal(output.segments.length,4);
 assert.equal(output.segments[0].start,0);
 assert.ok(Math.abs(output.segments[0].end-words[2].start)<.001);
 assert.ok(Math.abs(output.segments[1].end-words[11].start)<.001);
 assert.equal(output.segments[3].end,duration);
 assert.notEqual(output.segments[0].duration,output.segments[1].duration);
 assert.ok(output.cues.length>3);
});
test("slightly imperfect transcription aligns content rather than guessing",()=>{
 const scenes=[{speech:"Este animal vive en el bosque"},{speech:"y sorprende a todos con sus colores"},{speech:"después descubre un lugar increíble"}];
 const spoken=scenes.flatMap(x=>x.speech.split(" "));
 const words=spoken.map((word,i)=>({word,start:i*.31,end:i*.31+.23}));
 words[4].word="arbol"; // An ASR mistake must not invalidate the entire timeline.
 const t=speechTimeline(scenes,spoken.length*.31+.4,{words});
 assert.equal(t.segments.length,3);
 assert.ok(t.segments[0].duration>0);
 assert.ok(t.segments[1].duration>0);
});
test("ElevenLabs character timestamps produce variable-length visual cuts",()=>{
 const scenes=[{speech:"uno de los beneficios"},{speech:"es estudiar en el army"},{speech:"para alcanzar nuevas metas"}];
 const text=scenes.map(s=>s.speech).join(" ");
 const characters=Array.from(text),starts=characters.map((_,i)=>i*.065);
 const ends=starts.map(v=>v+.05);
 const t=speechTimeline(scenes,Math.max(5,ends.at(-1)+.7),{
  characters,character_start_times_seconds:starts,character_end_times_seconds:ends
 });
 assert.equal(t.alignmentSource,"elevenlabs_characters");
 assert.ok(t.segments[0].end>0);
 assert.ok(t.segments[1].start===t.segments[0].end);
 assert.ok(t.cues.every(c=>c.end>c.start));
});
test("incomplete or mismatched audio alignment fails safely before video animation",()=>{
 const scenes=[{speech:"una narración que tiene muchas palabras diferentes y debe durar muchos segundos"},
 {speech:"con muchos datos interesantes y ejemplos reales de ciencia"},
 {speech:"para terminar esta historia sin perder el hilo"}];
 assert.throws(()=>speechTimeline(scenes,12,{words:[
  {word:"una",start:0,end:.3},{word:"narración",start:.3,end:.7}
 ]}),/voice_alignment_incomplete/);
});
test("silent timeline proportions follow speech lengths, not fixed five seconds",()=>{
 const scenes=[{speech:"Un dato."},{speech:"Esta explicación es bastante larga y necesita mostrar muchas cosas."},
  {speech:"El fin."}];
 const result=silentTimeline(scenes,30,true);
 assert.equal(result.segments.length,3);
 assert.ok(result.segments[0].duration<result.segments[1].duration);
 assert.equal(result.segments.at(-1).end,30);
 assert.equal(result.cues.length,3);
});
test("render worker preflights narration and can create zoom shots without changing voice speed",()=>{
 const src=readFileSync(new URL("../services/vmv-studio-worker/worker.mjs",import.meta.url),"utf8");
 const active=src.slice(src.indexOf("async function processJob(job){"));
 assert.doesNotMatch(src,/atempo=/);
 assert.ok(active.indexOf('phase:"Preparando narración continua"')<active.indexOf("startMotionClip("));
 assert.match(active,/transcribeWordTimings\(job,narration\)/);
 assert.match(src,/silentTimeline\(scenes,duration,job.subtitles\)/);
 assert.match(src,/timing\.segments\[i\]\.duration\*24/);
 assert.match(src,/semanticReady\?"semantic-v2"/);
 assert.doesNotMatch(active,/job\.scenes\.length!==job\.seconds\/5/);
 assert.match(src,/requiresReview:!visuallyValid/);
});
