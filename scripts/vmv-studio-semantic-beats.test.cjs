const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");
const src=fs.readFileSync("lib/vmv-studio-semantic-beats.ts","utf8");
const compiled=ts.transpileModule(src,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const mod={exports:{}};
vm.runInNewContext(compiled,{module:mod,exports:mod.exports},{timeout:3000});
const {splitNarrationIntoMoments,approximateMomentSeconds}=mod.exports;
test("eggplant story uses complete ideas rather than six forced five-second slices",()=>{
 const narration=[
  "¡Oye, humano! ¿Sabías que llevas toda tu vida confundido conmigo?",
  "¡No soy una verdura, soy una fruta! Y técnicamente soy una baya, aunque no lo parezca, soy familia del tomate y la papa.",
  "Mi piel morada contiene antioxidantes llamados antocianinas que me hacen especial.",
  "Además, tengo un superpoder: ¡absorbo aceite como una esponja!",
  "Después de saber todo esto, ¿todavía piensas que soy aburrida?"
 ].join(" ");
 const scenes=splitNarrationIntoMoments(narration);
 assert.ok(scenes.length>=3&&scenes.length<=12,scenes.length);
 assert.equal(scenes.join(" "),narration);
 assert.ok(scenes.some(line=>line.includes("soy una baya")));
 assert.ok(scenes.some(line=>line.includes("como una esponja")));
 assert.ok(new Set(scenes.map(line=>line.split(/\\s+/).length)).size>1);
 assert.ok(scenes.some(line=>approximateMomentSeconds(line,narration,30)>5));
 assert.ok(scenes.some(line=>approximateMomentSeconds(line,narration,30)<5));
});
test("very short interjections attach to the next thought instead of using a micro-shot",()=>{
 const result=splitNarrationIntoMoments("¡Hola! ¿Qué te parece este planeta? Es mucho más extraño de lo que imaginas. Hay océanos bajo enormes capas de hielo. Y toda la historia apenas comienza.");
 assert.ok(result.length>=3);
 assert.match(result[0],/^¡Hola! ¿Qué/);
});
test("long stories are capped to thirty-six moments without losing text",()=>{
 const s=Array.from({length:40},(_,i)=>"Este es el capítulo "+(i+1)+" sobre la naturaleza y sus cambios constantes.").join(" ");
 const moments=splitNarrationIntoMoments(s);
 assert.ok(moments.length>=3&&moments.length<=36);
 assert.equal(moments.join(" "),s);
});
test("narration without logical breaks is rejected, not divided into equal word blocks",()=>{
 const s="Esto es una narración continua sin signos de puntuación que no permite identificar ningún momento visual significativo para esta historia";
 assert.deepEqual(Array.from(splitNarrationIntoMoments(s)),[]);
});
