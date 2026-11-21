const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const vm=require("node:vm");
const file=fs.readFileSync(path.resolve("lib/vmv-marketing-ads-meta.ts"),"utf8");
const js=ts.transpileModule(file,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true
}}).outputText;
function moduleWithEnv(env){
 const exports={};const module={exports};
 const current={...process.env,...env};
 const sandbox={module,exports,Buffer,URL,URLSearchParams,AbortSignal,fetch,console,
  process:{env:current},require:(name)=>{
   if(name==="node:crypto")return require("node:crypto");
   if(name==="@/lib/vmv-billing")return {billingAdmin:()=>null};
   throw Error("unexpected import "+name);
  }};
 vm.runInNewContext(js,sandbox,{filename:"vmv-marketing-ads-meta.js"});
 return module.exports;
}
test("OAuth cannot run in production even with complete credentials",()=>{
 const api=moduleWithEnv({VERCEL_ENV:"production",VMV_ADS_META_PILOT_ENABLED:"true",
  META_APP_ID:"123456789012345",META_APP_SECRET:"x".repeat(20),
  VMV_ADS_TOKEN_KEY:"a".repeat(64),
  VMV_ADS_PUBLIC_ORIGIN:"https://smartjob-abc.vercel.app"});
 assert.equal(api.adsMetaReady(),false);
});
test("OAuth requires Meta app credentials and an explicit HTTPS origin",()=>{
 const api=moduleWithEnv({VERCEL_ENV:"preview",VMV_ADS_META_PILOT_ENABLED:"true",
  META_APP_ID:"",META_APP_SECRET:"",VMV_ADS_TOKEN_KEY:"a".repeat(64),
  VMV_ADS_PUBLIC_ORIGIN:"https://smartjob-abc.vercel.app"});
 assert.equal(api.adsMetaReady(),false);
 assert.equal(moduleWithEnv({VMV_ADS_PUBLIC_ORIGIN:"http://localhost:3000"}).adsOrigin(),null);
 assert.equal(moduleWithEnv({VMV_ADS_PUBLIC_ORIGIN:"https://example.net"}).adsOrigin(),null);
 assert.equal(moduleWithEnv({VMV_ADS_PUBLIC_ORIGIN:"https://abc.vercel.app"}).adsOrigin(),"https://abc.vercel.app");
});
test("AES-256-GCM token encryption is random and authenticated",()=>{
 const api=moduleWithEnv({VMV_ADS_TOKEN_KEY:"f".repeat(64)});
 const token="TEST_META_ACCESS_TOKEN_DO_NOT_STORE_PLAINTEXT";
 const first=api.encryptMetaToken(token),second=api.encryptMetaToken(token);
 assert.notEqual(first,second);
 assert.equal(api.decryptMetaToken(first),token);
 const tampered=first.slice(0,-3)+(first.endsWith("ABC")?"XYZ":"ABC");
 assert.throws(()=>api.decryptMetaToken(tampered));
});
test("OAuth states are unpredictable and hashed",()=>{
 const api=moduleWithEnv({});
 const a=api.newState(),b=api.newState();
 assert.match(a,/^[A-Za-z0-9_-]{40,60}$/);
 assert.notEqual(a,b);
 assert.equal(api.stateHash(a).length,64);
 assert.notEqual(api.stateHash(a),api.stateHash(b));
});
test("Destination URLs are HTTPS and cannot be localhost or IP addresses",()=>{
 const api=moduleWithEnv({});
 for(const url of ["http://example.com","https://localhost/","https://127.0.0.1/",
  "https://user:password@example.com","file:///etc/passwd","javascript:alert(1)"])
  assert.equal(api.validDestination(url),null,url);
 assert.equal(api.validDestination("https://example.com/offer"),"https://example.com/offer");
});
test("Provider identifiers are constrained to numeric Meta IDs",()=>{
 const api=moduleWithEnv({});
 assert.equal(api.metaId("12345678901"),true);
 assert.equal(api.metaId("act_123456789"),false);
 assert.equal(api.metaId("../../oauth"),false);
});
test("No active ad spend is available without manual publish enablement",()=>{
 const route=fs.readFileSync(path.resolve("app/api/marketing/ads/meta/campaigns/route.ts"),"utf8");
 assert.match(route,/process\.env\.VMV_ADS_META_PUBLISH_ENABLED!=="true"/);
 assert.match(route,/process\.env\.VMV_ADS_META_ALLOWED_OWNER_ID!==owner/);
 assert.match(route,/input\?\.confirmationText!=="PUBLICAR"/);
 assert.match(route,/status:"PAUSED"/);
 assert.match(route,/status:"draft"/);
});


test("Creative payload uses supported Instagram user identity and has one consistent image-link spec",()=>{
 const api=moduleWithEnv({});
 const base={name:"Pasteles",pageId:"1234567890",placements:"facebook",
  instagramId:null,destination:"https://example.com",message:"Pasteles de cumpleaños",
  headline:"Conoce nuestros pasteles",imageHash:"a".repeat(32)};
 const story=JSON.parse(api.metaLinkCreativeFields(base).object_story_spec);
 assert.equal(story.page_id,base.pageId);
 assert.equal(story.link_data.image_hash,base.imageHash);
 assert.equal(story.link_data.call_to_action.value.link,base.destination);
 assert.equal("instagram_actor_id" in story,false);
 const ig=JSON.parse(api.metaLinkCreativeFields({...base,placements:"facebook_instagram",instagramId:"1234567890"}).object_story_spec);
 assert.equal(ig.instagram_user_id,"1234567890");
 assert.equal("instagram_actor_id" in ig,false);
});
test("Creative preflight uses Meta validate_only, without creating a creative or an ad",async()=>{
 const api=moduleWithEnv({});
 const fake=api.metaLinkCreativeFields;
 const base={name:"Test",pageId:"1234567890",placements:"facebook",
  instagramId:null,destination:"https://example.com",message:"Original copy",
  headline:"An informative headline",imageHash:"a".repeat(32)};
 const originalFetch=global.fetch, calls=[];
 try{
  global.fetch=async(url,options)=>{
   calls.push({url:String(url),options});
   return new Response(JSON.stringify({success:true}),{status:200,headers:{"Content-Type":"application/json"}});
  };
  // The module captures fetch in its test sandbox, so the source contract below verifies the safe flag.
  const code=fs.readFileSync(path.resolve("lib/vmv-marketing-ads-meta.ts"),"utf8");
  assert.match(code,/execution_options:JSON\.stringify\(\["validate_only"\]\)/);
  const check=fs.readFileSync(path.resolve("app/api/marketing/ads/meta/creative-check/route.ts"),"utf8");
  assert.match(check,/validateMetaLinkCreative/);
  assert.equal(check.includes('operation:"create_paused"'),false);
  assert.match(check,/createdInMeta:false/);
  const route=fs.readFileSync(path.resolve("app/api/marketing/ads/meta/campaigns/route.ts"),"utf8");
  assert.ok(route.indexOf("await validateMetaLinkCreative(selectedAccount")<route.indexOf('const {data:claimed,error:claimError}'));
  assert.ok(route.indexOf('const creative=await metaPost(selectedAccount+"/adcreatives"')<route.indexOf('const campaign=await metaPost(selectedAccount+"/campaigns"'));
 }finally{global.fetch=originalFetch;}
});
test("Creative error subcodes are distinguished, rather than treating all 100s as the same",()=>{
 const api=moduleWithEnv({});
 assert.equal(api.metaCreativeReason(new api.MetaApiError("meta_api_100",400,1885183)),"meta_app_in_development_mode");
 assert.equal(api.metaCreativeReason(new api.MetaApiError("meta_api_100",400,2238281)),"meta_instagram_identity_deprecated");
 assert.equal(api.metaCreativeReason(new api.MetaApiError("meta_api_100",400,1487124)),"meta_creative_image_not_found");
 assert.equal(api.metaCreativeReason(new api.MetaApiError("meta_api_100",400,null)),"meta_creative_parameters_rejected");
});


test("Agent ad wizard preserves Meta preflight rejection details and keeps user spending disabled",()=>{
 const route=fs.readFileSync(path.resolve("app/api/marketing/ads/meta/campaigns/route.ts"),"utf8");
 const wizard=fs.readFileSync(path.resolve("app/vista-app/ai-agents/AutomaticAdWizard.tsx"),"utf8");
 const history=fs.readFileSync(path.resolve("app/vista-app/marketing/ads/AdsStudio.tsx"),"utf8");
 const creativeCheck=fs.readFileSync(path.resolve("app/api/marketing/ads/meta/creative-check/route.ts"),"utf8");
 for(const [name,src,kind] of [
  ["campaigns/route.ts",route,ts.ScriptKind.TS],
  ["AutomaticAdWizard.tsx",wizard,ts.ScriptKind.TSX],
  ["AdsStudio.tsx",history,ts.ScriptKind.TSX]
 ]){
  const parsed=ts.createSourceFile(name,src,ts.ScriptTarget.Latest,true,kind);
  assert.deepEqual(parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText," ")),[],name);
 }
 assert.match(route,/diagnostic\("preflight",metaCode,subcode\)/);
 assert.match(route,/console\.warn\("\[vmv-meta-ads\] paused creation blocked"/);
 assert.match(route,/\.update\(\{error_code:value,updated_at:new Date\(\)\.toISOString\(\)\}\)/);
 assert.match(route,/\.eq\("owner_id",owner\)\.eq\("status","draft"\)/);
 assert.match(route,/createdInMeta:false,adSpendActive:false/);
 assert.match(route,/metaMessage:error.providerMessage/);
 assert.match(wizard,/Borrador guardado\. /);
 assert.match(wizard,/Meta rechazó los parámetros del anuncio/);
 assert.match(wizard,/Referencia VMV: /);
 assert.doesNotMatch(wizard,/El borrador se guardó, pero Meta no confirmó la campaña pausada/);
 assert.match(history,/Comprobar con Meta · sin publicar/);
 assert.match(history,/c\.status==="draft"\?<button type="button"/);
 assert.match(history,/creativeChecks\[c\.id\]\.metaMessage/);
 assert.match(creativeCheck,/validateMetaLinkCreative/);
 assert.match(creativeCheck,/metaTrace:error.traceId/);
 assert.match(creativeCheck,/createdInMeta:false,adSpendActive:false/);
 assert.doesNotMatch(creativeCheck,/operation:"create_paused"/);
 assert.match(route,/process\.env\.VMV_ADS_META_PUBLISH_ENABLED!=="true"/);
});

test("Meta Graph errors retain sanitized owner-facing explanation and support trace",()=>{
 const code=fs.readFileSync(path.resolve("lib/vmv-marketing-ads-meta.ts"),"utf8");
 assert.match(code,/providerMessage:string\|null=null,public traceId:string\|null=null/);
 assert.match(code,/error_user_msg/);
 assert.match(code,/fbtrace_id/);
 assert.match(code,/access_token=\[redacted\]/);
 assert.match(code,/Bearer \[redacted\]/);
 assert.match(code,/\\.slice\(0,360\)/);
});
