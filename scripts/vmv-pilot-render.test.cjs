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
 "lib/vmv-pilot-voice-config.ts",
 "lib/vmv-pilot-quality.ts",
 "app/vista-app/vmv-pilot/stickman-lab/page.tsx",
 "lib/vmv-stickman-engine.ts"
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
 assert.match(ui,/Autorizo generar el video y consumir créditos/);
});
test("Clip worker actually uses image-to-video, five seconds and an MP4 compositor",()=>{
 const w=read("services/vmv-pilot-worker/worker.mjs");
 const engine=read("services/vmv-pilot-worker/motion-engine.mjs");
 assert.match(engine,/experimental_startVideo/);
 assert.match(engine,/experimental_getVideoStatus/);
 assert.match(engine,/bytedance\/seedance-v1\.0-pro-fast/);
 assert.match(engine,/bytedance\/seedance-v1\.0-pro/);
 assert.match(w,/startMotionClip/);
 assert.match(w,/waitMotionClip/);
 assert.match(engine,/duration:5/);
 assert.match(w,/ffmpeg/);
 assert.match(w,/subtitles=/);
 assert.match(w,/atempo=/);
 assert.match(w,/Math\.floor\(65\*completed\/total\)/);
 assert.match(w,/STYLES|STYLE/);
 assert.match(w,/await persistAsset\(job,item\.key,item\.clip,"video\/mp4"\)/);
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
 assert.match(ui,/step===11\?<div className=\{css.review\}/);
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
 assert.match(api,/vmv_pilot_render_enqueue_v3/);
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
 assert.match(worker,/verifyAudioLanguage\(job,\[narrationFile\],dir\)/);
 assert.match(worker,/audio_language_mismatch/);
 assert.match(worker,/eleven_multilingual_v2/);
 assert.match(worker,/job\.voice_provider==="elevenlabs"/);
 assert.match(worker,/voice:job\.voice_id/);
 assert.match(read("services/vmv-pilot-worker/motion-engine.mjs"),/duration:5/);
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

test("Quality wizard creates one or two videos with explicit animation price and credit approval",()=>{
 const ui=source["app/vista-app/vmv-pilot/page.tsx"];
 const quality=source["lib/vmv-pilot-quality.ts"];
 assert.match(ui,/step===10\?<div className=\{css.choices\}/);
 assert.match(ui,/step===11\?<div className=\{css.review\}/);
 assert.match(ui,/Probar ambas/);
 assert.match(ui,/Generar ambos videos/);
 assert.match(ui,/qualityMode:form\.qualityMode/);
 assert.match(ui,/Autorizo generar 2 videos y consumir créditos/);
 assert.match(quality,/centsPerSecond:2\.06/);
 assert.match(quality,/centsPerSecond:5\.15/);
 assert.match(quality,/centsPerSecond:7\.21/);
});
test("The compare mode is a single idempotent job and NOT two separate paid AI preparations",()=>{
 const api=source["app/api/video-generator/pilot-render/route.ts"];
 const sql=read("supabase/sql/vmv_pilot_quality_comparison_20261122.sql");
 const worker=read("services/vmv-pilot-worker/worker.mjs");
 assert.match(api,/vmv_pilot_render_enqueue_v3/);
 assert.match(api,/validPilotQuality\(qualityMode\)/);
 assert.match(sql,/quality_mode IN \('turbo','high','compare'\)/);
 assert.match(sql,/PERFORM pg_advisory_xact_lock/);
 assert.match(sql,/UNIQUE|pilot_render_daily_limit/);
 assert.match(worker,/job\.quality_mode==="compare"\?\["turbo","high"\]/);
 assert.match(worker,/await aiScript\(job\)/);
 assert.match(worker,/await generateContinuousSpeech\(job,scenes,narrationFile\)/);
 assert.match(worker,/await makeImage\(job,scenes\[i\]/);
 assert.match(worker,/Promise\.allSettled\(pending\.map/);
 assert.match(worker,/await startMotionClip\(/);
 assert.match(worker,/outputs:\{\.\.\.\(job\.outputs\|\|\{\}\),\[variant\]:pathKey\}/);
});
test("Only owner-specific completed MP4 variants are signed, preference uses PATCH without spending",()=>{
 const api=source["app/api/video-generator/pilot-render/route.ts"];
 const dock=source["components/VMVPilotRenderDock.tsx"];
 assert.match(api,/variantPath\(owner,row\.id,variant\)/);
 assert.match(api,/createSignedUrl/);
 assert.match(api,/export async function PATCH/);
 assert.match(api,/update\(\{preferred_model:preferredModel\}\)/);
 assert.match(dock,/className=\{job\?\.quality_mode==="compare"\?css\.comparison:css\.single\}/);
 assert.match(dock,/Usar /);
 assert.match(dock,/videoUrls/);
 assert.match(dock,/preferred_model:variant/);
});

test("Custom Stickman lab uses an independent 2D engine with real geometric motion and 5s timelines",()=>{
 const engine=source["lib/vmv-stickman-engine.ts"];
 const page=source["app/vista-app/vmv-pilot/stickman-lab/page.tsx"];
 assert.match(engine,/export const STICKMAN_SCENE_SECONDS=5/);
 assert.match(engine,/export const STICKMAN_SECONDS=15/);
 assert.match(engine,/type StickmanAction=/);
 assert.match(engine,/action:"earth"/);
 assert.match(engine,/action:"jupiter"/);
 assert.match(engine,/action:"beach"/);
 assert.match(engine,/function stickman\(/);
 assert.match(engine,/function earth\(/);
 assert.match(engine,/function jupiter\(/);
 assert.match(engine,/function raceCar\(/);
 assert.match(engine,/ctx\.rotate|Math\.sin|oscillate/);
 assert.match(engine,/export function drawStickmanFrame/);
 assert.doesNotMatch(engine,/runway|fal\.ai|minimax|fetch\(/i);
 assert.match(page,/stickmanStory\(topic,language\)/);
 assert.match(page,/drawStickmanFrame/);
 assert.match(page,/canvas\.captureStream/);
 assert.match(page,/new MediaRecorder/);
 assert.match(page,/videoUrl/);
 assert.match(page,/download=\{/);
});
test("The free preview never calls a paid generator; voice generation is opt-in",()=>{
 const page=source["app/vista-app/vmv-pilot/stickman-lab/page.tsx"];
 assert.match(page,/withVoice\?await loadVoice/);
 assert.match(page,/confirmCost:true/);
 assert.match(page,/voiceParts\.length/);
 assert.match(page,/source\.start\(begin\+i\*5\)/);
 assert.match(page,/speech\/scenes/);
 assert.doesNotMatch(page,/image_to_video|runwayStart|GEN4/);
});
test("The lab is reachable from Pilot and does not change the existing paid wizard",()=>{
 const ui=source["app/vista-app/vmv-pilot/page.tsx"];
 assert.match(ui,/stickman-lab/);
 assert.match(ui,/Abrir laboratorio manual de VMV Motion/);
 assert.match(ui,/Crear con VMV Motion/);
 assert.match(ui,/PilotTrendStep/);
 assert.match(ui,/Generar ambos videos/);
});

test("Pilot uses Seedance 720p with durable jobs and one uninterrupted narration",()=>{
 const worker=read("services/vmv-pilot-worker/worker.mjs");
 const engine=read("services/vmv-pilot-worker/motion-engine.mjs");
 const timeline=read("services/vmv-pilot-worker/speech-timeline.mjs");
 const quality=read("lib/vmv-pilot-quality.ts");
 assert.match(worker,/voice_continuous/);
 assert.match(worker,/voice_timeline/);
 assert.match(worker,/speechTimeline\(scenes/);
 assert.match(worker,/await persistAsset\(job,item\.key,item\.clip,"video\/mp4"\)/);
 assert.match(worker,/taskKey/);
 assert.match(engine,/resolution:"1280x720"/);
 assert.match(engine,/createSignedUrl/);
 assert.match(timeline,/character_start_times_seconds/);
 assert.match(quality,/seedance-v1\.0-pro-fast/);
 assert.match(quality,/seedance-v1\.0-pro/);
});

test("Pilot wizard opens a fresh consented Motion production with its trend and voice settings",()=>{
 const wizard=read("app/vista-app/vmv-pilot/page.tsx");
 const motion=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 const speech=read("app/api/video-generator/speech/continuous/route.ts");
 assert.match(wizard,/vmv-pilot-motion-handoff-v1/);
 assert.match(wizard,/form\.creative_seed/);
 assert.match(wizard,/voiceProvider:form\.voiceProvider/);
 assert.match(wizard,/confirmedCost:true/);
 assert.match(wizard,/pilotMotion=/);
 assert.match(motion,/PILOT_MOTION_HANDOFF_KEY/);
 assert.match(motion,/setPilotAuto\(true\)/);
 assert.match(motion,/await prepareStoryboard\(\)/);
 assert.match(motion,/await animateApproved\(\)/);
 assert.match(motion,/vmv-motion-archive-/);
 assert.match(speech,/openaiContinuous/);
 assert.match(speech,/timestamp_granularities/);
});
