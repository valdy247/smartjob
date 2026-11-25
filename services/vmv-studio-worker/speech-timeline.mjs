// The voice recording is canonical. Visual edits follow actual spoken-word
// boundaries; unlike legacy timelines, scene lengths are never divided evenly.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const normalize=(word)=>String(word||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]/g,"");
const sourceWords=scenes=>scenes.flatMap(s=>String(s.speech||"").trim().split(/\s+/).filter(Boolean));
function characterWords(alignment,text){
 const chars=alignment?.characters,starts=alignment?.character_start_times_seconds,
  ends=alignment?.character_end_times_seconds;
 if(!Array.isArray(chars)||!Array.isArray(starts)||!Array.isArray(ends)||
  chars.length!==starts.length||chars.length!==ends.length||
  chars.join("").replace(/\s+/g," ").trim()!==text.replace(/\s+/g," ").trim())return null;
 const words=[];let word="",first=0,last=0;
 const flush=()=>{if(word.trim())words.push({word,start:first,end:last});word="";};
 chars.forEach((ch,i)=>{if(/\s/u.test(ch)){flush();return;}if(!word)first=starts[i];word+=ch;last=ends[i];});
 flush();return words;
}
function recognizedWords(alignment,duration,text){
 const fromWhisper=Array.isArray(alignment?.words)&&alignment.words.length;
 const input=fromWhisper?alignment.words:characterWords(alignment,text);
 if(!Array.isArray(input)||!input.length)return null;
 const words=input.map(w=>({word:String(w.word||""),start:Number(w.start),end:Number(w.end)}))
  .filter(w=>w.word.trim()&&Number.isFinite(w.start)&&Number.isFinite(w.end)&&
   w.start>=0&&w.end>w.start&&w.start<duration&&w.end<=duration+.5);
 if(!words.length)return null;
 for(let i=1;i<words.length;i++)if(words[i].start+0.05<words[i-1].start)
  throw Error("voice_alignment_incomplete");
 return {words,source:fromWhisper?"whisper_words":"elevenlabs_characters"};
}
function visualSegments(scenes,duration,recognized){
 const original=sourceWords(scenes),heard=recognized.map(w=>normalize(w.word)),
  written=original.map(normalize),n=written.length,m=heard.length;
 if(n<6||m<3||m<Math.floor(n*.78)||m>n*1.25)throw Error("voice_alignment_incomplete");
 // LCS aligns imperfect transcripts without guessing a time from equal scene lengths.
 // Memory is bounded by 36 scenes / 180-second narration.
 const width=m+1,dp=new Uint16Array((n+1)*width);
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--){
  dp[i*width+j]=written[i]&&written[i]===heard[j]?
   1+dp[(i+1)*width+j+1]:
   Math.max(dp[(i+1)*width+j],dp[i*width+j+1]);
 }
 const matches=[];let i=0,j=0;
 while(i<n&&j<m){
  if(written[i]&&written[i]===heard[j]){matches.push({source:i,heard:j});i++;j++;}
  else if(dp[(i+1)*width+j]>=dp[i*width+j+1])i++;
  else j++;
 }
 if(matches.length<Math.max(3,Math.floor(n*.72)))throw Error("voice_alignment_incomplete");
 const segments=[],counts=scenes.map(s=>sourceWords([s]).length);let total=0;
 for(let k=0;k<scenes.length;k++){
  const start=segments.length?segments.at(-1).end:0;
  total+=counts[k];
  let end=duration;
  if(k<scenes.length-1){
   const next=matches.find(match=>match.source>=total);
   const previous=[...matches].reverse().find(match=>match.source<total);
   if(!next||!previous)throw Error("voice_scene_alignment_incomplete");
   // A cut happens at the beginning of the FIRST word of the next thought.
   // A gap between sentences belongs to the preceding visual, not a black frame.
   end=clamp(recognized[next.heard].start,0,duration);
  }
  if(end<=start+.25||end>duration+.05)throw Error("voice_scene_alignment_incomplete");
  segments.push({index:k,start,end,duration:end-start});
 }
 return segments;
}
export function speechTimeline(scenes,duration,alignment=null){
 if(!Number.isFinite(duration)||duration<1||duration>300||!Array.isArray(scenes)||
  scenes.length<1||scenes.length>36)throw Error("voice_duration_invalid");
 const text=scenes.map(s=>String(s.speech||"").trim()).join(" ");
 const source=recognizedWords(alignment,duration,text);
 if(!source)throw Error("voice_alignment_unavailable");
 const {words}=source,segments=visualSegments(scenes,duration,words);
 const cues=[];let last=0;
 for(let i=0;i<words.length;i+=5){
  const batch=words.slice(i,i+5),start=clamp(batch[0].start,0,duration),
   end=clamp(batch.at(-1).end,start+.04,duration);
  if(end<=last)continue;
  cues.push({start:Math.max(last,start),end,text:batch.map(w=>w.word.trim()).join(" ")});
  last=end;
 }
 if(!cues.length)throw Error("voice_alignment_incomplete");
 return {duration,segments,cues,alignmentSource:source.source};
}
export function silentTimeline(scenes,duration,withCaptions=true){
 if(!Number.isFinite(duration)||duration<1||!Array.isArray(scenes)||scenes.length<3)throw Error("scene_timing_invalid");
 const counts=scenes.map(s=>sourceWords([s]).length),total=counts.reduce((a,b)=>a+b,0);
 if(!total)throw Error("scene_timing_invalid");
 let current=0;const segments=[],cues=[];
 scenes.forEach((scene,index)=>{
  const start=current;
  current=index===scenes.length-1?duration:duration*(counts.slice(0,index+1).reduce((a,b)=>a+b,0))/total;
  segments.push({index,start,end:current,duration:current-start});
  if(withCaptions)cues.push({start,end:current,text:String(scene.speech||"").trim()});
 });
 return {duration,segments,cues,alignmentSource:"silent_visual_timeline"};
}

/** Manual photo montage honors exactly the user-arranged five-second shots.
 * It never distributes durations by prose length or invents speech cues.
 */
export function manualTimeline(scenes,duration){
 if(!Array.isArray(scenes)||scenes.length<3||scenes.length>12||
  !Number.isInteger(duration)||duration!==scenes.length*5)
  throw Error("manual_scene_timing_invalid");
 const segments=scenes.map((scene,index)=>{
  if(scene.durationSeconds!==5)throw Error("manual_scene_timing_invalid");
  return {index,start:index*5,end:(index+1)*5,duration:5};
 });
 return {duration,segments,cues:[],alignmentSource:"manual_photo_timeline"};
}
