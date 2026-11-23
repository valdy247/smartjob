/** Video Studio preflight: one bounded editorial review before user preview.
 * No audio or credits are generated here. The final render still aligns to
 * measured voice timestamps, not estimated per-scene seconds.
 */
export type StudioAuditScene={
 speech:string;imagePrompt:string;caption:string;motion:"animate"|"zoom"
};
export type StudioAuditOutline={
 title:string;logline:string;hook:string;ending:string;characters:string;
 setting:string;narration:string;beats:string[]
};
export type StudioAuditEdit=StudioAuditScene&{index:number;reason:string};
export type StudioAuditDecision={
 decision:"pass"|"fix"|"block";reason:string;changes:StudioAuditEdit[]
};
export type StudioAuditedDraft={
 outline:StudioAuditOutline;scenes:StudioAuditScene[];
 audit:{decision:"pass"|"fix";reason:string;estimatedSeconds:number;changedMoments:number}
};
const normalize=(value:string)=>value.trim().replace(/\s+/g," ");
export function estimatedStudioVoiceSeconds(script:string,language:string){
 const words=normalize(script).split(/\s+/).filter(Boolean).length;
 return words/(language==="es"?2.3:2.25);
}
export function studioRuntimePlausible(script:string,seconds:number,language:string){
 const estimate=estimatedStudioVoiceSeconds(script,language);
 return Number.isInteger(seconds)&&seconds>=15&&seconds<=180&&
  Math.abs(estimate-seconds)<=Math.max(3,seconds*.1);
}
function sceneValid(s:StudioAuditScene):boolean{
 return typeof s?.speech==="string"&&s.speech.trim().length>=5&&s.speech.length<=230&&
  typeof s.imagePrompt==="string"&&s.imagePrompt.trim().length>=35&&s.imagePrompt.length<=950&&
  typeof s.caption==="string"&&s.caption.trim().length>=2&&s.caption.length<=110&&
  (s.motion==="animate"||s.motion==="zoom");
}
export function validStudioDraft(outline:StudioAuditOutline,scenes:StudioAuditScene[]){
 return Boolean(outline&&Array.isArray(outline.beats)&&
  typeof outline.narration==="string"&&outline.narration.length<=9000&&
  Array.isArray(scenes)&&scenes.length>=3&&scenes.length<=36&&
  scenes.every(sceneValid)&&
  normalize(scenes.map(s=>s.speech).join(" "))===normalize(outline.narration));
}
/** Reject untrusted edits that rewrite a healthy story, change numbering, or
 * leave a draft that would later fail the worker's duration preflight.
 */
export function applyStudioAudit(
 originalOutline:StudioAuditOutline,originalScenes:StudioAuditScene[],
 report:StudioAuditDecision,seconds:number,language:string
):StudioAuditedDraft|null{
 if(!validStudioDraft(originalOutline,originalScenes)||!report||
  !["pass","fix","block"].includes(report.decision)||
  typeof report.reason!=="string"||report.reason.length>320||
  !Array.isArray(report.changes))return null;
 if(report.decision==="block")return null;
 if(report.decision==="pass"&&report.changes.length)return null;
 const limit=Math.max(2,Math.ceil(originalScenes.length*.35));
 if(report.changes.length>limit)return null;
 const unique=new Set<number>();
 const revised=originalScenes.map(s=>({...s}));
 for(const change of report.changes){
  if(!change||!Number.isInteger(change.index)||change.index<0||
   change.index>=originalScenes.length||unique.has(change.index)||
   !sceneValid(change)||typeof change.reason!=="string"||
   change.reason.trim().length<3||change.reason.length>220)return null;
  unique.add(change.index);
  revised[change.index]={
   speech:change.speech.trim(),imagePrompt:change.imagePrompt.trim(),
   caption:change.caption.trim(),motion:change.motion
  };
 }
 if(report.decision==="fix"&&!unique.size)return null;
 const narration=revised.map(s=>s.speech.trim()).join(" ");
 const nextOutline={...originalOutline,narration};
 if(!validStudioDraft(nextOutline,revised)||
  !studioRuntimePlausible(narration,seconds,language))return null;
 return {
  outline:nextOutline,scenes:revised,
  audit:{
   decision:report.decision,reason:report.reason.trim().slice(0,320),
   estimatedSeconds:Math.round(estimatedStudioVoiceSeconds(narration,language)*10)/10,
   changedMoments:unique.size
  }
 };
}
