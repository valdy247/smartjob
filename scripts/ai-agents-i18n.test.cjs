const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
const page=fs.readFileSync("app/vista-app/ai-agents/page.tsx","utf8");
const provider=fs.readFileSync("lib/i18n-web.tsx","utf8");
const catalog=JSON.parse(fs.readFileSync("lib/i18n/messages.json","utf8"));
test("AI Agents uses the identical VMV account-language provider as Home",()=>{
 assert.match(page,/useInterfaceLanguage\(\)/);
 assert.match(page,/import \{useInterfaceLanguage\} from "@\/lib\/i18n-web"/);
 assert.match(page,/<InterfaceLanguagePicker compact\/>/);
 assert.match(provider,/path\?\.startsWith\("\/web\/"\)/);
 assert.ok(!page.includes("localStorage.setItem(\"vmv_ui_language\""));
});
test("AI Agents home has no hardcoded Spanish in user-facing JSX",()=>{
 const home=page.slice(page.indexOf('screen==="home"?<>'),page.indexOf('{businessDialog?<'));
 assert.ok(home.length>1500);
 for(const literal of ["UN AGENTE POR NEGOCIO","Todas tus funciones.","Capacidades de tu agente","Aquí vivirán tus agentes","Explorar ejemplo de taxi","Hacer principal","Activar en estudio"]){
  assert.ok(!home.includes(literal),literal+" cannot bypass locale");
 }
 for(const key of ["agents.onePerBusiness","agents.oneAgent","agents.allFunctions","agents.capabilities",
 "agents.yourAgent","agents.disclaimer","agents.makePrincipal","agents.status.needsAttention"]){
  assert.ok(home.includes('translate("'+key+'")'),key+" is required on home");
  for(const lang of ["es","en"])assert.ok(catalog[lang][key],lang+" missing "+key);
 }
});
test("all AI Agents UI catalog keys have Spanish and English entries",()=>{
 const keys=[...new Set([...page.matchAll(/translate\("(agents\.[\w.]+)"/g)].map(m=>m[1]))];
 for(const key of keys){
  assert.equal(typeof catalog.es[key],"string",key+": es");
  assert.equal(typeof catalog.en[key],"string",key+": en");
 }
 for(const kind of ["calls","support","sales","bookings","inventory","operations","custom"])
  for(const prefix of ["capability","capabilityDetail","type"]){
   const key="agents."+prefix+"."+kind;
   assert.ok(catalog.es[key]&&catalog.en[key],key);
  }
});
test("locale switching does not remount or rewrite saved agent content",()=>{
 assert.ok(!page.includes("key={language}"));
 assert.ok(!page.includes("setAgents([])"));
 const profile=fs.readFileSync("app/vista-app/AccountBusinessAgent.tsx","utf8");
 assert.ok(profile.includes("centralPrefill(business,principal?"));
 assert.ok(profile.includes('storeAgent({...value,setup:{...value.setup,central_source_updated_at:business.updated_at}}'));
 assert.ok(page.includes('openAgentProfile(agent,"agent",step)'));
 assert.ok(page.includes('useEffect(()=>{setNotice("");},[language])'));
});
test("AI Agents route parses as valid TSX",()=>{
 const source=ts.createSourceFile("ai-agents/page.tsx",page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.deepEqual(source.parseDiagnostics.map(x=>String(x.messageText)),[]);
});

test("AI Agents wizard uses VMV language for questions, controls and accessibility",()=>{
 const wizard=fs.readFileSync("app/vista-app/ai-agents/AgentSetupWizard.tsx","utf8");
 const connections=fs.readFileSync("app/vista-app/ai-agents/AgentConnections.tsx","utf8");
 const voiceSample=fs.readFileSync("app/vista-app/ai-agents/VoiceSample.tsx","utf8");
 for(const source of [wizard,connections,voiceSample])assert.match(source,/useInterfaceLanguage/);
 const ids=[...new Set([...wizard.matchAll(/\b[qat]\("([a-z_]+)"/g)].map(m=>m[1])),"state","hours"];
 for(const id of ids){
  const key="agents.wizard.q."+id;
  assert.ok(catalog.es[key]&&catalog.en[key],"Bilingual question missing "+key);
 }
 for(const key of ["agents.wizard.configure","agents.wizard.agentName","agents.wizard.mission",
  "agents.wizard.phoneVoice","agents.wizard.allowedTasks","agents.wizard.saveDraft","agents.wizard.saveAgent"]){
  assert.ok(wizard.includes('"'+key+'"'),"Wizard control not localized: "+key);
 }
 assert.match(wizard,/\{choiceLabel\(opt\)\}/);
 assert.match(wizard,/onClick=\{\(\)=>answer\(question.id,opt\)\}/);
 assert.match(wizard,/onChange=\{next=>answer\("language_rule",next\)\}/);
 assert.match(wizard,/onChange=\{next=>answer\("voice_preset",next\)\}/);
 assert.ok(!wizard.includes("key={language}"),"Locale may not remount a draft");
 assert.ok(connections.includes("agents.connections.allowInventory"));
 assert.ok(voiceSample.includes("agents.voiceSample.listenNamed"));
});
test("AI Agents known source option values retain ids while translating displayed labels",()=>{
 const wizard=fs.readFileSync("app/vista-app/ai-agents/AgentSetupWizard.tsx","utf8");
 for(const value of ["Sí","No","Español","English","Bilingüe","Teléfono y chat",
  "Amable y profesional","Varios conductores","Reconocerlo y derivar a un humano"]){
  const key="agents.wizard.option."+value;
  assert.ok(catalog.es[key]&&catalog.en[key],key);
 }
 assert.ok(wizard.includes('value={optionValue}'),'Original option value must remain unchanged');
 assert.ok(wizard.includes('onChange={e=>onChange(e.target.value)}'),'Selection must store original value');
});
