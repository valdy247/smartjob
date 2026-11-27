const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");
const source=fs.readFileSync("lib/vmv-studio-manual.ts","utf8");
const code=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};
vm.runInNewContext(code,{module:m,exports:m.exports},{timeout:3000});
const x=m.exports;
const prompt="A person picks up a plate and walks across the room while the camera follows their movements.";

test("manual studio is a separate route, not a change to the existing auto-creation steps",()=>{
 const automatic=fs.readFileSync("app/vista-app/video-studio/page.tsx","utf8");
 const manual=fs.readFileSync("app/vista-app/video-studio/manual/page.tsx","utf8");
 assert.match(automatic,/href="\/vista-app\/video-studio\/manual"/);
 assert.match(automatic,/>Crear video</);
 assert.match(automatic,/>Historial</);
 assert.match(manual,/Editor de videos/);
 assert.doesNotMatch(manual,/plan\?mode=|Proponer idea|Generar propuesta|studioAuditIssues/);
 assert.match(manual,/Dirige cada escena/);
 assert.match(manual,/Crear video por/);
});
test("manual montage charges only montage and selected motion, not image or voice generation",()=>{
 assert.equal(x.manualPrice(["still","still","still"],"turbo"),2);
 assert.equal(x.manualPrice(["zoom","zoom","zoom"],"turbo"),5);
 assert.equal(x.manualPrice(["animate","zoom","still"],"turbo"),8);
 assert.equal(x.manualPrice(["animate","zoom","still"],"high"),16);
 assert.equal(x.manualPrice(["animate","animate","animate"],"turbo"),17);
 assert.equal(x.validManualStoryboard([{prompt,motion:"animate"},{prompt,motion:"zoom"},{prompt,motion:"still"}]),true);
 assert.equal(x.validManualStoryboard([{prompt,motion:"animate"}]),false);
 assert.equal(x.validManualStoryboard(Array.from({length:13},()=>({prompt,motion:"zoom"}))),false);
 assert.equal(x.validManualStoryboard([{prompt,motion:"surprise"},{prompt,motion:"zoom"},{prompt,motion:"still"}]),false);
});
test("server only accepts real small JPEG frames, resized to 720x1280",()=>{
 const bytes=new Uint8Array(1200);
 bytes.set([0xff,0xd8,0xff,0xc0,0,17,8,5,0,2,208,3,1,17,0,2,17,1,3,17,1],0);
 bytes.set([0xff,0xd9],bytes.length-2);
 assert.equal(x.readManualJpegDimensions(bytes).width,720);
 assert.equal(x.readManualJpegDimensions(bytes).height,1280);
 bytes[0]=0;
 assert.equal(x.readManualJpegDimensions(bytes),null);
 const upload=fs.readFileSync("app/api/video-studio/manual/upload/route.ts","utf8");
 assert.match(upload,/await authenticatedUser\(req\)/);
 assert.match(upload,/manualImagePath\(owner,id,index\)/);
 assert.match(upload,/dimensions\.width!==720\|\|dimensions\.height!==1280/);
 assert.match(upload,/if\(existing\)return respond\(\{error:"manual_project_already_started"\}/);
 assert.match(upload,/MAX_MANUAL_UPLOAD_BYTES/);
});
test("manual jobs verify private images and reserve credits atomically after user consent",()=>{
 const api=fs.readFileSync("app/api/video-studio/manual/jobs/route.ts","utf8");
 const sql=fs.readFileSync("supabase/migrations/20261125090000_vmv_studio_manual_video_jobs.sql","utf8");
 assert.match(api,/b\?\.confirmCost!==true/);
 assert.match(api,/expectedCredits!==credit/);
 assert.match(api,/\.storage\.from\("vmv-studio-assets"\)/);
 assert.match(api,/manualImagePath\(owner,b.projectId,i\)/);
 assert.match(api,/vmv_studio_create_manual_job/);
 assert.match(sql,/p_owner uuid,p_job uuid,p_key uuid/);
 assert.match(sql,/v_price integer:=2/);
 assert.match(sql,/v_n\*5/);
 assert.match(sql,/approved:true|coalesce\(v_scene->>'approved',''\)<>'true'/);
 assert.match(sql,/jsonb_typeof\(p_scenes\)<>'array'/);
 assert.match(sql,/source_platform/);
 assert.match(sql,/'manual'/);
 assert.match(sql,/'queued_animation'/);
 assert.match(sql,/balance-reserved into v_available/);
 assert.match(sql,/where owner_id=p_owner for update/);
 assert.match(sql,/revoke all on function public\.vmv_studio_create_manual_job/);
 assert.doesNotMatch(sql,/source_platform='idea'|regenerate_image/);
});
test("worker reuses user images, bypasses automatic storyboard, and can mix still/zoom/animation",()=>{
 const worker=fs.readFileSync("services/vmv-studio-worker/worker.mjs","utf8");
 const timeline=fs.readFileSync("services/vmv-studio-worker/speech-timeline.mjs","utf8");
 assert.match(worker,/job.assets\?\.manual_editor!==true\)await verifyScriptLanguage/);
 assert.match(worker,/manualTimeline\(scenes,duration\)/);
 assert.match(worker,/scenes\[i\]\.motion==="still"&&job.assets\?\.manual_editor===true/);
 assert.match(worker,/scenes\[i\]\.motion==="zoom"/);
 assert.match(worker,/await startMotionClip/);
 assert.match(worker,/typeof s.imagePath!=="string"/);
 assert.match(worker,/!s.imagePath.startsWith\(prefix\)/);
 assert.match(timeline,/export function manualTimeline/);
 assert.match(timeline,/duration!==scenes\.length\*5/);
 const es=source.length;
 assert.ok(es>500);
});
test("the manual studio can recover a cloud job after the iPhone closes Safari",()=>{
 const ui=fs.readFileSync("app/vista-app/video-studio/manual/page.tsx","utf8");
 assert.match(ui,/localStorage\.setItem\(jobKey\+owner/);
 assert.match(ui,/localStorage\.getItem\(jobKey\+user\.id\)/);
 assert.match(ui,/document\.addEventListener\("visibilitychange",onWake\)/);
 assert.match(ui,/window\.addEventListener\("pageshow",onWake\)/);
 assert.match(ui,/api\("jobs\?id="\+encodeURIComponent\(job.id\)\)/);
 assert.match(ui,/<video className=\{styles\.finalVideo\}/);
});

test("single image is explicit and does not relax multi-scene validation",()=>{
 assert.equal(x.validSingleImageStoryboard([{prompt:"Move",motion:"animate"}]),true);
 assert.equal(x.validSingleImageStoryboard([{prompt:"Move",motion:"zoom"}]),false);
 assert.equal(x.validManualStoryboard([{prompt,motion:"animate"}]),false);
 const api=fs.readFileSync("app/api/video-studio/manual/jobs/route.ts","utf8");
 assert.match(api,/videoStudioWorkerProbe\("none",true\)/);
 assert.match(api,/vmv_studio_create_single_image_job/);
});

test("single-image studio starts fresh after a terminal job and exposes a new video action",()=>{
 const ui=fs.readFileSync("app/vista-app/video-studio/manual/page.tsx","utf8");
 assert.match(ui,/\["completed","failed","cancelled"\]\.includes\(saved\.status\)/);
 assert.match(ui,/setJob\(saved\);setStep\("running"\)/);
 assert.match(ui,/if\(single\)\{shotsRef\.current\.forEach[\s\S]*?setShots\(\[\]\)/);
 assert.match(ui,/if\(owner\)window\.localStorage\.removeItem\(jobKey\+owner\)/);
 assert.match(ui,/onClick=\{restart\}><ImagePlus size=\{18\}\/> Crear nuevo video/);
});
