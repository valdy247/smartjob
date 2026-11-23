const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const api=read("app/api/video-generator/prompt-helper/route.ts");
const helper=read("components/VideoPromptAssistant.tsx");
const quick=read("app/vista-app/video-generator/quick/page.tsx");
const agent=read("app/vista-app/ai-agents/AutomaticVideoWizard.tsx");
const studio=read("app/vista-app/video-generator/page.tsx");
const autopilot=read("app/vista-app/video-generator/AutopilotWizard.tsx");
test("The prompt helper and all connected TSX files parse",()=>{
 for(const file of [
  "app/api/video-generator/prompt-helper/route.ts",
  "components/VideoPromptAssistant.tsx",
  "app/vista-app/video-generator/quick/page.tsx",
  "app/vista-app/ai-agents/AutomaticVideoWizard.tsx",
  "app/vista-app/video-generator/page.tsx",
  "app/vista-app/video-generator/AutopilotWizard.tsx"
 ]){
  const parsed=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,
   file.endsWith("tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(parsed.parseDiagnostics.map(e=>ts.flattenDiagnosticMessageText(e.messageText," ")),[],file);
 }
});
test("AI service is owner-scoped, rate-limited, bounded and cannot call video generation",()=>{
 assert.ok(api.includes("authenticatedUser(req)"));
 assert.ok(api.includes("videoAllowed(owner)"));
 assert.ok(api.includes('if(length>18000)'));
 assert.ok(api.includes("previous.count>=16"));
 assert.ok(api.includes("limits[type]"));
 assert.ok(api.includes("askAiAgent"));
 assert.ok(api.includes("videoHeaders"));
 assert.ok(!api.includes("startRunway"));
 assert.ok(!api.includes("confirmCost:true"));
});
test("AI accepts distinct prompt types with field-specific maximum lengths",()=>{
 for(const entry of ["topic:220","video:1000","image:12000","scene_image:900","narration:240","overlay:60","social:500","niche:160"])
  assert.ok(api.includes(entry),entry);
 assert.ok(api.includes("Preserve")||api.includes("preserve"));
 assert.ok(api.includes("Do NOT write a full screenplay"));
});
test("Assistant never silently overwrites the original prompt",()=>{
 assert.ok(helper.includes('role="dialog"'));
 assert.ok(helper.includes("Conservar original"));
 assert.ok(helper.includes("Usar esta versión"));
 assert.ok(helper.includes("onApply(next)"));
 assert.ok(helper.includes("value!==original"));
 assert.ok(helper.includes("setSuggestion(body.suggestion)"));
 assert.ok(helper.includes("getSupabase()"));
 assert.ok(helper.includes("session.access_token"));
 assert.ok(helper.includes('"/api/video-generator/prompt-helper"'));
 assert.ok(!helper.includes("onApply(body.suggestion)"));
});
test("Quick wizard has a prompt assistant for idea, narration, subtitles and image scenes",()=>{
 for(const kind of ['kind="topic"','kind="narration"','kind="overlay"','kind="scene_image"'])
  assert.ok(quick.includes(kind),kind);
 assert.ok(quick.includes('setApproved(false)'));
 assert.ok(quick.includes('if(key==="imagePrompt")'));
 assert.ok(quick.includes("URL.revokeObjectURL(oldImage)"));
 assert.ok(quick.includes('updateScene(i,"imagePrompt",value)'));
});
test("Video AI Agent, Studio and Autopilot all use the same approved rewrite flow",()=>{
 for(const component of [agent,studio,autopilot])
  assert.ok(component.includes('VideoPromptAssistant'),"Missing shared helper");
 assert.ok(agent.includes('kind={standalone?"image":"video"}'));
 assert.ok(agent.includes('kind="image"'));
 assert.ok(studio.includes('kind="video"'));
 assert.ok(studio.includes('kind="social"'));
 assert.ok(autopilot.includes('kind="niche"'));
});
