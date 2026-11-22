import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoDb,videoHeaders} from "@/lib/vmv-video-generator";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const reply=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers:videoHeaders});
type Camera={focusX:number;focusY:number;startZoom:number;endZoom:number};
type Scene={speech:string;caption:string;imagePrompt:string;motionPrompt:string;camera:Camera};
const num=(v:unknown,min:number,max:number)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max?v:null;
function parse(raw:unknown):{title:string;storyBible:string;scenes:[Scene,Scene,Scene]}|null{
 if(!raw||typeof raw!=="object")return null;
 const obj=raw as Record<string,unknown>;
 if(!Array.isArray(obj.scenes)||obj.scenes.length!==3)return null;
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
  scenes:scenes as [Scene,Scene,Scene]};
}
const system=[
 "You are an expert director, screenwriter and visual storytelling artist for 15-second vertical short videos. Match the genre requested by the user: 2D character cartoon for cartoon stories, cinematic scientific visualization for educational facts, or other requested style. Never force cartoons on documentary content.",
 "Write exactly three consecutive five-second beats with compelling distinct visual information: 1 striking hook, 2 tangible escalation or evidence, 3 surprising visual reveal/payoff. For educational videos, use a precise visual comparison or transformation, not a static crowd with endless zoom-out. Never repeat camera-only zooms as the entire action.",
 "Create one STORY BIBLE describing in precise English the characters, colors, clothing, height ratio, props and environment. Repeat these immutable visual details in EACH imagePrompt.",
 "Return JSON only, with keys title, storyBible and scenes. scenes is an array of exactly 3 objects, each with: speech (Spanish short narration), caption (2-5 words), imagePrompt (full English illustrated start frame description), motionPrompt (English exact 5-second motion direction), camera (focusX 270, focusY 435, startZoom 1.02, endZoom 1.3).",
 "In each imagePrompt write a full, independently usable English text-to-image prompt for one complete portrait 9:16 illustrated frame. Show the exact action and expression at its strongest instant.",
 "Image quality must be premium and appropriate to the topic, with visual substance and coherent motion possibilities, dramatic but believable scale, readable subject and strong composition. Avoid generic stock-like images, motionless large groups, and repeated zooming.",
 "Describe consistent character appearance, colors and clothes identically in every prompt. Put the cast's exact visual traits explicitly into EACH scene prompt to improve continuity.",
 "Composition: subjects occupy the middle 70%, leave upper and lower safe areas for captions. NO lettering, NO logos, NO speech bubbles, NO watermarks.",
 "Every scene must have a recognizable environment; show the STARTING pose BEFORE that beat begins so animation can perform the assigned action. The same location and cast must be recognizable in every frame.",
 "motionPrompt: detailed English direction for how to animate the supplied starting image during ONLY its five-second beat. No recap, no jumping forward. 2-4 exact character actions, camera moves and end pose.",
 "Plan continuous camera grammar: each scene has an intentional visual change and distinct action, not merely a zoom. Camera focus coordinates refer to a 540x960 portrait frame.",
 "For each five-second beat, speech must fit naturally in 5 seconds (8-12 Spanish words at energetic pace). The full 3 speeches must form one fluid narration with a strong initial hook and meaningful end, not three disjoint statements. Captions are 2-5 words, both in the user's language. No made-up facts."
].join(" ");
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"video_not_enabled_for_account"},403);
 const len=Number(req.headers.get("content-length")||0);
 if(len>4000)return reply({error:"request_too_large"},413);
 const body=await req.json().catch(()=>null);
 const prompt=typeof body?.prompt==="string"?body.prompt.trim():"";
 if(prompt.length<8||prompt.length>500||body?.confirmCost!==true)return reply({error:"invalid_motion_request"},400);
 if(!process.env.OPENAI_API_KEY)return reply({error:"openai_key_not_configured"},503);
 const {data:granted,error:quotaError}=await videoDb().rpc("smartjob_web_ai_claim_video_test_slot",{p_owner:owner});
 if(quotaError)return reply({error:"motion_quota_unavailable"},503);
 if(granted!==true)return reply({error:"motion_limit"},429);
 try{
  const response=await fetch("https://api.openai.com/v1/chat/completions",{
   method:"POST",cache:"no-store",
   headers:{"Content-Type":"application/json",Authorization:"Bearer "+process.env.OPENAI_API_KEY},
   body:JSON.stringify({model:"gpt-4.1-mini",messages:[{role:"system",content:system},
    {role:"user",content:prompt}],max_tokens:2300,response_format:{type:"json_object"},store:false}),
   signal:AbortSignal.timeout(50000)
  });
  if(!response.ok){
   if(response.status===401)return reply({error:"openai_key_invalid"},503);
   if(response.status===429)return reply({error:"openai_quota_or_rate_limit"},429);
   console.warn("[vmv-motion-openai] HTTP",response.status);
   return reply({error:"openai_request_failed"},503);
  }
  const result=await response.json();
  const answer=typeof result?.choices?.[0]?.message?.content==="string"?result.choices[0].message.content:"";
  const start=answer.indexOf("{"),end=answer.lastIndexOf("}");
  if(start<0||end<start){console.warn("[vmv-motion-openai] no JSON object",result?.choices?.[0]?.finish_reason||"unknown");return reply({error:"motion_scene_retry"},503);}
  const parsed=parse(JSON.parse(answer.slice(start,end+1)));
  if(!parsed){console.warn("[vmv-motion-openai] scene validation failed",result?.choices?.[0]?.finish_reason||"unknown");return reply({error:"motion_scene_retry"},503);}
  return reply({...parsed,model:"gpt-4.1-mini"});
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
