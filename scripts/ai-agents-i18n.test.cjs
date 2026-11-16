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
 assert.ok(page.includes('setDraft(current=>centralPrefill(saved,current))'));
 assert.ok(page.includes("setAgents(old=>[saved,...old.filter(a=>a.id!==saved.id)])"));
 assert.ok(page.includes('useEffect(()=>{setNotice("");},[language])'));
});
test("AI Agents route parses as valid TSX",()=>{
 const source=ts.createSourceFile("ai-agents/page.tsx",page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.deepEqual(source.parseDiagnostics.map(x=>String(x.messageText)),[]);
});
