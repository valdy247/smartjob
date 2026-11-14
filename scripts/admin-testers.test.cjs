const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");

const root=path.resolve(__dirname,"..");
const source=fs.readFileSync(path.join(root,"lib/vmv-testers.ts"),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
const mod={exports:{}};
new Function("module","exports","require",compiled.outputText)(mod,mod.exports,require);
const lib=mod.exports;
const fixed={projectId:"prj_yeVaibe69wH77tUM2ZXphTHjzwfx",teamId:"team_8nteHLnX79fizQnfvEnSL4su",
 branch:"feat/vmv-smart-call-control-center"};
const oldFetch=global.fetch;
const envNames=["VERCEL_API_TOKEN","RESEND_API_KEY","VMV_TESTER_FROM_EMAIL","VMV_TESTER_FROM_VERIFIED",
 "VMV_TESTER_SMS_ENABLED","TWILIO_ACCOUNT_SID","TWILIO_AUTH_TOKEN","TWILIO_TESTER_SMS_FROM","TWILIO_MESSAGING_SERVICE_SID"];
const oldEnv=Object.fromEntries(envNames.map(k=>[k,process.env[k]]));
function restore(){
 global.fetch=oldFetch;
 for(const name of envNames){if(oldEnv[name]===undefined)delete process.env[name];else process.env[name]=oldEnv[name];}
}
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
const mk=(sha,state,created=1000,extra={})=>({
 id:"dpl_"+sha.slice(0,18),name:"smartjob",url:"smartjob-"+sha.slice(0,9)+".vercel.app",
 target:null,created,readyState:state,projectId:fixed.projectId,
 meta:{githubCommitRef:fixed.branch,githubCommitSha:sha,githubCommitMessage:"QA "+state,
  githubRepo:"smartjob",githubOrg:"valdy247"},...extra
});
const sha=(letter)=>letter.repeat(40);
function mockVercel(items,projectOverride={},detailsOverride=null){
 process.env.VERCEL_API_TOKEN="mock-token-only";
 const seen=[];
 global.fetch=async(input)=>{
  const u=new URL(String(input));seen.push(u);
  if(u.pathname.startsWith("/v9/projects/")){
   assert.equal(u.searchParams.get("teamId"),fixed.teamId);
   return response({id:fixed.projectId,name:"smartjob",accountId:fixed.teamId,
    passwordProtection:{enabled:false},ssoProtection:{enabled:false},trustedIps:{enabled:false},...projectOverride});
  }
  if(u.pathname==="/v7/deployments"){
   assert.equal(u.searchParams.get("projectId"),fixed.projectId);
   assert.equal(u.searchParams.get("branch"),fixed.branch);
   assert.equal(u.searchParams.get("teamId"),fixed.teamId);
   return response({deployments:items});
  }
  if(u.pathname.startsWith("/v13/deployments/"))return response(detailsOverride||items.find(x=>x.id===u.pathname.split("/").at(-1)));
  throw Error("Unexpected Vercel call "+u.href);
 };
 return seen;
}
test("only READY previews from exact project and branch are selected; newer build is shown separately",async()=>{
 try{
  const ready=mk(sha("a"),"READY",1000),building=mk(sha("b"),"BUILDING",1100),
   failed=mk(sha("c"),"ERROR",1200),other=mk(sha("d"),"READY",2000,
    {meta:{...ready.meta,githubCommitRef:"main",githubCommitSha:sha("d")}}),
   prod=mk(sha("e"),"READY",2100,{target:"production"});
  mockVercel([prod,other,failed,building,ready]);
  const data=await lib.getLatestTesterPreview();
  assert.equal(data.ready.id,ready.id);
  assert.equal(data.building.id,building.id);
  assert.equal(data.protected,false);
 }finally{restore();}
});
test("no READY branch preview is not substituted with ERROR or BUILDING",async()=>{
 try{
  mockVercel([mk(sha("c"),"ERROR",1300),mk(sha("b"),"BUILDING",1200)]);
  const data=await lib.getLatestTesterPreview();
  assert.equal(data.ready,null);
  assert.equal(data.building?.state,"BUILDING");
 }finally{restore();}
});
test("pinned earlier READY deployment can be verified after a newer READY deploy",async()=>{
 try{
  const old=mk(sha("a"),"READY",1000),newer=mk(sha("b"),"READY",3000);
  mockVercel([newer,old],{},old);
  const checked=await lib.verifyTesterDeployment(old.id);
  assert.equal(checked.deployment.url,"https://"+old.url+"/");
  assert.equal(checked.deployment.sha,old.meta.githubCommitSha);
  assert.equal(checked.preview.ready.id,newer.id);
 }finally{restore();}
});
test("password-protected previews cannot be dispatched",async()=>{
 try{
  const ready=mk(sha("a"),"READY",1000);
  mockVercel([ready],{passwordProtection:{enabled:true}},ready);
  const preview=await lib.getLatestTesterPreview();
  assert.equal(preview.protected,true);
  await assert.rejects(()=>lib.verifyTesterDeployment(ready.id),/DEPLOYMENT_NOT_SENDABLE/);
 }finally{restore();}
});
test("email delivery uses one recipient, fixed message and provider idempotency key, no network",async()=>{
 try{
  process.env.RESEND_API_KEY="mock";process.env.VMV_TESTER_FROM_EMAIL="verified@example.com";process.env.VMV_TESTER_FROM_VERIFIED="true";
  let calls=0;
  global.fetch=async(url,options)=>{
   assert.equal(String(url),"https://api.resend.com/emails");
   assert.equal(options.headers["Idempotency-Key"],"vmv-tester-"+sha("a"));
   const data=JSON.parse(options.body);assert.deepEqual(data.to,["tester@example.com"]);
   assert.ok(data.text.includes("https://smartjob-abc.vercel.app"));
   assert.ok(data.html.includes("Abrir versión de prueba"));
   calls++;return response({id:"mock-email-id"});
  };
  const d={id:"dpl_mock",url:"https://smartjob-abc.vercel.app",sha:sha("c"),message:"QA",state:"READY",createdAt:1000};
  const sent=await lib.sendTesterPreview({id:"mock-delivery",name:"QA",channel:"email",address:"tester@example.com"},d,sha("a"));
  assert.equal(calls,1);assert.equal(sent.state,"accepted");assert.equal(sent.providerId,"mock-email-id");
 }finally{restore();}
});
test("SMS requires explicit enabled sender and includes opt-out information",async()=>{
 try{
  process.env.VMV_TESTER_SMS_ENABLED="true";process.env.TWILIO_ACCOUNT_SID="ACmock123";
  process.env.TWILIO_AUTH_TOKEN="mock";process.env.TWILIO_TESTER_SMS_FROM="+12025550111";
  let calls=0;
  global.fetch=async(url,options)=>{
   assert.match(String(url),/api.twilio.com\/2010-04-01/);
   const form=new URLSearchParams(options.body);
   assert.equal(form.get("To"),"+12025550222");
   assert.equal(form.get("From"),"+12025550111");
   assert.match(form.get("Body"),/STOP/);
   calls++;return response({sid:"SMmock"});
  };
  const d={id:"dpl_mock",url:"https://smartjob-abc.vercel.app",sha:sha("c"),message:"QA",state:"READY",createdAt:1000};
  const sent=await lib.sendTesterPreview({id:"mock-delivery",name:"QA",channel:"sms",address:"+12025550222"},d,sha("a"));
  assert.equal(calls,1);assert.equal(sent.state,"accepted");assert.equal(sent.providerId,"SMmock");
 }finally{restore();}
});
test("SQL and API enforce admin-only, durability, rate limits and signed webhooks",()=>{
 const sql=fs.readFileSync(path.join(root,"supabase/sql/vmv_admin_testers.sql"),"utf8");
 const api=fs.readFileSync(path.join(root,"app/api/admin/testers/route.ts"),"utf8");
 const webhook=fs.readFileSync(path.join(root,"lib/vmv-tester-webhooks.ts"),"utf8");
 assert.match(sql,/role='admin'/);
 assert.match(sql,/p_request_key|request_key uuid/);
 assert.match(sql,/send_rate_limited/);
 assert.match(sql,/tester-deployment:/);
 assert.match(sql,/('pending','processing','accepted','delivered','unknown','failed')/);
 assert.match(api,/if\(access\.error\|\|access\.data\?\.role!=="admin"\)/);
 assert.match(api,/action==="resume"/);
 assert.match(webhook,/timingSafeEqual/);
 assert.match(webhook,/svix-signature/);
 assert.match(webhook,/x-twilio-signature/);
});
