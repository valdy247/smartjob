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
test("Smart Quote prepares a persisted PDF before sharing it from review",()=>{
 assert.match(quote,/vmv_smart_quote_save/);
 assert.match(quote,/p_quote_id:draftId\|\|null/);
 assert.match(quote,/vmv_smart_quote_set_pdf_details/);
 assert.match(quote,/setPdfFile\(new File/);
 assert.match(quote,/await navigator\.share\(\{?data\}?\)/);
 assert.match(quote,/onClick=\{\(\)=>setSavedId\(draftId\)\}/);
 assert.doesNotMatch(quote,/action:"send"/);
});
test("First-time product setup preserves agent identity, permissions and catalog ownership",()=>{
 const store=read(base+"commerceStore.ts");
 const hub=read(base+"CommerceStudio.tsx");
 assert.match(commerce,/saveCommerceSetup\(agent/);
 assert.match(commerce,/AgentWebCatalogEditor/);
 assert.match(commerce,/onOpenStudio\(\)/);
 assert.match(store,/commerce_onboarded:"Sí"/);
 assert.match(store,/\.eq\("owner_id",owner\)\.eq\("business_id",agent\.business_id\)/);
 assert.match(store,/\.eq\("revision",agent\.revision\)/);
 assert.match(store,/cap_catalog:config\.catalog/);
 assert.match(store,/perm_prepare_order:config\.orders/);
 assert.match(hub,/toggleCatalogRead/);
 assert.match(hub,/BuilderImageField/);
 assert.match(bookings,/vmv_ai_booking_services/);
 assert.match(bookings,/vmv_ai_booking_slots/);
 assert.match(bookings,/storeAgent\(\{\.\.\.agent,setup/);
 assert.match(bookings,/cap_bookings:enabled/);
 assert.match(bookings,/perm_book_service:enabled&&confirm/);
 assert.match(bookings,/onOpenStudio/);
});


test("Productos/Pedidos opens directly after one-time setup and keeps real product photos",()=>{
 const hub=read(base+"CommerceStudio.tsx");
 const editor=read(base+"AgentWebCatalogEditor.tsx");
 const store=read(base+"commerceStore.ts");
 const renderer=read("lib/web-builder-live-catalog.ts");
 for(const [file,src] of [["CommerceStudio.tsx",hub],["AgentWebCatalogEditor.tsx",editor]]){
  const ast=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText," ")),[],file);
 }
 assert.doesNotMatch(root,/\{id:"sales",title:"Ventas"/);
 assert.match(root,/title:"Productos\/Pedidos"/);
 assert.match(root,/commerceNeedsSetup\(agent\)\?"commerceWizard":"commerce"/);
 assert.match(root,/setCommerceTab\("catalog"\)/);
 assert.match(hub,/Agregar producto/);
 assert.match(hub,/Mis productos/);
 assert.match(hub,/role="switch"/);
 assert.match(hub,/Conectado":"Desconectado"/);
 assert.match(hub,/BuilderImageField/);
 assert.match(editor,/BuilderImageField/);
 assert.match(store,/image_path:photo/);
 assert.match(store,/smartjob-web-images\/"\+owner/);
 assert.match(renderer,/select\("id,name,description,price_cents,currency,image_path"\)/);
 assert.match(renderer,/safeWebImageUrl/);
 assert.match(renderer,/inventory_connection_enabled!==true/);
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

test("Smart Call bilingual menu validation, safe voice allowlist, and isolated provider routing",()=>{
 function loadTs(filename,local={}){
  const out=ts.transpileModule(read(filename),{compilerOptions:{
   module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
  }}).outputText;
  const mod={exports:{}};
  new Function("require","module","exports",out)((id)=>local[id]||require(id),mod,mod.exports);
  return mod.exports;
 }
 const voices=loadTs("lib/vmv-ai-agents/phone-voices.ts");
 const policy=loadTs("lib/vmv-ai-agents/call-policy.ts",{"./phone-voices":voices});
 const baseline=policy.checkCallPolicy(policy.initialCallPolicy);
 assert.equal(baseline.menu_config.spanish_digit,"1");
 assert.equal(baseline.menu_config.english_digit,"2");
 assert.equal(baseline.menu_config.agent_digit,"3");
 assert.equal(policy.decideCall(baseline,{day:"mon",minutes:600}).action,"menu");
 const direct=policy.checkCallPolicy({...baseline,agent_enabled:false,translation_enabled:false});
 assert.equal(policy.decideCall(direct,{day:"mon",minutes:600}).action,"ring_owner");
 assert.throws(()=>policy.checkCallPolicy({...direct,menu_config:{...direct.menu_config,enabled:false}}),/menú/);
 assert.ok(voices.PHONE_VOICE_CATALOG.filter(v=>v.lang==="es").length>=2);
 assert.ok(voices.PHONE_VOICE_CATALOG.filter(v=>v.lang==="en").length>=2);
 assert.equal(voices.sayElevenVoice("es_maria","en"),"");
 assert.match(voices.sayElevenVoice("en_jessica","en"),/^ElevenLabs\./);
 assert.throws(()=>policy.checkCallPolicy({...baseline,menu_config:{
  ...baseline.menu_config,english_digit:"1"}}),/diferente/);
 assert.throws(()=>policy.checkCallPolicy({...baseline,menu_config:{
  ...baseline.menu_config,voice_es:"attacker_voice"}}),/autorizada/);
 assert.throws(()=>policy.checkCallPolicy({...baseline,menu_config:{
  ...baseline.menu_config,greeting_es:"<Hangup/>"}}),/mensajes/);
 const router=read("app/api/vmv/ai-agents/test-number/route.ts");
 assert.match(router,/VMV_SMART_CALL_GUIDED_IVR_ENABLED/);
 assert.match(router,/process.env.VERCEL_ENV==="preview"/);
 assert.match(router,/reservePhoneSession/);
 assert.match(router,/claimNational/);
 assert.match(router,/validSelectionSignature|selectionSignature/);
 assert.doesNotMatch(router,/AvailablePhoneNumbers\/US\/Local.json|IncomingPhoneNumbers\.json/);
 const requestDb=read("supabase/sql/vmv_smart_call_line_requests_20261119.sql");
 assert.match(requestDb,/enable row level security/);
 assert.match(requestDb,/owner_id=\(select auth.uid\(\)\)/);
 assert.doesNotMatch(read("app/api/vmv/ai-agents/available-numbers/route.ts"),/method:"POST"/);
});


test("Booking wizard opens live services, slots and requests directly and does not disable empty agenda cards",()=>{
 const wizard=read(base+"AutomaticBookingWizard.tsx");
 const studio=read(base+"BookingStudio.tsx");
 const page=read(base+"page.tsx");
 const parsed=[
  ["AutomaticBookingWizard.tsx",wizard],
  ["BookingStudio.tsx",studio],
  ["page.tsx",page]
 ];
 for(const [path,code] of parsed){
  const ast=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText," ")),[],path);
 }
 assert.match(wizard,/onOpenStudio\(nextGoal\)/);
 assert.match(wizard,/openGoal\("services"\)/);
 assert.match(wizard,/openGoal\("slots"\)/);
 assert.match(wizard,/openGoal\("bookings"\)/);
 assert.doesNotMatch(wizard,/disabled=\{!serviceCount\}/);
 assert.match(wizard,/eq\("approved",true\)/);
 assert.match(wizard,/vmv_ai_bookings/);
 assert.match(wizard,/aria-pressed=\{businessConfirmed\}/);
 assert.match(page,/initialTab=\{bookingTab\}/);
 assert.match(page,/initialStep=\{resumeBooking\?"goal":"business"\}/);
 assert.match(studio,/initialTab\?:BookingTab/);
 assert.match(studio,/setTab\("services"\)/);
 assert.match(studio,/eligibleServices=services\.filter\(s=>s\.active&&s\.approved\)/);
 assert.match(studio,/Crear o aprobar servicio/);
 assert.match(studio,/Aún no hay reservas registradas/);
 assert.match(studio,/vmv_ai_owner_add_booking_slot/);
});
