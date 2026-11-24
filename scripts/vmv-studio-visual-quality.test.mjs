import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm,readFile} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {sceneVisualDirection,imageUsesCharacterReference,validVisualPlan,
 sanitizedVisualFeedback} from "../services/vmv-studio-worker/visual-director.mjs";
import {planVisualIdentity,generateCharacterMaster,reviewVisualSequence,
 contactSheet} from "../services/vmv-studio-worker/visual-quality.mjs";

const scenes=[
 {speech:"¿Sabías que soy una fruta?",imagePrompt:"A purple talking eggplant mascot stares directly into the camera."},
 {speech:"Mi piel tiene pigmentos especiales.",imagePrompt:"Extreme macro closeup of violet skin pigment molecules with no characters."},
 {speech:"Absorbo aceite al cocinarme.",imagePrompt:"Overhead closeup of eggplant slices and oil in a frying pan."},
 {speech:"¿Todavía crees que soy aburrida?",imagePrompt:"The cartoon eggplant character dances beside a served dish."}
];
test("visual directions follow narration and do not force the same framed character",()=>{
 const shots=scenes.map((s,i)=>sceneVisualDirection(s,i,scenes.length));
 assert.equal(shots[0].role,"hook");
 assert.equal(shots.at(-1).role,"payoff");
 assert.equal(shots[1].role,"detail");
 assert.ok(shots[2].direction.includes("physical interaction"));
 assert.notEqual(shots[0].direction,shots[1].direction);
 assert.ok(shots.every(v=>v.direction.includes("may be OFF SCREEN")));
});
test("character master is used only when that character appears, never for scientific inserts",()=>{
 assert.equal(imageUsesCharacterReference(scenes[0],true),true);
 assert.equal(imageUsesCharacterReference(scenes[1],true),false);
 assert.equal(imageUsesCharacterReference(scenes[2],true),false);
 assert.equal(imageUsesCharacterReference(scenes[3],true),true);
 assert.equal(imageUsesCharacterReference(scenes[3],false),false);
});
test("visual identity plan checks scene completeness before an extra paid image call",()=>{
 assert.equal(validVisualPlan({identityNeeded:true,characterDescription:"Purple eggplant, thick eyebrows and a green calyx.",
  sceneReference:[true,false,false,true]},4),true);
 assert.equal(validVisualPlan({identityNeeded:true,characterDescription:"Purple eggplant",sceneReference:[true]},4),false);
 assert.equal(validVisualPlan({identityNeeded:false,characterDescription:"",sceneReference:[false,false,false,false]},4),true);
});
test("vision QA returns bounded actionable indexes and rejects hallucinated panels",()=>{
 const report={problems:[
  {index:1,problem:"repetition",direction:"Change to a high-angle shot showing the ingredient interaction, not a repeated portrait."},
  {index:17,problem:"story",direction:"Bogus panel index that is not visible in this image."},
  {index:2,problem:"weird",direction:"Unsupported problem type should never alter any image."},
  {index:2,problem:"identity",direction:"Make the recurring character's eyebrows and calyx consistent with its neutral reference."}
 ]};
 const p=sanitizedVisualFeedback(report,6,4);
 assert.deepEqual(p.map(x=>x.index),[7,8]);
 assert.equal(p[0].problem,"repetition");
});
test("one neutral master is generated once with limited artwork budget and no prior-scene reference",async()=>{
 const job={style:"cartoon2d",scenes},plan={identityNeeded:true,
  characterDescription:"Purple cartoon eggplant with expressive eyes, black thick eyebrows, green calyx.",
  sceneReference:[true,false,false,true]};
 let requests=0,body;
 const mock=async(url,options)=>{requests++;body=JSON.parse(options.body);
  return {ok:true,json:async()=>({data:[{b64_json:Buffer.alloc(8000,37).toString("base64")}]})};
 };
 const image=await generateCharacterMaster(plan,job,mock,"https://example.test","secret");
 assert.equal(requests,1);
 assert.equal(image.length,8000);
 assert.equal(body.model,"gpt-image-1-mini");
 assert.equal(body.quality,"medium");
 assert.match(body.prompt,/neutral/);
 assert.doesNotMatch(body.prompt,/scene 2|previous frame|same kitchen/i);
});
test("visual identity AI returns per-shot character visibility",async()=>{
 const job={style:"cartoon2d",scenes};
 const plan={identityNeeded:true,characterDescription:"Purple animated eggplant with thick brows and a bright green calyx.",
  sceneReference:[true,false,false,true]};
 const response=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(plan)}}]})});
 const data=await planVisualIdentity(job,response,"https://example.test","secret");
 assert.deepEqual(data.sceneReference,plan.sceneReference);
});
test("contact sheet compares ACTUAL images in one bounded vision call",async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),"studio-visual-test-"));
 try{
  const paths=await Promise.all(scenes.map(async(_,i)=>{
   const f=path.join(dir,"frame-"+i+".jpg");await writeFile(f,Buffer.alloc(1024,i+1));return f;
  }));
  let ffmpegCalls=0,visionCalls=0;
  const shell=async(cmd,args)=>{ffmpegCalls++;assert.equal(cmd,"ffmpeg");
   assert.match(args.join(" "),/xstack=inputs=4/);
   await writeFile(args.at(-1),Buffer.alloc(2048,11));
  };
  const request=async(url,options)=>{
   visionCalls++;assert.match(url,/chat\/completions/);
   const content=JSON.parse(options.body).messages.at(-1).content;
   assert.equal(content[1].type,"image_url");
   assert.equal(content[1].image_url.detail,"high");
   return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
    problems:[{index:1,problem:"repetition",direction:"Show the ingredient under a macro camera instead of repeating the narrator in the kitchen."}]
   })}}]})};
  };
  const found=await reviewVisualSequence({style:"cartoon2d"},scenes,paths,0,dir,
   request,"https://example.test","secret",shell);
  assert.equal(ffmpegCalls,1);
  assert.equal(visionCalls,1);
  assert.deepEqual(found.map(x=>x.index),[1]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("worker never edits the immediately previous scene to derive another one",async()=>{
 const src=(await readFile(new URL("../services/vmv-studio-worker/worker.mjs",import.meta.url),"utf8"));
 assert.match(src,/persistAsset\(job,"character_master"/);
 assert.match(src,/referenceFor\(i\)/);
 assert.doesNotMatch(src,/visualReference=previous|makeImage\(job,scenes\[i\],visualReference\)/);
 assert.match(src,/reviewVisualSequence\(job,scenes\.slice/);
 assert.match(src,/corrected>=2/);
 assert.match(src,/requiresReview=true/);
 assert.match(src,/visual_gallery_report/);
 assert.match(src,/job\.quality_mode==="high"\?"high":"medium"/);
});
