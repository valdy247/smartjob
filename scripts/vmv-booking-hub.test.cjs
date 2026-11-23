const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const root=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const studio=read("app/vista-app/ai-agents/BookingStudio.tsx");
const wizard=read("app/vista-app/ai-agents/AutomaticBookingWizard.tsx");
const rootPage=read("app/vista-app/ai-agents/page.tsx");
const css=read("app/vista-app/ai-agents/CommerceStudio.module.css");
const messages=JSON.parse(read("lib/i18n/messages.json"));
const sql=read("supabase/sql/vmv_booking_owner_review_20261120.sql");
test("Servicios/Reservas dashboard and first-time wizard parse cleanly",()=>{
 for(const [filename,source] of [
  ["BookingStudio.tsx",studio],["AutomaticBookingWizard.tsx",wizard],["page.tsx",rootPage]
 ]){
  const ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText," ")),[],filename);
 }
});
test("Booking capability uses the same visual action-card hierarchy as product catalog",()=>{
 assert.match(studio,/className=\{styles\.tabs\}/);
 assert.match(studio,/className=\{styles\.catalogConnection\}/);
 assert.match(studio,/className=\{styles\.catalogSwitch\}/);
 assert.match(studio,/className=\{styles\.actionGrid\}/);
 assert.match(studio,/className=\{styles\.actionCard\}/);
 assert.match(studio,/Agregar servicio/);
 assert.match(studio,/Mis servicios/);
 assert.match(studio,/Servicios y reservas/);
 assert.match(studio,/Solicitudes/);
 assert.match(studio,/setView\("slots"\)/);
 assert.match(css,/\.actionGrid\{/);
 assert.match(css,/\.actionCard\{/);
 assert.match(css,/\.serviceRowActions\{/);
});
test("Booking wizard is only for initial setup, and subsequent entries go directly to hub",()=>{
 assert.match(rootPage,/bookingsNeedsSetup\(agent\)\?"bookingsWizard":"bookings"/);
 assert.match(rootPage,/initialStep="business"/);
 assert.match(rootPage,/onClose=\{back\}/);
 assert.match(wizard,/bookings_onboarded:"Sí"/);
 assert.match(wizard,/setStep\("permissions"\)/);
 assert.match(studio,/bookings_onboarded:"Sí"/);
 assert.doesNotMatch(studio,/setScreen\("bookingsWizard"\)/);
});
test("Actual service catalog, capacity-safe slot RPC, requests and agent permissions are connected",()=>{
 for(const name of ["vmv_ai_booking_services","vmv_ai_booking_slots","vmv_ai_bookings",
  "vmv_ai_human_requests","vmv_ai_owner_add_booking_slot","storeAgent",
  "cap_bookings:next","perm_book_service:next","approved","auto_confirm"])
  assert.ok(studio.includes(name),name);
 assert.match(studio,/reviewRequest/);
 assert.match(studio,/decideBooking/);
 assert.match(studio,/vmv_ai_owner_review_booking/);
 assert.match(studio,/source==="ai_phone_test"/);
});
test("Owner booking review validates tenant, actual slot, capacity and writes audit",()=>{
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/owner_id=v_owner/);
 assert.match(sql,/v_booking\.status='canceled'/);
 assert.match(sql,/active AND approved/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/v_reserved>=v_slot\.capacity/);
 assert.match(sql,/vmv_ai_booking_owner_decisions/);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION.*TO authenticated/);
 assert.doesNotMatch(sql,/stripeCheckout|createCharge|sendTwilio/);
});
test("Spanish and English service capability labels are preserved",()=>{
 const spanish=JSON.stringify(messages);
 assert.match(spanish,/Servicios\/Reservas/);
 assert.match(spanish,/Services\/Bookings/);
 assert.match(rootPage,/title:"Servicios\/Reservas"/);
});
