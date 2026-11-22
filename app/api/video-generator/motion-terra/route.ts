import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoHeaders} from "@/lib/vmv-video-generator";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=180;
const SCENE_COUNT=12;
const reply=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers:videoHeaders});
type Camera={focusX:number;focusY:number;startZoom:number;endZoom:number};
type Scene={speech:string;caption:string;imagePrompt:string;motionPrompt:string;camera:Camera};
const num=(v:unknown,min:number,max:number)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max?v:null;
function parse(raw:unknown):{title:string;storyBible:string;scenes:Scene[]}|null{
 if(!raw||typeof raw!=="object")return null;
 const obj=raw as Record<string,unknown>;
 if(!Array.isArray(obj.scenes)||obj.scenes.length!==SCENE_COUNT)return null;
 const scenes:Scene[]=[];
 for(const rawScene of obj.scenes){
  if(!rawScene||typeof rawScene!=="object")return null;
  const row=rawScene as Record<string,unknown>;
  const speech=typeof row.speech==="string"?row.speech.trim().slice(0,165):"";
  const caption=typeof row.caption==="string"?row.caption.trim().slice(0,70):"";
  const imagePrompt=typeof row.imagePrompt==="string"?row.imagePrompt.trim().slice(0,1700):"";
  if(speech.length<8||imagePrompt.length<35)return null;
  const motionPrompt=typeof row.motionPrompt==="string"?row.motionPrompt.trim().slice(0,650):"";
  const c=(row.camera&&typeof row.camera==="object"?row.camera:{}) as Record<string,unknown>;
  scenes.push({speech,caption,imagePrompt,motionPrompt:motionPrompt||imagePrompt,camera:{
   focusX:num(c.focusX,90,450)??270,focusY:num(c.focusY,260,630)??435,
   startZoom:num(c.startZoom,1,1.16)??1.02,endZoom:num(c.endZoom,1.15,1.5)??1.3
  }});
 }
 return {title:typeof obj.title==="string"?obj.title.slice(0,80):"VMV Motion",
  storyBible:typeof obj.storyBible==="string"?obj.storyBible.slice(0,1200):"",
  scenes:scenes};
}
const narrationSystem=[
 "You are an expert short-form video narrator. Write a SINGLE compelling 60-second narration in the user's language. The narration is AUDIO ONLY, not instructions for the images.",
 "Create a strong curiosity hook, scientific explanation and payoff. For Spanish, aim for 96-108 spoken words total across exactly twelve connected short phrases. Keep each phrase short enough for approximately five seconds. Do not reveal an animal or a surprise before the story presents it.",
 "Avoid unsupported factual claims, dead air, repetition, filler, and directions such as camera or scene descriptions.",
 'Return JSON only: {"title":"...","speech":["0-5 second speech","5-10 second speech","10-15 second speech","15-20 second speech","20-25 second speech","25-30 second speech","30-35 second speech","35-40 second speech","40-45 second speech","45-50 second speech","50-55 second speech","55-60 second speech"]}.'
].join(" ");
const visualSystem=[
 "You are the VISUAL FILM DIRECTOR. Match every shot to the action and subject of its corresponding narration segment. Preserve the reveal order. NEVER show a character, animal or surprise before it is introduced in the narration.",
 "Design exactly twelve VISUALLY distinct but logically consecutive five-second shots that make a compelling 60-second film. Each shot must communicate new visual information with purposeful subject movement, a clear composition, and distinct cinematic action. No redundant shots, generic crowds, repeated zoom-outs, or camera motion substituting for action.",
 "For educational facts, show clever visual metaphors, useful scale comparisons or transformations. Do not render physically nonsensical elements: a globe must not hover over a desert after transitioning to ground level. For character stories, the same protagonist should look consistent across cuts.",
 "Continuity means logical storytelling and stable appearance of recurring characters and recognizable art direction; NOT preservation of all previous objects, exact camera position or scene location. Freely change setting, distance, cast visibility, camera angle and props when the story logically requires it.",
 "Invent one coherent styleGuide stating only persistent art style, palette and recurring character traits, not a mandatory set of objects or fixed background. It should NOT force the same environment in all shots.",
 "Each imagePrompt must be an independent, concise 50-90-word English first-frame prompt for its one matching speech segment, portrait 9:16, showing ONLY what is known and relevant at that point. Keep character designs consistent without importing unrelated props.",
 "Each motionPrompt is one short English sentence describing on-screen subject movement over five seconds, starting from the still. No recaps or instant time jumps.",
 "For this video use a consistent polished 2D hand-drawn STICKMAN CARTOON style: the dog, rat and fish are recognizable simple stick-character animals with expressive open eyes, articulated limbs/fins and genuine body motion; streets, cars, the laboratory, aquarium, buildings and props are richly colored, clean vector-like backgrounds with bold outlines. Keep the same animal designs across shots. Do not use photorealism, static slideshows or camera zoom as a substitute for character animation. No baked-in lettering, logos or speech bubbles.",
 'Return JSON only: {"storyBible":"shared aesthetic/recurring character traits only","scenes":[{"caption":"2-5 words in narration language","imagePrompt":"English first-frame visual direction","motionPrompt":"English five-second motion"}]} exactly 12 scenes. Speech is NOT part of this output.'
].join(" ");
async function askOpenAI(system:string,user:string,maxTokens:number){
 const response=await fetch("https://api.openai.com/v1/chat/completions",{
  method:"POST",cache:"no-store",
  headers:{"Content-Type":"application/json",Authorization:"Bearer "+process.env.OPENAI_API_KEY},
  body:JSON.stringify({model:"gpt-4.1-mini",messages:[{role:"system",content:system},
   {role:"user",content:user}],max_tokens:maxTokens,response_format:{type:"json_object"},store:false}),
  signal:AbortSignal.timeout(50000)
 });
 if(!response.ok){
  console.warn("[vmv-motion-director] provider status",response.status);
  if(response.status===401)throw Error("openai_key_invalid");
  if(response.status===429)throw Error("openai_quota_or_rate_limit");
  throw Error("openai_request_failed");
 }
 const result=await response.json();
 const content=result?.choices?.[0]?.message?.content;
 if(typeof content!=="string"||!content.trim()){
  console.warn("[vmv-motion-director] empty output",{finishReason:result?.choices?.[0]?.finish_reason});
  throw Error("motion_scene_retry");
 }
 if(result?.choices?.[0]?.finish_reason==="length"){
  console.warn("[vmv-motion-director] output truncated");
  throw Error("motion_output_truncated");
 }
 const parsed=JSON.parse(content) as unknown;
 if(!parsed||typeof parsed!=="object")throw Error("motion_scene_retry");
 return parsed as Record<string,unknown>;
}
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"video_not_enabled_for_account"},403);
 const len=Number(req.headers.get("content-length")||0);
 if(len>4000)return reply({error:"request_too_large"},413);
 const body=await req.json().catch(()=>null);
 const prompt=typeof body?.prompt==="string"?body.prompt.trim():"";
 if(prompt.length<8||prompt.length>2000||body?.confirmCost!==true)return reply({error:"invalid_motion_request"},400);
 if(!process.env.OPENAI_API_KEY)return reply({error:"openai_key_not_configured"},503);
 // Private preview is already restricted to the explicitly allowlisted owner.
 // No daily test quota: the owner controls each paid generation via confirmCost.
 try{
  const narration=await askOpenAI(narrationSystem,prompt,1500);
  if(!Array.isArray(narration.speech)||narration.speech.length!==SCENE_COUNT||
   narration.speech.some(v=>typeof v!=="string"||v.trim().length<8||v.length>165)){
   console.warn("[vmv-motion-director] invalid narration",{count:Array.isArray(narration.speech)?narration.speech.length:null});
   return reply({error:"motion_scene_retry",stage:"narration",reason:"invalid_segment_count_or_length"},422);
  }
  const spoken=narration.speech as string[];
  const visuals=await askOpenAI(visualSystem,JSON.stringify({
   idea:prompt,title:narration.title,narrationForTimingOnly:spoken
  }),9000);
  if(!Array.isArray(visuals.scenes)||visuals.scenes.length!==SCENE_COUNT){
   console.warn("[vmv-motion-director] invalid visual scenes",{count:Array.isArray(visuals.scenes)?visuals.scenes.length:null});
   return reply({error:"motion_scene_retry",stage:"storyboard",reason:"invalid_scene_count"},422);
  }
  const enriched={title:narration.title,storyBible:visuals.storyBible,
   scenes:visuals.scenes.map((scene,i)=>({
    ...(scene as Record<string,unknown>),speech:spoken[i]
   }))};
  const parsed=parse(enriched);
  if(!parsed){
   console.warn("[vmv-motion-director] invalid storyboard fields");
   return reply({error:"motion_scene_retry",stage:"storyboard",reason:"invalid_scene_fields"},422);
  }
  return reply({...parsed,model:"gpt-4.1-mini",directorVersion:3,durationSeconds:60});
 }catch(e){
  const message=e instanceof Error?e.message:"unknown";
  console.warn("[vmv-motion-openai]",message);
  if(/free tier users do not have access|upgrade to paid credits/i.test(message))
   return reply({error:"terra_gateway_paid_credits_required"},402);
  if(/insufficient_quota|billing|credits exhausted/i.test(message))
   return reply({error:"terra_credits_exhausted"},402);
  if(/rate.limit|429/i.test(message))return reply({error:"terra_rate_limited"},429);
  if(message==="motion_output_truncated")return reply({error:"motion_scene_retry",reason:"output_truncated"},422);
  if(message==="motion_scene_retry")return reply({error:"motion_scene_retry",reason:"invalid_model_output"},422);
  return reply({error:"motion_ai_unavailable"},503);
 }
}
