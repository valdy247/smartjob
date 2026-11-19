const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const wizard=read("app/vista-app/ai-agents/AutomaticVideoWizard.tsx");
const agents=read("app/vista-app/ai-agents/page.tsx");
const catalog=read("app/vista-app/page.tsx");
const studio=read("app/vista-app/video-generator/page.tsx");
const start=read("app/api/video-generator/route.ts");
const image=read("app/api/video-generator/image/route.ts");
const theme=read("app/vista-app/ai-agents/AgentServiceFlow.module.css");
const media=["app/vista-app/ai-agents/AutomaticVideoWizard.tsx","app/api/video-generator/image/route.ts"];
test("New video agent code parses as TypeScript and JSX",()=>{
 for(const file of media){
  const parsed=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,
   file.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(parsed.parseDiagnostics.map(e=>ts.flattenDiagnosticMessageText(e.messageText," ")),[],
   "TypeScript parse error in "+file);
 }
});
test("Video requests belong to the principal agent and verified business",()=>{
 assert.match(agents,/screen==="video"&&principal&&selectedBusiness&&selectedWorkspace/);
 assert.match(agents,/agent={principal}/);
 assert.match(wizard,/user\.id!==business\.owner_id/);
 assert.match(wizard,/user\.id!==agent\.owner_id/);
 assert.match(wizard,/agent\.business_id!==workspaceId/);
 assert.match(wizard,/vmv_marketing_businesses/);
 assert.match(wizard,/vmv_ai_catalog_items/);
 assert.match(wizard,/vmv_ai_booking_services/);
 assert.match(wizard,/\.eq\("approved",true\)\.eq\("active",true\)/);
 assert.match(wizard,/selected\.includes\(x\.id\)/);
});
test("The AI Agent is the only reachable new video creation entry",()=>{
 assert.match(agents,/setScreen\("video"\)/);
 assert.match(catalog,/id:"video-generator".*service=video/);
 assert.match(catalog,/disabled={item\.id==="instagram-connect"}/);
 assert.match(studio,/onClick=\{\(\)=>window\.location\.assign\("\/vista-app\/ai-agents\?service=video"\)\}/);
 assert.match(studio,/onClick=\{\(\)=>void preparePilot\(\)\}/);
 assert.match(studio,/\/vista-app\/ai-agents\?service=video&pilot=/);
 assert.match(studio,/setScreen\("library"\);void refreshJob\(id\)/);
});
test("Image generation is private and quota limited, approval is required before consuming video credits",()=>{
 assert.match(image,/videoAllowed\(owner\)/);
 assert.match(image,/vmv_marketing_businesses/);
 assert.match(image,/vmv_ai_businesses/);
 assert.match(image,/smartjob_web_ai_claim_video_test_slot/);
 assert.match(image,/generateImage\(/);
 assert.doesNotMatch(image,/startRunway\(|operation:"activate"|published_at/);
 assert.match(wizard,/Aprobar imagen/);
 assert.match(wizard,/Reintentar/);
 assert.match(wizard,/Descartar propuesta/);
 assert.match(wizard,/stage==="reference"\?Boolean\(filePreview\)&&!imageCandidate/);
 assert.match(wizard,/setFilePreview\(reference\)/);
 assert.match(wizard,/imageUrl:mode==="image"\?filePreview:""/);
});
test("Review cards allow inline pencil edits while preserving progress",()=>{
 assert.match(wizard,/const reviewCard=/);
 assert.match(wizard,/className={base\.edit}/);
 assert.match(wizard,/const edit=\(target:Stage\)/);
 assert.match(wizard,/setEditing\(true\);move\(target\)/);
 assert.match(wizard,/if\(editing\)\{setEditing\(false\);move\("review"\);return;\}/);
 assert.match(wizard,/Guardar y volver a Revisión/);
 assert.match(wizard,/reviewCard\("Guion"/);
 assert.match(wizard,/reviewCard\("Imagen"/);
});
test("Preview Runway only starts after independent human credit authorization",()=>{
 assert.match(start,/videoAllowed\(owner\)/);
 assert.match(start,/body\?\.confirmCost!==true/);
 assert.match(start,/vmv_video_reserve_pilot_job/);
 assert.match(wizard,/confirmCredits/);
 assert.match(wizard,/window\.confirm\("¿Autorizas generar este video/);
 assert.match(wizard,/confirmCost:true,clientKey/);
 assert.match(wizard,/\/api\/video-generator\/brief/);
 assert.match(wizard,/\/api\/video-generator",\{/);
 assert.match(wizard,/\/vista-app\/video-generator\?job=/);
 assert.doesNotMatch(wizard,/automaticPublish|publish\(|postToInstagram|activate\(/);
});
test("Video wizard uses consistent white-background soft color shifts and reduced-motion support",()=>{
 assert.match(wizard,/theme\.flow/);
 assert.match(wizard,/theme\.agentRobot/);
 assert.match(wizard,/theme\.agentHeading/);
 assert.match(wizard,/theme\.agentProgress/);
 assert.match(wizard,/theme\.agentButton/);
 assert.match(theme,/300s ease-in-out infinite/);
 assert.match(theme,/prefers-reduced-motion:reduce/);
 assert.match(theme,/#a32972/);
 assert.match(theme,/#7942b6/);
 assert.match(theme,/#315da5/);
 assert.match(theme,/#207a67/);
});

test("Visual image understanding, explicit conflict confirmation and social caption generation",()=>{
 const analysis=read("app/api/video-generator/analyze-image/route.ts");
 const brief=read("app/api/video-generator/brief/route.ts");
 const caption=read("app/api/video-generator/caption/route.ts");
 assert.match(analysis,/videoAllowed\(owner\)/);
 assert.match(analysis,/OPENAI_API_KEY/);
 assert.match(analysis,/UPLOADED IMAGE/);
 assert.match(analysis,/black panther/);
 assert.match(wizard,/inspectReference\(reference\)/);
 assert.match(wizard,/imageAnalysis\.subject/);
 assert.match(wizard,/creativeOverride/);
 assert.match(wizard,/visualGrounding:mode==="image"/);
 assert.match(brief,/IMAGE-TO-VIDEO/);
 assert.match(brief,/visualGrounding/);
 assert.match(caption,/videoAllowed\(owner\)/);
 assert.match(caption,/job\.status!=="SUCCEEDED"/);
 assert.match(caption,/platforms\[platform\]/);
 assert.match(studio,/Ver prompt de este video/);
 assert.match(studio,/Generar descripción/);
 assert.match(studio,/captionModal/);
});
test("Pilot-specific quota keeps normal owners unchanged and never opens unapproved publishing",()=>{
 const sql=read("supabase/sql/vmv_video_agent_test_quota_20261119.sql");
 assert.match(sql,/where public\.smartjob_web_ai_usage\.calls<50/);
 assert.match(sql,/if num>=1 then raise exception 'video_active_job_limit'/);
 assert.match(sql,/revoke all on function public\.vmv_video_reserve_pilot_job/);
 assert.match(sql,/to service_role/);
 assert.match(image,/videoAllowed\(owner\)/);
 assert.match(start,/confirmCost/);
});
