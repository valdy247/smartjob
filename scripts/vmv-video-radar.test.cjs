const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const root=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const files=[
 "lib/vmv-video-radar.ts",
 "app/api/video-generator/radar/route.ts",
 "app/vista-app/video-generator/ViralRadar.tsx",
 "app/vista-app/video-generator/AutopilotWizard.tsx",
 "app/vista-app/video-generator/page.tsx",
 "app/api/video-generator/pilot/route.ts",
 "app/vista-app/ai-agents/AutomaticVideoWizard.tsx"
];
const source=Object.fromEntries(files.map(f=>[f,read(f)]));
test("Viral Radar and autopilot source parse as TS/TSX",()=>{
 for(const p of files){
  const parsed=ts.createSourceFile(p,source[p],ts.ScriptTarget.Latest,true,
   p.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.deepEqual(parsed.parseDiagnostics.map(e=>ts.flattenDiagnosticMessageText(e.messageText," ")),[],
   p);
 }
});
test("YouTube public statistics are displayed raw; no derived engagement score",()=>{
 const compiled=ts.transpileModule(source["lib/vmv-video-radar.ts"],{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const stats={};new Function("exports",compiled)(stats);
 const now=Date.parse("2026-11-20T12:00:00.000Z");
 const video=stats.videoToRadar({
  id:"5qap5aO4i9A",snippet:{title:"Original video",channelTitle:"Channel",
   channelId:"CH123",publishedAt:"2026-11-18T12:00:00.000Z",
   thumbnails:{medium:{url:"https://i.ytimg.com/vi/5qap5aO4i9A/mqdefault.jpg"}}},
  statistics:{viewCount:"10000",likeCount:"100",commentCount:"50"}
 },now);
 assert.equal(video.views,10000);
 assert.equal(video.likes,100);
 assert.equal(video.comments,50);
 assert.equal(Object.hasOwn(video,"averageViewsPerDay"),false);
 assert.equal(Object.hasOwn(video,"signalScore"),false);
 assert.equal(stats.cleanRadarQuery("  custom  cakes   "), "custom cakes");
 assert.equal(stats.cleanRadarQuery("<iframe>"),null);
 assert.equal(stats.validRadarId("5qap5aO4i9A"),true);
 assert.equal(stats.validRadarId("javascript:alert(1)"),false);
});
test("Research runs only behind owner auth and official YouTube, never client provider secrets",()=>{
 const api=source["app/api/video-generator/radar/route.ts"];
 const client=source["app/vista-app/video-generator/ViralRadar.tsx"];
 assert.match(api,/authenticatedUser\(req\)/);
 assert.match(api,/videoAllowed\(owner\)/);
 assert.match(api,/process\.env\.YOUTUBE_DATA_API_KEY/);
 assert.match(api,/www\.googleapis\.com\/youtube\/v3/);
 assert.match(api,/publishedAfter:since/);
 assert.match(api,/order:"viewCount"/);
 assert.match(api,/vmv_video_radar_claim/);
 assert.match(api,/eq\("owner_id",owner\)/);
 assert.match(client,/\/api\/video-generator\/radar/);
 assert.doesNotMatch(client,/YOUTUBE_DATA_API_KEY\s*\+|process\.env/);
 assert.doesNotMatch(api,/posts\.insert|publishToSocial|startRunway\(/);
});
test("Owner can select a traceable original idea, verified before persistence",()=>{
 const wizard=source["app/vista-app/video-generator/AutopilotWizard.tsx"];
 const pilot=source["app/api/video-generator/pilot/route.ts"];
 const media=source["app/vista-app/ai-agents/AutomaticVideoWizard.tsx"];
 assert.match(wizard,/<ViralRadar niche=\{plan\.niche\}/);
 assert.match(wizard,/creative_seed:\(idea\.hook/);
 assert.match(wizard,/research_scan_id:scanId/);
 assert.match(pilot,/eq\("id",scanId\)\.eq\("owner_id",owner\)/);
 assert.match(pilot,/source\.data\.ideas\.some/);
 assert.match(pilot,/status:"paused"/);
 assert.match(pilot,/next_run_at:null/);
 assert.match(media,/fromPlan\.creative_seed/);
 assert.match(media,/pilotId:sourcePilotId\|\|null/);
});
test("Database owner RLS and server-only quota isolate research",()=>{
 const sql=read("supabase/sql/vmv_video_radar_youtube_20261120.sql");
 assert.match(sql,/ALTER TABLE public\.vmv_video_radar_scans ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/owner_id=\(SELECT auth\.uid\(\)\)/);
 assert.match(sql,/vmv_video_radar_claim/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.vmv_video_radar_claim\(uuid,text,integer\) TO service_role/);
 assert.match(sql,/IF used>=6 THEN RAISE EXCEPTION 'radar_daily_limit'/);
 assert.match(sql,/created_at>now\(\)-interval '6 hours'/);
 assert.match(sql,/creative_seed/);
});

test("Owner deletion and scheduled purge protect YouTube data retention",()=>{
 const api=source["app/api/video-generator/radar/route.ts"];
 const ui=source["app/vista-app/video-generator/ViralRadar.tsx"];
 const sql=read("supabase/sql/vmv_video_radar_retention_20261120.sql");
 assert.match(sql,/cron\.schedule/);
 assert.match(sql,/interval '29 days'/);
 assert.match(sql,/vmv_video_radar_clear_owner/);
 assert.match(api,/export async function DELETE/);
 assert.match(api,/db\.rpc\("vmv_video_radar_clear_owner"/);
 assert.match(ui,/Borrar mis investigaciones/);
 assert.match(ui,/x-vmv-youtube-consent/i);
 assert.match(api,/x-vmv-youtube-consent/);
 assert.doesNotMatch(ui,/averageViewsPerDay|engagementPercent|signalScore/);
 assert.doesNotMatch(api,/averageViewsPerDay|engagementPercent|signalScore/);
 assert.match(ui,/youtube\.com\/t\/terms/);
});

test("Pilot trends distinguish AI ideas from genuine source video titles and views",()=>{
 const pilot=read("app/vista-app/vmv-pilot/PilotTrendStep.tsx");
 const styles=read("app/vista-app/vmv-pilot/PilotTrendStep.module.css");
 assert.match(pilot,/Idea sugerida por IA/);
 assert.match(pilot,/Video original verificado en YouTube/);
 assert.match(pilot,/video\.title/);
 assert.match(pilot,/video\.channel/);
 assert.match(pilot,/video\.publishedAt/);
 assert.match(pilot,/video\.url/);
 assert.match(pilot,/video\.thumbnail/);
 assert.match(pilot,/video\.views/);
 assert.match(pilot,/vistas acumuladas del video original/);
 assert.match(pilot,/no una medición de viralidad en tiempo real/);
 assert.match(pilot,/onChoose\(idea,scan\.id\)/);
 assert.match(styles,/\.sourceCard/);
 assert.match(styles,/\.disclosure/);
});
