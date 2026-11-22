const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const ts=require("typescript");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const files=[
 "app/vista-app/vmv-pilot/page.tsx",
 "components/VMVPilotRenderDock.tsx",
 "app/api/video-generator/pilot-render/route.ts",
 "app/api/video-generator/pilot/route.ts",
 "app/api/video-generator/radar/route.ts",
 "app/vista-app/video-generator/ViralRadar.tsx"
];
const source=Object.fromEntries(files.map(p=>[p,read(p)]));
test("Video Pilot wizard and durable API parse TypeScript",()=>{
 for(const p of files){
  const parsed=ts.createSourceFile(p,source[p],ts.ScriptTarget.Latest,true,
   p.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(parsed.parseDiagnostics.map(e=>ts.flattenDiagnosticMessageText(e.messageText," ")),[],p);
 }
});
test("Worker has valid native Node JavaScript syntax",()=>{
 execFileSync(process.execPath,["--check",path.join(__dirname,"..","services/vmv-pilot-worker/worker.mjs")]);
});
test("Wizard supports niche, audience and goals outside business",()=>{
 const ui=source["app/vista-app/vmv-pilot/page.tsx"];
 for(const phrase of ["Curiosidades","Historia","Entretenimiento","Negocios","Niños","Adultos","Familias","Otro","Entretener","Enseñar","Inspirar","Promocionar","Generar video"])
  assert.ok(ui.includes(phrase),phrase);
 assert.match(ui,/setStep\(1\)/);
 assert.match(ui,/setStep\(3\)/);
 assert.match(ui,/Autorizo usar créditos/);
});
test("Clip worker actually uses image-to-video, five seconds and an MP4 compositor",()=>{
 const w=read("services/vmv-pilot-worker/worker.mjs");
 assert.match(w,/image_to_video/);
 assert.match(w,/model:"gen4\.5"/);
 assert.match(w,/duration:5/);
 assert.match(w,/ffmpeg/);
 assert.match(w,/subtitles=/);
 assert.match(w,/atempo=/);
 assert.match(w,/Math\.floor\(78\*\(i\+1\)\/scenes\.length\)/);
 assert.match(w,/STYLES|STYLE/);
 assert.match(w,/await persistAsset\(job,"clip_"\+i/);
});
test("Durable job requires per-video credit consent and enforces privacy and limits",()=>{
 const api=source["app/api/video-generator/pilot-render/route.ts"];
 const sql=read("supabase/sql/vmv_pilot_durable_renders_20261121.sql");
 assert.match(api,/confirmCost!==true/);
 assert.match(api,/process\.env\.VMV_PILOT_RENDER_ENABLED/);
 assert.match(api,/authenticatedUser\(req\)/);
 assert.match(api,/videoAllowed\(owner\)/);
 assert.match(api,/createSignedUrl/);
 assert.match(sql,/pilot_render_active_limit/);
 assert.match(sql,/pilot_render_daily_limit/);
 assert.match(sql,/lease_expires_at/);
 assert.match(sql,/FOR UPDATE SKIP LOCKED/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/one job per 24h/i);
});
test("Floating progress is server-reported and restores on reload",()=>{
 const dock=source["components/VMVPilotRenderDock.tsx"];
 assert.match(dock,/pilot-render/);
 assert.match(dock,/setInterval/);
 assert.match(dock,/refresh/);
 assert.match(dock,/job\?\.progress/);
 assert.match(dock,/vmv-pilot:generate/);
 assert.match(dock,/video controls playsInline/);
 assert.doesNotMatch(dock,/MediaRecorder|createImageBitmap|canvas\.captureStream/);
});
test("Search errors never hide failures behind an uninformative generic message",()=>{
 const client=source["app/vista-app/video-generator/ViralRadar.tsx"];
 assert.match(client,/login:/);
 assert.match(client,/radar_youtube_invalid:/);
 assert.doesNotMatch(client,/Couldn't research this topic\./);
});
test("Saving campaign alone cannot start a paid generation or publish content",()=>{
 const api=source["app/api/video-generator/pilot/route.ts"];
 assert.match(api,/status:"paused"/);
 assert.match(api,/next_run_at:null/);
 assert.doesNotMatch(api,/publishToSocial|startRunway|generateSpeech/);
});
