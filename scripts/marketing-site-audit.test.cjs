const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
const {NextRequest}=require("next/server");
const routePath="../app/api/marketing/site-audit/route.ts";
const before={url:process.env.NEXT_PUBLIC_SUPABASE_URL,publishable:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,pagespeed:process.env.GOOGLE_PAGESPEED_API_KEY};
process.env.NEXT_PUBLIC_SUPABASE_URL="https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="test-only-publishable";
process.env.GOOGLE_PAGESPEED_API_KEY="test-only-pagespeed";
const fixture=({owner="test-owner",anonymous=false}={})=>{
 const calls={getUser:0};
 const source=fs.readFileSync(require.resolve(routePath),"utf8");
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const mod={exports:{}};
 const resolve=name=>{
  if(name==="@supabase/supabase-js")return {createClient:()=>({auth:{getUser:async token=>{
   calls.getUser++;assert.equal(token,"valid-test-token");
   return {data:{user:owner?{id:owner,is_anonymous:anonymous}:null},error:null};
  }}})};
  return require(name);
 };
 new Function("module","exports","require",js)(mod,mod.exports,resolve);
 return {api:mod.exports,calls};
};
const request=(url="https://www.example.com",{token=true}={})=>new NextRequest("https://vmv.example/api/marketing/site-audit?url="+encodeURIComponent(url)+"&lang=es",{
 headers:token?{Authorization:"Bearer valid-test-token"}:{}
});
test("public access cannot spend Google PageSpeed quota",async()=>{
 const original=global.fetch;
 global.fetch=async()=>{throw Error("should never fetch Google")};
 try{
  const {api,calls}=fixture();
  assert.equal((await api.GET(request(undefined,{token:false}))).status,401);
  assert.equal(calls.getUser,0);
 }finally{global.fetch=original;}
});
test("invalid or anonymous sessions cannot scan any website",async()=>{
 for(const options of [{owner:null},{owner:"test-owner",anonymous:true}]){
  const {api}=fixture(options);
  assert.equal((await api.GET(request())).status,401);
 }
});
test("authenticated scans still reject private or malformed targets",async()=>{
 const original=global.fetch;
 global.fetch=async()=>{throw Error("should not invoke Google")};
 try{
  const {api}=fixture();
  for(const host of ["http://localhost","http://127.0.0.1","http://192.168.1.3","file:///etc/passwd","https://example.local"]){
   const response=await api.GET(request(host));
   assert.equal(response.status,400,host);
  }
 }finally{global.fetch=original;}
});
test("valid audited public website returns measured PageSpeed evidence only",async()=>{
 let called=0;const original=global.fetch;
 global.fetch=async(target)=>{
  called++;
  assert.match(String(target),/^https:\/\/www\.googleapis\.com\/pagespeedonline\/v5\/runPagespeed/);
  const u=new URL(String(target));
  assert.equal(u.searchParams.get("url"),"https://www.example.com/");
  return new Response(JSON.stringify({lighthouseResult:{
   categories:{performance:{score:.8},seo:{score:.9},accessibility:{score:.95}},
   audits:{"meta-description":{title:"Missing meta description",description:"A meta description helps discovery.",score:.25,scoreDisplayMode:"numeric"}}
  }}),{status:200});
 };
 try{
  const {api,calls}=fixture();
  const response=await api.GET(request());
  assert.equal(response.status,200);
  const json=await response.json();
  assert.equal(json.source,"Google PageSpeed Insights API");
  assert.equal(json.scores.performance,80);
  assert.ok(json.findings.some(x=>x.id==="meta-description"));
  assert.equal(calls.getUser,1);assert.equal(called,1);
 }finally{global.fetch=original;}
});
test("Google quota and upstream errors are not misrepresented as successful scans",async()=>{
 const original=global.fetch;
 try{
  global.fetch=async()=>new Response("quota exhausted",{status:429});
  const response=await fixture().api.GET(request());
  assert.equal(response.status,429);
  assert.ok((await response.json()).error);
  global.fetch=async()=>new Response("error",{status:500});
  assert.equal((await fixture().api.GET(request())).status,502);
 }finally{global.fetch=original;}
});
test.after(()=>{
 const props={NEXT_PUBLIC_SUPABASE_URL:before.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:before.publishable,GOOGLE_PAGESPEED_API_KEY:before.pagespeed};
 for(const [key,value] of Object.entries(props)){
  if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
