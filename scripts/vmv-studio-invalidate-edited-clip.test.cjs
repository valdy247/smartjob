const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const sql=fs.readFileSync("supabase/migrations/20261124201500_vmv_studio_invalidate_edited_clip.sql","utf8");
const worker=fs.readFileSync("services/vmv-studio-worker/worker.mjs","utf8");

test("regenerating only scene six invalidates its old image AND old animation clip",()=>{
 const regen=sql.split("CREATE OR REPLACE FUNCTION public.vmv_studio_scene_update")[1]
  .split("CREATE OR REPLACE FUNCTION public.vmv_studio_set_scene_motion")[0];
 assert.match(regen,/assets=case when p_regen then coalesce\(v_job\.assets,'\{\}'::jsonb\)/);
 for(const asset of ["image_","clip_turbo_","clip_high_","task_turbo_","task_high_"]){
  assert.ok(regen.includes("('"+asset+"'||p_index)"),"Missing selective invalidation for "+asset);
 }
 assert.match(regen,/else v_job\.assets end/);
 assert.match(regen,/length\(p_value\) between 5 and 950/);
 assert.match(regen,/if length\(p_value\)>230 then raise exception 'studio_speech_too_long'/);
 assert.match(regen,/updated_at=now\(\) where id=p_job returning/);
});
test("switching animation or zoom only deletes the old clip/task, not the approved image",()=>{
 const motion=sql.split("CREATE OR REPLACE FUNCTION public.vmv_studio_set_scene_motion")[1];
 assert.match(motion,/where id=p_job and owner_id=p_owner and status='awaiting_image_approval'/);
 for(const asset of ["clip_turbo_","clip_high_","task_turbo_","task_high_"]){
  assert.ok(motion.includes("('"+asset+"'||p_index)"));
 }
 assert.doesNotMatch(motion,/assets=.*- \('image_'\|\|p_index\)/);
 assert.doesNotMatch(motion,/balance=|charge_credits|credit_ledger|reserved=/);
});
test("video worker restores clips only when their stored asset reference exists",()=>{
 assert.match(worker,/if\(!await restoreAsset\(job,key,clip\)\)/);
 assert.match(worker,/if\(scenes\[i\]\.motion==="zoom"\)/);
 assert.match(worker,/await startMotionClip\(/);
 assert.match(worker,/await persistAsset\(job,key,clip,"video\/mp4"\)/);
 assert.match(worker,/if\(typeof scenes\[i\]\.imagePath==="string"/);
 assert.match(worker,/await persistAsset\(job,"image_"\+i,image,"image\/jpeg"\)/);
});
