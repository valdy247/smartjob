// VMV Motion: source TTS can finish early; schedule its phrases into fixed-length scenes.
export type SceneVoiceSlot={
 index:number;sourceStart:number;sourceEnd:number;
 timelineStart:number;timelineSeconds:number;playbackRate:number;
};
export type SceneCaptionCue={start:number;end:number;text:string};
type Alignment={characters:string[];character_start_times_seconds:number[];character_end_times_seconds:number[]};
function syncError(reason:string){
 return Error(reason+" Los clips de Seedance se conservan sin cambios.");
}
export function createSceneVoiceTimeline(
 sceneEnds:number[]|null|undefined,audioSeconds:number,sceneCount:number,videoSeconds:number
):SceneVoiceSlot[]{
 if(!Number.isInteger(sceneCount)||sceneCount<1||sceneCount>12||
  !Number.isFinite(videoSeconds)||videoSeconds<=0||
  !Number.isFinite(audioSeconds)||audioSeconds<=0||
  !Array.isArray(sceneEnds)||sceneEnds.length!==sceneCount)
  throw syncError("La narración no tiene marcas de tiempo válidas por escena. Vuelve a crear la voz.");
 const slotSeconds=videoSeconds/sceneCount;
 if(!Number.isFinite(slotSeconds)||slotSeconds<2)
  throw syncError("La duración de las escenas no es válida.");
 const last=sceneEnds[sceneCount-1];
 if(!Number.isFinite(last)||Math.abs(last-audioSeconds)>0.9)
  throw syncError("La narración y sus tiempos no coinciden. Vuelve a crear la voz.");
 const result:SceneVoiceSlot[]=[];
 let prior=0;
 for(let index=0;index<sceneCount;index++){
  const end=index===sceneCount-1?Math.max(last,audioSeconds):sceneEnds[index];
  if(!Number.isFinite(end)||end<=prior+0.2||end>audioSeconds+0.25)
   throw syncError("Los tiempos de voz de la escena "+(index+1)+" son inválidos.");
  const span=end-prior;
  // Leave ~120ms per scene to avoid cutting the final syllable at the next shot.
  const playbackRate=Math.max(1,span/Math.max(0.5,slotSeconds-0.12));
  if(playbackRate>1.28)
   throw syncError("La frase de la escena "+(index+1)+" dura "+span.toFixed(1)+
    " s y no cabe con naturalidad en "+slotSeconds.toFixed(1)+
    " s. Acorta esa frase y vuelve a crear la voz.");
  result.push({index,sourceStart:prior,sourceEnd:Math.min(end,audioSeconds),
   timelineStart:index*slotSeconds,timelineSeconds:slotSeconds,playbackRate});
  prior=end;
 }
 return result;
}
export function createSceneCaptionCues(alignment:Alignment,slots:SceneVoiceSlot[]):SceneCaptionCue[]{
 if(!slots.length)return [];
 const {characters,character_start_times_seconds:starts,character_end_times_seconds:ends}=alignment;
 if(!Array.isArray(characters)||!Array.isArray(starts)||!Array.isArray(ends)||
  characters.length!==starts.length||characters.length!==ends.length)return [];
 const words:{text:string;start:number;end:number;scene:number}[]=[];
 let token="",start=0,end=0;
 const flush=()=>{
  if(!token.trim()){token="";return;}
  let scene=slots.findIndex(s=>end<=s.sourceEnd+0.025);
  if(scene<0)scene=slots.length-1;
  words.push({text:token.trim(),start,end,scene});
  token="";
 };
 for(let i=0;i<characters.length;i++){
  const ch=characters[i],from=starts[i],to=ends[i];
  if(typeof ch!=="string"||!Number.isFinite(from)||!Number.isFinite(to))return [];
  if(/\s/u.test(ch)){flush();continue;}
  if(!token)start=from;
  token+=ch;end=to;
 }
 flush();
 const cues:SceneCaptionCue[]=[];
 for(let i=0;i<words.length;){
  const scene=words[i].scene;
  const group:typeof words=[];
  while(i<words.length&&words[i].scene===scene&&group.length<5)group.push(words[i++]);
  const slot=slots[scene];
  const from=Math.max(slot.timelineStart,slot.timelineStart+
   (group[0].start-slot.sourceStart)/slot.playbackRate);
  const to=Math.min(slot.timelineStart+slot.timelineSeconds,slot.timelineStart+
   (group[group.length-1].end-slot.sourceStart)/slot.playbackRate);
  if(to>from)cues.push({start:from,end:to,text:group.map(w=>w.text).join(" ")});
 }
 return cues;
}
