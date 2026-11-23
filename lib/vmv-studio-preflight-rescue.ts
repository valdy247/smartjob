/** Video Studio deterministic rescue when an AI audit returns malformed output.
 * Never invent claims. May remove redundant complete beats and vary framing.
 * Actual video timing still follows the worker's measured audio.
 */
import {
 estimatedStudioVoiceSeconds,studioRuntimePlausible,studioAuditIssues,validStudioDraft,repetitiveVisualPairs
} from "./vmv-studio-script-auditor";
import type {StudioAuditScene,StudioAuditOutline,StudioAuditedDraft} from "./vmv-studio-script-auditor";

const shots=[
 "Wide establishing shot revealing the entire environment and the subject in context",
 "Extreme close-up macro detail with selective focus on the narrated object",
 "Overhead camera showing the relationship of the objects in a clear arrangement",
 "Low angle three-quarter camera revealing the subject's distinct physical action",
 "Side profile medium shot with visible foreground and background contrast",
 "Dynamic tracking camera emphasizing the event described by the voiceover",
 "Cutaway detail of the specific item just mentioned in the spoken narration",
 "High angle two-subject composition demonstrating an actual interaction"
] as const;
const normalized=(s:string)=>s.trim().replace(/\s+/g," ");
const words=(s:string)=>new Set(normalized(s).toLowerCase().normalize("NFD")
 .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9 ]/g," ")
 .split(/\s+/).filter(w=>w.length>4));
function removableIndex(scenes:StudioAuditScene[]):number{
 let selected=-1,score=Infinity;
 for(let i=1;i<scenes.length-1;i++){
  const own=words(scenes[i].speech),outside=new Set(
   scenes.filter((_,j)=>j!==i).flatMap(s=>[...words(s.speech)]));
  const unique=[...own].filter(t=>!outside.has(t)).length;
  const redundancy=[...own].filter(t=>outside.has(t)).length;
  const transition=/^(as[ií] que|adem[aá]s|y para|por otro lado|de hecho|en otras palabras|y tambi[eé]n|so next time|by the way|also|furthermore)\b/i.test(scenes[i].speech);
  const specificity=(/[\d]|:|[!?]|antioxid|tomate|baya|esponja|fruta|scientific|fact/i.test(scenes[i].speech)?2:0);
  const value=unique*3-redundancy+specificity*3-(transition?10:0);
  if(value<score){score=value;selected=i;}
 }
 return selected;
}
export function rescueStudioDraft(
 outline:StudioAuditOutline,source:StudioAuditScene[],seconds:number,language:string
):StudioAuditedDraft|null{
 if(!validStudioDraft(outline,source))return null;
 const scenes=source.map(s=>({...s}));
 const originalCount=scenes.length;
 // Keep complete thoughts; never accelerate or cut the spoken waveform.
 for(let turn=0;turn<8;turn++){
  const narration=scenes.map(s=>normalized(s.speech)).join(" ");
  const estimate=estimatedStudioVoiceSeconds(narration,language);
  if(studioRuntimePlausible(narration,seconds,language))break;
  if(estimate<seconds||scenes.length<=3)return null;
  const pick=removableIndex(scenes);
  if(pick<0)return null;
  scenes.splice(pick,1);
 }
 for(let round=0;round<3;round++){
  const repeats=repetitiveVisualPairs(scenes);
  if(!repeats.length)break;
  for(const i of repeats){
   const visual=scenes[i].imagePrompt.replace(/\.\s*$/,"").slice(0,500);
   const line=normalized(scenes[i].speech).slice(0,125);
   scenes[i].imagePrompt=shots[i%shots.length]+
    ". Visualize the specific narrated moment: "+line+". "+visual+".";
  }
 }
 const narration=scenes.map(s=>normalized(s.speech)).join(" ");
 const fixedOutline={...outline,narration,beats:scenes.map(s=>s.imagePrompt.slice(0,160))};
 if(studioAuditIssues(fixedOutline,scenes,seconds,language).length)return null;
 return {outline:fixedOutline,scenes,audit:{
  decision:"revise",reason:"Recovered natural pacing and varied repeated shot directions without inventing facts.",
  estimatedSeconds:Math.round(estimatedStudioVoiceSeconds(narration,language)*10)/10,
  changedMoments:originalCount-scenes.length+repetitiveVisualPairs(source).length
 }};
}

/** Recover visual batches without losing a usable narration when structured image
 * prompts are malformed. The final editorial review can replace all of them.
 */
export function rescueVisualBatch(
 lines:string[],outline:StudioAuditOutline,start:number
):StudioAuditScene[]{
 const motions=["animate","zoom","animate","zoom","animate","zoom"] as const;
 return lines.map((speech,index)=>{
  const i=start+index;
  const beat=outline.beats[i%outline.beats.length]||outline.logline;
  const shot=shots[i%shots.length];
  const character=outline.characters.slice(0,170);
  const setting=outline.setting.slice(0,120);
  return {
   speech,
   imagePrompt:(
    shot+". "+character+" in "+setting+". "+
    "The foreground must clearly illustrate this exact narration: "+speech.slice(0,205)+
    ". Visual idea: "+beat.slice(0,150)+
    ". No rendered letters or subtitles. Keep consistent character identity."
   ).slice(0,900),
   caption:speech.trim().split(/\s+/).slice(0,7).join(" ").slice(0,110),
   motion:motions[i%motions.length]
  };
 });
}
