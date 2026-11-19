const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const {NextRequest}=require("next/server");

const routePath=path.resolve("app/api/marketing/ads/generate/route.ts");
const source=fs.readFileSync(routePath,"utf8");
const payload={business:"Mayuli Bakery",offer:"Pasteles personalizados para cumpleaños",
 audience:"Personas que organizan celebraciones",city:"Columbus, Georgia",
 benefit:"Diseños personalizados",locale:"es",goal:"website"};
const responseText=JSON.stringify({
 headline:"Pasteles personalizados para tu celebración",
 message:"Celebra un cumpleaños con un pastel personalizado. Conoce los diseños que podemos preparar y consulta los detalles en nuestra web."
});
function load({user="test-user",available=true,reply=responseText,throwProvider=false}={}){
 const output=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
 }}).outputText;
 const calls=[];
 const requirements={module:{exports:{}},require:(name)=>{
  if(name==="next/server")return require("next/server");
  if(name==="@/lib/auth-server")return {authenticatedUser:async()=>user};
  if(name==="@/lib/vmv-marketing-ads-meta")return {noCache:{"Cache-Control":"no-store"}};
  if(name==="@/lib/vmv-ai-agents/model")return {
   aiAgentModelPathAvailable:()=>available,
   askAiAgent:async args=>{calls.push(args);if(throwProvider)throw Error("provider_unavailable");return reply;}
  };
  throw Error("Unexpected import: "+name);
 }};
 new Function("module","exports","require",output)(
  requirements.module,requirements.module.exports,requirements.require
 );
 return {POST:requirements.module.exports.POST,calls};
}
const request=(angle)=>new NextRequest("https://vmv.example/api/marketing/ads/generate",{
 method:"POST",headers:{"Content-Type":"application/json"},
 body:JSON.stringify({...payload,angle})
});
test("reject generation without one of the three approved creative angles",async()=>{
 const {POST,calls}=load();
 for(const angle of [undefined,"unknown","__proto__",0]){
  const res=await POST(request(angle));
  assert.equal(res.status,400);
  assert.equal((await res.json()).error,"select_ad_angle");
 }
 assert.equal(calls.length,0);
});
test("single angle generates only one ad with verified details",async()=>{
 const expected={
  offer:"Lead with the customer's verified product",
  local:"Emphasize the verified service city",
  value:"Highlight the customer's explicitly supplied benefit"
 };
 for(const angle of ["offer","local","value"]){
  const {POST,calls}=load();
  const res=await POST(request(angle));
  assert.equal(res.status,200);
  assert.equal(res.headers.get("Cache-Control"),"no-store");
  const data=await res.json();
  assert.equal(data.angle,angle);
  assert.equal(data.variant.headline,"Pasteles personalizados para tu celebración");
  assert.equal(data.variant.message.startsWith("Celebra"),true);
  assert.equal("variants" in data,false);
  assert.equal("recommendation" in data,false);
  assert.equal(calls.length,1);
  assert.match(calls[0].system,/Generate only ONE ad/);
  assert.match(calls[0].system,/Do not invent reviews, prices/);
  assert.ok(calls[0].messages[0].content.includes(expected[angle]));
  assert.ok(calls[0].messages[0].content.includes(payload.offer));
 }
});
test("guest and unavailable AI do not create an ad",async()=>{
 const guest=load({user:null});
 assert.equal((await guest.POST(request("offer"))).status,401);
 assert.equal(guest.calls.length,0);
 const disabled=load({available:false});
 assert.equal((await disabled.POST(request("local"))).status,503);
 assert.equal(disabled.calls.length,0);
});
test("provider errors are reported, never replaced with generic copy",async()=>{
 const {POST}=load({throwProvider:true});
 const res=await POST(request("value"));
 assert.equal(res.status,503);
 assert.equal("variant" in await res.json(),false);
});
test("incomplete generated ad is rejected",async()=>{
 const {POST}=load({reply:JSON.stringify({headline:"ok",message:"too short"})});
 assert.equal((await POST(request("offer"))).status,503);
});
test("Ads Studio offers three short modal options before generation",()=>{
 const ui=fs.readFileSync(path.resolve("app/vista-app/marketing/ads/AdsStudio.tsx"),"utf8");
 assert.match(ui,/role="dialog" aria-modal="true"/);
 assert.match(ui,/onClick=\{\(\)=>setConceptDialogOpen\(true\)\}/);
 for(const id of ["offer","local","value"])assert.ok(ui.includes('id:"'+id+'"'));
 assert.match(ui,/onClick=\{\(\)=>generate\(item\.id\)\}/);
 assert.match(ui,/response\.variant\.headline/);
 assert.equal(ui.includes("plan.variants.map"),false);
 assert.equal(ui.includes("plan.recommendation"),false);
 assert.equal(ui.includes("plan.measurement"),false);
 assert.ok(ui.includes('setDraftId("");setDraftKey(crypto.randomUUID());'));
});
