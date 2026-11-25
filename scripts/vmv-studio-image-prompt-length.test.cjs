const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const sql=fs.readFileSync("supabase/migrations/20261124200000_vmv_studio_image_prompt_950.sql","utf8");
const api=fs.readFileSync("app/api/video-studio/jobs/route.ts","utf8");
const ui=fs.readFileSync("app/vista-app/video-studio/page.tsx","utf8");

test("incident: image prompt over 230 characters is valid and regeneration is charged only once",()=>{
 const newVisual="Two stickman characters in a clean white studio with an orange bar at fifty thousand dollars and a taller blue bar at seventy-five thousand dollars. Green banknotes float between the bars and the camera holds a clear overhead graphic. Strong visual hierarchy, legible dollar amounts, large numbers and distinct actions that show the difference to viewers without relying only on a stationary chart.";
 assert.ok(newVisual.length>230&&newVisual.length<950);
 assert.match(sql,/p_action='edit_scene' and p_value is not null and length\(p_value\) between 5 and 950/);
 const regeneration=sql.split("if p_regen then")[1].split("else")[0];
 assert.doesNotMatch(regeneration,/length\(p_value\)>230/);
 assert.match(regeneration,/update public\.vmv_studio_wallets set balance=balance-1/);
 assert.match(regeneration,/insert into public\.vmv_studio_credit_ledger/);
 assert.match(regeneration,/jsonb_build_object\('imagePath',null,'approved',false\)/);
});
test("the 230-char maximum applies only to narration edits",()=>{
 const blocks=sql.split("if p_regen then");
 assert.equal(blocks.length,2);
 const spoken=blocks[1].split("   else")[1];
 assert.match(spoken,/length\(p_value\)>230 then raise exception 'studio_speech_too_long'/);
 assert.match(spoken,/v_scene=v_scene\|\|/);
});
test("image regeneration sends the full prompt to the server with explicit credit consent",()=>{
 assert.match(ui,/regenerateFrame\(regenIndex,frameVisual\.trim\(\)\)/);
 assert.match(ui,/confirmRegenerationCost:true/);
 assert.match(api,/b\.confirmRegenerationCost!==true/);
 assert.match(api,/value\.length>950/);
 assert.match(ui,/Regenerar imagen · 1 crédito/);
 assert.match(ui,/Para aplicar los cambios de la descripción/);
});
test("narration validation errors return an actionable message, not a generic image failure",()=>{
 assert.match(api,/studio_speech_too_long.*studio_speech_too_long/);
 assert.match(ui,/studio_speech_too_long:"La narración/);
});
