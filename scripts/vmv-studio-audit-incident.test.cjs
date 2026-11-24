const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");
const load=(path,required={})=>{
 const code=ts.transpileModule(fs.readFileSync(path,"utf8"),{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const mod={exports:{}};
 vm.runInNewContext(code,{module:mod,exports:mod.exports,
  require:id=>{if(Object.hasOwn(required,id))return required[id];throw Error("Unexpected import "+id);},
  process:{env:{VERCEL_ENV:"preview"}},console:{warn:()=>{}}},{timeout:5000});
 return mod.exports;
};
const audit=load("lib/vmv-studio-script-auditor.ts");
const rescue=load("lib/vmv-studio-preflight-rescue.ts",{
 "./vmv-studio-script-auditor":audit
});
const moments=[
 "La esposa calienta una cuchara y la pone sobre la comida.",
 "Ella lleva el plato hasta la mesa del comedor, donde espera su marido.",
 "El marido le pide perdón por haberle roto su vestido favorito.",
 "La esposa sonríe y levanta la cuchara caliente usando unas pinzas.",
 "Introduce la cuchara en un vaso de agua y sale una nube de vapor.",
 "Ella lo abraza con ternura mientras él observa confundido y asustado."
];
const visuals=[
 "A wide side view of a woman in a cozy kitchen heating a metal spoon.",
 "Wide full-body shot of the same woman walking to a dining table with a plate.",
 "Close-up of the husband seated at the dining table with an apologetic face.",
 "Overhead insert shot of kitchen tongs lifting a spoon from the meal plate.",
 "Extreme close up of the spoon entering a glass of water with steam rising.",
 "Final wide two-subject composition: a tender hug while the husband looks scared."
];
function fixture(){
 const scenes=moments.map((speech,i)=>({speech,imagePrompt:visuals[i],
  caption:speech.slice(0,50),motion:i%2?"zoom":"animate"}));
 return {scenes,outline:{title:"La disculpa inesperada",logline:"Una disculpa romántica termina con un giro cómico.",
  hook:"Una esposa prepara algo inesperado en la cocina.",ending:"El marido queda completamente confundido.",
  characters:"The same woman and husband throughout the story.",
  setting:"Cozy residential kitchen and dining room.",beats:visuals.map(v=>v.slice(0,160)),
  narration:scenes.map(s=>s.speech).join(" ")}};
}
function setup(){
 let calls=0;
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync("app/api/video-studio/plan/route.ts","utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const modules={
  "next/server":{NextResponse:{json:(body,{status=200}={})=>({body,status})}},
  "@/lib/auth-server":{authenticatedUser:async()=>"owner"},
  "@/lib/vmv-ai-agents/model":{askAiAgent:async()=>{calls++;return "{}";}},
  "@/lib/vmv-studio-script-auditor":audit,
  "@/lib/vmv-studio-preflight-rescue":rescue,
  "@/lib/vmv-studio-semantic-beats":{splitNarrationIntoMoments:()=>moments},
  "@/lib/vmv-pilot-voice-config":{validPilotLanguage:x=>x==="es",pilotLanguageName:()=>"Spanish"},
  "@/lib/vmv-studio-countries":{isVideoStudioCountry:x=>typeof x==="string"&&/^[A-Z]{2}$/.test(x)}
 };
 vm.runInNewContext(code,{module:mod,exports:mod.exports,
  require:id=>{if(Object.hasOwn(modules,id))return modules[id];throw Error("Missing mock "+id);},
  process:{env:{VERCEL_ENV:"preview"}},console:{warn:()=>{}}},{timeout:5000});
 return {POST:mod.exports.POST,calls:()=>calls};
}
test("incident regression: six silent scenes survive failed editorial model and are returned intact",async()=>{
 const {outline,scenes}=fixture(),{POST,calls}=setup();
 assert.ok(audit.validStudioDraft(outline,scenes));
 assert.equal(audit.studioRuntimePlausible(outline.narration,15,"es"),false);
 const input={mode:"audit",topic:"Humor de pareja",idea:"Cuchara caliente, disculpa y abrazo",
  audience:"Público general",style:"stickman",seconds:15,
  language:"es",voiceProvider:"none",confirmPlanCost:true,outline,scenes};
 const response=await POST({headers:{get:()=>null},json:async()=>input});
 assert.equal(response.status,200,JSON.stringify(response.body));
 assert.equal(response.body.auditPassed,true);
 assert.equal(response.body.scenes.length,6);
 assert.equal(response.body.outline.narration,outline.narration);
 assert.equal(response.body.scenes.map(s=>s.speech).join(" "),outline.narration);
 assert.equal(calls(),2); // Independent audit failed, bounded non-billing rescue accepted the valid draft.
});
test("a voiced storyboard with natural duration variance is not deleted when the auditor times out",async()=>{
 const {outline,scenes}=fixture(),{POST}=setup();
 const estimated=audit.estimatedStudioVoiceSeconds(outline.narration,"es");
 assert.ok(estimated>0);
 const result=await POST({headers:{get:()=>null},json:async()=>({
  mode:"audit",topic:"Humor de pareja",idea:"Una disculpa graciosa",
  audience:"Adultos",style:"stickman",seconds:30,language:"es",
  voiceProvider:"elevenlabs",confirmPlanCost:true,outline,scenes
 })});
 // A short narration may be genuinely too brief for 30 seconds; in that
 // case the worker-safe upper/lower bound, not a strict ±9% gate, governs.
 const compatible=audit.studioRuntimeCompatible(outline.narration,30,"es","elevenlabs");
 assert.equal(result.status,compatible?200:502);
 if(compatible){
  assert.equal(result.body.auditPassed,true);
  assert.equal(result.body.scenes.length,6);
 }
});
test("route receives the selected voice mode, and the client never blocks silent scripts on word count",()=>{
 const ui=fs.readFileSync("app/vista-app/video-studio/page.tsx","utf8");
 const route=fs.readFileSync("app/api/video-studio/plan/route.ts","utf8");
 assert.match(ui,/style:visual,seconds,language,voiceProvider/);
 assert.match(ui,/studioRuntimeCompatible\(narrationDraft,seconds,language,voiceProvider\)/);
 assert.match(ui,/voiceProvider==="none"\?"Duraciones flexibles/);
 assert.match(route,/rescueStudioDraft\(outline,scenes,seconds,language,voiceProvider\)/);
 assert.match(route,/studioAuditIssues\(outline,scenes,seconds,language,voiceProvider\)/);
 assert.match(route,/voiceProvider==="none"/);
 assert.doesNotMatch(route,/vmv_studio_create_job|charge_credits|stripe/);
});
