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
new Function("module","exports","require",js)(ctx,ctx.exports,(name)=>name==="./website-address"?require("../lib/website-address.ts"):require(name));
const {signupQuestions,signupValidation,signupHours}=ctx.exports;
const ids=d=>signupQuestions(d).map(q=>q.id);
const withBiz={first:"Valdy",last:"Mena",agent_name:"Papi",business_now:"yes",business_type:"storefront",country:"US",
 hours_policy:"weekly",capabilities:"support,bookings,calls,sales,marketing,ads,website,inventory",services_mode:"now",products_mode:"now",service_1_more:"yes",service_2_more:"no",product_1_more:"no",availability_mode:"weekly"};

test("registration begins with first name, then a personalized greeting and agent name",()=>{
 const first=signupQuestions({})[0];
 assert.equal(first.id,"first");assert.match(first.es,/Hola.*cómo te llamas/i);
 const questions=signupQuestions({first:"Valdy"});
 assert.equal(questions[1].id,"agent_name");assert.match(questions[1].es,/Valdy/);
 assert.equal(questions[2].id,"business_now");
 assert.ok(questions.find(q=>q.id==="last"),"surname is collected later as an account detail");
});
test("declining business preserves personal setup without inventing a company",()=>{
 const questions=ids({first:"Valdy",last:"Mena",agent_name:"Papi",business_now:"no"});
 assert.ok(!questions.includes("business_name"));
 assert.ok(!questions.includes("business_phone"));
 assert.ok(!questions.includes("service_1_name"));
 for(const id of ["agent_language","agent_personality","agent_response","agent_handoff","user_phone","email","password","repeat_password"])
  assert.ok(questions.includes(id),id);
});
test("business setup asks one question for each essential datum and nothing twice",()=>{
 const all=ids(withBiz);
 for(const id of ["business_name","category","description","business_type","country",
  "region","city","postal","street","website","hours_natural","services_mode","products_mode",
  "capabilities","service_1_name","service_1_duration","service_2_name","service_2_duration",
  "product_1_name","product_1_price","booking_confirm","availability_mode",
  "call_after_hours","marketing_goal","website_goal","inventory_connections","agent_response","agent_handoff"])
  assert.ok(all.includes(id),id);
 for(const duplicate of ["booking_count","call_number","business_phone","business_email","legal_name",
  "business_services","business_products","inventory_categories","sales_prices",
  "hours_mon","hours_tue","hours_wed","hours_thu","hours_fri","hours_sat","hours_sun"])
  assert.ok(!all.includes(duplicate),"unnecessary repeated or free-text question: "+duplicate);
 assert.equal(all.filter(id=>id==="user_phone").length,1);
 assert.ok(!all.includes("service_3_name"));
 assert.ok(!all.includes("product_2_name"));
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
 assert.match(signupValidation({id:"hours_natural",kind:"natural_hours",optional:false,max:400},
  "Lunes a viernes de 9 a 5",{}),/confirma/);
 assert.equal(signupValidation({id:"hours_natural",kind:"natural_hours",optional:false,max:400},
  "Lunes a viernes de 9 a 5",{hours_approved:"yes",hours_policy:"weekly"}),"");
 assert.equal(signupValidation({id:"website",kind:"url",optional:true,max:250},
  "mayulibakery.com",{}),"");
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

test("registration matches the shared white AI Services wizard, without landing-page decoration",()=>{
 const wizard=read("components/SignupWizard.tsx");
 const css=read("components/SignupExperience.module.css");
 const shared=read("app/vista-app/ai-agents/AutomaticWebWizard.module.css");
 const flow=read("app/vista-app/ai-agents/AgentServiceFlow.module.css");
 assert.ok(wizard.includes('import service from "@/app/vista-app/ai-agents/AutomaticWebWizard.module.css"'));
 assert.ok(wizard.includes('import theme from "@/app/vista-app/ai-agents/AgentServiceFlow.module.css"'));
 for(const part of ["service.root","service.top","service.track","service.robot","service.question",
  "service.optionsVertical","service.optionActive","service.field","service.primary","theme.agentButton"])
  assert.ok(wizard.includes(part),part+" must reuse service wizard styles");
 assert.ok(css.includes("background:#fff"));
 assert.ok(shared.includes(".question{"));
 assert.ok(flow.includes(".agentProgress{"));
 for(const excluded of ["styles.story","styles.orb","styles.glowOne","styles.badge","styles.footerHint"])
  assert.ok(!wizard.includes(excluded),"remove decorative "+excluded);
 assert.ok(!css.includes("radial-gradient"));
 assert.ok(!css.includes("linear-gradient"));
});

test("Google categories and locations come from provider-backed endpoints, not invented approved labels",()=>{
 const picker=read("components/SignupSmartFields.tsx");
 const geo=read("app/api/vmv/signup-geo/route.ts");
 const categories=read("app/api/marketing/google-categories/route.ts");
 assert.ok(picker.includes('"/api/marketing/google-categories?q="'));
 assert.ok(picker.includes('category_source:"pending"'));
 assert.ok(picker.includes('category_source:"verified"'));
 assert.ok(categories.includes("GOOGLE_BUSINESS_PROFILE_ACCESS_TOKEN"));
 assert.ok(geo.includes("GOOGLE_PLACES_API_KEY"));
 assert.ok(geo.includes("includedPrimaryTypes"));
 assert.ok(geo.includes("validateCity"));
 assert.ok(geo.includes("administrative_area_level_1"));
 const flow=read("lib/vmv-signup-flow.ts");
 assert.ok(flow.includes('kind==="location_region"')||flow.includes('"location_region"'));
 assert.ok(flow.includes('kind==="google_category"')||flow.includes('"google_category"'));
 const complete=read("lib/vmv-signup-complete.ts");
 assert.ok(complete.includes('action:"validateCity"'));
 assert.ok(complete.includes("google_category_id"));
});
test("AI proposes hours; owner explicitly edits and approves the weekly calendar",()=>{
 const wizard=read("components/SignupWizard.tsx");
 const editor=read("components/SignupSmartFields.tsx");
 const backend=read("app/api/vmv/signup-hours/route.ts");
 assert.ok(wizard.includes("<SignupHoursReview"));
 assert.ok(wizard.includes('hours_approved:"yes"'));
 assert.ok(editor.includes('role="dialog"'));
 assert.ok(editor.includes("onApprove(hours)"));
 assert.ok(backend.includes("askAiAgent"));
 assert.ok(backend.includes("requiresApproval:true"));
 assert.ok(backend.includes("too_many_requests"));
});
test("service/product onboarding persists each item to existing canonical catalogs",()=>{
 const complete=read("lib/vmv-signup-complete.ts");
 assert.ok(complete.includes("vmv_ai_catalog_items"));
 assert.ok(complete.includes("vmv_ai_booking_services"));
 assert.ok(complete.includes("productIds"));
 assert.ok(complete.includes('data.services_mode==="now"'));
 assert.ok(complete.includes('data.products_mode==="now"'));
 assert.ok(complete.includes('data.inventory_connections'));
 assert.ok(complete.includes('contactNumber(data.user_phone'));
 assert.ok(!complete.includes('contactNumber(data.call_number'));
});
