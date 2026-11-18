const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
const {NextRequest}=require("next/server");

const BASE="https://vmv.example/api/marketing/social-captions/";
const route=(name,{user="user-test",allowed=true,transcript="Una pastelera decora un pastel."}={})=>{
 const source=fs.readFileSync(require.resolve("../app/api/marketing/social-captions/"+name+"/route.ts"),"utf8");
 const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const stats={creditCalls:0,transcriptionCalls:0};
 const fakeRequire=name=>{
  if(name==="@/lib/auth-server")return {
   authenticatedUser:async()=>user,
   consumeCredit:async()=>{stats.creditCalls++;return allowed;}
  };
  if(name==="ai")return {experimental_transcribe:async()=>{stats.transcriptionCalls++;return {text:transcript};}};
  if(name==="@ai-sdk/gateway")return {createGateway:()=>({transcriptionModel:()=>({})})};
  return require(name);
 };
 const mod={exports:{}};
 new Function("module","exports","require",output)(mod,mod.exports,fakeRequire);
 return {api:mod.exports,stats};
};
const jsonReq=(body)=>new NextRequest(BASE+"generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
const audioReq=(mime="audio/webm",size=1024)=>{
 const form=new FormData();
 form.append("audio",new Blob([new Uint8Array(size)],{type:mime}),mime.startsWith("video/")?"video.mp4":"speech.webm");
 return new NextRequest(BASE+"transcribe",{method:"POST",body:form});
};
const valid={network:"TikTok",transcript:"El negocio muestra cómo prepara sus productos cada mañana.",scene:"",locale:"es"};
const prev={
 direct:process.env.OPENAI_API_KEY,eleven:process.env.ELEVENLABS_API_KEY,
 gateway:process.env.AI_GATEWAY_API_KEY,oidc:process.env.VERCEL_OIDC_TOKEN
};
function withKeys({direct,eleven,gateway}={}){
 for(const key of ["OPENAI_API_KEY","ELEVENLABS_API_KEY","AI_GATEWAY_API_KEY","VERCEL_OIDC_TOKEN"])delete process.env[key];
 if(direct)process.env.OPENAI_API_KEY="unit-test-only";
 if(eleven)process.env.ELEVENLABS_API_KEY="unit-test-only";
 if(gateway)process.env.AI_GATEWAY_API_KEY="unit-test-only";
}
test("caption generation denies guests before spending credits",async()=>{
 withKeys({direct:true});
 const {api,stats}=route("generate",{user:null});
 assert.equal((await api.POST(jsonReq(valid))).status,401);
 assert.equal(stats.creditCalls,0);
});
test("caption generation rejects invalid platform, missing context and overlong payload before spending",async()=>{
 withKeys({direct:true});
 const {api,stats}=route("generate");
 for(const body of [{...valid,network:"MySpace"},{...valid,transcript:"",scene:""},{...valid,transcript:"x".repeat(6100)}]){
  assert.equal((await api.POST(jsonReq(body))).status,400);
 }
 assert.equal(stats.creditCalls,0);
});
test("caption generation requires configured AI and enforces quota",async()=>{
 withKeys();
 assert.equal((await route("generate").api.POST(jsonReq(valid))).status,503);
 withKeys({direct:true});
 const denied=route("generate",{allowed:false});
 assert.equal((await denied.api.POST(jsonReq(valid))).status,429);
 assert.equal(denied.stats.creditCalls,1);
});
test("caption generation returns real provider text, never posts content",async()=>{
 withKeys({direct:true});
 const original=global.fetch;
 let called=0;
 global.fetch=async(url,options)=>{
  called++;
  assert.match(String(url),/api.openai.com/);
  const request=JSON.parse(options.body);
  assert.equal(request.messages[1].content.includes("TikTok"),true);
  assert.equal(request.messages[1].content.includes(valid.transcript),true);
  assert.match(request.messages[0].content,/sin inventar|no inventar/i);
  return new Response(JSON.stringify({choices:[{message:{content:"Nuestro proceso artesanal, paso a paso. Conócenos. #Repostería #HechoAMano"}}]}),{status:200});
 };
 try{
  const {api,stats}=route("generate");
  const response=await api.POST(jsonReq(valid));
  assert.equal(response.status,200);
  assert.match((await response.json()).caption,/Repostería/);
  assert.equal(stats.creditCalls,1);assert.equal(called,1);
  assert.equal(response.headers.get("Cache-Control"),"no-store");
 }finally{global.fetch=original;}
});
test("caption provider errors fail visibly without invented caption",async()=>{
 withKeys({direct:true});
 const original=global.fetch;global.fetch=async()=>new Response("unavailable",{status:503});
 try{
  const res=await route("generate").api.POST(jsonReq(valid));
  assert.equal(res.status,502);
  assert.equal((await res.json()).caption,undefined);
 }finally{global.fetch=original;}
});
test("audio-only transcription denies guests",async()=>{
 withKeys({eleven:true});
 const {api,stats}=route("transcribe",{user:null});
 assert.equal((await api.POST(audioReq())).status,401);
 assert.equal(stats.creditCalls,0);
});
test("audio-only transcription rejects video bytes by content type without charging",async()=>{
 withKeys({eleven:true});
 const {api,stats}=route("transcribe");
 const response=await api.POST(audioReq("video/mp4"));
 assert.equal(response.status,400);
 assert.equal(stats.creditCalls,0);
});
test("audio transcription rejects invalid audio and requires provider",async()=>{
 withKeys({eleven:true});
 assert.equal((await route("transcribe").api.POST(audioReq("audio/webm",100))).status,400);
 withKeys();
 assert.equal((await route("transcribe").api.POST(audioReq())).status,503);
});
test("audio transcription enforces quota",async()=>{
 withKeys({eleven:true});
 const denied=route("transcribe",{allowed:false});
 assert.equal((await denied.api.POST(audioReq())).status,429);
 assert.equal(denied.stats.creditCalls,1);
});
test("audio transcription only forwards an audio blob and returns recognized speech",async()=>{
 withKeys({eleven:true});
 const original=global.fetch;let calls=0;
 global.fetch=async(url,options)=>{
  calls++;
  assert.match(String(url),/speech-to-text/);
  const upload=options.body.get("file");
  assert.ok(upload instanceof Blob);
  assert.match(upload.type,/audio/);
  assert.ok(upload.size>512);
  return new Response(JSON.stringify({text:"Nuestro pan sale fresco del horno.",language_code:"es"}),{status:200});
 };
 try{
  const {api,stats}=route("transcribe");
  const res=await api.POST(audioReq());
  assert.equal(res.status,200);
  assert.equal((await res.json()).text,"Nuestro pan sale fresco del horno.");
  assert.equal(calls,1);assert.equal(stats.creditCalls,1);
 }finally{global.fetch=original;}
});
test("transcription handles silence and provider failure accurately",async()=>{
 withKeys({eleven:true});
 const original=global.fetch;
 try{
  global.fetch=async()=>new Response(JSON.stringify({text:" "}),{status:200});
  assert.equal((await route("transcribe").api.POST(audioReq())).status,422);
  global.fetch=async()=>new Response("error",{status:500});
  assert.equal((await route("transcribe").api.POST(audioReq())).status,502);
 }finally{global.fetch=original;}
});
test.after(()=>{
 for(const [key,value] of Object.entries({OPENAI_API_KEY:prev.direct,ELEVENLABS_API_KEY:prev.eleven,AI_GATEWAY_API_KEY:prev.gateway,VERCEL_OIDC_TOKEN:prev.oidc})){
  if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
