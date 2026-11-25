import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildZoomMotion} from "../services/vmv-studio-worker/zoom-motion.mjs";

test("zoom creates a full 24fps video from a single image with continuous 18% camera movement",()=>{
 const {frames,vf}=buildZoomMotion(5);
 assert.equal(frames,120);
 assert.match(vf,/zoompan=z='1\+0\.18\*min\(on\/119,1\)'/);
 assert.match(vf,/:d=120:s=720x1280:fps=24/);
 assert.match(vf,/x='\(iw-iw\/zoom\)\/2'/);
 assert.match(vf,/format=yuv420p/);
 assert.notEqual(buildZoomMotion(4).vf,buildZoomMotion(8).vf);
});
test("invalid or non-finite zoom durations fail safely",()=>{
 for(const duration of [-1,0,0.4,21,Infinity,NaN]){
  assert.throws(()=>buildZoomMotion(duration),/studio_zoom_duration_invalid/);
 }
 assert.equal(buildZoomMotion(1.01).frames,25);
});
test("worker renders real zoom from a static original, not endless loop of barely changing frames",()=>{
 const s=readFileSync("services/vmv-studio-worker/worker.mjs","utf8");
 assert.match(s,/import \{buildZoomMotion\} from "\.\/zoom-motion\.mjs"/);
 assert.match(s,/const \{frames,vf\}=buildZoomMotion\(timing\.segments\[i\]\.duration\)/);
 assert.match(s,/await shell\("ffmpeg",\["-hide_banner","-loglevel","error","-y","-i",image,/);
 assert.doesNotMatch(s,/zoompan=z='min\(zoom\+0\.00055,1\.16\)'/);
 assert.doesNotMatch(s,/"-loop","1","-i",image/);
});
test("review cards let every image switch motion with no regeneration, and Edit scrolls to the editor",()=>{
 const s=readFileSync("app/vista-app/video-studio/page.tsx","utf8");
 assert.match(s,/openFrameEditor=\(index:number\)=>\{/);
 assert.match(s,/requestAnimationFrame\(\(\)=>frameEditRef\.current\?\.scrollIntoView/);
 assert.match(s,/onClick=\{\(\)=>openFrameEditor\(i\)\}.*Editar escena/);
 assert.match(s,/vmv-motion-card-/);
 assert.match(s,/value=\{scene\.motion==="zoom"\?"zoom":"animate"\}/);
 assert.match(s,/onChange=\{e=>void saveFrameMotion\(i,/);
 assert.match(s,/onChange=\{e=>void saveFrameMotion\(sceneIndex,/);
 assert.match(s,/action:"set_motion",index,motion/);
 assert.match(s,/Cambiar movimiento no regenera la imagen ni consume créditos/);
});
test("motion-only backend only accepts the owner in pre-render scene review and does not touch credits",()=>{
 const api=readFileSync("app/api/video-studio/jobs/route.ts","utf8");
 const sql=readFileSync("supabase/migrations/20261124190000_vmv_studio_scene_motion_edit.sql","utf8");
 assert.match(api,/if\(action==="set_motion"\)/);
 assert.match(api,/p_owner:owner,p_job:id,p_index:b\.index,p_motion:b\.motion/);
 assert.match(api,/vmv_studio_set_scene_motion/);
 assert.match(sql,/owner_id=p_owner and status='awaiting_image_approval'/);
 assert.match(sql,/p_motion not in \('zoom','animate'\)/);
 assert.match(sql,/jsonb_set\(v_job\.scenes,array\[p_index::text,'motion'\]/);
 assert.match(sql,/version=version\+1/);
 assert.match(sql,/security invoker/);
 assert.match(sql,/revoke all on function public\.vmv_studio_set_scene_motion/);
 assert.doesNotMatch(sql,/(update public\.vmv_studio_wallets|charge_credits|regenerate|vmv_studio_credit_ledger)/);
});
