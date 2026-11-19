const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const wizard=read("app/vista-app/ai-agents/AutomaticAdWizard.tsx");
const parent=read("app/vista-app/ai-agents/page.tsx");
const bridge=read("lib/vmv-ai-agents/ad-handoff.ts");
test("Agent ad flow uses existing principal and selected central business",()=>{
 assert.match(parent,/if\(principal&&selectedBusiness&&selectedWorkspace\)/);
 assert.match(parent,/agent={principal}/);
 assert.match(wizard,/agent\.business_id!==workspaceId/);
 assert.match(wizard,/user\.id!==business\.owner_id/);
});
test("Only authorized, active, approved inventory is offered",()=>{
 assert.match(wizard,/vmv_ai_catalog_items/);
 assert.match(wizard,/\.eq\("owner_id",user\.id\)/);
 assert.match(wizard,/\.eq\("business_id",workspaceId\)/);
 assert.match(wizard,/\.eq\("approved",true\)\.eq\("active",true\)/);
 assert.match(wizard,/vmv_ai_booking_services/);
 assert.match(wizard,/productIds:string\[\]/);
 assert.match(wizard,/answer\.productIds\.includes\(p\.id\)/);
});
test("Marketing receives a scoped short-lived creative brief, never an ad launch",()=>{
 assert.match(bridge,/sessionStorage\.setItem/);
 assert.match(bridge,/ownerId!==ownerId\|\|x\.businessId!==businessId/);
 assert.match(bridge,/30\*60\*1000/);
 assert.match(bridge,/sessionStorage\.removeItem/);
 assert.match(wizard,/saveAgentAdBrief\(brief\)/);
 assert.match(wizard,/\/vista-app\/marketing\/ads\/create\?from=ai-agents/);
 assert.doesNotMatch(wizard,/create_paused|confirmSpend|PUBLICAR|ads_management/);
});
test("The agent does not claim to generate or publish Meta ads itself",()=>{
 assert.match(wizard,/La aprobación, imagen, presupuesto y publicación se gestionan en Marketing/);
 assert.match(wizard,/meta\/image/);
 assert.match(wizard,/meta\/locations/);
 assert.match(wizard,/meta\/accounts/);
 assert.match(wizard,/api\/marketing\/ads\/generate/);
 assert.match(wizard,/Continuar/);
 assert.match(wizard,/Generar anuncio/);
});

test("Multiple ad goals can be toggled without automatic navigation",()=>{
 assert.match(wizard,/goals:Goal\[\]/);
 assert.match(wizard,/toggleGoal=\(goal:Goal\)/);
 assert.match(wizard,/current\.goals\.filter\(item=>item!==goal\)/);
 assert.match(wizard,/answer\.goals\.includes\(id\)/);
 assert.match(wizard,/aria-pressed={answer\.goals\.includes\(id\)}/);
 assert.match(wizard,/step==="goal"\?answer\.goals\.length>0/);
 assert.doesNotMatch(wizard,/update\("goal",id\);next\(\)/);
 assert.match(wizard,/goals:answer\.goals/);
 assert.match(bridge,/goals\?:Array<"visits"\|"messages"\|"sales">/);
});
test("Website decision can return to saved site after opting for another option",()=>{
 assert.match(wizard,/siteChoice==="saved"/);
 assert.match(wizard,/setSiteChoice\(hasSite\?"saved":"custom"\)/);
 assert.match(wizard,/setSiteChoice\("custom"\)/);
 assert.match(wizard,/setSiteChoice\("none"\)/);
 assert.match(wizard,/siteChoice==="saved"\?savedWebsite/);
 assert.match(wizard,/value={customWebsite}/);
 assert.doesNotMatch(wizard,/update\("website",""\)/);
});
