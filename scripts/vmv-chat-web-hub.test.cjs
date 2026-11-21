const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const root=path.join(__dirname,"..");
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const paths=[
 "app/vista-app/ai-agents/ChatWebHub.tsx",
 "app/vista-app/ai-agents/page.tsx",
 "app/vista-app/ai-agents/AgentLiveTest.tsx",
 "app/api/vmv/ai-agents/simulate/route.ts"
];
const source=Object.fromEntries(paths.map(p=>[p,read(p)]));
test("Chat web hub and server flow parse as TypeScript/JSX",()=>{
 for(const p of paths){
  const ast=ts.createSourceFile(p,source[p],ts.ScriptTarget.Latest,true,
   p.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(ast.parseDiagnostics.map(e=>ts.flattenDiagnosticMessageText(e.messageText," ")),[],p);
 }
});
test("Chat web remains a single agent capability with four real sections",()=>{
 const hub=source["app/vista-app/ai-agents/ChatWebHub.tsx"];
 const page=source["app/vista-app/ai-agents/page.tsx"];
 assert.match(page,/kind==="support"\)\{\s*setSelected\(agent\.id\);setScreen\("chatWeb"\)/);
 assert.match(page,/ChatWebHub/);
 assert.match(hub,/Chat web/);
 for(const text of ["title:\"Webs\"","title:\"Probar agente\"","title:\"Conversaciones\"","title:\"Ajustes\""]){
  assert.ok(hub.includes(text),text);
 }
 assert.match(hub,/smartjob_web_publications/);
 assert.match(hub,/vmv_web_chat_site_links/);
 assert.match(hub,/\.delete\(\)\.eq\("owner_id",owner\)/);
 assert.match(hub,/vmv_ai_conversations/);
 assert.match(hub,/smartjob_web_inquiries/);
 assert.match(hub,/vmv_ai_messages/);
 assert.match(hub,/setAgentCatalogReadAccess/);
 assert.match(hub,/vmv_web_chat_settings/);
 assert.match(hub,/public_chat_enabled:false/);
});
test("Settings can only select approved and available products, not live checkout",()=>{
 const hub=source["app/vista-app/ai-agents/ChatWebHub.tsx"];
 const sim=source["app/api/vmv/ai-agents/simulate/route.ts"];
 const live=source["app/vista-app/ai-agents/AgentLiveTest.tsx"];
 const ddl=read("supabase/sql/vmv_web_chat_control_center_20261120.sql");
 for(const setting of ["warmth","formality","reply_style","languages","sales_enabled",
  "sales_item_ids","lead_capture","human_handoff"]){
  assert.ok(hub.includes(setting),setting);
  assert.ok(ddl.includes(setting),setting);
 }
 assert.match(hub,/c\.approved&&c\.active/);
 assert.match(hub,/c\.stock_mode==="unlimited"/);
 assert.match(ddl,/web_chat_sales_require_approved_available_catalog/);
 assert.match(ddl,/cardinality\(NEW\.sales_item_ids\)=0/);
 assert.match(ddl,/vmv_ai_catalog_items c/);
 assert.match(sim,/webPreview=body\.webPreview===true/);
 assert.match(sim,/selectedProducts/);
 assert.match(sim,/displayCatalog/);
 assert.match(sim,/Nunca puedes modificar existencias/);
 assert.match(live,/webPreview:webMode/);
 assert.doesNotMatch(sim,/checkoutSession|createPaymentIntent/);
});
test("Owner and business isolation, no fake public chat activation",()=>{
 const ddl=read("supabase/sql/vmv_web_chat_control_center_20261120.sql");
 const hub=source["app/vista-app/ai-agents/ChatWebHub.tsx"];
 const css=read("app/vista-app/ai-agents/ChatWebHub.module.css");
 assert.match(ddl,/ENABLE ROW LEVEL SECURITY/g);
 assert.match(ddl,/owner_id=\(SELECT auth\.uid\(\)\)/);
 assert.match(ddl,/public_chat_enabled=false/);
 assert.match(ddl,/web_chat_site_business_mismatch/);
 assert.match(ddl,/NEW\.owner_id/);
 assert.match(hub,/Chat público sin activar/);
 assert.match(hub,/Las consultas web existentes siguen llegando a la bandeja/);
 assert.match(css,/@media\(max-width:420px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
