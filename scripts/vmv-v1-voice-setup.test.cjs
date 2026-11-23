const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
const read=p=>fs.readFileSync(p,"utf8");

test("V1 voice catalog is authenticated, read-only and does not need the old video spend flag",()=>{
 const api=read("app/api/video-studio/voices/route.ts");
 assert.match(api,/authenticatedUser\(req\)/);
 assert.match(api,/if\(!owner\)return NextResponse\.json\(\{error:"authentication_required"\}/);
 assert.doesNotMatch(api,/videoAllowed|VMV_VIDEO_PILOT_ENABLED|VMV_VIDEO_ALLOWED_OWNER_ID/);
 assert.match(api,/process\.env\.ELEVENLABS_API_KEY/);
 assert.match(api,/https:\/\/api\.elevenlabs\.io\/v2\/voices/);
 assert.match(api,/page_size:"40"/);
 assert.doesNotMatch(api,/generateSpeech|\/v1\/text-to-speech|method:"POST"/);
 assert.doesNotMatch(api,/return.*key/);
});
test("V1 shows ElevenLabs samples without permitting paid TTS or changing the Pilot workflow",()=>{
 const studio=read("app/vista-app/video-studio/page.tsx");
 const picker=read("app/vista-app/vmv-pilot/PilotVoiceStep.tsx");
 assert.match(studio,/catalogEndpoint="\/api\/video-studio\/voices" sampleMode="prerecorded"/);
 assert.match(picker,/catalogEndpoint="\/api\/video-generator\/pilot-voices",sampleMode="paid"/);
 assert.match(picker,/const canPreview=sampleMode==="paid"\|\|/);
 assert.match(picker,/disabled=\{disabled\|\|Boolean\(loadingId\)\|\|!canPreview\}/);
 assert.match(picker,/sampleMode==="prerecorded"/);
 for(const p of ["app/api/video-studio/voices/route.ts","app/vista-app/vmv-pilot/PilotVoiceStep.tsx","app/vista-app/video-studio/page.tsx"]){
  const src=ts.createSourceFile(p,read(p),ts.ScriptTarget.Latest,true,p.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(src.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText," ")),[],p);
 }
});
