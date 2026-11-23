/** Natural story moments, independent of five-second video windows.
 * Preserve every spoken word and split at completed thoughts, not equal word counts.
 */
const words=(text:string)=>text.trim().split(/\s+/).filter(Boolean).length;
const normalize=(text:string)=>text.trim().replace(/\s+/g," ");
const connectors=/\s+(?=(?:pero|aunque|adem[aá]s|despu[eé]s|entonces|porque|however|but|although|then|meanwhile|therefore|finally)\b)/iu;
const isValid=(pieces:string[])=>pieces.length>=3&&pieces.length<=36&&
 pieces.every(part=>part.length>=5&&part.length<=230&&words(part)>=2);
export function splitNarrationIntoMoments(narration:string):string[]{
 const script=normalize(narration);
 if(!script||script.length>9000)return [];
 const sentences=script.split(/(?<=[.!?。！？])\s+/u).map(normalize).filter(Boolean);
 const chunks:string[]=[];
 for(const sentence of sentences){
  // Split overlong thoughts at punctuation; never interrupt a short clause.
  const clauses=sentence.split(/(?<=[,;:—])\s+/u).map(normalize).filter(Boolean);
  let current="";
  for(const clause of clauses){
   const combined=normalize([current,clause].filter(Boolean).join(" "));
   if(current&&words(combined)>19&&words(current)>=4){chunks.push(current);current=clause;}
   else current=combined;
  }
  if(current)chunks.push(current);
 }
 // Long clauses may contain a clear transition even without punctuation.
 const refined:string[]=[];
 for(const chunk of chunks){
  if(words(chunk)>23&&connectors.test(chunk)){
   const parts=chunk.split(connectors).map(normalize).filter(Boolean);
   let current="";
   for(const part of parts){
    const joined=normalize([current,part].filter(Boolean).join(" "));
    if(current&&words(joined)>18&&words(current)>=4){refined.push(current);current=part;}
    else current=joined;
   }
   if(current)refined.push(current);
  }else refined.push(chunk);
 }
 // Keep very short phrases connected to a neighbor, without altering the script.
 const result:string[]=[];
 for(const part of refined){
  if(result.length&&words(part)<4&&result[result.length-1].length+part.length+1<=230)
   result[result.length-1]+=" "+part;
  else result.push(part);
 }
 while(result.length>36){
  let merged=false;
  for(let i=0;i<result.length-1;i++){
   if(result[i].length+result[i+1].length+1<=230){
    result.splice(i,2,result[i]+" "+result[i+1]);merged=true;break;
   }
  }
  if(!merged)return [];
 }
 if(!isValid(result))return [];
 return normalize(result.join(" "))===script?result:[];
}
export const approximateMomentSeconds=(speech:string,whole:string,totalSeconds:number)=>{
 const total=words(whole),part=words(speech);
 return total>0?Math.max(.5,Math.round(totalSeconds*part/total*10)/10):0;
};
