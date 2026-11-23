const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");
function load(path,requireFn=()=>{throw Error("Unexpected dependency");}){
 const code=ts.transpileModule(fs.readFileSync(path,"utf8"),{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const module={exports:{}};
 vm.runInNewContext(code,{exports:module.exports,module,require:requireFn},{timeout:3000});
 return module.exports;
}
const auditor=load("lib/vmv-studio-script-auditor.ts");
const rescue=load("lib/vmv-studio-preflight-rescue.ts",id=>{
 if(id==="./vmv-studio-script-auditor")return auditor;
 throw Error("Unexpected dependency "+id);
});
const source=[
 "¡Oye, humano! ¿Sabías que llevas toda tu vida confundido conmigo?",
 "¡No soy una verdura, soy una fruta!",
 "Y para hacerlo más interesante, ¡técnicamente soy una baya!",
 "Aunque no lo parezca, soy familia del tomate y la papa.",
 "Mi piel morada contiene antioxidantes llamados antocianinas, que me hacen no solo bonita sino también saludable.",
 "Y aquí va mi superpoder: ¡absorbo aceite como una esponja!",
 "Así que la próxima vez que me frías, recuerda que tengo más trucos de los que imaginas.",
 "Después de saber todo esto, ¿todavía piensas que soy aburrida?"
];
const visuals=[
 "A cute violet animated eggplant faces the audience in a medium shot, looking surprised beside a kitchen counter.",
 "In a bold split-screen visual, the purple eggplant stands between vegetable and fruit baskets.",
 "An educational macro cutaway of the violet eggplant beside assorted berries to show a botanical comparison.",
 "A family tree of garden plants with clearly visible eggplants, ripe tomatoes and fresh potatoes.",
 "Extreme close up view of purple eggplant skin with colorful scientific pigment particles floating in the background.",
 "A top-down shot of eggplant slices in a skillet visibly absorbing oil like a small sponge.",
 "The eggplant chef gestures toward a pan, delivering a humorous knowing expression in a bright kitchen.",
 "A wide low-angle ending shot of the eggplant character smiling toward the camera and gesturing to the audience."
];
const fixture=()=>{
 const scenes=source.map((speech,i)=>({speech,imagePrompt:visuals[i],caption:speech.slice(0,42),motion:i%2===0?"animate":"zoom"}));
 const outline={title:"La verdad de la berenjena",logline:"Una berenjena animada revela su identidad.",
  hook:"¡Oye humano!",ending:"¿Soy aburrida?",characters:"Purple eggplant talking in a fun cartoon",
  setting:"Colorful home kitchen",beats:visuals.map(x=>x.slice(0,160)),narration:source.join(" ")};
 return {scenes,outline};
};
test("the exact 90-word eggplant story is repaired to a natural 30s without losing its berry reveal",()=>{
 const {outline,scenes}=fixture();
 assert.equal(outline.narration.split(/\s+/).length,90);
 assert.equal(auditor.studioRuntimePlausible(outline.narration,30,"es"),false);
 const result=rescue.rescueStudioDraft(outline,scenes,30,"es");
 assert.ok(result,"recover the story instead of returning an empty page");
 assert.equal(result.outline.narration,result.scenes.map(x=>x.speech).join(" "));
 assert.ok(auditor.studioRuntimePlausible(result.outline.narration,30,"es"));
 assert.ok(result.outline.narration.includes("baya"),"do not cut the central fact");
 assert.ok(result.outline.narration.includes("tomate"));
 assert.ok(result.outline.narration.includes("antocianinas"));
 assert.equal(result.scenes.length,7);
 assert.equal(result.scenes.some(x=>x.speech.startsWith("Así que la próxima vez")),false);
});
test("recovery varies identical images without modifying spoken claims",()=>{
 const {outline,scenes}=fixture();
 scenes[3].imagePrompt=scenes[2].imagePrompt;
 outline.narration=scenes.map(x=>x.speech).join(" ");
 const result=rescue.rescueStudioDraft(outline,scenes,30,"es");
 assert.ok(result);
 assert.deepEqual(Array.from(auditor.repetitiveVisualPairs(result.scenes)),[]);
 assert.ok(result.scenes[3].imagePrompt.includes("narrated moment"));
 assert.ok(result.outline.narration.includes("baya"));
});
test("a short script is not padded with empty claims",()=>{
 const {outline,scenes}=fixture();
 const shortScenes=scenes.slice(0,3);
 const shortOutline={...outline,narration:shortScenes.map(x=>x.speech).join(" ")};
 assert.equal(rescue.rescueStudioDraft(shortOutline,shortScenes,30,"es"),null);
});
test("the source script is never mutated by the recovery process",()=>{
 const {outline,scenes}=fixture();
 const snapshot=JSON.stringify({outline,scenes});
 rescue.rescueStudioDraft(outline,scenes,30,"es");
 assert.equal(JSON.stringify({outline,scenes}),snapshot);
});
test("incomplete AI-generated image batches receive corresponding varied visual directions",()=>{
 const {outline}=fixture();
 const batch=rescue.rescueVisualBatch(source.slice(0,3),outline,0);
 assert.equal(batch.length,3);
 assert.equal(batch.map(x=>x.speech).join(" "),source.slice(0,3).join(" "));
 assert.ok(batch.every(x=>x.imagePrompt.length>=35&&x.imagePrompt.length<=950));
 assert.notEqual(batch[0].imagePrompt,batch[1].imagePrompt);
 assert.ok(batch.every(x=>x.motion==="animate"||x.motion==="zoom"));
});
test("the audio scene analyzer remains separate from editorial preview",()=>{
 const route=fs.readFileSync("app/api/video-studio/plan/route.ts","utf8");
 assert.match(route,/rescueStudioDraft\(outline,scenes,seconds,language\)/);
 assert.match(route,/rescueVisualBatch\(voiceoverExcerpts,outline,start\)/);
 assert.doesNotMatch(route,/vmv_studio_create_job\(/);
});
