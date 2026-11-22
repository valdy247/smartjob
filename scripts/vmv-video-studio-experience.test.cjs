const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const studio=read("app/vista-app/video-generator/page.tsx");
const quick=read("app/vista-app/video-generator/quick/page.tsx");
const agent=read("app/vista-app/ai-agents/AutomaticVideoWizard.tsx");
const home=read("app/vista-app/page.tsx");
const agentHome=read("app/vista-app/ai-agents/page.tsx");
const library=read("lib/vmv-video-quick-library.ts");
const sql=read("supabase/sql/vmv_video_quick_library_20261121.sql");

test("all entry points keep Video Generator and offer four focused creation modes",()=>{
 assert.ok(home.includes('action:()=>window.location.assign("/vista-app/video-generator")'));
 assert.ok(studio.includes('onClick={()=>open("menu")}'));
 assert.ok(studio.includes('onClick={()=>open("library")}'));
 assert.ok(studio.includes('"text-image"'));
 assert.ok(studio.includes('"edit-image"'));
 assert.ok(studio.includes('"image-video"'));
 assert.ok(studio.includes('"text-video"'));
 assert.ok(agentHome.includes('href="/vista-app/video-generator/quick?visual=sticks"'));
 assert.ok(agent.includes('window.location.assign("/vista-app/video-generator/quick?visual=sticks")'));
});
test("Stickman style appears first and quick wizard only asks four questions",()=>{
 assert.ok(quick.includes('["Elige tu estilo","Choose your style"]'));
 assert.ok(quick.includes('["¿De qué trata el video?","What\'s your video about?"]'));
 assert.ok(quick.includes('["Ajustes del video","Video settings"]'));
 assert.ok(quick.includes('["Revisa tu creación","Review your creation"]'));
 assert.ok(quick.includes('visual==="sticks"'));
 assert.ok(quick.includes("<strong>Stickman 2D</strong>"));
 assert.ok(quick.includes("stepNumber}/6"));
 assert.ok(!quick.includes("stepNumber}/9"));
 assert.ok(!quick.includes("step<6"));
 assert.ok(quick.includes('href="/vista-app/video-generator"'));
});
test("back from scenes or exported video doesn't destroy already-generated work",()=>{
 assert.ok(quick.includes('if(stage==="ready"){setStage("story");setError("");return;}'));
 assert.ok(quick.includes('if(stage==="story"){setStage("setup");setStep(3);setError("");return;}'));
 const back=quick.slice(quick.indexOf("const goPrevious="),quick.indexOf("const goNext="));
 assert.ok(!back.includes("resetMedia()"));
 const plan=quick.slice(quick.indexOf("const plan=async"),quick.indexOf("const assets=async"));
 assert.ok(plan.indexOf("resetMedia()")>plan.indexOf('if(!Array.isArray(data.scenes)'),"do not delete media when storyboard fails");
});
test("quick draft is account-scoped and stores settings, not binary or credential data",()=>{
 assert.ok(quick.includes('vmv-video-draft-v1:'));
 assert.ok(quick.includes('setDraftRestored(true)'));
 assert.ok(quick.includes('if(!accountId||!draftRestored)return;'));
 assert.ok(quick.includes("JSON.stringify({kind,visual,seconds,ratio,narration,topic,step})"));
 const persisted=quick.match(/JSON\.stringify\(\{kind,visual,seconds,ratio,narration,topic,step\}\)/);
 assert.ok(persisted);
 assert.ok(!persisted[0].includes("imageUrl")&&!persisted[0].includes("access_token"));
});
test("account library safely uploads a finished video and signed playback only after explicit approval",()=>{
 assert.ok(quick.includes("saveQuickVideo(client"));
 assert.ok(quick.includes("Guardar en mi biblioteca"));
 assert.ok(quick.includes("Descargar video"));
 assert.ok(studio.includes("listQuickVideos(db)"));
 assert.ok(studio.includes("deleteQuickVideo(db,project)"));
 assert.ok(library.includes(".createSignedUrl(p.media_path,3600)"));
 assert.ok(library.includes("getUser()"));
 assert.ok(library.includes("is_anonymous"));
 assert.ok(library.includes("if(blob.size<1000||blob.size>25*1024*1024)"));
 assert.ok(library.includes("upsert:false"));
 assert.ok(library.includes("await db.storage.from(QUICK_VIDEO_BUCKET).remove([path])"));
 assert.ok(library.includes('quick_permission'));
});
test("private storage and DB deny cross-user access and impose upload limits",()=>{
 assert.match(sql,/alter table public\.vmv_video_quick_projects enable row level security/);
 assert.match(sql,/owner_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/values\('vmv-video-quick','vmv-video-quick',false/);
 assert.match(sql,/26214400/);
 assert.match(sql,/storage\.foldername\(name\)\)\[1\]=\(select auth\.uid\(\)\)::text/);
 assert.match(sql,/storage\.extension\(name\) in \('mp4','webm'\)/);
 assert.match(sql,/vmv_quick_library_limit_reached/);
 assert.ok(!sql.includes("to anon"));
});
test("Runway/Kling video jobs and video caption safety remain separate from Stickman storage",()=>{
 const api=read("app/api/video-generator/route.ts");
 assert.ok(api.includes('videoAllowed(owner)'));
 assert.ok(api.includes('confirmCost'));
 assert.ok(studio.includes("captureVideoFrame(current.output_url)"));
 assert.ok(studio.includes("captionModal"));
 assert.ok(quick.includes("download")&&quick.includes("saveToLibrary"));
 assert.ok(!library.includes("service_role"));
 assert.ok(!library.includes("SUPABASE_SERVICE_ROLE_KEY"));
});
test("updated TS and TSX source files remain parseable",()=>{
 const files=[
  "app/vista-app/video-generator/page.tsx",
  "app/vista-app/video-generator/CreativeGenerator.tsx",
  "app/vista-app/video-generator/quick/page.tsx",
  "app/vista-app/ai-agents/AutomaticVideoWizard.tsx",
  "app/vista-app/ai-agents/page.tsx",
  "app/vista-app/page.tsx",
  "lib/vmv-video-quick-library.ts"
 ];
 for(const p of files){
  const src=ts.createSourceFile(p,read(p),ts.ScriptTarget.Latest,true,
   p.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(src.parseDiagnostics.map(e=>ts.flattenDiagnosticMessageText(e.messageText," ")),[],p);
 }
});

test("minimal creator advances on style selection and preserves authorized generation",()=>{
 const flow=read("app/vista-app/video-generator/CreativeGenerator.tsx");
 const image=read("app/api/video-generator/image/route.ts");
 assert.match(flow,/chooseStyle\(item\.id\)/);
 assert.match(flow,/newStage\(mode==="edit-image"\?"upload"/);
 assert.match(flow,/VideoPromptAssistant value=\{prompt\}/);
 assert.match(flow,/checked=\{confirmed\}/);
 assert.match(flow,/confirmCost:true/);
 assert.match(image,/sourceBytes\?\{text:instructions/);
 assert.doesNotMatch(flow,/Continuar|Continue/);
});
