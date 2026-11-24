import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {sanitizedVisualFeedback,validVisualPlan} from "./visual-director.mjs";

const parseJson=async response=>{
 if(!response.ok)throw Error("visual_quality_provider_"+response.status);
 const data=await response.json();
 try{return JSON.parse(data.choices?.[0]?.message?.content||"");}
 catch{throw Error("visual_quality_invalid_json");}
};
/** One inexpensive classifier to decide whether a reusable CHARACTER reference
 * is warranted; b-roll and explanatory diagrams can ignore it. This is not a
 * cost-bearing video generation step and does not reserve more user credits.
 */
export async function planVisualIdentity(job,request,openai,key){
 const scenes=job.scenes||[];
 const response=await request(openai+"/chat/completions",{
  method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
  body:JSON.stringify({model:"gpt-4.1-mini",temperature:0,max_tokens:460,
   response_format:{type:"json_object"},
   messages:[{role:"system",content:[
    "You design recurring visual identities for a multi-shot AI video.",
    "Decide if the same PERSON, MASCOT or CARTOON CHARACTER should retain an exact appearance across shots.",
    "For geography, cooking demonstrations, landscapes and documentaries without a recurring protagonist, identityNeeded=false.",
    "When true, produce ONE detailed description of the character's fixed appearance only: shape, face, colors, proportions and clothing.",
    "Never mention a scene background, pose, camera, lighting, action, location or expression in the permanent identity description.",
    "sceneReference is one boolean per scene: true ONLY when that character needs to be visible.",
    "False for macro detail inserts, cutaways, demonstrations that show only ingredients or other objects.",
    'Return strict JSON: {"identityNeeded":boolean,"characterDescription":string,"sceneReference":boolean[]}.'
   ].join(" ")},
   {role:"user",content:JSON.stringify({style:job.style,scenes:scenes.map(s=>({
    speech:String(s.speech||"").slice(0,200),
    visual:String(s.imagePrompt||"").slice(0,320)
   }))})}]})
 },26000);
 const result=await parseJson(response);
 if(!validVisualPlan(result,scenes.length))throw Error("visual_identity_invalid");
 return result;
}
export async function generateCharacterMaster(plan,job,request,openai,key){
 if(!plan.identityNeeded)return null;
 const prompt=[
  "CREATE ONE ORIGINAL CHARACTER IDENTITY REFERENCE, not a frame from the final video.",
  "A single complete standing neutral model of this exact consistent actor:",
  plan.characterDescription.slice(0,800),
  "Strict style: "+job.style+". Clean neutral light gray studio background, no objects or scenery.",
  "Show the character clearly centered with face, silhouette, stable clothing and colors.",
  "This reference is used ONLY for identity, never for its pose, background or camera.",
  "NO text, captions, watermark, logos, scenery, inset panels or unrelated secondary characters."
 ].join(" ");
 const response=await request(openai+"/images/generations",{
  method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
  body:JSON.stringify({model:"gpt-image-1-mini",size:"1024x1536",quality:"medium",
   output_format:"jpeg",n:1,prompt:prompt.slice(0,3500)})
 },180000);
 if(!response.ok)throw Error("visual_master_provider_"+response.status);
 const data=await response.json();
 const b64=data?.data?.[0]?.b64_json;
 if(typeof b64!=="string"||b64.length<5000||b64.length>13000000)
  throw Error("visual_master_invalid");
 return Buffer.from(b64,"base64");
}
export async function contactSheet(files,dir,offset,shell){
 if(!files.length||files.length>8)throw Error("visual_contact_invalid");
 const output=path.join(dir,"contact-"+offset+".jpg"),args=["-hide_banner","-loglevel","error","-y"];
 for(const f of files)args.push("-i",f);
 let filter="";
 for(let i=0;i<files.length;i++){
  filter+="["+i+":v]scale=192:288:force_original_aspect_ratio=increase,"+
   "crop=192:288,setsar=1[v"+i+"];";
 }
 filter+=files.map((_,i)=>"[v"+i+"]").join("")+"xstack=inputs="+files.length+
  ":layout="+files.map((_,i)=>(i%4*192)+"_"+Math.floor(i/4)*288).join("|")+
  ":fill=white[out]";
 args.push("-filter_complex",filter,"-map","[out]","-frames:v","1","-q:v","6",output);
 await shell("ffmpeg",args,90000);
 return readFile(output);
}
export async function reviewVisualSequence(
 job,scenes,files,start,dir,request,openai,key,shell
){
 const sheet=await contactSheet(files,dir,start,shell);
 const response=await request(openai+"/chat/completions",{
  method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
  body:JSON.stringify({model:"gpt-4.1-mini",temperature:0,max_tokens:550,
   response_format:{type:"json_object"},
   messages:[{role:"system",content:[
    "You are a strict EDITORIAL VISUAL DIRECTOR reviewing ACTUAL finished storyboard images.",
    "This image is a contact sheet, read left-to-right top-to-bottom, one video shot per tile.",
    "Judge the real compositions, do not simply compare the written prompts.",
    "Identify repeated subject scale, camera angle, identical backgrounds and nearly identical poses that create monotonous video.",
    "The same recurring character appearance is GOOD continuity, not repetition. Distinct environments, actions and B-ROLL are valuable.",
    "Compare the image in each tile with its provided spoken narration, reject wrong visual facts or misplaced characters.",
    "Do not force a recurring character into detailed inserts where it does not belong.",
    "Flag only material problems. Do not invent defects, criticize style preference or recommend changing the narration.",
    "Provide max 3 targeted fixes per contact sheet; give an actionable NEW camera/location/action instruction for EACH.",
    "Use 0-based tile indices. Allowed problem names: repetition, story, identity, composition.",
    'Strict JSON only: {"problems":[{"index":0,"problem":"repetition","direction":"Full detailed corrective camera and scene action instruction"}]}.'
   ].join(" ")},
   {role:"user",content:[
    {type:"text",text:JSON.stringify({style:job.style,scenes:scenes.map((s,i)=>({
     index:i,speech:String(s.speech||"").slice(0,180),
     visual:String(s.imagePrompt||"").slice(0,300)
    }))})},
    {type:"image_url",image_url:{url:"data:image/jpeg;base64,"+sheet.toString("base64"),detail:"high"}}
   ]}]})
 },45000);
 const report=await parseJson(response);
 return sanitizedVisualFeedback(report,start,files.length);
}
