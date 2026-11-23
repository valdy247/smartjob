const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const ui=read("app/vista-app/video-studio/page.tsx");
const css=read("app/vista-app/video-studio/page.module.css");
const plan=read("app/api/video-studio/plan/route.ts");
const trends=read("app/api/video-studio/trends/route.ts");

test("five style cards have original illustrations and a fullscreen example viewer",()=>{
 const posters=["stickman","cartoon2d","cartoon3d","clay","storybook"];
 for(const id of posters){
  const p="public/video-studio/styles/"+id+".svg";
  const svg=read(p);
  assert.match(svg,/^<svg/);assert.match(svg,/<\/svg>$/);
  assert.match(ui,new RegExp("/video-studio/styles/"+id+"\\.svg"));
 }
 assert.match(ui,/video:null/);
 assert.match(ui,/styles\.exampleOverlay/);
 assert.match(ui,/role="dialog" aria-modal="true"/);
 assert.match(ui,/previewExample\.video\?<video/);
 assert.match(ui,/Ilustración de referencia · video animado próximamente/);
 assert.match(ui,/type="button" className=\{styles\.exampleButton\}/);
 assert.doesNotMatch(ui,/s\.emoji/);
 assert.match(css,/\.exampleOverlay\{position:fixed/);
 assert.match(css,/\.styleGraphic img/);
});

test("Video Studio home has only creation and history cards without the removed Creative Studio banner",()=>{
 assert.doesNotMatch(ui,/VMV CREATIVE STUDIO|Convierte tus ideas en/);
 assert.doesNotMatch(ui,/className=\{styles\.welcome\}/);
 assert.match(ui,/<strong>Crear video<\/strong>/);
 assert.match(ui,/<strong>Historial<\/strong>/);
});

test("Video Studio is safe inside the phone Preview and standalone links return to it",()=>{
 assert.match(ui,/window\.self!==window\.top/);
 assert.match(ui,/window\.location\.replace\("\/vista-app\?preview=video"\)/);
 assert.match(ui,/vmv-preview-navigate/);
 assert.match(ui,/window\.parent\.postMessage/);
 assert.match(ui,/returnToVMV\(\)/);
 assert.match(ui,/get\("standalone"\)==="1"/);
});

test("own idea has short prompt and AI produces editable scenes without null dereference",()=>{
 assert.match(ui,/stage==="idea"/);
 assert.match(ui,/maxLength=\{700\}/);
 assert.match(ui,/Crear mi guion con IA/);
 assert.match(ui,/api\("plan","POST",\{\.\.\.shared,mode:"outline"\}\)/);
 assert.match(ui,/mode:"scenes",outline:plan,start:b\.start,batchSize:b\.size/);
 assert.match(ui,/Array\.isArray\(chunk\?\.scenes\)/);
 assert.match(ui,/Array\.isArray\(first\.outline\.beats\)/);
 assert.match(ui,/setDraftPhase\("Escribiendo escenas y movimientos…"\)/);
 assert.match(ui,/patchScene\(i,"speech"/);
 assert.match(ui,/patchScene\(i,"imagePrompt"/);
 assert.match(ui,/stepsFor\(platform\)/);
 assert.match(ui,/platform==="idea"\?"idea":"trends"/);
});

test("V1 independently searches verified YouTube sources with owner-scoped persisted quota",()=>{
 assert.match(ui,/\/api\/video-studio\/trends\?q=/);
 assert.match(trends,/authenticatedUser\(req\)/);
 assert.doesNotMatch(trends,/videoAllowed\(/);
 assert.match(trends,/vmv_video_radar_claim/);
 assert.match(trends,/eq\("owner_id",owner\)/);
 assert.match(trends,/x-vmv-youtube-consent/);
 assert.match(trends,/www\.googleapis\.com\/youtube\/v3/);
 assert.match(trends,/sourceId:v\.id/);
 assert.match(trends,/slice\(0,3\)/);
 assert.match(ui,/Proponer idea/);
 assert.match(trends,/description:v\.description/);
 assert.match(ui,/styles\.trendTitle/);
 assert.match(ui,/styles\.trendDescription/);
 assert.match(ui,/styles\.trendBody/);
 assert.match(css,/\.trendCard\{display:grid;grid-template-columns:133px/);
 assert.match(css,/height:252px/);
 assert.match(ui,/Ver tendencia/);
 assert.match(ui,/Conexión pendiente/);
 assert.doesNotMatch(trends,/videoGenerate|startRunway|generateSpeech/);
});

test("own idea can continue with an editable draft when AI is temporarily unavailable",()=>{
 assert.match(ui,/makeEditableDraft=\(\)=>/);
 assert.match(ui,/setManualDraft\(true\)/);
 assert.match(ui,/Reintentar IA/);
 assert.match(ui,/setPlanNotice\(/);
 assert.match(ui,/platform==="idea"\?null:selectedTrend/);
 assert.match(ui,/errorMessages\[error\]\|\|"No se pudo completar la operación/);
});

test("creative plan only runs in Preview, requires signed-in owner and explicit request",()=>{
 assert.match(plan,/process\.env\.VERCEL_ENV!=="preview"/);
 assert.match(plan,/authenticatedUser\(req\)/);
 assert.match(plan,/confirmPlanCost!==true/);
 assert.match(plan,/maxDuration=60/);
 assert.match(plan,/askAiAgent\(/);
 assert.match(plan,/seconds<15\|\|seconds>180/);
 assert.match(plan,/batchSize>6/);
 assert.match(plan,/No text or subtitles inside frame images/);
 assert.match(plan,/avoid/i);
 assert.doesNotMatch(plan,/videoAllowed|VMV_VIDEO_ALLOWED_OWNER_ID/);
 assert.doesNotMatch(plan,/startRunway|generateSpeech|stripe/);
});

test("Video Studio lets owners listen to OpenAI previews with a daily quota and no wallet charge",()=>{
 const component=read("app/vista-app/vmv-pilot/PilotVoiceStep.tsx");
 const api=read("app/api/video-studio/voice-preview/route.ts");
 assert.match(ui,/previewEndpoint="\/api\/video-studio\/voice-preview" sampleMode="limited"/);
 assert.match(component,/sampleMode==="limited"&&v\.provider==="openai"/);
 assert.match(component,/fetch\(previewEndpoint,/);
 assert.match(component,/const hasPublicSample=/);
 assert.match(api,/process\.env\.VERCEL_ENV!=="preview"/);
 assert.match(api,/authenticatedUser\(req\)/);
 assert.match(api,/validPilotLanguage\(language\)/);
 assert.match(api,/provider!=="openai"/);
 assert.match(api,/validPilotVoice\(provider,voiceId\)/);
 assert.match(api,/vmv_pilot_voice_preview_claim/);
 assert.match(api,/if\(!granted\)return failure\("voice_preview_limit",429\)/);
 assert.match(api,/generateSpeech\(/);
 assert.match(api,/gateway\.speechModel\("openai\/tts-1"\)/);
 assert.doesNotMatch(api,/wallet|charge_credits|stripe/);
 assert.doesNotMatch(api,/videoAllowed/);
 for(const p of ["app/vista-app/vmv-pilot/PilotVoiceStep.tsx","app/api/video-studio/voice-preview/route.ts"]){
  const source=read(p),parsed=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true,p.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(parsed.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText," ")),[],p);
 }
});

test("new TS/TSX routes and client parse successfully",()=>{
 for(const p of ["app/vista-app/video-studio/page.tsx",
   "app/api/video-studio/plan/route.ts","app/api/video-studio/trends/route.ts"]){
  const src=ts.createSourceFile(p,read(p),ts.ScriptTarget.Latest,true,
   p.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(src.parseDiagnostics.map(x=>{const at=src.getLineAndCharacterOfPosition(x.start||0);return (at.line+1)+":"+(at.character+1)+" "+ts.flattenDiagnosticMessageText(x.messageText," ");}),[],p);
 }
});
