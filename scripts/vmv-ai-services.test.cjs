const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const base="app/vista-app/ai-agents/";
const root=read(base+"page.tsx");
const call=read(base+"AutomaticCallWizard.tsx");
const quote=read(base+"AutomaticQuoteWizard.tsx");
const commerce=read(base+"AutomaticCommerceWizard.tsx");
const bookings=read(base+"AutomaticBookingWizard.tsx");
const dash=read("app/vista-app/page.tsx");
test("All new functional service wizards parse and reuse shared agent UX",()=>{
 for(const p of ["AutomaticCallWizard.tsx","AutomaticQuoteWizard.tsx",
  "AutomaticCommerceWizard.tsx","AutomaticBookingWizard.tsx"]){
  const file=base+p;
  const ast=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText," ")),[],file);
  assert.match(read(file),/AgentServiceFlow\.module\.css/);
  assert.match(read(file),/AutomaticWebWizard\.module\.css/);
  assert.match(read(file),/onClick/);
 }
});
test("Only existing functional services are in the principal agent's guided service router",()=>{
 for(const screen of ["call","quote","commerceWizard","bookingsWizard","web","video","ads"]){
  assert.ok(root.includes('screen==="'+screen+'"'),screen+" is not routed");
 }
 assert.match(root,/AutomaticCallWizard/);
 assert.match(root,/AutomaticQuoteWizard/);
 assert.match(root,/AutomaticCommerceWizard/);
 assert.match(root,/AutomaticBookingWizard/);
 assert.match(root,/service==="inventory"\|\|service==="sales"/);
 assert.match(root,/setScreen\("bookingsWizard"\)/);
 assert.match(dash,/id:"smart-call".*service=call/);
 assert.match(dash,/id:"smart-quote".*service=quote/);
 assert.match(dash,/id:"video-generator".*service=video/);
 assert.match(dash,/id:"ads-studio"/);
});
test("Smart Call never alters Twilio line route, always verifies ownership and uses optimistic version guards",()=>{
 assert.match(call,/loadPhoneSelection\(\)/);
 assert.match(call,/user\.id!==agent\.owner_id/);
 assert.match(call,/user\.id!==business\.owner_id/);
 assert.match(call,/selectPhoneAgent\(line\.routeId,workingAgent\)/);
 assert.match(call,/checkCallPolicy\(policy\),version/);
 assert.match(call,/method:"POST"/);
 assert.match(call,/\/api\/vmv\/ai-agents\/call-settings/);
 assert.match(call,/\/api\/vista-app\/smart-call/);
 assert.match(call,/window\.confirm\("¿Guardar las reglas/);
 assert.doesNotMatch(call,/twilio_number:|smartjob_phone_routes"\)\.update|buyPhoneNumber|purchasePhone/);
});
test("Smart Quote computes preview and saves only a reviewable server-calculated owner draft",()=>{
 assert.match(quote,/vmv_marketing_businesses/);
 assert.match(quote,/vmv_smart_quote_catalog/);
 assert.match(quote,/unit_price_cents/);
 assert.match(quote,/confirm\("¿Guardar esta cotización como BORRADOR/);
 assert.match(quote,/vmv_smart_quote_save/);
 assert.match(quote,/p_quote_id:null/);
 assert.match(quote,/p_business_id:business\.id/);
 assert.doesNotMatch(quote,/vmv_smart_quote_set_status|stripe\.charges|checkout\/sessions|mark_sent/);
});
test("Inventory sales and bookings share canonical stores, require owner permission approval",()=>{
 assert.match(commerce,/setAgentCatalogReadAccess\(agent,inventoryRead\)/);
 assert.match(commerce,/saveCommerceAgentPermissions\(agent,permission\)/);
 assert.match(commerce,/AgentWebCatalogEditor/);
 assert.match(commerce,/confirm\("¿Guardar los permisos/);
 assert.match(bookings,/vmv_ai_booking_services/);
 assert.match(bookings,/vmv_ai_booking_slots/);
 assert.match(bookings,/storeAgent\(\{\.\.\.agent,setup/);
 assert.match(bookings,/cap_bookings:enabled/);
 assert.match(bookings,/perm_book_service:enabled&&confirm/);
 assert.match(bookings,/onOpenStudio/);
});

test("Guided Smart Call menu and activation screens are TypeScript/TSX parseable",()=>{
 for(const filename of ["app/vista-app/ai-agents/SmartCallMenuEditor.tsx",
  "app/vista-app/ai-agents/SmartCallAgentSetup.tsx",
  "lib/vmv-ai-agents/call-policy.ts","lib/vmv-ai-agents/phone-voices.ts",
  "app/api/vmv/ai-agents/test-number/route.ts"]){
  const ast=ts.createSourceFile(filename,read(filename),ts.ScriptTarget.Latest,true,
   filename.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText," ")),[],filename);
 }
 assert.match(call,/SmartCallMenuEditor/);
 assert.match(call,/SmartCallAgentSetup/);
 assert.match(read("app/api/vmv/ai-agents/test-number/route.ts"),/VMV_SMART_CALL_GUIDED_IVR_ENABLED/);
 assert.match(read("app/api/vmv/ai-agents/test-number/route.ts"),/reservePhoneSession/);
 assert.match(read("lib/vmv-ai-agents/phone-voices.ts"),/voiceById/);
});
