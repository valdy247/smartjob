const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const ts=require("typescript");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const files=[
 "app/vista-app/vmv-pilot/page.tsx",
 "components/VMVPilotRenderDock.tsx",
 "app/api/video-generator/pilot-render/route.ts",
 "app/api/video-generator/pilot/route.ts",
 "app/api/video-generator/radar/route.ts",
 "app/vista-app/video-generator/ViralRadar.tsx",
 "app/vista-app/vmv-pilot/PilotTrendStep.tsx",
 "app/vista-app/vmv-pilot/PilotVoiceStep.tsx",
 "app/api/video-generator/pilot-voices/route.ts",
 "app/api/video-generator/pilot-voice-preview/route.ts",
 "lib/vmv-pilot-elevenlabs.ts",
 "lib/vmv-pilot-voice-config.ts"
];
const source=Object.fromEntries(files.map(p=>[p,read(p)]));
test("Video Pilot wizard and durable API parse TypeScript",()=>{
 for(const p of files){
  const parsed=ts.createSourceFile(p,source[p],ts.ScriptTarget.Latest,true,
   p.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(parsed.parseDiagnostics.map(e=>ts.flattenDiagnosticMessageText(e.messageText," ")),[],p);
 }
});
test("Worker has valid native Node JavaScript syntax",()=>{
 execFileSync(process.execPath,["--check",path.join(__dirname,"..","services/vmv-pilot-worker/worker.mjs")]);
});
test("Wizard supports niche, audience and goals outside business",()=>{
 const ui=source["app/vista-app/vmv-pilot/page.tsx"];
 for(const phrase of ["Curiosidades","Historia","Entretenimiento","Negocios","Niños","Adultos","Familias","Otro","Entretener","Enseñar","Inspirar","Promocionar","Generar video"])
  assert.ok(ui.includes(phrase),phrase);
 assert.match(ui,/setStep\(1\)/);
 assert.match(ui,/setStep\(3\)/);
 assert.match(ui,/Autorizo usar créditos/);
});
test("Clip worker actually uses image-to-video, five seconds and an MP4 compositor",()=>{
 const w=read("services/vmv-pilot-worker/worker.mjs");
 assert.match(w,/image_to_video/);
 assert.match(w,/model:"gen4\.5"/);
 assert.match(w,/duration:5/);
 assert.match(w,/ffmpeg/);
 assert.match(w,/subtitles=/);
 assert.match(w,/atempo=/);
 assert.match(w,/Math\.floor\(78\*\(i\+1\)\/scenes\.length\)/);
 assert.match(w,/STYLES|STYLE/);
 assert.match(w,/await persistAsset\(job,"clip_"\+i/);
});
test("Durable job requires per-video credit consent and enforces privacy and limits",()=>{
 const api=source["app/api/video-generator/pilot-render/route.ts"];
 const sql=read("supabase/sql/vmv_pilot_durable_renders_20261121.sql");
 assert.match(api,/confirmCost!==true/);
 assert.match(api,/process\.env\.VMV_PILOT_RENDER_ENABLED/);
 assert.match(api,/authenticatedUser\(req\)/);
 assert.match(api,/videoAllowed\(owner\)/);
 assert.match(api,/createSignedUrl/);
 assert.match(sql,/pilot_render_active_limit/);
 assert.match(sql,/pilot_render_daily_limit/);
 assert.match(sql,/lease_expires_at/);
 assert.match(sql,/FOR UPDATE SKIP LOCKED/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/one job per 24h/i);
});
test("Floating progress is server-reported and restores on reload",()=>{
 const dock=source["components/VMVPilotRenderDock.tsx"];
 assert.match(dock,/pilot-render/);
 assert.match(dock,/setInterval/);
 assert.match(dock,/refresh/);
 assert.match(dock,/job\?\.progress/);
 assert.match(dock,/vmv-pilot:generate/);
 assert.match(dock,/video controls playsInline/);
 assert.doesNotMatch(dock,/MediaRecorder|createImageBitmap|canvas\.captureStream/);
});
test("Search errors never hide failures behind an uninformative generic message",()=>{
 const client=source["app/vista-app/video-generator/ViralRadar.tsx"];
 assert.match(client,/login:/);
 assert.match(client,/radar_youtube_invalid:/);
 assert.doesNotMatch(client,/Couldn't research this topic\./);
});
test("Saving campaign alone cannot start a paid generation or publish content",()=>{
 const api=source["app/api/video-generator/pilot/route.ts"];
 assert.match(api,/status:"paused"/);
 assert.match(api,/next_run_at:null/);
 assert.doesNotMatch(api,/publishToSocial|startRunway|generateSpeech/);
});

test("Pilot requires a trend decision before summary; no nested Radar inside final review",()=>{
 const ui=source["app/vista-app/vmv-pilot/page.tsx"];
 const trend=source["app/vista-app/vmv-pilot/PilotTrendStep.tsx"];
 assert.match(ui,/step===9\?<PilotTrendStep/);
 assert.match(ui,/step===10\?<div className=\{css.review\}/);
 assert.doesNotMatch(ui,/<ViralRadar/);
 assert.match(trend,/Sí, analizar/);
 assert.match(trend,/No, continuar/);
 assert.match(trend,/setPhase\(L\("Creando propuestas"/);
 assert.match(trend,/scanId:current\.id,language/);
 assert.match(trend,/onChoose\(idea,scan\.id\)/);
 assert.match(trend,/youtube\.com\/t\/terms/);
});
test("Six supported video languages and voice choice are independent of interface language",()=>{
 const ui=source["app/vista-app/vmv-pilot/page.tsx"];
 const voice=source["app/vista-app/vmv-pilot/PilotVoiceStep.tsx"];
 const cfg=source["lib/vmv-pilot-voice-config.ts"];
 for(const lang of ['"es"','"en"','"pt"','"fr"','"de"','"it"'])assert.ok(cfg.includes(lang));
 assert.match(ui,/Idioma del video/);
 assert.match(ui,/step===6/);
 assert.match(ui,/step===7\?<PilotVoiceStep/);
 assert.match(ui,/language:form\.language,voiceProvider:form\.voiceProvider,voiceId:form\.voiceId/);
 assert.match(voice,/onChoose\(v\.provider,v\.id,v\.name\)/);
 assert.match(voice,/No voice/);
});
test("Selected voice and target language are verified before a persistent job is accepted",()=>{
 const api=source["app/api/video-generator/pilot-render/route.ts"];
 const pilot=source["app/api/video-generator/pilot/route.ts"];
 assert.match(api,/validPilotLanguage\(language\)/);
 assert.match(api,/validPilotVoice\(voiceProvider,voiceId\)/);
 assert.match(api,/verifyElevenLabsVoice\(voiceId,language\)/);
 assert.match(api,/vmv_pilot_render_enqueue_v2/);
 assert.match(pilot,/ideas_language!==language/);
 assert.match(pilot,/voice_provider:voiceProvider/);
 const sql=read("supabase/sql/vmv_pilot_languages_and_voices_20261121.sql");
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.vmv_pilot_render_enqueue_v2/);
 assert.match(sql,/p_voice_provider/);
 assert.match(sql,/CHECK\(language IN \('es','en','pt','fr','de','it'\)\)/);
});
test("Worker blocks videos where script or actual narration has the wrong language",()=>{
 const worker=read("services/vmv-pilot-worker/worker.mjs");
 assert.match(worker,/verifyScriptLanguage\(job,scenes\)/);
 assert.match(worker,/script_language_mismatch/);
 assert.match(worker,/verifyAudioLanguage\(job,voices,dir\)/);
 assert.match(worker,/audio_language_mismatch/);
 assert.match(worker,/eleven_multilingual_v2/);
 assert.match(worker,/job\.voice_provider==="elevenlabs"/);
 assert.match(worker,/voice:job\.voice_id/);
 assert.match(worker,/duration:5/);
});

test("Voice cards preview real audio in the chosen video language without selecting the voice",()=>{
 const view=source["app/vista-app/vmv-pilot/PilotVoiceStep.tsx"];
 const api=source["app/api/video-generator/pilot-voice-preview/route.ts"];
 assert.match(view,/onClick=\{\(\)=>void play\(v\)\}/);
 assert.match(view,/onChoose\(v\.provider,v\.id,v\.name\)/);
 assert.match(view,/new Audio\(url\)/);
 assert.match(view,/audio\.play\(\)/);
 assert.match(view,/URL\.createObjectURL\(blob\)/);
 assert.match(view,/URL\.revokeObjectURL/);
 assert.match(api,/generateSpeech/);
 assert.match(api,/eleven_multilingual_v2/);
 assert.match(api,/samples\[language\]/);
 assert.match(api,/videoAllowed\(owner\)/);
 assert.match(api,/vmv_pilot_voice_preview_claim/);
 assert.match(api,/Content-Type":"audio\/mpeg"/);
 const sql=read("supabase/sql/vmv_pilot_voice_previews_20261122.sql");
 assert.match(sql,/vmv_pilot_voice_preview_claim/);
 assert.match(sql,/IF n>=12 THEN RETURN false/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
});
