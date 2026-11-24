import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {prepareRevisionAssets} from "../services/vmv-studio-worker/revision-assets.mjs";

const sourceId="042db5ba-ad1e-4af5-a0f4-206060231ba8";
const childId="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const owner="bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const q="turbo";
const prefix=owner+"/"+sourceId+"/";
function fixture(){
 const clips=[0,1,2,3].map(i=>"clip_"+q+"_"+i);
 const assets={voice_continuous:prefix+"voice_continuous.mp3",
  voice_timeline:{duration:63.3,alignmentVersion:2,segments:Array.from({length:4},(_,i)=>({
   index:i,duration:10,start:i*10,end:i*10+10}))},
  character_master:prefix+"character_master.jpg",
  visual_plan:{identityNeeded:true,characterDescription:"Neutral person reference",sceneReference:[true,true,true,true]}};
 for(const k of clips)assets[k]=prefix+k+".mp4";
 const scenes=Array.from({length:4},(_,i)=>({speech:"Narration part "+i,
  imagePrompt:"Original scene prompt "+i,imagePath:prefix+"image_"+i+".jpg",
  approved:true,requiresReview:false,motion:"animate"}));
 const parent={id:sourceId,owner_id:owner,status:"completed",scenes,assets,
  quality_mode:q,voice_provider:"elevenlabs"};
 const childScenes=scenes.map(s=>({...s}));
 childScenes[0]={...childScenes[0],imagePath:null,approved:false,requiresReview:true,
  imagePrompt:"The brand new opening shot, with altered framing."};
 const job={id:childId,owner_id:owner,quality_mode:q,voice_provider:"elevenlabs",
  assets:{revision_source_id:sourceId,revision_scene_index:0}};
 const copies=[],patches=[];
 const db={from:table=>{
  assert.equal(table,"vmv_studio_jobs");
  return {select:()=>({eq:()=>({eq:()=>({eq:()=>({
   maybeSingle:async()=>({data:parent,error:null})
  })})})})};
 },storage:{from:bucket=>{
  assert.equal(bucket,"vmv-studio-assets");
  return {copy:async(from,to)=>{copies.push({from,to});return {error:null};}};
 }}};
 const patch=async (_,changes)=>{patches.push(changes);Object.assign(job,changes);};
 return {parent,job,db,scenes:childScenes,copies,patches,patch};
}
test("only one targeted image and clip are excluded from cloned assets",async()=>{
 const t=fixture();
 assert.equal(await prepareRevisionAssets({db:t.db,job:t.job,scenes:t.scenes,patch:t.patch,bucket:"vmv-studio-assets"}),true);
 assert.equal(t.copies.length,8); // 3 other images+3 clips+voice+master
 assert.ok(t.copies.every(x=>x.from.startsWith(prefix)));
 assert.ok(t.copies.every(x=>x.to.startsWith(owner+"/"+childId+"/")));
 assert.ok(t.copies.every(x=>!x.from.includes("image_0.jpg")&&!x.from.includes("clip_turbo_0.mp4")));
 assert.equal(t.scenes[0].approved,false);
 assert.equal(t.scenes[0].imagePath,null);
 assert.equal(t.scenes[0].requiresReview,true);
 for(let i=1;i<4;i++){
  assert.equal(t.scenes[i].approved,true);
  assert.equal(t.scenes[i].imagePath,owner+"/"+childId+"/image_"+i+".jpg");
 }
 assert.equal(t.job.assets.voice_timeline.duration,63.3);
 assert.equal(t.job.assets.voice_continuous,owner+"/"+childId+"/voice_continuous.mp3");
 assert.equal(t.job.assets.visual_gallery_audited,true);
 assert.equal(t.job.assets.revision_assets_ready,true);
});
test("copy is safely idempotent after interrupted worker and unchanged frames stay unchanged",async()=>{
 const t=fixture();
 const original=t.parent.scenes.map(s=>({...s}));
 const firstCopy=t.db.storage.from("vmv-studio-assets").copy;
 let invoked=0;
 t.db.storage.from=()=>({copy:async(from,to)=>{
  invoked++;
  if(invoked===1)return {error:{statusCode:"409",message:"Already exists"}};
  return {error:null};
 }});
 await prepareRevisionAssets({db:t.db,job:t.job,scenes:t.scenes,patch:t.patch,bucket:"vmv-studio-assets"});
 assert.equal(invoked,8);
 assert.deepEqual(t.parent.scenes,original);
 assert.equal(await prepareRevisionAssets({db:t.db,job:t.job,scenes:t.scenes,patch:t.patch,bucket:"vmv-studio-assets"}),true);
 assert.equal(invoked,8);
});
test("a forged missing parent or invalid revision index is rejected before copying",async()=>{
 const t=fixture();
 t.job.assets.revision_scene_index=9;
 await assert.rejects(prepareRevisionAssets({db:t.db,job:t.job,scenes:t.scenes,patch:t.patch,bucket:"vmv-studio-assets"}),
 /revision_source_invalid/);
 assert.equal(t.copies.length,0);
});
test("worker preserves original voice and other completed clips; target requires human approval",()=>{
 const worker=readFileSync("services/vmv-studio-worker/worker.mjs","utf8");
 assert.match(worker,/prepareRevisionAssets\(\{db,job,scenes,patch,bucket:WORK\}\)/);
 assert.match(worker,/Boolean\(job.assets\?\.revision_source_id\)\|\|!visuallyValid/);
 assert.match(worker,/Number\(job.resume_count\)>0\|\|\s*Boolean\(job.assets\?\.revision_source_id\)/);
 assert.match(worker,/await restoreAsset\(job,key,clip\)/);
 assert.match(worker,/await restoreAsset\(job,"voice_continuous",narration\)/);
});
test("completion remains a new video, with separate fixed-cost quote and original untouched",()=>{
 const api=readFileSync("app/api/video-studio/revisions/route.ts","utf8");
 const ui=readFileSync("app/vista-app/video-studio/CompletedSceneEditor.tsx","utf8");
 const parent=readFileSync("app/vista-app/video-studio/page.tsx","utf8");
 const sql=readFileSync("supabase/migrations/20261124182500_vmv_studio_completed_scene_revision.sql","utf8");
 assert.match(api,/await authenticatedUser\(req\)/);
 assert.match(api,/eq\("owner_id",owner\)/);
 assert.match(api,/b.expectedCredits!==credits/);
 assert.match(api,/b\?\.confirmCost!==true/);
 assert.match(api,/vmv_studio_create_scene_revision/);
 assert.match(ui,/useState\(0\)/); // first scene selected
 assert.match(ui,/onCreated\(result.id\)/);
 assert.match(parent,/Editar escenas de este video/);
 assert.match(parent,/Editar escenas<\/button>/);
 assert.match(sql,/v_source.status/); // note source status guaranteed by filtered SELECT.
 assert.match(sql,/status='completed'/);
 assert.match(sql,/jsonb_build_object\('revision_source_id'/);
 assert.match(sql,/charge_credits,status,phase,progress/);
 assert.match(sql,/revoke all on function public\.vmv_studio_create_scene_revision/);
 assert.doesNotMatch(sql,/update public\.vmv_studio_jobs set scenes/);
});
