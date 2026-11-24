const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");
const code=fs.readFileSync("lib/vmv-studio-script-auditor.ts","utf8");
const compiled=ts.transpileModule(code,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const mod={exports:{}};
vm.runInNewContext(compiled,{module:mod,exports:mod.exports},{timeout:3000});
const {applyStudioAudit,estimatedStudioVoiceSeconds,studioRuntimePlausible,validStudioDraft}=mod.exports;

const sample=()=>{
 const scenes=[
  {speech:"¡Hola, humano! Tengo una historia sorprendente que contarte hoy sobre mi verdadera identidad.",imagePrompt:"A smiling animated eggplant faces the camera with lively expression and gentle studio lighting.",caption:"¡Hola, humano!",motion:"animate"},
  {speech:"Aunque muchos me llaman verdura, técnicamente soy una fruta de la familia del tomate y de la papa.",imagePrompt:"The same eggplant proudly shows a simplified family tree with tomatoes and other botanical relatives.",caption:"Soy una fruta",motion:"zoom"},
  {speech:"Mi piel morada tiene pigmentos naturales que le dan ese color tan especial y brillante.",imagePrompt:"A detailed closeup of the eggplant's glossy violet skin with soft realistic studio highlights.",caption:"Mi piel morada",motion:"zoom"},
  {speech:"Y cuando me cocinas, puedo absorber mucho aceite, como una auténtica esponja de cocina.",imagePrompt:"The same playful eggplant appears next to a pan and a sponge demonstrating liquid absorption.",caption:"Como una esponja",motion:"animate"},
  {speech:"¿Ahora que conoces mi secreto, todavía piensas que soy aburrida?",imagePrompt:"The animated eggplant looks at the audience with a cheeky grin and a fun final camera push.",caption:"¿Aburrida yo?",motion:"animate"}
 ];
 const outline={title:"El secreto de la berenjena",logline:"Una berenjena narra curiosidades.",hook:"Una sorpresa",ending:"Una pregunta",characters:"Berenjena morada parlante",
  setting:"Cocina de colores brillantes",narration:scenes.map(s=>s.speech).join(" "),beats:scenes.map(s=>s.imagePrompt)};
 return {scenes,outline};
};
test("healthy storyboard passes without edits or credits",()=>{
 const {outline,scenes}=sample();
 assert.equal(validStudioDraft(outline,scenes),true);
 assert.equal(studioRuntimePlausible(outline.narration,30,"es"),true);
 const r=applyStudioAudit(outline,scenes,{
  decision:"pass",reason:"A coherent, well-paced short.",title:"",scenes:[]
 },30,"es");
 assert.equal(r.audit.decision,"pass");
 assert.equal(r.audit.changedMoments,0);
 assert.equal(r.outline.narration,outline.narration);
 assert.deepEqual(Array.from(r.scenes,s=>s.imagePrompt),Array.from(scenes,s=>s.imagePrompt));
});
test("an editor can rewrite every scene and change scene count, movement, visuals and script",()=>{
 const {outline,scenes}=sample();
 const revised=[
  {...scenes[0],speech:"¡Atención! Nadie te contó jamás la verdadera historia de esta berenjena que habla."},
  {...scenes[1],speech:"Soy una fruta, y aquí me ves junto a mis parientes: tomates y papas.",
   imagePrompt:"The purple eggplant stands in a botanical garden, pointing at a vivid tomato and an actual potato plant, wide three-quarter shot.",motion:"animate"},
  {...scenes[2],speech:"Mira estos destellos en mi piel; son pigmentos naturales llamados antocianinas.",
   imagePrompt:"Extreme macro view of the purple eggplant skin with light passing through translucent violet textures, science illustration.",motion:"zoom"},
  {...scenes[3],speech:"Al cocinarme, absorbo aceite fácilmente. ¡Míralo en esta sartén!",
   imagePrompt:"Top down cooking demonstration of eggplant slices sizzling and visibly taking up oil from a shallow pan.",motion:"animate"},
  {...scenes[4],speech:"Ya entiendes por qué soy interesante. ¿Te atreves a probarme?",
   imagePrompt:"A lively final full-body wide shot of the eggplant presenting a colorful meal on a dining table.",motion:"animate"}
 ];
 // Include the story's additional beats so that pacing fits 30s.
 
 
 
 revised[3].speech+=" Es una característica útil que debes recordar.";
 revised[4].speech+=" Cuenta tu curiosidad favorita.";
 const r=applyStudioAudit(outline,scenes,{
  decision:"revise",reason:"Improve visual variety and align each shot to the narration.",
  title:"La berenjena sorprendente",scenes:revised
 },30,"es");
 assert.ok(r);
 assert.equal(r.audit.decision,"revise");
 assert.equal(r.outline.title,"La berenjena sorprendente");
 assert.equal(r.scenes[1].motion,"animate");
 assert.equal(r.outline.narration,r.scenes.map(s=>s.speech).join(" "));
 assert.equal(r.audit.changedMoments,5);
});
test("full rewrites with changed moment counts are accepted when coherent",()=>{
 const {outline,scenes}=sample();
 const rewrite=[
  {...scenes[0],speech:"Hola, humano, hoy te contaré una verdad sobre mi identidad secreta."},
  {...scenes[1],speech:"Soy una fruta y tengo parentesco con tomates y papas."},
  {...scenes[2],speech:"Mi piel morada contiene pigmentos naturales que producen ese color espectacular."},
  {...scenes[3],speech:"Al cocinarme puedo absorber mucho aceite, como una esponja."},
  {...scenes[4],speech:"Y por eso soy un ingrediente versátil que sorprende en la cocina."},
  {speech:"¿Te atreves a probarme? Nos vemos en tu próxima receta deliciosa.",
   imagePrompt:"Overhead view of an illustrated kitchen table with a plate of eggplant slices, fresh tomato and small cooking props.",caption:"Hasta pronto",motion:"zoom"}
 ];
 const r=applyStudioAudit(outline,scenes,{
  decision:"revise",reason:"A clearer ending and new cutaway were needed.",title:"",scenes:rewrite
 },30,"es");
 assert.ok(r);
 assert.equal(r.scenes.length,6);
 assert.equal(r.outline.beats.length,6);
});
test("a 90-word voiceover cannot pass the 30-second preflight",()=>{
 const {outline,scenes}=sample();
 const long=Array.from({length:90},(_,i)=>"palabra"+i).join(" ");
 assert.equal(studioRuntimePlausible(long,30,"es"),false);
 assert.equal(studioRuntimePlausible(outline.narration,30,"es"),true);
});
test("identical adjacent prompts are automatically flagged, even if AI approves them",()=>{
 const {outline,scenes}=sample();
 const duplicated=scenes.map(x=>({...x}));
 duplicated[1].imagePrompt=duplicated[0].imagePrompt;
 const invalidOutline={...outline,narration:duplicated.map(x=>x.speech).join(" ")};
 assert.deepEqual(Array.from(mod.exports.repetitiveVisualPairs(duplicated)),[1]);
 assert.ok(Array.from(mod.exports.studioAuditIssues(invalidOutline,duplicated,30,"es"))
  .some(x=>x.includes("Repetitive")));
 assert.equal(applyStudioAudit(invalidOutline,duplicated,{
  decision:"pass",reason:"No issues.",title:"",scenes:[]
 },30,"es"),null);
});
test("a rewrite must meet duration, completeness and visual variety to be shown",()=>{
 const {outline,scenes}=sample();
 const wrong=[...scenes.map(s=>({...s}))];
 wrong[0].imagePrompt=wrong[1].imagePrompt;
 for(const report of [
  {decision:"pass",reason:"But I changed content.",title:"new",scenes:[]},
  {decision:"revise",reason:"Empty proposal.",title:"",scenes:[]},
  {decision:"revise",reason:"Bad voiceover.",title:"",scenes:[{...scenes[0],speech:"la"},...scenes.slice(1)]},
  {decision:"revise",reason:"Repetitive shots.",title:"",scenes:wrong},
  {decision:"revise",reason:"Unsupported motion.",title:"",scenes:[{...scenes[0],motion:"explode"},...scenes.slice(1)]},
  {decision:"revise",reason:"Bad title.",title:"ab",scenes}
 ])assert.equal(applyStudioAudit(outline,scenes,report,30,"es"),null);
});
test("no intermediate draft appears; one auditable stage runs before showing approval",()=>{
 const ui=fs.readFileSync("app/vista-app/video-studio/page.tsx","utf8");
 const route=fs.readFileSync("app/api/video-studio/plan/route.ts","utf8");
 const flow=ui.slice(ui.indexOf("const prepare=async"),ui.indexOf("const patchScene="));
 assert.match(flow,/mode:"audit",outline:plan,scenes:completed/);
 assert.ok(flow.indexOf('mode:"audit"')<flow.indexOf("setScenes(reviewed.scenes)"));
 assert.doesNotMatch(flow,/setScenes\(completed\)/);
 assert.match(route,/FULL editorial authority to revise ALL scenes/);
 assert.match(route,/Detect boring repeated images/);
 assert.doesNotMatch(route,/vmv_studio_create_job|charge_credits|stripe/);
 assert.match(ui,/Revisando ajustes finales/);
});

test("silent videos accept full visual storytelling irrespective of approximate spoken seconds",()=>{
 const {outline,scenes}=sample();
 const issues=mod.exports.studioAuditIssues(outline,scenes,15,"es","none");
 assert.deepEqual(Array.from(issues),[]);
 const r=applyStudioAudit(outline,scenes,{
  decision:"pass",reason:"Action and visual narrative are coherent.",title:"",scenes:[]
 },15,"es","none");
 assert.ok(r);
 assert.equal(r.scenes.length,scenes.length);
 assert.equal(r.outline.narration,outline.narration);
});
test("voiced preflight checks the same safe estimate range as the worker, not a strict 9 percent",()=>{
 const {outline,scenes}=sample();
 const approx39=Array.from({length:90},(_,i)=>"palabra"+i).join(" ");
 assert.equal(studioRuntimePlausible(approx39,30,"es"),false);
 assert.equal(mod.exports.studioRuntimeCompatible(approx39,30,"es","elevenlabs"),true);
 assert.equal(mod.exports.studioRuntimeCompatible(approx39,30,"es","none"),true);
 assert.equal(mod.exports.studioRuntimeCompatible("muy corto",30,"es","elevenlabs"),false);
 assert.equal(mod.exports.studioRuntimeCompatible("muy corto",30,"es","none"),true);
 assert.equal(mod.exports.studioRuntimeCompatible(approx39,10,"es","none"),false);
 assert.equal(mod.exports.studioAuditIssues({...outline,narration:approx39},scenes,30,"es","elevenlabs")
  .includes("Voiceover length does not match selected runtime"),false);
});
test("silent mode still blocks incomplete scenes and repeated visual prompts",()=>{
 const {outline,scenes}=sample();
 const duplicate=scenes.map(s=>({...s}));
 duplicate[1].imagePrompt=duplicate[0].imagePrompt;
 const issues=mod.exports.studioAuditIssues(outline,duplicate,15,"es","none");
 assert.ok(issues.some(v=>v.includes("Repetitive")));
 duplicate[2].speech="no";
 assert.ok(mod.exports.studioAuditIssues(outline,duplicate,15,"es","none")
  .some(v=>v.includes("Storyboard incomplete")));
});
