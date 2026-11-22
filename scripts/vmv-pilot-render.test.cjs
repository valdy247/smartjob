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
 assert.match(ui,/Abrir VMV Motion/);
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
 assert.match(motion,/vmv-motion-projects-v1/);
 assert.match(motion,/archiveMotionProject/);
 assert.match(motion,/newMotionProject/);
 assert.match(speech,/openaiContinuous/);
 assert.match(speech,/timestamp_granularities/);
});

test("Pilot passes trusted source research to Motion instead of inventing celebrity controversies",()=>{
 const wizard=read("app/vista-app/vmv-pilot/page.tsx");
 const lab=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 const director=read("app/api/video-generator/motion-terra/route.ts");
 assert.match(wizard,/researchScanId:form\.research_scan_id/);
 assert.match(wizard,/researchVideoId:form\.research_video_id/);
 assert.match(lab,/researchSource/);
 assert.match(lab,/researchScanId:researchSource\.scanId/);
 assert.match(director,/vmv_video_radar_scans/);
 assert.match(director,/\.eq\("owner_id",owner\)/);
 assert.match(director,/validRadarId\(body\?\.researchVideoId\)/);
 assert.match(director,/YouTube public metadata/);
 assert.match(director,/not proof of its assertions/);
 assert.match(director,/do not invent a named person/);
 assert.match(director,/research:evidence/);
});

test("Seedance preflight validates all pending storyboard frames before paid generation",()=>{
 const api=read("app/api/video-generator/motion-seedance/route.ts");
 const motion=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 assert.match(api,/action==="preflight"/);
 assert.match(api,/if\(action==="preflight"\)return reply\(\{ready:true/);
 assert.match(api,/seedance_motion_prompt_invalid/);
 assert.match(api,/seedance_image_owner_mismatch/);
 assert.doesNotMatch(api,/if\(!process\.env\.AI_GATEWAY_API_KEY\)return reply/);
 assert.match(motion,/action:"preflight"/);
 assert.match(motion,/pending\.map\(beat/);
 assert.match(motion,/HTTP "\+response\.status/);
 assert.match(motion,/Tus imágenes y los clips anteriores se conservan/);
});

test("Motion narration stays editable after paid clips without invalidating image approvals",()=>{
 const motion=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 assert.match(motion,/Editar narración/);
 assert.match(motion,/Guardar narración/);
 assert.match(motion,/Cancelar/);
 assert.match(motion,/setSpeechDraft/);
 assert.match(motion,/scenes\[index\]=\{\.\.\.scenes\[index\],speech\}/);
 assert.match(motion,/Editing narration does not invalidate approved images/);
 assert.match(motion,/saveDirectorPlan\(next\)/);
 assert.match(motion,/if\(changed\)\{setSeedJoined\(""\)/);
 assert.match(motion,/editingSpeech!==null\|\|regeneratingScene/);
});

test("Gateway errors distinguish an exhausted budget from funds, payment restrictions, and unknown 402",async()=>{
 const {classifyGatewayVideoFailure:classify}=await import("../lib/vmv-gateway-video-error.mjs");
 const budget=classify({name:"GatewayInternalServerError",cause:{
  name:"AI_APICallError",statusCode:402,
  responseBody:JSON.stringify({error:{type:"quota_for_entity_exceeded",
   message:'Project budget exceeded. Current spend: $5.05, limit: $5.00. API key id abc_secret'}})
 }});
 assert.equal(budget.error,"ai_gateway_budget_exceeded");
 assert.equal(budget.status,402);
 assert.equal(budget.providerType,"quota_for_entity_exceeded");
 assert.equal(budget.budgetScope,"project");
 assert.doesNotMatch(JSON.stringify(budget),/abc_secret|Current spend/);
 assert.equal(classify({statusCode:402,responseBody:JSON.stringify({error:{type:"insufficient_funds"}})}).error,
  "ai_gateway_funds_unavailable");
 assert.equal(classify({cause:{statusCode:402,responseBody:'{"error":{"type":"payment_required"}}'}}).error,
  "ai_gateway_billing_restricted");
 assert.equal(classify({name:"GatewayInternalServerError",cause:{statusCode:402}}).error,
  "ai_gateway_payment_rejected");
 assert.equal(classify({name:"GatewayInternalServerError",cause:{
  statusCode:402,message:"Gateway failed: quota_for_entity_exceeded: Project budget exceeded. Current spend: $5.05, limit: $5.00"
 }}).error,"ai_gateway_budget_exceeded");
 assert.equal(classify({statusCode:422}).error,"seedance_invalid_parameters");
 const route=read("app/api/video-generator/motion-seedance/route.ts");
 const ui=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 assert.match(route,/classifyGatewayVideoFailure\(e\)/);
 assert.match(route,/providerType:problem\.providerType/);
 assert.match(route,/budgetScope:problem\.budgetScope/);
 assert.match(ui,/ai_gateway_budget_exceeded/);
 assert.match(ui,/ai_gateway_funds_unavailable/);
 assert.match(ui,/ai_gateway_payment_rejected/);
 assert.match(ui,/No se hizo ningún reintento automático/);
});

test("Saved storyboard .jpg previews use the correct validation rule and cost no model calls",()=>{
 const api=read("app/api/video-generator/motion-image/route.ts");
 const preview=api.split('if(body?.action==="preview"){')[1]?.split(' const prompt=')[0];
 assert.ok(preview,"Preview-only branch must exist");
 const sourceRule=preview.match(/!\/(\^[^\n]*?)\/\.test\(imagePath\)/)?.[1];
 assert.equal(sourceRule,'^[-a-z0-9/]+\\.jpg$',"Do not double-escape the JPG extension in a regex literal");
 const rule=new RegExp(sourceRule);
 assert.equal(rule.test("01234567-89ab-4def-8012-123456789abc/01234567-89ab-4def-8012-123456789abc.jpg"),true);
 assert.equal(rule.test("01234567-89ab-4def-8012-123456789abc/other.png"),false);
 assert.equal(rule.test("../private.jpg"),false);
 assert.match(preview,/createSignedUrl\(imagePath,7200\)/);
 assert.doesNotMatch(preview,/api\.openai\.com|startVideo\(/);
});

test("Seedance montage downloads existing completed MP4s without rechecking gateway status or regenerating",()=>{
 const api=read("app/api/video-generator/motion-seedance/route.ts");
 const ui=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 const download=api.split('if(body?.action==="download"||body?.action==="archive"||body?.action==="stitch-url"){')[1]?.split('if(body?.action==="status"){')[0];
 assert.ok(download,"Existing clips must have a download route");
 assert.match(download,/unseal\(token,owner\)/);
 assert.match(download,/storage\.from\(CLIP_BUCKET\)\.download/);
 assert.match(download,/trustedSeedanceUrl\(sourceUrl\)/);
 assert.match(download,/mediaUrl=sourceUrl/);
 assert.match(download,/savePrivateClip\(owner,token,data\)/);
 const clipBranch=download.split('if(sourceUrl&&trustedSeedanceUrl(sourceUrl)){')[1]?.split('}else{')[0];
 assert.ok(clipBranch);
 assert.doesNotMatch(clipBranch,/startVideo\(|getVideoStatus\(/);
 assert.match(api,/endsWith\("\.volces\.com"\)/);
 assert.match(api,/fileSizeLimit:26000000/);
 assert.match(ui,/body:JSON\.stringify\(\{action:"stitch-url",token,sourceUrl\}\)/);
 assert.match(ui,/loadSeedanceForStitching\(accessToken,job\.tokens\[i\],job\.urls\[i\],i\)/);
 assert.match(ui,/Recuperando MP4 guardado/);
 assert.match(ui,/No se inició otra generación/);
});

test("Cloud Motion Library is owner-scoped and final renders use signed storage uploads",()=>{
 const api=read("app/api/video-generator/motion-library/route.ts");
 const studio=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 assert.match(api,/authenticatedUser\(req\)/);
 assert.match(api,/videoAllowed\(owner\)/);
 assert.match(api,/public:false/);
 assert.match(api,/projectPath\(owner,snapshot\.id\)/);
 assert.match(api,/createSignedUploadUrl\(path,\{upsert:true\}\)/);
 assert.match(api,/createSignedUrl\(/);
 assert.match(api,/validSnapshot\(project,owner\)/);
 assert.match(studio,/setCloudProjects/);
 assert.match(studio,/action:"save"/);
 assert.match(studio,/action:"list"/);
 assert.match(studio,/action:"load"/);
 assert.match(studio,/action:"render-upload"/);
 assert.match(studio,/uploadToSignedUrl/);
 assert.match(studio,/action:"render-url"/);
});
test("Single-scene editing does not invalidate other paid Seedance clips",()=>{
 const api=read("app/api/video-generator/motion-seedance/route.ts");
 const studio=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 assert.match(studio,/renderSingleScene=useCallback/);
 assert.match(studio,/job\.draftTokens/);
 assert.match(studio,/job\.needsMotion/);
 assert.match(studio,/latest\.tokens\[index\]=pending/);
 assert.match(studio,/latest\.urls\[index\]=status\.url/);
 assert.match(studio,/latest\.history=/);
 assert.match(studio,/revertClip=useCallback/);
 assert.match(studio,/await seedanceRequest\(accessToken,\{action:"archive"/);
 assert.match(api,/allowArchived=false/);
 assert.match(api,/if\(!jobFresh\)return reply\(\{error:"video_archive_missing"\},410\)/);
 assert.match(api,/if\(archiveOnly\)return reply\(\{saved:true,cached:true\}\)/);
});
test("Video finishing and publishing are honest and available by stage",()=>{
 const studio=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 assert.match(studio,/["']crear["']\|["']revisar["']\|["']editar["']\|["']publicar["']/);
 assert.match(studio,/musicVolume:/);
 assert.match(studio,/voiceVolume:/);
 assert.match(studio,/fadeSeconds/);
 assert.match(studio,/navigator\.clipboard\.writeText/);
 assert.match(studio,/await shareLibraryVideo\(currentCloudId\(\)\)/);
 assert.match(studio,/No publica automáticamente/);
 assert.match(studio,/Registro manual/);
 assert.match(studio,/currentCloudId\(\)/);
 const director=read("app/api/video-generator/motion-terra/route.ts");
 assert.match(director,/reusableCharacterBible:characterGuide/);
});

test("A saved character photo can be used to seed new scenes while preserving independent backgrounds",()=>{
 const studio=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 const image=read("app/api/video-generator/motion-image/route.ts");
 assert.match(studio,/setCharacterFrames\(previews\)/);
 assert.match(studio,/setCharacterReferencePath/);
 assert.match(studio,/referenceMode:"character"/);
 assert.match(studio,/referencePath:characterReferencePath/);
 assert.match(image,/characterReference=body\?\.referenceMode==="character"/);
 assert.match(image,/Use the attached image ONLY as a visual reference/);
 assert.match(image,/Do not reuse unrelated background objects/);
 assert.match(image,/referencePath\.startsWith\(owner\+"\/"\)/);
});
test("Soundtrack is synchronized after recorder begins, never before music decoding completes",()=>{
 const studio=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 assert.match(studio,/voiceSource=voice/);
 assert.match(studio,/musicSource=background/);
 assert.match(studio,/recorder\.start\(300\)/);
 assert.match(studio,/voiceSource\?\.start\(startsAt\)/);
 assert.match(studio,/musicSource\?\.start\(startsAt\)/);
 const start=studio.indexOf("recorder.start(300)");
 assert.ok(start>0);
 assert.ok(studio.indexOf("voiceSource?.start(startsAt)",start)>start);
});

test("Final VMV Motion UX uses one visual library instead of recovery menus and technical buttons",()=>{
 const motion=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 const styles=read("app/vista-app/vmv-pilot/stickman-lab/page.module.css");
 assert.match(motion,/Biblioteca de videos/);
 assert.match(motion,/libraryOpen/);
 assert.match(motion,/libraryGrid/);
 assert.match(motion,/cloudProjects\.filter/);
 assert.match(motion,/archivedProjects\.filter/);
 assert.match(motion,/restoreCloudProject\(item\.id\)/);
 assert.match(motion,/restoreMotionProject\(item\.id\)/);
 assert.match(motion,/Continuar editando/);
 assert.match(motion,/setLibraryOpen\(false\)/);
 assert.doesNotMatch(motion,/Abrir proyecto de la nube/);
 assert.doesNotMatch(motion,/Recuperar historia anterior/);
 assert.doesNotMatch(motion,/>Recuperar imágenes</);
 assert.doesNotMatch(motion,/>LAB</);
 assert.match(styles,/\.workspaceTabs/);
 assert.match(styles,/\.libraryCard/);
 assert.match(styles,/@media\(max-width:550px\)/);
});
test("Wizard and editor show loading spinners at route changes and while restoring projects",()=>{
 const wizard=read("app/vista-app/vmv-pilot/page.tsx");
 const editor=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 const routeLoader=read("app/vista-app/vmv-pilot/stickman-lab/loading.tsx");
 const wizardLoader=read("app/vista-app/vmv-pilot/loading.tsx");
 assert.match(wizard,/setTransitioning\(true\)/);
 assert.match(wizard,/transitionOverlay/);
 assert.match(wizard,/LoaderCircle className=\{css\.spin\}/);
 assert.match(editor,/auth==="checking"\|\|bootstrapping/);
 assert.match(editor,/loadingScreen/);
 assert.match(editor,/projectSwitching\?<div className=\{css\.loadingOverlay\}/);
 assert.match(editor,/framesRefreshing\?"Cargando imágenes/);
 assert.match(editor,/clipPreviewLoading\?"Cargando clip/);
 assert.match(routeLoader,/LoaderCircle/);
 assert.match(wizardLoader,/LoaderCircle/);
});

test("Library covers are privately signed and cannot reference another owner's storyboard",()=>{
 const api=read("app/api/video-generator/motion-library/route.ts");
 const studio=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 assert.match(api,/function validSnapshot\(input:unknown,owner:string\)/);
 assert.match(api,/path\.startsWith\(owner\+"\/"\)/);
 assert.match(api,/validSnapshot\(project,owner\)/);
 assert.match(api,/createSignedUrl\(first\.referencePath,3600\)/);
 assert.match(api,/scenes:project\.plan\.frames\.length,sceneCount:project\.plan\.scenes\.length/);
 assert.match(studio,/coverUrl\?:string/);
 assert.match(studio,/item\.coverUrl\?<img src=\{item\.coverUrl\}/);
 assert.match(studio,/currentTarget\.style\.display="none"/);
});

test("Library video voice change uses existing clips with a separate paid-confirmed narration",()=>{
 const page=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 const speech=read("app/api/video-generator/speech/continuous/route.ts");
 assert.match(page,/restoreCloudProject\(item\.id,true\)/);
 assert.match(page,/restoreMotionProject\(item\.id,true\)/);
 assert.match(page,/Cambiar voz/);
 assert.match(page,/VOICE_CHOICES/);
 assert.match(page,/Crear versión con esta voz/);
 assert.match(page,/animateApproved\("voice"\)/);
 assert.match(page,/const voiceOnly=mode==="voice"/);
 assert.match(page,/window\.confirm\("Se generará una nueva narración/);
 assert.match(page,/const pending=voiceOnly\?\[\]/);
 assert.match(page,/if\(job\.urls\[beat\]\)continue/);
 assert.match(page,/loadContinuousVoice\(plan\.scenes\.map/);
 assert.match(page,/stitchSeedanceClips\(localUrls,speech,asmrEnabled\?false:subtitles/);
 assert.match(speech,/openaiVoices=new Set\(\["alloy","nova","echo"\]\)/);
});
test("Changing a saved video's voice creates a new private render and retains the original",()=>{
 const page=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 const api=read("app/api/video-generator/motion-library/route.ts");
 assert.match(page,/const revisionId=crypto\.randomUUID\(\)/);
 assert.match(page,/voiceRevisions=\[/);
 assert.match(page,/action:"render-upload",id,extension,\.\.\.\(revisionId/);
 assert.match(page,/activeRenderId=revisionId/);
 assert.match(page,/selectVideoVersion=useCallback/);
 assert.match(page,/voiceRevisions\.map/);
 assert.match(api,/renderPath\(owner:string,id:string,extension:string,revisionId\?:string\)/);
 assert.match(api,/versions\/.*revisionId/);
 assert.match(api,/validId\(body\.revisionId\)/);
 assert.match(api,/validSnapshot\(project,owner\)/);
});

test("A new narration is billed only after all existing video clips can be downloaded",()=>{
 const page=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 const start=page.indexOf('const animateApproved=useCallback(async(mode:"normal"|"voice"="normal")');
 const finish=page.indexOf('},[customPrompt,withVoice,voice,subtitles',start);
 assert.ok(start>=0&&finish>start);
 const montage=page.slice(start,finish);
 const download=montage.indexOf('localUrls.push(await loadSeedanceForStitching');
 const voice=montage.indexOf('const speech=narrationEnabled?await loadContinuousVoice');
 assert.ok(download>=0&&voice>download,
  "Existing MP4 retrieval must finish before new voice spending begins");
 assert.match(montage,/const pending=voiceOnly\?\[\]/);
 assert.match(montage,/if\(job\.urls\[beat\]\)continue/);
});

test("VMV Motion ASMR is a separate credit-confirmed audio-only path and preserves clips",()=>{
 const page=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 const api=read("app/api/video-generator/motion-sfx/route.ts");
 assert.match(page,/asmrEnabled/);
 assert.match(page,/if\(enabled\)\{setProjectNarration\(false\);setSubtitles\(false\);/);
 assert.doesNotMatch(page,/music:asmrEnabled\?null:musicFile/);
 assert.match(page,/music:musicFile,musicVolume:musicVolume\/100/);
 assert.match(page,/compatible con ASMR/);
 assert.match(page,/loadMotionSfx\(accessToken,customPrompt,plan.scenes/);
 assert.match(page,/motionSfxCache\.set\(cacheKey,audio\)/);
 assert.match(page,/video\.playbackRate=playbackSpeed/);
 assert.match(page,/effectSources\.forEach\(\(source,index\)=>/);
 assert.match(api,/authenticatedUser\(req\)/);
 assert.match(api,/videoAllowed\(owner\)/);
 assert.match(api,/body\?\.confirmCost!==true/);
 assert.match(api,/eleven_text_to_sound_v3/);
 assert.match(api,/duration_seconds:duration/);
 assert.match(api,/Absolutely no speech, no narration, no vocals, no music/);
});

test("Private VMV Motion library can share original renders without sign-in or transcoding",()=>{
 const api=read("app/api/video-generator/motion-library/route.ts");
 const page=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 assert.match(api,/if\(action==="render-share"\)/);
 assert.match(api,/const project=await readProject\(owner,body\.id\)/);
 assert.match(api,/createMotionShareToken\(saved\.path\)/);
 assert.match(api,/new URL\("\/video-share\/"\+share\.token,origin\)/);
 assert.match(api,/const saved=await finishedRender\(owner,body\.id,project\)/);
 assert.match(api,/const active=project\.seedance\.activeRenderId/);
 assert.match(api,/public:false/);
 assert.match(page,/item\.ready\?<button type="button"/);
 assert.match(page,/shareLibraryVideo\(item\.id\)/);
 assert.match(page,/shareLibraryVideo\(currentCloudId\(\)\)/);
 assert.match(page,/action:"render-share",id/);
 assert.match(page,/navigator\.clipboard\.writeText\(libraryShare\.url\)/);
 assert.match(page,/Comparte el archivo original/);
 assert.doesNotMatch(api,/ffmpeg|transcode|MediaRecorder/);
});

test("Completed Seedance clips are signed rather than proxied through Vercel response",()=>{
 const api=read("app/api/video-generator/motion-seedance/route.ts");
 const ui=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 assert.match(api,/body\?\.action==="stitch-url"/);
 assert.match(api,/unseal\(token,owner,true\)/);
 assert.match(api,/createSignedUrl\(clipPath\(owner,token\),1800\)/);
 assert.match(api,/if\(signedOnly\)return await signedClip\(\)/);
 assert.match(api,/const saved=await savePrivateClip\(owner,token,data\)/);
 assert.match(ui,/action:"stitch-url",token,sourceUrl/);
 assert.match(ui,/await fetch\(ticket\.url,\{cache:"no-store"\}\)/);
 assert.match(ui,/la descarga directa del MP4 falló/);
 const loader=ui.split("async function loadSeedanceForStitching(")[1]?.split("type MotionSfx=")[0];
 assert.ok(loader);
 assert.doesNotMatch(loader,/await response\.blob\(\)/);
 assert.doesNotMatch(loader,/startVideo\(|generateMinimax\(/);
});

test("VMV Motion only runs paid narration with an explicit persisted opt-in",()=>{
 const page=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 assert.match(page,/narrationEnabled\?:boolean/);
 assert.match(page,/narrationEnabled:state\.narrationEnabled===true/);
 assert.match(page,/setWithVoice\(recovered\.narrationEnabled===true/);
 assert.match(page,/setWithVoice\(changeVoice\|\|project\.seedance\.narrationEnabled===true/);
 assert.match(page,/setWithVoice\(changeVoice\|\|selected\.seedance\.narrationEnabled===true/);
 assert.match(page,/const narrationEnabled=voiceOnly\?withVoice:/);
 assert.match(page,/withVoice&&storedNarration&&!asmrEnabled/);
 assert.match(page,/if\(narrationEnabled\)\{/);
 assert.match(page,/const speech=narrationEnabled\?await loadContinuousVoice/);
 assert.match(page,/latest\.narrationEnabled=narrationEnabled/);
 assert.match(page,/job\.narrationEnabled=enabled/);
 assert.match(page,/if\(enabled\)\{job\.narrationEnabled=false;\}/);
 assert.match(page,/job\.montageSeconds=montageSeconds/);
 assert.match(page,/Narración con voz IA/);
 assert.match(page,/Desactivada: no se generará narración/);
 assert.doesNotMatch(page,/setCustomMode\(true\);setWithVoice\(true\)/);
 assert.doesNotMatch(page,/setCustomPrompt\(saved\.prompt\);setCustomMode\(true\);setWithVoice\(true\)/);
});

test("Library sharing appears only for saved render files and desktop uses a visible share dialog",()=>{
 const api=read("app/api/video-generator/motion-library/route.ts");
 const page=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 const css=read("app/vista-app/vmv-pilot/stickman-lab/page.module.css");
 assert.match(api,/async function finishedRender\(owner:string,id:string,project:ProjectSnapshot\)/);
 assert.match(api,/const root=await bucket\.list\(owner\+"\/"\+id,\{limit:100\}\)/);
 assert.match(api,/saved\.has\("final\."\+extension\)/);
 assert.match(api,/const ready=Boolean\(await finishedRender/);
 assert.match(api,/if\(!saved\)return reply\(\{error:"motion_render_not_found"\},404\)/);
 assert.match(page,/item\.ready\?<button type="button"/);
 assert.match(page,/Montar para compartir/);
 assert.match(page,/libraryShareOverlay/);
 assert.match(page,/role="dialog" aria-modal="true"/);
 assert.match(page,/Enviar por WhatsApp/);
 assert.match(page,/Enviar por correo/);
 assert.match(page,/Probar descarga/);
 assert.match(page,/document\.execCommand\("copy"\)/);
 assert.match(css,/\.libraryShareOverlay\{position:fixed/);
});

test("VMV Motion allows 60-second ASMR and music without speeding up 12 saved clips",()=>{
 const page=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 const sfx=read("app/api/video-generator/motion-sfx/route.ts");
 const asmrControl=page.split('Sonidos ASMR con IA</span>')[0].split('onChange={e=>{const enabled=e.target.checked;').pop()||"";
 assert.match(asmrControl,/setProjectNarration\(false\)/);
 assert.doesNotMatch(asmrControl,/setMontageSeconds\(30\)/);
 assert.match(asmrControl,/job\.montageSeconds=montageSeconds/);
 assert.match(page,/const durationSeconds=seconds\/groups/);
 assert.match(page,/seconds:montageSeconds/);
 assert.match(page,/video\.playbackRate=playbackSpeed/);
 assert.match(page,/music:musicFile,musicVolume:musicVolume\/100/);
 assert.match(page,/const effects=asmrEnabled\?await loadMotionSfx/);
 assert.match(page,/60 segundos · original/);
 assert.match(page,/Los efectos se sincronizan con las escenas/);
 assert.match(sfx,/!\[5,10\]\.includes\(duration\)/);
 assert.doesNotMatch(page,/if\(enabled\)\{job\.narrationEnabled=false;job\.montageSeconds=30;/);
});

test("Sharing from Publicar opens the same public VMV download as Biblioteca (not iCloud)",()=>{
 const route=read("app/api/video-generator/motion-library/route.ts");
 const share=read("lib/vmv-motion-share.ts");
 const publicPage=read("app/video-share/[token]/route.ts");
 const studio=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 assert.match(route,/createMotionShareToken\(saved\.path\)/);
 assert.match(route,/VERCEL_BRANCH_URL/);
 assert.match(share,/const secondsInWeek=7\*24\*60\*60/);
 assert.match(share,/createHmac\("sha256"/);
 assert.match(share,/timingSafeEqual\(actual,expected\)/);
 assert.match(share,/const allowedPath=new RegExp/);
 assert.match(share,/expiry<=nowSeconds/);
 assert.match(publicPage,/export async function GET/);
 assert.match(publicPage,/readMotionShareToken\(token\)/);
 assert.match(publicPage,/createSignedUrl\(share\.path,120,\{download:share\.filename\}\)/);
 assert.match(publicPage,/NextResponse\.redirect\(signed\.data\.signedUrl/);
 assert.match(publicPage,/Descargar video original/);
 assert.match(publicPage,/noindex, nofollow/);
 assert.doesNotMatch(publicPage,/authenticatedUser|\.download\(share\.path\)|MediaRecorder|ffmpeg/);
 assert.match(studio,/await shareLibraryVideo\(currentCloudId\(\)\)/);
 assert.match(studio,/Compartir enlace/);
 assert.doesNotMatch(studio,/await mobile\.share\(/);
});

test("VMV Motion aborts frozen frames instead of exporting audio over a stalled image",()=>{
 const studio=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 assert.match(studio,/lastMediaAdvance=clipStartedAt/);
 assert.match(studio,/getVideoPlaybackQuality\?\.\(\)\.totalVideoFrames/);
 assert.match(studio,/now-lastMediaAdvance>1200/);
 assert.match(studio,/now-lastFrameAdvance>1500/);
 assert.match(studio,/video\.currentTime\+0\.4<expectedMediaProgress/);
 assert.match(studio,/Se canceló la exportación para evitar un video congelado con audio/);
});

test("VMV Motion preserves previous cloud render and checks recording duration before publishing",()=>{
 const s=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 assert.match(s,/const revisionId=crypto\.randomUUID\(\)/);
 assert.match(s,/Math\.abs\(measured-montageSeconds\)>1\.5/);
 assert.match(s,/No se guardó el archivo defectuoso/);
 assert.match(s,/No se reemplazó ninguna versión anterior/);
 assert.match(s,/await motionLibrary\(accessToken,\{\s*action:"render-upload",id,extension,\.\.\.\(revisionId\?\{revisionId\}:\{\}\)/);
});

test("Wizard duration is preserved through Motion handoff, storyboard, saved clips, audio and library",()=>{
 const wizard=read("app/vista-app/vmv-pilot/page.tsx");
 const studio=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 const terra=read("app/api/video-generator/motion-terra/route.ts");
 const library=read("app/api/video-generator/motion-library/route.ts");
 const speech=read("app/api/video-generator/speech/continuous/route.ts");
 const sfx=read("app/api/video-generator/motion-sfx/route.ts");
 assert.match(wizard,/seconds:form\.seconds,subtitles:form\.subtitles/);
 assert.match(wizard,/Produce an original, coherent "\+form\.seconds\+"-second/);
 assert.doesNotMatch(wizard,/update\(\{qualityMode:"turbo",seconds:60\}\)/);
 assert.match(studio,/validMotionSeconds\(handoff\.seconds\)/);
 assert.match(studio,/handed\.seconds=handoff\.seconds/);
 assert.match(studio,/setMontageSeconds\(handoff\.seconds\)/);
 assert.match(studio,/const requiredScenes=sceneTotal\(plan,chosenSeconds\)/);
 assert.match(studio,/seconds:chosenSeconds/);
 assert.match(studio,/for\(let beat=0;beat<requiredScenes;beat\+\+\)/);
 assert.match(studio,/for\(let i=0;i<requiredScenes;i\+\+\)/);
 assert.match(studio,/const playbackSpeed=5\/segmentSeconds/);
 assert.match(studio,/video\.playbackRate=playbackSpeed/);
 assert.match(studio,/directorPlan\.scenes\.length/);
 assert.match(terra,/const allowedSeconds=\[15,30,60\]/);
 assert.match(terra,/sceneCount\(seconds\)/);
 assert.match(terra,/durationSeconds:seconds/);
 assert.match(library,/\[3,6,12\]\.includes\(x\.plan\.scenes\.length\)/);
 assert.match(speech,/\[3,6,12\]\.includes\(segments\.length\)/);
 assert.match(sfx,/\[1,2\]\.includes\(scenes\.length\)/);
});

test("Direct-story duration respects explicit 30 seconds and can be selected before generation",()=>{
 const page=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 assert.match(page,/function durationFromPrompt\(prompt:string\)/);
 assert.match(page,/const manualDurationRef=useRef\(false\)/);
 assert.match(page,/const detected=durationFromPrompt\(customPrompt\)/);
 assert.match(page,/if\(detected&&detected!==montageSeconds\)setMontageSeconds\(detected\)/);
 assert.match(page,/\(\[15,30,60\] as const\)\.map\(seconds/);
 assert.match(page,/aria-pressed=\{montageSeconds===seconds\}/);
 assert.match(page,/const chosenSeconds=plan\?baseMotionSeconds\(plan\):montageSeconds/);
 assert.match(page,/saved\.seconds=chosenSeconds;saved\.montageSeconds=chosenSeconds/);
 assert.match(page,/manualDurationRef\.current=true/);
 assert.doesNotMatch(page,/El guion tiene fragmentos incompletos/);
});
test("The six user-written celery voice lines remain unchanged and in order",()=>{
 const {transpileModule,ModuleKind,ScriptTarget}=require("typescript");
 const Module=require("node:module");
 const source=read("lib/vmv-motion-script.ts");
 const compiled=transpileModule(source,{
  compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText;
 const file=new Module("lib/vmv-motion-script.ts",module);
 file._compile(compiled,"lib/vmv-motion-script.ts");
 const {extractTimedNarration}=file.exports;
 const timed=[
  "**0–5 s:** «¡Hola! Soy el apio. Sí, ese vegetal crujiente que muchos ignoran».",
  "**5–10 s:** «Si me comes, te aporto mucha agua para complementar tu hidratación».",
  "**10–15 s:** «También tengo fibra, que ayuda a mantener una digestión saludable».",
  "**15–20 s:** «Y aporto vitamina K, importante para la salud de tus huesos».",
  "**20–25 s:** «Puedes disfrutarme en ensaladas, sopas o con tu salsa favorita».",
  "**25–30 s:** «¡No me ignores en el refrigerador! ¿Ya sabías todo esto de mí?»."
 ].join("\n");
 const found=extractTimedNarration(timed,6);
 assert.equal(found?.length,6);
 assert.equal(found?.[0],"¡Hola! Soy el apio. Sí, ese vegetal crujiente que muchos ignoran");
 assert.equal(found?.[5],"¡No me ignores en el refrigerador! ¿Ya sabías todo esto de mí?");
 assert.equal(extractTimedNarration(timed.replace("**20–25 s:**","**15–20 s:**"),6),null);
 assert.equal(extractTimedNarration(timed,12),null);
 const api=read("app/api/video-generator/motion-terra/route.ts");
 assert.match(api,/const suppliedSpeech=extractTimedNarration\(prompt,requiredScenes\)/);
 assert.match(api,/const narration=suppliedSpeech\?/);
 assert.match(api,/const spoken=narration\.speech as string\[\]/);
});

test("Voice change inside VMV Motion can audition gender-labelled ElevenLabs male samples and OpenAI Onyx",()=>{
 const studio=read("app/vista-app/vmv-pilot/stickman-lab/page.tsx");
 const choices=read("app/vista-app/vmv-pilot/PilotVoiceStep.tsx");
 const api=read("app/api/video-generator/pilot-voices/route.ts");
 const speech=read("app/api/video-generator/speech/continuous/route.ts");
 const cfg=read("lib/vmv-pilot-voice-config.ts");
 assert.match(studio,/import PilotVoiceStep from "\.\.\/PilotVoiceStep"/);
 assert.match(studio,/<PilotVoiceStep language=\{language\}/);
 assert.match(studio,/chooseProjectVoice\(/);
 assert.match(studio,/setPilotVoiceId\(elevenId\)/);
 assert.match(studio,/job\.elevenVoiceId=elevenId\|\|pilotVoiceId/);
 assert.match(choices,/Masculinas \/ graves/);
 assert.match(choices,/Todas las voces/);
 assert.match(choices,/\["onyx","echo"\]\.includes\(v\.id\)/);
 assert.match(choices,/v\.previewUrl\?\.startsWith\("https:\/\/"\)/);
 assert.match(choices,/new Audio\(url\)/);
 assert.match(choices,/audio\.play\(\)/);
 assert.match(choices,/pilot-voice-preview/);
 assert.match(api,/gender:v\.labels\?\.gender/);
 assert.match(api,/previewUrl:/);
 assert.match(speech,/"onyx"/);
 assert.match(cfg,/id:"onyx"/);
});
