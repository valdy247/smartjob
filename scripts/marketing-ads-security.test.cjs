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
