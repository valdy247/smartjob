import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoHeaders} from "@/lib/vmv-video-generator";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=180;
const SCENE_COUNT=6;
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
 "You are an expert short-form video narrator. Write a SINGLE compelling 30-second narration in the user's language. The narration is AUDIO ONLY, not instructions for the images.",
 "Create a strong curiosity hook, concise scientific or story explanation, and a surprising payoff. For Spanish, use 48-54 spoken words total, 8-9 words per five-second segment at natural speaking pace. Keep each segment short enough to fit in five seconds WITHOUT speeding up or cutting words. Each segment is part of one continuous speech, not six separate mini-stories.",
 "Avoid unsupported factual claims, dead air, repetition, filler, and directions such as camera or scene descriptions.",
 'Return JSON only: {"title":"...","speech":["0-5 second speech","5-10 second speech","10-15 second speech","15-20 second speech","20-25 second speech","25-30 second speech"]}.'
].join(" ");
const visualSystem=[
 "You are the VISUAL FILM DIRECTOR, working independently from the narrator. The audio narration is supplied for timing and subject knowledge ONLY. Never illustrate each sentence literally and never treat narration text as an image prompt.",
 "Design exactly six VISUALLY distinct but logically consecutive five-second shots that make a compelling 30-second film. Each shot must communicate new visual information with purposeful subject movement, a clear composition, and distinct cinematic action. No redundant shots, generic crowds, repeated zoom-outs, or camera motion substituting for action.",
 "For educational facts, show clever visual metaphors, useful scale comparisons or transformations. Do not render physically nonsensical elements: a globe must not hover over a desert after transitioning to ground level. For character stories, the same protagonist should look consistent across cuts.",
 "Continuity means logical storytelling and stable appearance of recurring characters and recognizable art direction; NOT preservation of all previous objects, exact camera position or scene location. Freely change setting, distance, cast visibility, camera angle and props when the story logically requires it.",
 "Invent one coherent styleGuide stating only persistent art style, palette and recurring character traits, not a mandatory set of objects or fixed background. It should NOT force the same environment in all shots.",
 "Each imagePrompt must be a self-sufficient English prompt for generating ONE original first frame from text, portrait 9:16, with the exact shot's own people, objects, location, framing, and art direction. Explicitly say which recurring features are kept and which scene-specific elements are present. No dependence on previous image and never instruct the model to copy it.",
 "Each motionPrompt must independently specify the exact 5-second movement and changing visual content to animate FROM the scene's first frame, using verbs and concrete subject action. No recap or instant time-travel.",
 "Match requested genre: cinematic photorealistic scientific visualization for documentary education, polished stylized 2D for cartoons, or user's stated look. No baked-in lettering, logos or speech bubbles.",
 'Return JSON only: {"storyBible":"shared aesthetic/recurring character traits only","scenes":[{"caption":"2-5 words in narration language","imagePrompt":"English first-frame visual direction","motionPrompt":"English five-second motion"}]} exactly 6 scenes. Speech is NOT part of this output.'
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
 if(typeof content!=="string"||!content.trim())throw Error("motion_scene_retry");
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
 if(prompt.length<8||prompt.length>500||body?.confirmCost!==true)return reply({error:"invalid_motion_request"},400);
 if(!process.env.OPENAI_API_KEY)return reply({error:"openai_key_not_configured"},503);
 // Private preview is already restricted to the explicitly allowlisted owner.
 // No daily test quota: the owner controls each paid generation via confirmCost.
 try{
  const narration=await askOpenAI(narrationSystem,prompt,850);
  if(!Array.isArray(narration.speech)||narration.speech.length!==SCENE_COUNT||
   narration.speech.some(v=>typeof v!=="string"||v.trim().length<8||v.length>165))
   return reply({error:"motion_scene_retry"},503);
  const spoken=narration.speech as string[];
  const visuals=await askOpenAI(visualSystem,JSON.stringify({
   idea:prompt,title:narration.title,narrationForTimingOnly:spoken
  }),3600);
  if(!Array.isArray(visuals.scenes)||visuals.scenes.length!==SCENE_COUNT)
   return reply({error:"motion_scene_retry"},503);
  const enriched={title:narration.title,storyBible:visuals.storyBible,
   scenes:visuals.scenes.map((scene,i)=>({
    ...(scene as Record<string,unknown>),speech:spoken[i]
   }))};
  const parsed=parse(enriched);
  if(!parsed)return reply({error:"motion_scene_retry"},503);
  return reply({...parsed,model:"gpt-4.1-mini",directorVersion:3,durationSeconds:30});
 }catch(e){
  const message=e instanceof Error?e.message:"unknown";
  console.warn("[vmv-motion-openai]",message);
  if(/free tier users do not have access|upgrade to paid credits/i.test(message))
   return reply({error:"terra_gateway_paid_credits_required"},402);
  if(/insufficient_quota|billing|credits exhausted/i.test(message))
   return reply({error:"terra_credits_exhausted"},402);
  if(/rate.limit|429/i.test(message))return reply({error:"terra_rate_limited"},429);
  return reply({error:"motion_ai_unavailable"},503);
 }
}
