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
test("healthy storyboard passes without changing a single line or spending credits",()=>{
 const {outline,scenes}=sample();
 assert.equal(validStudioDraft(outline,scenes),true);
 assert.equal(studioRuntimePlausible(outline.narration,30,"es"),true);
 const result=applyStudioAudit(outline,scenes,{decision:"pass",reason:"Continuity and pacing are coherent.",changes:[]},30,"es");
 assert.equal(result.audit.decision,"pass");
 assert.equal(result.audit.changedMoments,0);
 assert.equal(result.outline.narration,outline.narration);
 assert.deepEqual(Array.from(result.scenes,s=>s.speech),Array.from(scenes,s=>s.speech));
});
test("fixes only defective narration, image direction and animation choice",()=>{
 const {outline,scenes}=sample();
 const replacement={...scenes[1],index:1,motion:"animate",
  imagePrompt:"The same violet eggplant points to a tomato and clearly gestures while explaining their botanical relationship.",
  reason:"A demonstrative gesture works better than an unrelated tree diagram."};
 const r=applyStudioAudit(outline,scenes,{decision:"fix",reason:"Scene two illustrates a different moment.",changes:[replacement]},30,"es");
 assert.equal(r.audit.changedMoments,1);
 assert.equal(r.scenes[1].motion,"animate");
 assert.equal(r.scenes[0].imagePrompt,scenes[0].imagePrompt);
 assert.equal(r.scenes[2].imagePrompt,scenes[2].imagePrompt);
 assert.equal(r.outline.narration,r.scenes.map(s=>s.speech).join(" "));
});
test("revised speech is synchronized with the final displayed narration",()=>{
 const {outline,scenes}=sample();
 const revised={...scenes[2],index:2,
  speech:"Mi piel morada tiene pigmentos vegetales que le dan ese color especial.",
  reason:"Shorten dense narration without changing the scientific claim."};
 const r=applyStudioAudit(outline,scenes,{decision:"fix",reason:"This line needs a quicker tempo.",changes:[revised]},30,"es");
 assert.equal(r.outline.narration,r.scenes.map(s=>s.speech).join(" "));
 assert.notEqual(r.outline.narration,outline.narration);
});
test("a 90-word narration never silently passes as 30 seconds",()=>{
 const {outline,scenes}=sample();
 const long=Array.from({length:90},(_,i)=>"palabra"+i).join(" ");
 assert.equal(studioRuntimePlausible(long,30,"es"),false);
 assert.equal(studioRuntimePlausible(outline.narration,30,"es"),true);
});
test("rejected audit reports cannot rewrite a majority or create inconsistent beats",()=>{
 const {outline,scenes}=sample();
 const change=i=>({...scenes[i],index:i,reason:"Improve scene coherence."});
 for(const report of [
  {decision:"fix",reason:"Many issues.",changes:[change(0),change(1),change(2)]},
  {decision:"fix",reason:"Duplicate.",changes:[change(0),change(0)]},
  {decision:"pass",reason:"Contradictory.",changes:[change(0)]},
  {decision:"fix",reason:"Nothing to fix.",changes:[]},
  {decision:"block",reason:"Needs a full rework.",changes:[]},
  {decision:"fix",reason:"Invalid timing.",changes:[{...change(0),speech:"la"}]},
  {decision:"fix",reason:"Invalid movement.",changes:[{...change(0),motion:"teleport"}]}
 ])assert.equal(applyStudioAudit(outline,scenes,report,30,"es"),null);
});
test("auditor protocol sits before draft is shown and cannot reserve credits",()=>{
 const ui=fs.readFileSync("app/vista-app/video-studio/page.tsx","utf8");
 const route=fs.readFileSync("app/api/video-studio/plan/route.ts","utf8");
 const flow=ui.slice(ui.indexOf("const prepare=async"),ui.indexOf("const patchScene="));
 assert.match(flow,/mode:"audit",outline:plan,scenes:completed/);
 assert.ok(flow.indexOf('mode:"audit"')<flow.indexOf("setScenes(reviewed.scenes)"));
 assert.doesNotMatch(flow,/setScenes\(completed\)/);
 assert.match(route,/decision=pass and changes=\[\]/);
 assert.match(route,/decision=block/);
 assert.doesNotMatch(route,/vmv_studio_create_job|charge_credits|stripe/);
});
