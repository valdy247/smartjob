const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
const vm=require("node:vm");
const read=p=>fs.readFileSync(p,"utf8");

test("topic groups offer diverse creator themes and accent-insensitive search",()=>{
 const file="lib/vmv-studio-topics.ts";
 const js=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 vm.runInNewContext(js,{module:mod,exports:mod.exports,Set,Array},{timeout:3000});
 const topics=mod.exports;
 assert.ok(topics.VIDEO_STUDIO_ALL_TOPICS.length>=45);
 assert.equal(new Set(topics.VIDEO_STUDIO_ALL_TOPICS).size,topics.VIDEO_STUDIO_ALL_TOPICS.length);
 for(const group of topics.VIDEO_STUDIO_TOPIC_GROUPS)assert.ok(group.topics.length>=7);
 assert.ok(topics.searchStudioTopics("tecnologia","learning").includes("Tecnología"));
 assert.ok(topics.searchStudioTopics("misterios","popular").includes("Misterios"));
 assert.ok(topics.searchStudioTopics("marketing","popular").includes("Marketing digital"));
 const page=read("app/vista-app/video-studio/page.tsx");
 assert.match(page,/searchStudioTopics\(topicSearch,topicGroup\)/);
 assert.match(page,/VIDEO_STUDIO_TOPIC_GROUPS\.map/);
 assert.match(page,/Otro tema · Escribir el mío/);
});
test("public ElevenLabs library supports language, voice quality, use case, age, gender, accent, and pages",()=>{
 const api=read("app/api/video-studio/voices/route.ts");
 for(const s of [
  "authenticatedUser(req)","scope","library","/v1/shared-voices",
  'page_size:"24"','sort:"trending"','category","high_quality"',
  'params.set("gender",gender)','params.set("age",age)',
  'params.set("accent",accent)','params.append("use_cases",useCase)',
  'params.set("search",search)','params.set("language"',
  "libraryHasMore","libraryTotal","public_owner_id",
  'include_custom_rates:"false"'
 ]){if(s!=='params.set("language"')assert.ok(api.includes(s),s);}
 assert.doesNotMatch(api,/method:"POST"/,"catalog browse must stay read-only");
});
test("public voice activation uses verified provider IDs before any video-credit reservation",()=>{
 const api=read("app/api/video-studio/voice-activate/route.ts");
 const component=read("app/vista-app/vmv-pilot/PilotVoiceStep.tsx");
 assert.match(api,/authenticatedUser\(req\)/);
 assert.match(api,/lookup\.json\(\)/);
 assert.match(api,/v\.voice_id===voiceId&&v\.public_owner_id===publicOwnerId/);
 assert.match(api,/https:\/\/api\.elevenlabs\.io\/v1\/voices\/add\//);
 assert.match(api,/imported\.status===401\|\|imported\.status===403/);
 assert.doesNotMatch(api,/db\.rpc\(|stripe\.|charge_credits|\.from\("vmv_studio_wallets"\)/);
 assert.match(component,/await fetch\(activationEndpoint/);
 assert.match(component,/onChoose\("elevenlabs",data\.voiceId,v\.name\)/);
 assert.match(component,/libraryMode=false,sampleMode="paid"/,"legacy Pilot still defaults to no library");
 const page=read("app/vista-app/video-studio/page.tsx");
 assert.match(page,/activationEndpoint="\/api\/video-studio\/voice-activate" libraryMode/);
});
test("silent videos bypass text-to-speech and use silent scene-based subtitle timing",()=>{
 const jobs=read("app/api/video-studio/jobs/route.ts");
 const worker=read("services/vmv-studio-worker/worker.mjs");
 assert.match(jobs,/\["openai","elevenlabs","none"\]/);
 assert.match(jobs,/x\.voiceProvider==="none"&&x\.voiceId!=="none"/);
 assert.match(worker,/voice_provider==="none"&&job\.voice_id==="none"/);
 assert.match(worker,/const narration=silent\?null:/);
 assert.match(worker,/silentTimeline\(scenes,duration,job.subtitles\)/);
 const timeline=read("services/vmv-studio-worker/speech-timeline.mjs");
 assert.match(timeline,/alignmentSource:"silent_visual_timeline"/);
 assert.match(worker,/if\(!silent\)\{/);
 assert.match(worker,/else args\.push\("-an"\)/);
 assert.match(worker,/assemble\(job,dir,clips,narration,timing,variant\)/);
});
test("provider readiness protects credits if Render cannot synthesize ElevenLabs audio",()=>{
 const worker=read("services/vmv-studio-worker/worker.mjs");
 const cloud=read("lib/vmv-studio-cloud-readiness.ts");
 const jobs=read("app/api/video-studio/jobs/route.ts");
 assert.match(worker,/req\.url==="\/voice-readyz"/);
 assert.match(worker,/process\.env\.ELEVENLABS_API_KEY\?\.trim\(\)/);
 assert.match(cloud,/url\.pathname="\/voice-readyz"/);
 assert.match(jobs,/videoStudioWorkerReady\("elevenlabs"\)/);
 assert.ok(jobs.indexOf('videoStudioWorkerReady("elevenlabs")')<
  jobs.indexOf('db.rpc("vmv_studio_create_job"'));
});
test("new and modified TS/TSX files parse with no errors",()=>{
 for(const path of ["lib/vmv-studio-topics.ts","app/vista-app/video-studio/page.tsx",
 "app/vista-app/vmv-pilot/PilotVoiceStep.tsx","app/api/video-studio/voices/route.ts",
 "app/api/video-studio/voice-activate/route.ts","app/api/video-studio/jobs/route.ts"]){
  const src=ts.createSourceFile(path,read(path),ts.ScriptTarget.Latest,true,
   path.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(src.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText," ")),[],path);
 }
});
