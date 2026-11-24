/** Direction and bounded visual QA for Video Studio.
 * A recurring cast has ONE neutral model sheet, never the previous shot as
 * the next image reference. The user's narration drives every composition.
 */
const cinematicShots=[
 {shot:"intimate close-up",camera:"eye-level tight close-up with strong foreground/background separation"},
 {shot:"wide establishing",camera:"wide-angle three-quarter shot with clear subject-to-environment relationship"},
 {shot:"comparison",camera:"medium-wide two-subject composition with visual contrast"},
 {shot:"detail",camera:"macro insert focused on the specific detail being explained"},
 {shot:"action",camera:"dynamic side or overhead angle showing the actual physical interaction"},
 {shot:"payoff",camera:"distinctive final hero shot with a changed backdrop and meaningful resolution"}
];
export function sceneVisualDirection(scene,index,total,notes=""){
 const text=String(scene?.speech||"")+" "+String(scene?.imagePrompt||"");
 const role=/[?¡!]/u.test(String(scene?.speech||""))&&index===0?"hook":
  index===total-1?"payoff":/(why|porque|por qu[eé]|cómo|how|explains|explica|dato|facts|fact)/i.test(text)?"explanation":
  /(sart[eé]n|pan|absor|demonstr|cooking|cook|action|acción|battle|mov|corre|run|jumps)/i.test(text)?"demonstration":
  /(macro|pigment|color|piel|skin|detail|detalle|microscop)/i.test(text)?"detail":
  index===0?"opening":"development";
 const cameraRole=role==="detail"?cinematicShots[3]:
  role==="demonstration"?cinematicShots[4]:
  role==="payoff"?cinematicShots[5]:
  cinematicShots[index%cinematicShots.length];
 return {
  role,
  shot:cameraRole.shot,
  direction:[
   "DIRECTED SHOT "+(index+1)+"/"+total+": "+role+".",
   "CAMERA: "+cameraRole.camera+".",
   "Visualize the ACTUAL new fact or action of this spoken line rather than posing the narrator.",
   "Keep the framing and surroundings different from the previous scene.",
   "The recurring actor may be OFF SCREEN for explanatory inserts; do not force a character into every shot.",
   "No text, signs, labels, logos or subtitles baked into the picture.",
   notes?("CORRECTION FROM VISUAL QA: "+String(notes).slice(0,420)):""
  ].filter(Boolean).join(" ")
 };
}
export function imageUsesCharacterReference(scene,useReference){
 if(useReference!==true)return false;
 const prompt=String(scene?.imagePrompt||"");
 const broll=/\b(macro|microscopic|cross.section|diagram|infographic|overhead.*(?:pan|skillet|sart[eé]n)|oil.absorb|nutrient.particl|extreme.detail|cutaway.detail)\b/i.test(prompt);
 const visible=/\b(character|mascot|protagonist|speaking|talking|smiling|faces|gesturing|full.body|eggplant.character|person|actor)\b/i.test(prompt);
 return !broll||visible;
}
export function validVisualPlan(plan,count){
 if(!plan||typeof plan!=="object"||typeof plan.identityNeeded!=="boolean"||
  typeof plan.characterDescription!=="string"||plan.characterDescription.length>900||
  !Array.isArray(plan.sceneReference)||plan.sceneReference.length!==count||
  !plan.sceneReference.every(x=>typeof x==="boolean"))return false;
 return !plan.identityNeeded||
  (plan.characterDescription.trim().length>=20&&plan.sceneReference.some(Boolean));
}
export function sanitizedVisualFeedback(report,offset,count){
 if(!report||typeof report!=="object"||!Array.isArray(report.problems))return [];
 return report.problems.slice(0,8).flatMap(item=>{
  if(!item||!Number.isInteger(item.index)||item.index<0||item.index>=count||
   typeof item.problem!=="string"||item.problem.length>180||
   typeof item.direction!=="string"||item.direction.trim().length<25||
   item.direction.length>600||
   !["repetition","story","identity","composition"].includes(item.problem))return [];
  return [{index:offset+item.index,problem:item.problem,direction:item.direction.trim()}];
 });
}
