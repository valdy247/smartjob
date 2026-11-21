import {NextRequest,NextResponse} from "next/server";
import {askAiAgent} from "@/lib/vmv-ai-agents/model";
export const runtime="nodejs";export const dynamic="force-dynamic";
const respond=(body:object,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
const rate=new Map<string,{count:number;reset:number}>();
const days=["mon","tue","wed","thu","fri","sat","sun"] as const;
const clock=/^([01]\d|2[0-3]):[0-5]\d$/;
export async function POST(req:NextRequest){
 const ip=(req.headers.get("x-vercel-forwarded-for")||req.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim().slice(0,64);
 const now=Date.now(),entry=rate.get(ip)||{count:0,reset:now+15*60000};
 if(now>entry.reset){entry.count=0;entry.reset=now+15*60000;}
 entry.count++;rate.set(ip,entry);
 if(entry.count>6)return respond({error:"too_many_requests"},429);
 let input="";
 try{
  const raw=await req.text();if(raw.length>1100)return respond({error:"invalid_input"},400);
  const data=JSON.parse(raw) as {text?:unknown};
  input=typeof data.text==="string"?data.text.trim():"";
 }catch{return respond({error:"invalid_input"},400);}
 if(input.length<10||input.length>400||/[<>]/.test(input))return respond({error:"invalid_input"},400);
 try{
  const response=await askAiAgent({
   system:"Extract a real business's recurring weekly public opening hours from the user's Spanish/English natural-language text. Do NOT guess days or times that were not stated. Respond ONLY JSON: {\"mon\":{\"closed\":true,\"start\":\"09:00\",\"end\":\"17:00\"}, ...} exactly 7 weekday keys mon,tue,wed,thu,fri,sat,sun. 24-hour HH:MM. For days that are not clearly covered set closed:true. If e.g Monday through Friday 11 am to 4 pm, set those days 11:00-16:00 and weekend closed. For open days include closed:false and valid start/end (no overnight spans). Don't claim the calendar is verified until owner reviews it.",
   messages:[{role:"user",content:input}],maxOutputTokens:380,temperature:0,timeoutMs:11500
  });
  const found=response.match(/\{[\s\S]*\}/)?.[0];
  if(!found)return respond({error:"unrecognized_schedule"},422);
  const object=JSON.parse(found) as Record<string,unknown>;
  const hours=days.map(day=>{
   const item=object[day] as {closed?:unknown;start?:unknown;end?:unknown}|undefined;
   if(!item||typeof item.closed!=="boolean")throw Error("malformed_day");
   if(item.closed)return {closed:true,start:"09:00",end:"17:00"};
   if(typeof item.start!=="string"||typeof item.end!=="string"||
    !clock.test(item.start)||!clock.test(item.end)||item.start>=item.end)throw Error("malformed_time");
   return {closed:false,start:item.start,end:item.end};
  });
  if(hours.every(h=>h.closed))return respond({error:"unrecognized_schedule"},422);
  return respond({hours,source:"AI",requiresApproval:true});
 }catch{return respond({error:"schedule_unavailable"},503);}
}
