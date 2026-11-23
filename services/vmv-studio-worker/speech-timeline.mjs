// Shared scene timing for VMV Pilot's continuous voice track and Seedance montage.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function speechTimeline(scenes,duration,alignment=null){
 if(!Number.isFinite(duration)||duration<1||duration>300||!scenes?.length)throw Error("voice_duration_invalid");
 const text=scenes.map(s=>s.speech.trim()).join(" ");
 const timedWords=alignment?.words;
 if(Array.isArray(timedWords)&&timedWords.length){
  const words=timedWords.filter(w=>typeof w.word==="string"&&Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.end>w.start);
  const normalize=s=>s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,"");
  const sourceWords=scenes.flatMap(s=>s.speech.trim().split(/\s+/));
  if(words.length!==sourceWords.length||words.some((w,i)=>normalize(w.word)!==normalize(sourceWords[i])))
   throw Error("voice_alignment_text_mismatch");
  let cursor=0,previous=0;const segments=[];
  for(let i=0;i<scenes.length;i++){
   cursor+=scenes[i].speech.trim().split(/\s+/).length;
   const end=i===scenes.length-1?duration:Math.min(duration,Math.max(previous+.05,(words[cursor-1].end+words[cursor].start)/2));
   segments.push({index:i,start:previous,end,duration:end-previous});previous=end;
  }
  const cues=[];
  for(let i=0;i<words.length;i+=5){const group=words.slice(i,i+5);
   cues.push({start:group[0].start,end:group.at(-1).end,text:group.map(w=>w.word.trim()).join(" ")});}
  return {duration,segments,cues,alignmentSource:"word_timestamps"};
 }
 const characters=alignment?.characters;
 const ends=alignment?.character_end_times_seconds;
 let boundaries=null;
 if(Array.isArray(characters)&&Array.isArray(ends)&&characters.length===ends.length&&
  characters.join("").replace(/\s+/g," ").trim()===text.replace(/\s+/g," ").trim()){
  let position=0;
  boundaries=scenes.map((scene,i)=>{
   position+=scene.speech.trim().length;
   const time=ends[position-1];
   if(i<scenes.length-1)position++;
   return time;
  });
  if(boundaries.some((v,i)=>!Number.isFinite(v)||v<=0||(i>0&&v<=boundaries[i-1]))||
   Math.abs(boundaries.at(-1)-duration)>2)boundaries=null;
 }
 if(!boundaries){
  const weights=scenes.map(s=>Math.max(1,s.speech.trim().split(/\s+/).length));
  const total=weights.reduce((a,b)=>a+b,0);let elapsed=0;
  boundaries=weights.map(w=>(elapsed+=duration*w/total));
 }
 let previous=0;
 const segments=boundaries.map((value,i)=>{
  const end=i===scenes.length-1?duration:clamp(value,previous+.05,duration-.05*(scenes.length-i-1));
  const segment={index:i,start:previous,end,duration:end-previous};
  previous=end;return segment;
 });
 const cues=[];
 if(Array.isArray(characters)&&Array.isArray(alignment?.character_start_times_seconds)&&
  characters.length===alignment.character_start_times_seconds.length&&characters.length===ends?.length){
  let word="",first=0,last=0,words=[];
  const flush=()=>{if(word.trim())words.push({text:word.trim(),start:first,end:last});word="";};
  characters.forEach((char,i)=>{
   if(/\s/u.test(char)){flush();return;}
   if(!word)first=alignment.character_start_times_seconds[i];
   word+=char;last=ends[i];
  });flush();
  for(let i=0;i<words.length;i+=5){
   const batch=words.slice(i,i+5);
   cues.push({start:batch[0].start,end:batch.at(-1).end,text:batch.map(w=>w.text).join(" ")});
  }
 }else{
  for(const scene of segments){
   const words=scenes[scene.index].speech.trim().split(/\s+/);
   for(let i=0;i<words.length;i+=5){
    const group=words.slice(i,i+5);
    cues.push({start:scene.start+scene.duration*i/words.length,
     end:scene.start+scene.duration*(i+group.length)/words.length,text:group.join(" ")});
   }
  }
 }
 return {duration,segments,cues};
}
