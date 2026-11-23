/** Fast editorial preflight. No credits are reserved or videos rendered here.
 * Actual shot duration always follows recorded audio timing in the worker.
 */
export type StudioAuditScene={speech:string;imagePrompt:string;caption:string;motion:"animate"|"zoom"};
export type StudioAuditOutline={
 title:string;logline:string;hook:string;ending:string;characters:string;
 setting:string;narration:string;beats:string[]
};
export type StudioAuditDecision={
 decision:"pass"|"revise";reason:string;title:string;scenes:StudioAuditScene[]
};
export type StudioAuditedDraft={
 outline:StudioAuditOutline;scenes:StudioAuditScene[];
 audit:{decision:"pass"|"revise";reason:string;estimatedSeconds:number;changedMoments:number}
};
const normalize=(v:string)=>v.trim().replace(/\s+/g," ");
const terms=(s:string)=>normalize(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]+/g," ").split(" ").filter(w=>w.length>=4&&
 !["same","with","that","this","from","animated","animation","scene","image","color","colors",
 "camera","character","characters","style","lighting","light","cinematic","frame","background",
 "consistent","continuous","purple","eggplant","shows","showing","detailed","visual"].includes(w));
export function estimatedStudioVoiceSeconds(script:string,language:string){
 const n=normalize(script).split(/\s+/).filter(Boolean).length;
 return n/(language==="es"?2.3:2.25);
}
export function studioRuntimePlausible(script:string,seconds:number,language:string){
 const estimate=estimatedStudioVoiceSeconds(script,language);
 return Number.isInteger(seconds)&&seconds>=15&&seconds<=180&&
  Math.abs(estimate-seconds)<=Math.max(2,seconds*.09);
}
const sceneValid=(s:StudioAuditScene)=>Boolean(s&&typeof s.speech==="string"&&
 s.speech.trim().length>=5&&s.speech.length<=230&&
 typeof s.imagePrompt==="string"&&s.imagePrompt.trim().length>=35&&s.imagePrompt.length<=950&&
 typeof s.caption==="string"&&s.caption.trim().length>=2&&s.caption.length<=110&&
 ["animate","zoom"].includes(s.motion));
export function validStudioDraft(outline:StudioAuditOutline,scenes:StudioAuditScene[]){
 return Boolean(outline&&typeof outline.narration==="string"&&
  Array.isArray(scenes)&&scenes.length>=3&&scenes.length<=36&&
  scenes.every(sceneValid)&&normalize(outline.narration)===normalize(scenes.map(s=>s.speech).join(" "))&&
  outline.narration.length<=9000);
}
/** Allow recurring characters, but reject consecutive nearly identical visual actions.
 * This is a warning signal, not a substitute for the editor's semantic judgment.
 */
export function repetitiveVisualPairs(scenes:StudioAuditScene[]):number[]{
 const overlaps:number[]=[];
 for(let i=1;i<scenes.length;i++){
  const a=new Set(terms(scenes[i-1].imagePrompt)),b=new Set(terms(scenes[i].imagePrompt));
  const union=new Set([...a,...b]).size,common=[...a].filter(t=>b.has(t)).length;
  const exact=normalize(scenes[i-1].imagePrompt).toLowerCase()===
   normalize(scenes[i].imagePrompt).toLowerCase();
  if(exact||(union>=5&&common/union>=.73))overlaps.push(i);
 }
 return overlaps;
}
export function studioAuditIssues(outline:StudioAuditOutline,scenes:StudioAuditScene[],
 seconds:number,language:string):string[]{
 const issues:string[]=[];
 if(!validStudioDraft(outline,scenes))issues.push("Storyboard incomplete or narration does not match visual segments");
 if(!studioRuntimePlausible(outline?.narration||"",seconds,language))
  issues.push("Voiceover length does not match selected runtime");
 if(Array.isArray(scenes)){
  const repeated=repetitiveVisualPairs(scenes);
  if(repeated.length)issues.push("Repetitive adjacent visual prompts at scene numbers "+repeated.map(i=>i+1).join(", "));
 }
 return issues;
}
/** The AI may rewrite ALL scenes or change their count when necessary.
 * A validated pass leaves everything intact; a revision is atomic, never partial.
 */
export function applyStudioAudit(
 originalOutline:StudioAuditOutline,originalScenes:StudioAuditScene[],
 report:StudioAuditDecision,seconds:number,language:string
):StudioAuditedDraft|null{
 if(!validStudioDraft(originalOutline,originalScenes)||!report||
  !["pass","revise"].includes(report.decision)||
  typeof report.reason!=="string"||report.reason.trim().length<4||
  report.reason.length>320||!Array.isArray(report.scenes)||
  typeof report.title!=="string")return null;
 const originalIssues=studioAuditIssues(originalOutline,originalScenes,seconds,language);
 if(report.decision==="pass"){
  if(report.scenes.length||report.title.trim()||originalIssues.length)return null;
  return {outline:originalOutline,scenes:originalScenes,
   audit:{decision:"pass",reason:report.reason.trim(),estimatedSeconds:
    Math.round(estimatedStudioVoiceSeconds(originalOutline.narration,language)*10)/10,changedMoments:0}};
 }
 const title=report.title.trim()||originalOutline.title;
 const scenes=report.scenes.map(s=>({
  speech:typeof s.speech==="string"?s.speech.trim():"",
  imagePrompt:typeof s.imagePrompt==="string"?s.imagePrompt.trim():"",
  caption:typeof s.caption==="string"?s.caption.trim():"",
  motion:s.motion
 }));
 const narration=scenes.map(s=>s.speech).join(" ");
 const outline={...originalOutline,title,narration,beats:scenes.map(s=>s.imagePrompt.slice(0,160))};
 if(title.length<3||title.length>100||studioAuditIssues(outline,scenes,seconds,language).length)
  return null;
 const changed=scenes.length!==originalScenes.length?Math.max(scenes.length,originalScenes.length):
  scenes.reduce((total,s,i)=>total+Number(
   s.speech!==originalScenes[i].speech||s.imagePrompt!==originalScenes[i].imagePrompt||
   s.motion!==originalScenes[i].motion||s.caption!==originalScenes[i].caption),0);
 return {outline,scenes,
  audit:{decision:"revise",reason:report.reason.trim(),estimatedSeconds:
   Math.round(estimatedStudioVoiceSeconds(narration,language)*10)/10,changedMoments:changed}};
}
