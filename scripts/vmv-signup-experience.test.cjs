const {test}=require("node:test");
const assert=require("node:assert/strict");
const ts=require("typescript");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const pure=read("lib/vmv-signup-flow.ts");
const js=ts.transpileModule(pure,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const ctx={exports:{}};
new Function("module","exports","require",js)(ctx,ctx.exports,require);
const {signupQuestions,signupValidation,signupHours}=ctx.exports;
const ids=d=>signupQuestions(d).map(q=>q.id);
const withBiz={first:"Valdy",last:"Mena",agent_name:"Papi",business_now:"yes",business_type:"storefront",country:"US",
 hours_policy:"weekly",capabilities:"support,bookings,calls,sales,marketing,ads,website,inventory",booking_count:"2",availability_mode:"weekly"};

test("registration begins with first name, then a personalized greeting and agent name",()=>{
 const first=signupQuestions({})[0];
 assert.equal(first.id,"first");assert.match(first.es,/Hola.*cómo te llamas/i);
 const questions=signupQuestions({first:"Valdy"});
 assert.equal(questions[1].id,"last");assert.match(questions[1].es,/Valdy/);
 assert.equal(questions[2].id,"agent_name");
 assert.equal(questions[3].id,"business_now");
});
test("declining business preserves personal setup without inventing a company",()=>{
 const questions=ids({first:"Valdy",last:"Mena",agent_name:"Papi",business_now:"no"});
 assert.ok(!questions.includes("business_name"));
 assert.ok(!questions.includes("business_phone"));
 assert.ok(!questions.includes("service_1_name"));
 for(const id of ["agent_language","agent_personality","agent_mission","user_phone","email","password","repeat_password"])
  assert.ok(questions.includes(id),id);
});
test("business onboarding asks contact, location, seven-day hours and every selected module's requirements",()=>{
 const all=ids(withBiz);
 for(const id of ["business_name","legal_name","category","description","business_type","city","region",
  "postal","street","unit","business_phone","business_email","website","instagram","facebook","whatsapp",
  "hours_mon","hours_tue","hours_wed","hours_thu","hours_fri","hours_sat","hours_sun",
  "business_services","business_products","policies","capabilities","service_1_name",
  "service_1_duration","service_2_name","service_2_duration","booking_confirm","availability_mode",
  "call_number","call_greeting","sales_prices","marketing_goal","ads_budget","website_goal","inventory_categories"])
  assert.ok(all.includes(id),id);
 assert.ok(!all.includes("service_3_name"),"exactly the chosen number of service questions");
});
test("service area removes street address and collects only served areas",()=>{
 const all=ids({...withBiz,business_type:"service_area",capabilities:"support"});
 assert.ok(all.includes("service_areas"));
 assert.ok(!all.includes("street"));assert.ok(!all.includes("unit"));
});
test("a custom country must provide an ISO two-letter code",()=>{
 const all=ids({...withBiz,country:"other"});
 assert.ok(all.includes("country_code"));
 assert.match(signupValidation({id:"country_code",kind:"text",optional:false,max:2},"USA",{}),/corta|dos letras/);
 assert.equal(signupValidation({id:"country_code",kind:"text",optional:false,max:2},"FR",{}),"");
});
test("future booking windows are required only when explicitly selected",()=>{
 const base={...withBiz,availability_mode:"single"};
 const all=ids(base);
 assert.ok(all.includes("availability_day"));assert.ok(all.includes("availability_start"));assert.ok(all.includes("availability_end"));
 assert.ok(!ids({...base,availability_mode:"later"}).includes("availability_day"));
 assert.ok(!ids({...base,availability_mode:"weekly"}).includes("availability_day"));
});
test("week schedule parsing respects closed days and business-local times",()=>{
 const days=signupHours({hours_mon:"11:00-16:00",hours_tue:"cerrado",hours_wed:"09:00-17:00"});
 assert.deepEqual(days[0],{closed:false,start:"11:00",end:"16:00"});
 assert.equal(days[1].closed,true);assert.equal(days.length,7);
});
test("passwords require ten characters and matching confirmation; invalid time is blocked",()=>{
 const p={id:"password",kind:"password",optional:false,max:128};
 assert.match(signupValidation(p,"abc123",{}),/10 caracteres/);
 assert.equal(signupValidation(p,"longsecurepassword",{}),"");
 const r={id:"repeat_password",kind:"password",optional:false,max:128};
 assert.match(signupValidation(r,"doesnotmatch",{password:"verystrongpassword"}),/coincidir/);
 assert.match(signupValidation({id:"hours_mon",kind:"timewindow",optional:false,max:20},"18:00-09:00",{}),/posterior/);
 assert.equal(signupValidation({id:"hours_mon",kind:"timewindow",optional:false,max:20},"cerrado",{}),"");
});
test("verification and provisioning happen before the last Go Home button",()=>{
 const wizard=read("components/SignupWizard.tsx"),finish=read("lib/vmv-signup-complete.ts");
 const home=read("app/vista-app/page.tsx");
 assert.ok(wizard.includes('emailRedirectTo:window.location.origin+"/registro?confirmado=1"'));
 assert.ok(wizard.includes("signInWithPassword"));
 assert.ok(wizard.includes("email_confirmed_at"));
 assert.ok(wizard.includes('setPhase("saving")'));
 assert.ok(wizard.includes('setPhase("ready")'));
 assert.ok(wizard.includes('window.location.replace("/vista-app")'));
 assert.ok(wizard.includes('vmv_signup_v2_completed:true'));
 assert.ok(home.includes('window.location.replace("/registro?resume=1")'));
 assert.ok(finish.includes("email_confirmed_at"));
 assert.ok(finish.includes("session.user.id!==user.id"));
 assert.ok(finish.includes("plan_prompt_seen:true"));
});
test("business, principal agent, catalog and hours save to canonical owner-scoped systems",()=>{
 const src=read("lib/vmv-signup-complete.ts");
 for(const marker of ["smartjob_profiles","vmv_marketing_businesses","provisionAiWorkspace",
  "vmv_ai_agents","choosePrincipalAgent","vmv_ai_booking_services",
  "vmv_ai_owner_seed_signup_availability","vmv_ai_owner_add_availability"])
  assert.ok(src.includes(marker),marker);
 assert.ok(src.includes("ignoreDuplicates:true"));
 assert.ok(src.includes("source_system:\"vmv_signup\""));
 assert.ok(src.includes('status:"draft"'));
 assert.ok(src.includes('data.booking_confirm==="yes"'));
 assert.ok(!src.includes("stripe.paymentIntents"));
 assert.ok(!src.includes("twilio_number:"));
});
test("a signup blueprint never serializes passwords or privileged account entitlements",()=>{
 const complete=read("lib/vmv-signup-complete.ts");
 assert.ok(complete.includes('key!=="password"&&key!=="repeat_password"'));
 assert.ok(!complete.includes("preferred_plan:\"premium\""));
 assert.ok(complete.includes("plan_prompt_seen:true"));
 assert.ok(!complete.includes("service_role"));
 assert.ok(!complete.includes("SUPABASE_SECRET_KEY"));
});
test("existing user sign-in is shared, OAuth providers are available as flows and no login creates a user",()=>{
 const login=read("components/VMVAuthGateway.tsx");
 const root=read("components/AuthPanel.tsx");
 const home=read("app/vista-app/page.tsx");
 assert.ok(login.includes('signInWithOAuth'));
 assert.ok(login.includes('social("google")'));
 assert.ok(login.includes('social("apple")'));
 assert.ok(login.includes("signInWithPassword"));
 assert.ok(login.includes("resetPasswordForEmail"));
 assert.ok(!login.includes(".signUp("));
 assert.ok(root.includes("<VMVAuthGateway"));
 assert.ok(home.includes("<VMVAuthGateway compact supabase={client}/>"));
});
test("signup and login interfaces are valid TypeScript and TSX",()=>{
 for(const p of ["components/SignupWizard.tsx","components/VMVAuthGateway.tsx",
  "components/AuthPanel.tsx","lib/vmv-signup-flow.ts","lib/vmv-signup-complete.ts",
  "app/vista-app/page.tsx"]){
  const parsed=ts.createSourceFile(p,read(p),ts.ScriptTarget.Latest,true,p.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(parsed.parseDiagnostics.map(x=>String(x.messageText)),[],p);
 }
});
test("weekly calendar seeding is restricted to signed-in owners and uses central business hours",()=>{
 const sql=read("supabase/sql/vmv_signup_initial_availability_20261121.sql");
 assert.ok(sql.includes("security invoker"));
 assert.ok(sql.includes("m.owner_id=auth.uid()"));
 assert.ok(sql.includes("public.vmv_ai_owner_add_availability"));
 assert.ok(sql.includes("grant execute on function public.vmv_ai_owner_seed_signup_availability"));
 assert.ok(sql.includes("to authenticated"));
 assert.ok(sql.includes("from public,anon,authenticated"));
});
