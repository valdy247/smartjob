const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const ai=read("app/vista-app/ai-agents/page.tsx");
const profile=read("app/vista-app/AccountBusinessAgent.tsx");
const account=read("app/vista-app/page.tsx");
const shared=read("app/vista-app/AgentSettingsEntry.tsx");

test("Identity and Activity do not render standalone AI Agent tiles",()=>{
 assert.ok(ai.includes('types.filter(type=>type.id!=="custom"&&type.id!=="operations").map'));
 assert.ok(!ai.includes('setScreen("editor")'));
 assert.ok(!ai.includes('setScreen("quality")'));
 assert.ok(!ai.includes("import AgentSetupWizard"));
 assert.ok(!ai.includes("import AgentQualityLab"));
});
test("existing AI Agents expose one Profile configuration entry",()=>{
 assert.ok(ai.includes('href={agentProfileUrl(principal||proposal||undefined)}'));
 assert.ok(ai.includes('import AgentSettingsEntry from "../AgentSettingsEntry"'));
 assert.ok(ai.includes('<AgentSettingsEntry'));
 assert.ok(!ai.includes('translate("agents.existing")'));
 assert.ok(!ai.includes('visibleAgents.map(a=>'));
 assert.ok(ai.includes('const edit=(agent:Agent,step:0|1|2|3=0)=>openAgentProfile(agent,"agent",step);'));
 assert.ok(ai.includes('const quality=(agent:Agent)=>openAgentProfile(agent,"quality");'));
 assert.ok(!ai.includes('translate("agents.editIdentity")'));
 assert.ok(!ai.includes('translate("agents.quality")'));
});
test("Profile is the one place to configure identity and inspect activity/quality",()=>{
 assert.ok(account.includes("<AccountBusinessAgent"));
 assert.ok(profile.includes('import AgentSettingsEntry from "./AgentSettingsEntry"'));
 assert.ok(profile.includes('<AgentSettingsEntry'));
 assert.ok(shared.includes('className={styles.card}'));
 assert.ok(shared.includes('className={styles.agentIcon}'));
 assert.ok(shared.includes('className={styles.copy}'));
 assert.ok(profile.includes('const AgentSetupWizard=dynamic(()=>import("./ai-agents/AgentSetupWizard"))'));
 assert.ok(profile.includes('const AgentQualityLab=dynamic(()=>import("./ai-agents/AgentQualityLab"))'));
 assert.ok(profile.includes('L("Configuración","Settings")'));
 assert.ok(profile.includes('L("Calidad y actividad","Quality & activity")'));
 assert.ok(profile.includes('role="tablist"'));
 assert.ok(profile.includes('initialStep={agentStep}'));
 assert.ok(profile.includes('onEdit={step=>{setAgentStep(step);setAgentView("configure");}}'));
});
test("deep links preserve selected business and section, without altering an agent's identity",()=>{
 assert.ok(ai.includes('params.set("business",businessId)'));
 assert.ok(ai.includes('params.set("step",String(step))'));
 assert.ok(profile.includes('setup!=="agent"&&setup!=="quality"'));
 assert.ok(profile.includes('requested&&!businesses.some(b=>b.id===requested)'));
 assert.ok(profile.includes('query.get("step")'));
 assert.ok(profile.includes('openAgent(step,setup==="quality"?"quality":"configure")'));
 assert.ok(profile.includes("centralPrefill(business,principal?"));
 assert.ok(profile.includes("storeAgent({...value,setup:{...value.setup,central_source_updated_at:business.updated_at}}"));
});
test("affected VMV components remain valid TypeScript/TSX",()=>{
 for(const file of ["app/vista-app/ai-agents/page.tsx","app/vista-app/AccountBusinessAgent.tsx","app/vista-app/AgentSettingsEntry.tsx"]){
  const source=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(source.parseDiagnostics.map(e=>String(e.messageText)),[],file);
 }
});
