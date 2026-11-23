// Preserve user-authored spoken dialogue when every timed five-second line is supplied.
// Never fabricate missing lines when user text has an incomplete or duplicate timestamp.
export function extractTimedNarration(prompt:string,count:number):string[]|null{
 if(!Number.isInteger(count)||count<1||count>12)return null;
 const segments=new Map<number,string>();
 for(const line of prompt.split(/\r?\n/)){
  const match=line.match(/(?:^|\s)\*{0,2}\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(?:s|segundos?|seconds?)?\s*:?\*{0,2}\s*[«“"]([^»”"]+)[»”"]/i);
  if(!match)continue;
  const start=Number(match[1]),end=Number(match[2]);
  if(start<0||start%5!==0||end!==start+5||start>=count*5||segments.has(start))return null;
  const dialogue=match[3].trim();
  if(dialogue.length<8||dialogue.length>165)return null;
  segments.set(start,dialogue);
 }
 if(segments.size!==count)return null;
 const ordered=Array.from({length:count},(_,i)=>segments.get(i*5));
 return ordered.every((line):line is string=>typeof line==="string"&&line.length>=8)?
  ordered as string[]:null;
}
