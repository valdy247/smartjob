// A five-second visual shot must never determine where a spoken sentence ends.
// Audio timestamps drive subtitles; the visual shots cover the audio timeline independently.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function speechTimeline(scenes,duration,alignment=null){
 if(!Number.isFinite(duration)||duration<1||duration>300||!Array.isArray(scenes)||!scenes.length)
  throw Error("voice_duration_invalid");
 const text=scenes.map(s=>String(s.speech||"").trim()).join(" ");
 const segments=scenes.map((_,i)=>{
  const start=duration*i/scenes.length,end=duration*(i+1)/scenes.length;
  return {index:i,start,end,duration:end-start};
 });
 const cues=[];
 if(Array.isArray(alignment?.words)&&alignment.words.length){
  // Whisper timestamps describe the words actually heard in the continuous recording.
  // Use that real timeline even when transcription punctuation differs from the source.
  const words=alignment.words.filter(w=>typeof w?.word==="string"&&w.word.trim()&&
   Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.end>w.start&&w.start>=0&&w.start<duration);
  const sourceWords=text.split(/\s+/).filter(Boolean);
  if(words.length<Math.max(3,Math.floor(sourceWords.length*.8)))
   throw Error("voice_alignment_incomplete");
  let last=0;
  for(let i=0;i<words.length;i+=5){
   const batch=words.slice(i,i+5),start=clamp(batch[0].start,0,duration);
   const end=clamp(batch.at(-1).end,start+.04,duration);
   if(start+0.04>=end||end<=last)continue;
   cues.push({start:Math.max(last,start),end,text:batch.map(w=>w.word.trim()).join(" ")});
   last=end;
  }
  if(!cues.length)throw Error("voice_alignment_incomplete");
  return {duration,segments,cues,alignmentSource:"whisper_words"};
 }
 const chars=alignment?.characters;
 const starts=alignment?.character_start_times_seconds,ends=alignment?.character_end_times_seconds;
 if(Array.isArray(chars)&&Array.isArray(starts)&&Array.isArray(ends)&&
  chars.length===starts.length&&chars.length===ends.length&&
  chars.join("").replace(/\s+/g," ").trim()===text.replace(/\s+/g," ").trim()){
  const words=[];let word="",first=0,last=0;
  const flush=()=>{if(word.trim())words.push({text:word.trim(),start:first,end:last});word="";};
  chars.forEach((ch,i)=>{
   if(/\s/u.test(ch)){flush();return;}
   if(!word)first=starts[i];
   word+=ch;last=ends[i];
  });flush();
  for(let i=0;i<words.length;i+=5){
   const batch=words.slice(i,i+5);
   if(Number.isFinite(batch[0].start)&&Number.isFinite(batch.at(-1).end))
    cues.push({start:clamp(batch[0].start,0,duration),end:clamp(batch.at(-1).end,0,duration),
     text:batch.map(w=>w.text).join(" ")});
  }
  if(cues.length)return {duration,segments,cues,alignmentSource:"elevenlabs_characters"};
 }
 // Legacy fallback is retained for old completed projects, but new renders must
 // explicitly obtain real alignment before assembling subtitles.
 const words=text.split(/\s+/).filter(Boolean);
 for(let i=0;i<words.length;i+=5){
  const group=words.slice(i,i+5);
  cues.push({start:duration*i/words.length,end:duration*(i+group.length)/words.length,text:group.join(" ")});
 }
 return {duration,segments,cues,alignmentSource:"estimated_legacy"};
}
