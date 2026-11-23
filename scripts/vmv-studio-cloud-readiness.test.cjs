const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const source=read("lib/vmv-studio-cloud-readiness.ts");

function setup(env,fetcher){
 const transpiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const module={exports:{}};
 const context={
  module,exports:module.exports,process:{env},URL,AbortSignal,
  fetch:fetcher
 };
 vm.runInNewContext(transpiled,context,{timeout:2000});
 return module.exports;
}

test("No production or disabled preview launch reserves cloud jobs",async()=>{
 let requests=0;
 const fetcher=async()=>{requests++;return {status:200,text:async()=>"ready"}};
 for(const overrides of [
  {VERCEL_ENV:"production",VMV_STUDIO_GENERATION_ENABLED:"true",VMV_STUDIO_WORKER_READY:"true"},
  {VERCEL_ENV:"preview",VMV_STUDIO_GENERATION_ENABLED:"false",VMV_STUDIO_WORKER_READY:"true"},
  {VERCEL_ENV:"preview",VMV_STUDIO_GENERATION_ENABLED:"true",VMV_STUDIO_WORKER_READY:"false"}
 ]){
  const config={
   VMV_STUDIO_WORKER_READY_URL:"https://vmv-studio.onrender.com/readyz",...overrides
  };
  const cloud=setup(config,fetcher);
  assert.equal(cloud.cloudLaunchEnabled(),false);
  assert.equal(await cloud.videoStudioWorkerReady(),false);
 }
 assert.equal(requests,0);
});

test("Refuses untrusted worker URLs without connecting",async()=>{
 let requests=0;
 const fetcher=async()=>{requests++;return {status:200,text:async()=>"ready"}};
 for(const url of [
  "http://vmv-studio.onrender.com/readyz",
  "https://localhost/readyz",
  "https://vmv-studio.onrender.com.evil.invalid/readyz",
  "https://vmv-studio.onrender.com/private",
  "https://vmv-studio.onrender.com/readyz?debug=1",
  "https://someone:password@vmv-studio.onrender.com/readyz"
 ]){
  const cloud=setup({
   VERCEL_ENV:"preview",VMV_STUDIO_GENERATION_ENABLED:"true",
   VMV_STUDIO_WORKER_READY:"true",VMV_STUDIO_WORKER_READY_URL:url
  },fetcher);
  assert.equal(await cloud.videoStudioWorkerReady(),false,url);
 }
 assert.equal(requests,0);
});

test("Live readiness requires exact healthy worker response",async()=>{
 const env={VERCEL_ENV:"preview",VMV_STUDIO_GENERATION_ENABLED:"true",
  VMV_STUDIO_WORKER_READY:"true",VMV_STUDIO_WORKER_READY_URL:"https://vmv-studio.onrender.com/readyz"};
 let request;
 const cloud=setup(env,async(url,options)=>{
  request={url,options};return {status:200,text:async()=>"ready"};
 });
 assert.equal(await cloud.videoStudioWorkerReady(),true);
 assert.equal(request.url,"https://vmv-studio.onrender.com/readyz");
 assert.equal(request.options.redirect,"error");
 assert.equal(request.options.cache,"no-store");
 const offline=setup(env,async()=>({status:503,text:async()=>"standby"}));
 assert.equal(await offline.videoStudioWorkerReady(),false);
 const timeout=setup(env,async()=>{throw Error("timeout");});
 assert.equal(await timeout.videoStudioWorkerReady(),false);
});

test("Jobs check live worker before the first database credit reservation",()=>{
 const jobs=read("app/api/video-studio/jobs/route.ts");
 const worker=read("services/vmv-studio-worker/worker.mjs");
 const start=jobs.indexOf("export async function POST");
 const stage=jobs.slice(start,jobs.indexOf("export async function PATCH",start));
 assert.ok(stage.includes("if(!cloudLaunchEnabled())"));
 assert.ok(stage.includes("if(!await videoStudioWorkerReady()||!await videoStudioSemanticWorkerReady())"));
 assert.ok(stage.indexOf("videoStudioWorkerReady()")<stage.indexOf('db.rpc("vmv_studio_create_job"'));
 assert.match(stage,/video_studio_worker_not_ready/);
 assert.match(worker,/select\("id",\{head:true\}\)\.limit\(1\)/);
 assert.match(worker,/res\.writeHead\(enabled\?200:503/);
 assert.doesNotMatch(worker.slice(worker.indexOf("createServer("),worker.indexOf("const auth=")),/vmv_studio_claim/);
});

test("new jobs require the semantic-v2 worker protocol and reject an old worker",async()=>{
 const env={VERCEL_ENV:"preview",VMV_STUDIO_GENERATION_ENABLED:"true",
  VMV_STUDIO_WORKER_READY:"true",VMV_STUDIO_WORKER_READY_URL:"https://vmv-studio.onrender.com/readyz"};
 const cloud=setup(env,async url=>({
  status:200,text:async()=>url.endsWith("/semantic-readyz")?"semantic-v2":"ready"
 }));
 assert.equal(await cloud.videoStudioSemanticWorkerReady(),true);
 const legacy=setup(env,async()=>({status:404,text:async()=>"not found"}));
 assert.equal(await legacy.videoStudioSemanticWorkerReady(),false);
});
