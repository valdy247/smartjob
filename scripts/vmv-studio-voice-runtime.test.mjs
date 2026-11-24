import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {recordedVoiceRuntime} from "../services/vmv-studio-worker/voice-runtime.mjs";

test("30-second selection accepts natural ElevenLabs voice durations without rushing",()=>{
 assert.equal(recordedVoiceRuntime(30,24.38),24.38);
 assert.equal(recordedVoiceRuntime(30,38.7),38.7);
 assert.equal(recordedVoiceRuntime(30,30),30);
});
test("silent nominal duration is unchanged and never calls TTS",()=>{
 const worker=readFileSync(new URL("../services/vmv-studio-worker/worker.mjs",import.meta.url),"utf8");
 assert.match(worker,/silent\?silentTimeline\(scenes,duration,job.subtitles\)/);
 assert.match(worker,/const originalDuration=narrationFile\?/);
});
test("reject extreme runtime deviations and invalid data before expensive animation",()=>{
 for(const bad of [0,-1,NaN,Infinity,301,8,15,48,78]){
  assert.throws(()=>recordedVoiceRuntime(30,bad),/voice_duration_(invalid|outside_safe_range)/);
 }
 assert.throws(()=>recordedVoiceRuntime(10,10),/voice_duration_invalid/);
});
test("worker reuses continuous voice and existing scene assets on resumed jobs",()=>{
 const worker=readFileSync(new URL("../services/vmv-studio-worker/worker.mjs",import.meta.url),"utf8");
 assert.match(worker,/restoreAsset\(job,"voice_continuous",narration\)/);
 assert.match(worker,/duration=recordedVoiceRuntime\(job.seconds,measuredVoiceSeconds,resumedExistingVoice\)/);
 assert.match(worker,/recordedVoiceRuntime\(job.seconds,Number\(timing\?\.duration\),/);
 assert.doesNotMatch(worker,/voice_length_requires_script_revision/);
 assert.doesNotMatch(worker,/atempo=/);
 assert.match(worker,/speechTimeline\(scenes,duration,alignment\)/);
 assert.ok(worker.indexOf("duration=recordedVoiceRuntime(job.seconds,measuredVoiceSeconds,resumedExistingVoice)") <
  worker.indexOf("startMotionClip("));
});
test("UI distinguishes target duration from the measured voice duration",()=>{
 const route=readFileSync(new URL("../app/api/video-studio/jobs/route.ts",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../app/vista-app/video-studio/page.tsx",import.meta.url),"utf8");
 assert.match(route,/const actualSeconds=typeof measured\?\.duration/);
 assert.match(ui,/Duración objetivo/);
 assert.match(ui,/Duración final:/);
 assert.match(ui,/job.actualSeconds\|\|job.seconds/);
});

test("saved ElevenLabs speech on a previously failed video may finish naturally without a new image call",()=>{
 assert.throws(()=>recordedVoiceRuntime(40,63.4),/voice_duration_outside_safe_range/);
 assert.equal(recordedVoiceRuntime(40,63.4,true),63.4);
 assert.equal(recordedVoiceRuntime(40,71,true),71);
 assert.throws(()=>recordedVoiceRuntime(40,73,true),/voice_duration_outside_safe_range/);
 assert.throws(()=>recordedVoiceRuntime(40,13,true),/voice_duration_outside_safe_range/);
 const worker=readFileSync(new URL("../services/vmv-studio-worker/worker.mjs",import.meta.url),"utf8");
 assert.match(worker,/Number\(job.resume_count\)>0&&Boolean\(job.assets\?\.voice_continuous\)/);
 assert.match(worker,/approved_voice_extended_on_resume/);
 assert.match(worker,/voice_duration_measured/);
 assert.match(worker,/await restoreAsset\(job,"voice_continuous",narration\)/);
});
