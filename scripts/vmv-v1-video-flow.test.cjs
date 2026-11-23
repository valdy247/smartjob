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

test("four approved style cards have original illustrations and a fullscreen example viewer",()=>{
 const posters=["stickman","cartoon2d","cartoon3d","clay"];
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

test("Video Studio accepts native phone embedding without redirecting out of it",()=>{
 assert.match(ui,/function VideoStudioV1\(\{embedded=false,onExit\}/);
 assert.match(ui,/if\(embedded\|\|window\.self!==window\.top/);
 assert.match(ui,/if\(embedded\)\{onExit\?\.\(\);return;\}/);
 assert.match(ui,/data-vmv-embedded=\{embedded\?"true":undefined\}/);
 assert.match(ui,/if\(embedded\|\|window\.self!==window\.top\)\{event\.preventDefault\(\);returnToVMV\(\);/);
 assert.match(css,/\.page\[data-vmv-embedded="true"\]\{min-height:100%;width:100%/);
 const parsed=ts.createSourceFile("page.tsx",ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.deepEqual(parsed.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText," ")),[]);
});

test("own idea has short prompt and AI produces editable scenes without null dereference",()=>{
 assert.match(ui,/stage==="idea"/);
 assert.match(ui,/maxLength=\{3000\}/);
 assert.match(ui,/Crear mi guion con IA/);
 assert.match(ui,/api\("plan","POST",\{\.\.\.shared,mode:"outline"\}\)/);
 assert.match(ui,/mode:"scenes",outline:plan,start:b\.start,batchSize:b\.size/);
 assert.match(ui,/Array\.isArray\(chunk\?\.scenes\)/);
 assert.match(ui,/Array\.isArray\(first\.outline\.beats\)/);
 assert.match(ui,/setDraftPhase\("Escribiendo escenas y movimientos…"\)/);
 assert.match(ui,/editNarration\(e\.target\.value\)/);
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

test("failed AI cannot masquerade as completed scenes; manual writing is opt-in",()=>{
 assert.match(ui,/const makeEditableDraft=\(\)=>/);
 assert.match(ui,/speech:"",imagePrompt:"",caption:""/);
 assert.match(ui,/Escribir guion manualmente/);
 assert.match(ui,/setManualDraft\(true\)/);
 assert.match(ui,/setError\(errorMessages\[code\]\?code:"studio_plan_provider_unavailable"\)/);
 assert.match(ui,/setScenes\(\[\]\);setNarrationDraft\(""\);setManualDraft\(false\)/);
 assert.doesNotMatch(ui,/else makeEditableDraft\(\)/);
 assert.match(ui,/Reintentar IA/);
 assert.match(ui,/window\.confirm\("Regenerar con IA reemplazará/);
 assert.match(ui,/scene\.speech/);
});

test("structured video script generation retries malformed output without inventing facts",()=>{
 const model=read("lib/vmv-ai-agents/model.ts");
 assert.match(model,/jsonMode\?:boolean/);
 assert.match(model,/response_format:\{type:"json_object"\}/);
 assert.match(plan,/async function askStructured<T>/);
 assert.match(plan,/jsonMode:true/);
 assert.match(plan,/for\(let attempt=0;attempt<2;attempt\+\+\)/);
 assert.match(plan,/readOutline\(value,count\)/);
 assert.match(plan,/readScenes\(value,batchSize\)/);
 assert.match(plan,/vmv-video-studio\/plan/);
 assert.match(plan,/invalid_output/);
 assert.doesNotMatch(plan,/console\.warn\([^;]*topic/);
});

test("short trending topic generates three actual scripts with strict schema in one request",async()=>{
 const vm=require("node:vm");
 const source=read("app/api/video-studio/plan/route.ts");
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const resultModule={exports:{}};
 const topic="O Parasita que ROUBA a Língua dos Peixes!";
 const outline={
  title:"El extraño parásito de los peces",logline:"Descubrimos cómo vive el parásito en la boca del pez.",
  hook:"Un pez abre la boca y revela un organismo inesperado.",
  ending:"Una última vista del pez muestra su adaptación sorprendente.",
  characters:"Pez marino de colores suaves y pequeño isópodo parásito.",
  setting:"Mar submarino y un primer plano de la boca del pez.",
  beats:["El pez nada y abre su boca.","El parásito aparece y se adhiere al pez.","El animal sigue nadando con el parásito."]
 };
 const scenes=outline.beats.map((beat,i)=>({
  speech:["Un pez esconde una sorpresa impresionante dentro de su boca.",
   "Este pequeño parásito puede reemplazar parte de su lengua.",
   "La naturaleza tiene relaciones increíbles que todavía investigamos."][i],
  imagePrompt:"Detailed underwater educational animation with a consistent blue fish and tiny marine isopod. "+beat,
  caption:"Curiosidad marina"
 }));
 let calls=0;
 const mockRequire=id=>{
  if(id==="next/server")return {NextResponse:{json:(body,{status=200}={})=>({body,status})}};
  if(id==="@/lib/auth-server")return {authenticatedUser:async()=>"owner"};
  if(id==="@/lib/vmv-ai-agents/model")return {askAiAgent:async arg=>{
   calls++;
   assert.equal(arg.jsonSchema.name,"vmv_video_complete");
   assert.equal(arg.jsonSchema.schema.additionalProperties,false);
   assert.ok(arg.jsonSchema.schema.required.includes("scenes"));
   return JSON.stringify({...outline,scenes});
  }};
  if(id==="@/lib/vmv-pilot-voice-config")return {validPilotLanguage:x=>x==="es",pilotLanguageName:()=>"Spanish"};
  if(id==="@/lib/vmv-studio-countries")return {isVideoStudioCountry:x=>typeof x==="string"&&/^[A-Z]{2}$/.test(x)};
  throw Error("Unexpected dependency: "+id);
 };
 const context={exports:resultModule.exports,module:resultModule,require:mockRequire,process:{env:{VERCEL_ENV:"preview"}},console:{warn:()=>{}}};
 vm.runInNewContext(output,context,{timeout:5000});
 const request={headers:{get:()=>null},json:async()=>({
  mode:"complete",topic,idea:topic,audience:"Todos",style:"cartoon3d",language:"es",seconds:15,
  confirmPlanCost:true,source:{title:topic,platform:"YouTube"}
 })};
 const result=await resultModule.exports.POST(request);
 assert.equal(result.status,200);
 assert.equal(result.body.scenes.length,3);
 assert.equal(result.body.outline.beats.length,3);
 assert.equal(result.body.scenes.map(s=>s.speech).join(" "),scenes.map(s=>s.speech).join(" "));
 assert.equal(calls,1,"one real model call for a 15s script");
});

test("short script failure rejects bad AI output instead of inventing scenes",async()=>{
 const vm=require("node:vm");
 const source=read("app/api/video-studio/plan/route.ts");
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 let calls=0;
 const mockRequire=id=>{
  if(id==="next/server")return {NextResponse:{json:(body,{status=200}={})=>({body,status})}};
  if(id==="@/lib/auth-server")return {authenticatedUser:async()=>"owner"};
  if(id==="@/lib/vmv-ai-agents/model")return {askAiAgent:async()=>{calls++;return "{}";}};
  if(id==="@/lib/vmv-pilot-voice-config")return {validPilotLanguage:x=>x==="es",pilotLanguageName:()=>"Spanish"};
  if(id==="@/lib/vmv-studio-countries")return {isVideoStudioCountry:x=>typeof x==="string"&&/^[A-Z]{2}$/.test(x)};
  throw Error("Unexpected dependency: "+id);
 };
 vm.runInNewContext(code,{exports:mod.exports,module:mod,require:mockRequire,process:{env:{VERCEL_ENV:"preview"}},console:{warn:()=>{}}},{timeout:5000});
 const result=await mod.exports.POST({headers:{get:()=>null},json:async()=>({
  mode:"complete",topic:"Parasita peixe",idea:"Parasita peixe",audience:"Público general",
  style:"cartoon3d",language:"es",seconds:15,confirmPlanCost:true
 })});
 assert.equal(result.status,502);
 assert.equal(result.body.error,"studio_plan_incomplete");
 assert.equal(result.body.scenes,undefined);
 assert.equal(calls,2);
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
 assert.match(ui,/previewEndpoint="\/api\/video-studio\/voice-preview" activationEndpoint="\/api\/video-studio\/voice-activate" libraryMode sampleMode="limited"/);
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
