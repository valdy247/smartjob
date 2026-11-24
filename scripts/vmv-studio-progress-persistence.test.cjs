const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");
const helper=fs.readFileSync("lib/vmv-studio-progress-persistence.ts","utf8");
const compiled=ts.transpileModule(helper,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const moduleObj={exports:{}};
vm.runInNewContext(compiled,{module:moduleObj,exports:moduleObj.exports},{timeout:3000});
const {studioJobKey,validStudioJobId,isStudioJobRestorable,studioStageForJob}=moduleObj.exports;
const ownerA="9e9c68f8-8f05-4d60-b8ab-387a5d8011af";
const ownerB="5045869d-168d-4e90-ab80-7d0db42656a8";
const jobId="07a3228d-3c6d-4a69-b4e6-1afdd350714b";

test("mobile progress reference is isolated by account and stores only a job ID",()=>{
 assert.notEqual(studioJobKey(ownerA),studioJobKey(ownerB));
 assert.match(studioJobKey(ownerA),/vmv-video-studio-current-job-v1:/);
 assert.equal(studioJobKey(""),null);
 assert.equal(studioJobKey("not-an-owner"),null);
 assert.equal(validStudioJobId(jobId),true);
 assert.equal(validStudioJobId("https://example.org/?token=123"),false);
 assert.equal(validStudioJobId("../etc/passwd"),false);
});
test("ongoing, image-review, completed, and failed projects can be restored",()=>{
 for(const status of ["queued_images","generating_images","awaiting_image_approval",
  "queued_animation","animating","assembling","verifying","completed","failed"]){
  assert.equal(isStudioJobRestorable(status),true,status);
 }
 assert.equal(isStudioJobRestorable("cancelled"),false);
 assert.equal(isStudioJobRestorable("not-found"),false);
 assert.equal(studioStageForJob({id:jobId,status:"animating"}),"progress");
 assert.equal(studioStageForJob({id:jobId,status:"failed"}),"progress");
 assert.equal(studioStageForJob({id:jobId,status:"completed"}),"result");
 assert.equal(studioStageForJob({id:jobId,status:"awaiting_image_approval",scenes:[
  {requiresReview:true},{requiresReview:false}
 ]}),"images");
 assert.equal(studioStageForJob({id:jobId,status:"awaiting_image_approval",scenes:[
  {requiresReview:false},{requiresReview:false}
 ]}),"progress");
});
test("restoration always reads the owner-protected server, not cached video data",()=>{
 const ui=fs.readFileSync("app/vista-app/video-studio/page.tsx","utf8");
 const api=fs.readFileSync("app/api/video-studio/jobs/route.ts","utf8");
 assert.match(ui,/window\.localStorage\.setItem\(key,id\)/);
 assert.match(ui,/window\.localStorage\.getItem\(key\)/);
 assert.match(ui,/activeOwnerRef\.current=session\?\.user\.id/);
 assert.match(ui,/api\("jobs\?id="\+encodeURIComponent\(id\)\)/);
 assert.match(ui,/api\("jobs"\)/);
 assert.match(ui,/setStage\(studioStageForJob\(restored\)\)/);
 assert.match(api,/\.eq\("id",id\)\.eq\("owner_id",owner\)/);
 assert.match(ui,/if\(!alive\|\|stageRef\.current!=="home"\|\|!restored\)return/);
});
test("foreground and bfcache return immediately refresh true server status",()=>{
 const ui=fs.readFileSync("app/vista-app/video-studio/page.tsx","utf8");
 const poll=ui.slice(ui.indexOf("  useEffect(()=>{if(![\"progress\""),
  ui.indexOf(" const next=(s:Stage)=>"));
 assert.match(poll,/document\.addEventListener\("visibilitychange",onWake\)/);
 assert.match(poll,/window\.addEventListener\("pageshow",onWake\)/);
 assert.match(poll,/window\.addEventListener\("focus",onWake\)/);
 assert.match(poll,/const onWake=\(\)=>\{if\(document\.visibilityState==="visible"\)void check\(\);\}/);
 assert.match(poll,/setJob\(data\.job\)/);
 assert.match(poll,/clearInterval\(timer\)/);
});
test("restoration never automatically creates or resumes a paid job",()=>{
 const ui=fs.readFileSync("app/vista-app/video-studio/page.tsx","utf8");
 const restoration=ui.slice(ui.indexOf("  // On iOS Safari"),ui.indexOf(" const loadHistory=useCallback("));
 assert.doesNotMatch(restoration,/method="POST"|api\("jobs","POST"|action:"resume"|action:"approve_all"/);
 assert.match(ui,/Puedes minimizar el navegador o bloquear tu móvil/);
 assert.match(ui,/const next=\(s:Stage\)=>\{\s*if\(s==="history"\|\|s==="home"\)clearRememberedJob\(\)/);
});
