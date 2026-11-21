const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const file=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const js=ts.transpileModule(file("lib/vmv-ai-agents/booking-chat.ts"),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const business="11111111-1111-4111-8111-111111111111";
const owner="22222222-2222-4222-8222-222222222222";
const agent="33333333-3333-4333-8333-333333333333";
const service="44444444-4444-4444-8444-444444444444";
const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const date=new Date(Date.parse(today+"T12:00:00Z")+86400000).toISOString().slice(0,10);
const approved={id:service,name:"Masaje",description:"Masaje relajante",duration_minutes:30,time_zone:"America/New_York",price_cents:5000,auto_confirm:true};
const window={day:date,start_local:"11:00:00",end_local:"16:00:00",time_zone:"America/New_York"};
const outcome=(body)=>JSON.stringify({action:"book",service_id:service,date,time:"13:00",customer_name:"",...body});
function fake({enabled=true,services=[approved],windows=[window],ai=outcome({customer_name:"Ana López"}),book={id:"55555555-5555-4555-8555-555555555555",status:"confirmed"},errorTable=null,errRpc=false}={}){
 const recorded={calls:[],prompts:[],tables:[]};
 const db={
  from(name){
   recorded.tables.push(name);
   const chain={select(){return chain},eq(){return chain},gte(){return chain},lte(){return chain},order(){return chain},
    limit:async()=>({data:name==="vmv_ai_booking_services"?services:windows,error:errorTable===name?{message:"failed"}:null})};
   return chain;
  },
  rpc:async(name,args)=>{recorded.calls.push({name,args});return {data:book,error:errRpc?{message:"db_error"}:null};}
 };
 const mod={exports:{}};
 const localRequire=(name)=>{
  if(name==="@/lib/vmv-ai-agents/model")return {askAiAgent:async args=>{recorded.prompts.push(args);return ai;}};
  return require(name);
 };
 new Function("module","exports","require",js)(mod,mod.exports,localRequire);
 const run=(overrides={})=>mod.exports.bookingChatTurn({
  db,owner,business,agent,configuration:{cap_bookings:enabled?"Sí":"No",perm_book_service:"Sí"},
  history:[],message:"Necesito reservar un masaje mañana a la 1 pm para Ana López",session:"web-session-test",source:"web_chat",...overrides
 });
 return {run,recorded};
}
test("inactive booking permission cannot query or change appointments",async()=>{
 const {run,recorded}=fake({enabled:false});
 assert.equal(await run(),null);
 assert.equal(recorded.calls.length,0);assert.equal(recorded.tables.length,0);
});
test("a user requesting a 30-minute massage at 13:00 triggers one verified atomic booking",async()=>{
 process.env.SUPABASE_SECRET_KEY="unit-test-booking-secret";
 const {run,recorded}=fake();
 const result=await run();
 assert.match(result,/Reserva confirmada/);
 assert.match(result,/13:00 \(30 min\)/);
 assert.equal(recorded.calls.length,1);
 assert.equal(recorded.calls[0].name,"vmv_ai_book_available_window");
 assert.deepEqual(Object.fromEntries(Object.entries(recorded.calls[0].args).filter(([k])=>k!=="p_key")),{
  p_owner:owner,p_business:business,p_agent:agent,p_service:service,p_date:date,p_time:"13:00",p_name:"Ana López"
 });
 assert.match(recorded.calls[0].args.p_key,/^web-[0-9a-f]{48}$/);
 assert.match(recorded.prompts[0].system,/duration_minutes/);
 assert.ok(recorded.prompts[0].system.includes(date));
});
test("owner preview never books real appointments even with customer name",async()=>{
 const {run,recorded}=fake();
 const result=await run({source:"owner_preview"});
 assert.match(result,/no guardé ninguna reserva/);
 assert.equal(recorded.calls.length,0);
});
test("missing customer name prompts one question; never invents or books",async()=>{
 const {run,recorded}=fake({ai:outcome({customer_name:""})});
 const result=await run({message:"Necesito un masaje mañana a la 1pm"});
 assert.match(result,/a nombre de quién/i);
 assert.equal(recorded.calls.length,0);
});
test("fully occupied or disabled slots fail without claiming a confirmed reservation",async()=>{
 process.env.SUPABASE_SECRET_KEY="unit-test-booking-secret";
 const {run,recorded}=fake({book:null});
 const result=await run();
 assert.match(result,/ya está ocupado|no se permite reservar/);
 assert.doesNotMatch(result,/Reserva confirmada/);
 assert.equal(recorded.calls.length,1);
});
test("a pending request blocks the slot but is not falsely reported as confirmed",async()=>{
 process.env.SUPABASE_SECRET_KEY="unit-test-booking-secret";
 const {run}=fake({book:{id:"55555555-5555-4555-8555-555555555555",status:"requested"}});
 const result=await run();
 assert.match(result,/Pendiente de aprobación/);
 assert.match(result,/horario queda ocupado/);
 assert.doesNotMatch(result,/Reserva confirmada/);
});
test("service duration must fit completely inside the owner's future availability",async()=>{
 const {run,recorded}=fake({ai:outcome({time:"15:45"})});
 assert.match(await run(),/fuera de la disponibilidad/);
 assert.equal(recorded.calls.length,0);
});
test("unauthorized service IDs or wrong time zones never reach write RPC",async()=>{
 for(const options of [
  {ai:outcome({service_id:"ffffffff-ffff-4fff-8fff-ffffffffffff"})},
  {services:[{...approved,time_zone:"America/Chicago"}]}
 ]){
  const {run,recorded}=fake(options);
  await run();
  assert.equal(recorded.calls.length,0);
 }
});
test("an unavailable database fails closed instead of promising a booking",async()=>{
 const {run}=fake({errorTable:"vmv_ai_booking_availability"});
 await assert.rejects(run(),/booking_availability_unavailable/);
});
test("availability, booked statuses and approved durations share one owner-bound workflow",()=>{
 const ui=file("app/vista-app/ai-agents/BookingStudio.tsx");
 const agenda=file("app/vista-app/ai-agents/AvailabilityAgenda.tsx");
 const publicChat=file("app/api/vmv/public-chat/route.ts");
 const simulator=file("app/api/vmv/ai-agents/simulate/route.ts");
 const schema=file("supabase/sql/vmv_ai_booking_future_availability_20261120.sql");
 assert.ok(ui.includes('<strong>Mi disponibilidad</strong>'));
 assert.ok(ui.includes('<AvailabilityAgenda business={workspace} owner={current.owner_id}'));
 assert.ok(agenda.includes('vmv_ai_owner_add_availability'));
 assert.ok(agenda.includes('vmv_ai_owner_remove_availability'));
 assert.ok(agenda.includes('["requested","confirmed"]'));
 assert.ok(agenda.includes('segment.busy?"Ocupado":"Disponible"'));
 assert.ok(publicChat.includes('bookingChatTurn({'));
 assert.ok(publicChat.includes('p_response:bookingReply'));
 assert.ok(simulator.includes('source:"owner_preview"'));
 assert.ok(schema.includes("pg_advisory_xact_lock"));
 assert.ok(schema.includes("tstzrange(s.start_at,s.end_at,'[)') && tstzrange(v_start,v_end,'[)')"));
 assert.ok(schema.includes("svc.duration_minutes"));
 assert.ok(schema.includes("grant execute on function public.vmv_ai_book_available_window"));
 assert.ok(schema.includes("to service_role"));
 assert.ok(schema.includes("enable row level security"));
});
test("calendar TSX and booking backend are parseable TypeScript",()=>{
 for(const filename of ["app/vista-app/ai-agents/AvailabilityAgenda.tsx",
  "app/vista-app/ai-agents/BookingStudio.tsx",
  "app/vista-app/ai-agents/AutomaticBookingWizard.tsx",
  "app/api/vmv/public-chat/route.ts","app/api/vmv/ai-agents/simulate/route.ts"]){
  const syntax=ts.createSourceFile(filename,file(filename),ts.ScriptTarget.ES2022,true,filename.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(syntax.parseDiagnostics.map(x=>String(x.messageText)),[],filename);
 }
});

test("model-generated customer names cannot book unless the visitor actually provided that name",async()=>{
 const {run,recorded}=fake({ai:outcome({customer_name:"Nombre Inventado"})});
 const response=await run({message:"Necesito un masaje mañana a la 1pm"});
 assert.match(response,/a nombre de quién/i);
 assert.equal(recorded.calls.length,0);
});
test("availability questions do not create bookings without explicit user intent",async()=>{
 const {run,recorded}=fake({ai:outcome({customer_name:"Ana López"})});
 const result=await run({message:"¿Hay disponibilidad para un masaje mañana a la 1pm? Soy Ana López"});
 assert.match(result,/¿Quieres que lo reserve/);
 assert.equal(recorded.calls.length,0);
});
