const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const studio=read("app/vista-app/marketing/ads/AdsStudio.tsx");
const intake=read("app/vista-app/ai-agents/AutomaticAdWizard.tsx");
test("Agent finish navigates to Marketing; Marketing receives direct review",()=>{
 assert.match(intake,/saveAgentAdBrief\(brief\)/);
 assert.match(intake,/marketing\/ads\/create\?from=ai-agents/);
 assert.match(studio,/query\.get\("from"\)!=="ai-agents"/);
 assert.match(studio,/consumeAgentAdBrief\(user\.id,id\)/);
 assert.match(studio,/setStep\(4\); \/\/ Review first/);
});
test("Review handoff re-verifies ownership and cannot skip Meta account and location",()=>{
 assert.match(studio,/vmv_marketing_businesses/);
 assert.match(studio,/vmv_ai_businesses/);
 assert.match(studio,/vmv_ai_agents/);
 assert.match(studio,/candidate\.workspaceId/);
 assert.match(studio,/candidate\.agentId/);
 assert.match(studio,/!hasAccount\|\|!form\.pageId/);
 assert.match(studio,/!form\.cityKey/);
 assert.match(studio,/Guardar campaña para aprobación/);
});
test("AI copy is generated once in Marketing, not ad spending",()=>{
 assert.match(studio,/setBusy\("agent-generate"\)/);
 assert.match(studio,/api\("\/api\/marketing\/ads\/generate","POST"/);
 assert.match(studio,/angle:"offer"/);
 assert.match(studio,/setSelectedAngle\("offer"\)/);
 assert.match(studio,/onClick=\{\(\)=>goStep\(4\)\}/);
 assert.match(studio,/operation:"create_paused"/);
 assert.match(studio,/confirmPaused:true/);
});
