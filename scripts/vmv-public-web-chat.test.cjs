const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const root=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const files=[
 "app/api/vmv/public-chat/route.ts",
 "app/web-studio/WebChatLauncher.tsx",
 "app/vista-app/ai-agents/ChatWebHub.tsx",
 "app/sites/[slug]/page.tsx",
 "app/web/[slug]/[[...page]]/page.tsx",
 "app/web-chat-privacy/page.tsx",
 "proxy.ts"
];
const source=Object.fromEntries(files.map(f=>[f,read(f)]));
test("Public chat and website integration parse cleanly as TS/TSX",()=>{
 for(const file of files){
  const ast=ts.createSourceFile(file,source[file],ts.ScriptTarget.Latest,true,
   file.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText," ")),[],file);
 }
});
test("Public API never trusts a browser-supplied agent, owner, session ID or price",()=>{
 const api=source["app/api/vmv/public-chat/route.ts"];
 assert.match(api,/publicOrigin\(req\)/);
 assert.match(api,/req\.headers\.get\("origin"\)/);
 assert.match(api,/billingAdmin\(\)/);
 assert.match(api,/vmv_web_chat_site_links/);
 assert.match(api,/public_chat_enabled",true/);
 assert.match(api,/status","active"/);
 assert.match(api,/workspace\.primary_agent_id!==agent\.id/);
 assert.match(api,/createHmac\("sha256"/);
 assert.match(api,/timingSafeEqual/);
 assert.match(api,/httpOnly:true/);
 assert.match(api,/vmv_web_public_chat_claim/);
 assert.match(api,/vmv_web_public_chat_finish/);
 assert.match(api,/aiAgentModelPathAvailable/);
 assert.match(api,/askAiAgent/);
 assert.match(api,/ownerCatalogSnapshot/);
 assert.match(api,/selected|sales_item_ids/);
 assert.match(api,/items/);
 assert.doesNotMatch(api,/checkoutSession|createPaymentIntent|sendTwilio/);
});
test("DB quotas and RLS protect live visitor chats and keep a 29-day lifecycle",()=>{
 const ddl=read("supabase/sql/vmv_public_web_chat_runtime_20261120.sql");
 const toggle=read("supabase/sql/vmv_public_web_chat_owner_toggle_20261120.sql");
 for(const token of [
  "ENABLE ROW LEVEL SECURITY","vmv_web_public_chat_claim",
  "vmv_web_public_chat_finish","vmv_web_public_chat_usage",
  "pg_advisory_xact_lock","v_count_owner>=140",
  "v_count_site>=80","v_count_ip>=16",
  "v_count_session>=12","29 days","cron.schedule",
  "primary_agent_id","web_chat_agent_not_ready"
 ])assert.ok(ddl.includes(token),token);
 assert.match(ddl,/REVOKE ALL ON public\.vmv_web_public_chat_messages FROM public,anon,authenticated/);
 assert.match(ddl,/GRANT SELECT ON public\.vmv_web_public_chat_messages TO authenticated/);
 assert.match(ddl,/owner_id=\(SELECT auth\.uid\(\)\)/);
 assert.match(ddl,/site_kind IN \('classic','builder'\)/);
 assert.match(toggle,/GRANT UPDATE\(public_chat_enabled\)/);
});
test("Both website families show chat only when owner has enabled it",()=>{
 const launcher=source["app/web-studio/WebChatLauncher.tsx"];
 assert.match(source["app/sites/[slug]/page.tsx"],/WebChatLauncher/);
 assert.match(source["app/web/[slug]/[[...page]]/page.tsx"],/WebChatLauncher/);
 assert.match(launcher,/\/api\/vmv\/public-chat\?kind=/);
 assert.match(launcher,/status\?\.enabled===true/);
 assert.match(launcher,/fallbackMode==="inbox"/);
 assert.match(launcher,/consent:true/);
 assert.match(launcher,/role="log"/);
 assert.match(launcher,/Hablar con una persona/);
 assert.match(launcher,/RequestForm/);
 assert.match(launcher,/\/web-chat-privacy/);
 assert.match(source["proxy.ts"],/web-chat-privacy/);
});
test("Owner decides activation and sees separate real visitor inbox",()=>{
 const hub=source["app/vista-app/ai-agents/ChatWebHub.tsx"];
 assert.match(hub,/togglePublicChat/);
 assert.match(hub,/setSettingsSaved\(true\)/);
 assert.match(hub,/agent\.status!=="active"/);
 assert.match(hub,/update\(\{public_chat_enabled:activate\}\)/);
 assert.match(hub,/visitorChats/);
 assert.match(hub,/vmv_web_public_chat_sessions/);
 assert.match(hub,/vmv_web_public_chat_messages/);
 assert.match(hub,/Solicitudes/);
 assert.match(hub,/Pruebas/);
 assert.match(hub,/site_kind:site.kind/);
 assert.match(hub,/Desvincular web/);
});


test("Customer stock counts are hidden; orders are owner-reviewed and cannot auto-charge",()=>{
 const helper=read("lib/vmv-ai-agents/customer-catalog.ts");
 const simulator=read("app/api/vmv/ai-agents/simulate/route.ts");
 const publicChat=source["app/api/vmv/public-chat/route.ts"];
 const action=read("app/api/vmv/public-chat/action/route.ts");
 const ownerPreview=read("app/api/vmv/ai-agents/commerce/request-order/route.ts");
 const form=read("components/VMVChatOrderCard.tsx");
 const sql=read("supabase/sql/vmv_ai_agent_chat_order_requests_20261121.sql");
 const hub=read("app/vista-app/ai-agents/CommerceStudio.tsx");
 const store=read("app/vista-app/ai-agents/commerceStore.ts");
 for(const [name,code] of [
  ["components/VMVChatOrderCard.tsx",form],
  ["app/api/vmv/public-chat/action/route.ts",action],
  ["app/api/vmv/ai-agents/commerce/request-order/route.ts",ownerPreview]
 ]){
  const ast=ts.createSourceFile(name,code,ts.ScriptTarget.Latest,true,
   name.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText," ")),[],name);
 }
 assert.match(simulator,/customerCatalog\(webPreview/);
 assert.match(simulator,/hideStockCounts\(rawReply\)/);
 assert.match(publicChat,/customerCatalog\(items\)/);
 assert.match(publicChat,/hideStockCounts\(rawReply\)/);
 assert.match(helper,/export function customerCatalog/);
 assert.doesNotMatch(helper,/availableQuantity:item\.availableQuantity/);
 const js=ts.transpileModule(helper,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const mod={exports:{}};
 new Function("module","exports",js)(mod,mod.exports);
 const redact=mod.exports.hideStockCounts;
 assert.doesNotMatch(redact("Tenemos 10 unidades disponibles. Precio 55 USD."),/10 unidades/);
 assert.doesNotMatch(redact("Stock: 10, pregunta por disponibilidad."),/Stock: 10/);
 assert.match(redact("Precio 55 USD."),/Precio 55 USD/);

 assert.match(form,/Pedido #/);
 assert.match(form,/acceptOrder:true/);
 assert.match(action,/visitorSession\(req,body.kind,body.slug\)/);
 assert.match(action,/body.action==="order"/);
 assert.match(action,/body.acceptOrder!==true/);
 assert.match(action,/vmv_ai_agent_capture_order/);
 assert.match(ownerPreview,/auth.getUser\(token\)/);
 assert.match(ownerPreview,/vmv_ai_agent_capture_order/);
 assert.match(sql,/security invoker/);
 assert.match(sql,/grant execute on function public.vmv_ai_agent_capture_order/);
 assert.match(sql,/to service_role/);
 assert.match(sql,/status,payment_status/);
 assert.match(sql,/requires_review','not_started/);
 assert.match(sql,/vmv_ai_owner_review_chat_order/);
 assert.match(hub,/Pedido #/);
 assert.match(hub,/Requerir pago/);
 assert.match(store,/reviewChatOrder/);
 assert.doesNotMatch(action,/checkoutSession|createPaymentIntent/);
});


test("Conversational multi-item checkout creates one reviewed order only after contact",()=>{
 const source=read("lib/vmv-ai-agents/conversational-order.ts");
 const compiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const mod={exports:{}};
 new Function("module","exports",compiled)(mod,mod.exports);
 const parse=mod.exports.conversationalOrder;
 const catalog=[
  {id:"product-1",name:"Cake",priceCents:5500},
  {id:"product-2",name:"chocoflan",priceCents:3000}
 ];
 const before=[{id:"q1",role:"user",content:"ok quiero un chocoflan y 2 cakes"}];
 const pending=parse(before,catalog);
 assert.equal(pending.intentId,"q1");
 assert.deepEqual(pending.items.map(x=>[x.name,x.qty]),[["Cake",2],["chocoflan",1]]);
 assert.equal(pending.name,"");
 const ready=parse([...before,
  {id:"q2",role:"assistant",content:"Dime tu nombre y teléfono"},
  {id:"q3",role:"user",content:"mi nombre es miguel y mi numero de telefono es 2394061146"}],catalog);
 assert.equal(ready.intentId,"q1");
 assert.equal(ready.name.toLowerCase(),"miguel");
 assert.equal(ready.phone,"2394061146");
 assert.equal(ready.items.reduce((n,item)=>n+item.qty*item.priceCents,0),14000);
 assert.equal(parse([{id:"q1",role:"user",content:"que tienes disponible?"}],catalog),null);
 assert.equal(parse([{id:"q1",role:"user",content:"quiero otro producto"}],catalog),null);
 const sim=read("app/api/vmv/ai-agents/simulate/route.ts");
 const sql=read("supabase/sql/vmv_ai_multi_conversation_orders_20261121.sql");
 assert.match(sim,/vmv_ai_capture_conversation_order/);
 assert.match(sim,/actionsExecuted:createdOrder\?1:0/);
 assert.match(sim,/const canPrepare=webPreview/);
 assert.doesNotMatch(sim,/selectedProducts=webPreview&&prefs\?\.sales_enabled/);
 assert.match(sql,/vmv_ai_orders/);
 assert.match(sql,/vmv_ai_order_lines/);
 assert.match(sql,/requires_review','not_started/);
 assert.match(sql,/grant execute on function public\.vmv_ai_capture_conversation_order/);
 assert.match(sql,/to service_role/);
 assert.doesNotMatch(sql,/payment_intents|checkout\.sessions|hold_inventory/);
});
