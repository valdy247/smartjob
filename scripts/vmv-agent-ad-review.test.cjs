const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const studio=read("app/vista-app/marketing/ads/AdsStudio.tsx");
const intake=read("app/vista-app/ai-agents/AutomaticAdWizard.tsx");
test("Agent submits a reviewable draft directly, while legacy handoffs are still owner verified",()=>{
 assert.match(intake,/operation:"draft",clientKey:sendKey/);
 assert.match(intake,/\/vista-app\/marketing\/ads\/campaigns/);
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
test("AI copy and Meta image are prepared in Agent before Marketing review, without ad spending",()=>{
 assert.match(intake,/generateCopy=async/);
 assert.match(intake,/uploadImage=async/);
 assert.match(studio,/candidate\.imageHash/);
 assert.match(studio,/candidate\.headline/);
 assert.match(studio,/candidate\.message/);
 assert.match(studio,/setSelectedAngle\("offer"\)/);
 assert.match(studio,/onClick=\{\(\)=>goStep\(4\)\}/);
 assert.match(studio,/operation:"create_paused"/);
 assert.match(studio,/confirmPaused:true/);
});

test("Only AI Agent can initiate new campaign, all requirements completed before review",()=>{
 const hub=read("app/vista-app/marketing/ads/page.tsx");
 const create=read("app/vista-app/marketing/ads/create/page.tsx");
 assert.match(hub,/href="\/vista-app\/ai-agents"/);
 assert.match(create,/window\.location\.replace\("\/vista-app\/ai-agents"\)/);
 assert.match(studio,/mode==="wizard"&&!agentBrief/);
 assert.match(intake,/meta\/accounts/);
 assert.match(intake,/meta\/locations/);
 assert.match(intake,/meta\/image/);
 assert.match(intake,/api\/marketing\/ads\/generate/);
 assert.match(intake,/if\(!returnToReview&&step==="image"&&!headline\.trim\(\)&&!message\.trim\(\)\)void generateCopy\(\)/);
 assert.match(intake,/step==="image"\?Boolean\(imageHash\)/);
 assert.match(intake,/step==="location"\?locationVerified/);
 assert.match(intake,/answer\.productIds\.includes\(p\.id\)/);
 assert.match(intake,/cityKey,cityName:cityMetaName/);
 assert.match(studio,/setImageHash\(candidate\.imageHash\|\|""\)/);
 assert.match(intake,/setStep\(returnToReview\?"review":"image"\)/);
 assert.match(intake,/stateName\(answer\.region\)/);
 assert.match(intake,/specialCategoriesAcknowledged:true/);
});
