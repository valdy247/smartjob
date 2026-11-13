import type {Session} from "@supabase/supabase-js";
export const weekDays=["mon","tue","wed","thu","fri","sat","sun"] as const;
export type DayName=typeof weekDays[number];
export type Day={enabled:boolean;start:string;end:string};
export type CallPolicy={
 agent_enabled:boolean;translation_enabled:boolean;
 agent_mode:"always"|"schedule"|"after_no_answer";
 translation_mode:"always"|"schedule";
 coexistence:"menu"|"agent_first"|"translation_first";
 outside_action:"translation"|"message";
 ring_seconds:number;time_zone:string;use_business_hours:boolean;
 schedule:Record<DayName,Day>;translation_schedule:Record<DayName,Day>;closed_message:string;
};
export type CallInfo={
 policy:CallPolicy;version:number;maskedPhone:string;agentActive:boolean;
 selectedAgentId:string|null;forwardReady:boolean;businessHoursReady:boolean;source:string;
};
export type CallSimulation={decision:{action:string;reason:string;agentAvailable:boolean;
 translationAvailable:boolean};zone:string;selectedAgentReady:boolean};
export const zones=["America/New_York","America/Chicago","America/Denver",
 "America/Los_Angeles","America/Phoenix","America/Anchorage",
 "Pacific/Honolulu","America/Puerto_Rico"];
const base=process.env.EXPO_PUBLIC_VMV_AI_API||
 "https://smartjob-git-feat-vmv-smart-cal-fcbaa4-valdys-projects-b97fc7a6.vercel.app";
async function request<T>(session:Session,method:"GET"|"POST"|"PUT",input?:Record<string,unknown>):Promise<T>{
 const r=await fetch(base+"/api/vmv/ai-agents/call-settings",{
  method,headers:{"Content-Type":"application/json",
   Authorization:"Bearer "+session.access_token},
  ...(input?{body:JSON.stringify(input)}:{})
 });
 let payload:T&{error?:string};
 try{payload=await r.json();}catch{throw Error("El servidor de llamadas no respondió.");}
 if(!r.ok)throw Error(payload.error||"No se pudo guardar o consultar las llamadas.");
 return payload;
}
export const getCallInfo=(session:Session)=>request<CallInfo>(session,"GET");
export const saveCallInfo=(session:Session,policy:CallPolicy,version:number)=>
 request<CallInfo&{ok:true}>(session,"PUT",{policy,version});
export const simulateCallInfo=(session:Session,policy:CallPolicy,day:DayName,time:string)=>
 request<CallSimulation>(session,"POST",{policy,day,time});
