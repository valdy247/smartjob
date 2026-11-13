/** Owner-configurable AI Agents call policy. Never changes Smart Call's own IVR. */
export const days=["sun","mon","tue","wed","thu","fri","sat"] as const;
export type DayName=typeof days[number];
export type DayHours={enabled:boolean;start:string;end:string};
export type Week=Record<DayName,DayHours>;
export type CallPolicy={
 agent_enabled:boolean;
 translation_enabled:boolean;
 agent_mode:"always"|"schedule"|"after_no_answer";
 translation_mode:"always"|"schedule";
 coexistence:"menu"|"agent_first"|"translation_first";
 outside_action:"translation"|"message";
 ring_seconds:number;
 time_zone:string;use_business_hours:boolean;
 schedule:Week;closed_message:string;
};
export type CallDecision={
 action:"menu"|"agent"|"translation"|"ring_owner"|"message";
 agentAvailable:boolean;translationAvailable:boolean;
 reason:"menu"|"agent"|"translation"|"outside_hours"|"disabled"|"owner_first";
};
const zones=["America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
 "America/Phoenix","America/Anchorage","Pacific/Honolulu","America/Puerto_Rico"] as const;
export const zoneOptions=[...zones];
const t=/^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const keyList=["sun","mon","tue","wed","thu","fri","sat"] as DayName[];
const defaultHours:Week=Object.fromEntries(keyList.map((d,i)=>[d,
 {enabled:i>=1&&i<=5,start:"09:00",end:"17:00"}])) as Week;
export const initialCallPolicy:CallPolicy={
 agent_enabled:true,translation_enabled:true,agent_mode:"always",
 translation_mode:"always",coexistence:"menu",outside_action:"translation",
 ring_seconds:18,time_zone:"America/New_York",use_business_hours:false,
 schedule:defaultHours,closed_message:"Gracias por llamar. En este momento no podemos atenderte."
};
const minute=(x:string)=>Number(x.slice(0,2))*60+Number(x.slice(3,5));
export function validWeek(value:unknown):value is Week{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const week=value as Record<string,DayHours>;
 return keyList.every(k=>{
  const h=week[k];
  return h&&typeof h==="object"&&!Array.isArray(h)&&typeof h.enabled==="boolean"&&
   typeof h.start==="string"&&typeof h.end==="string"&&t.test(h.start)&&t.test(h.end)&&
   h.start!==h.end;
 });
}
export function checkCallPolicy(input:unknown):CallPolicy{
 if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Configuración inválida.");
 const p=input as Record<string,unknown>;
 const one=(name:string,choices:string[])=>{
  const value=p[name];
  if(typeof value!=="string"||!choices.includes(value))throw Error("Opción inválida: "+name);
  return value;
 };
 if(typeof p.agent_enabled!=="boolean"||typeof p.translation_enabled!=="boolean"||
   (!p.agent_enabled&&!p.translation_enabled))throw Error("Deja al menos una función de llamadas habilitada.");
 if(typeof p.use_business_hours!=="boolean")throw Error("Elige cómo usar los horarios.");
 if(!validWeek(p.schedule))throw Error("Completa los días y las horas; apertura y cierre deben ser diferentes.");
 const zone=one("time_zone",zoneOptions) as CallPolicy["time_zone"];
 const count=Number(p.ring_seconds);
 if(!Number.isInteger(count)||count<10||count>30)throw Error("La espera permitida es de 10 a 30 segundos.");
 if(typeof p.closed_message!=="string"||p.closed_message.trim().length<5||
  p.closed_message.length>220)throw Error("El mensaje de cierre debe tener entre 5 y 220 caracteres.");
 return {
  agent_enabled:p.agent_enabled,translation_enabled:p.translation_enabled,
  agent_mode:one("agent_mode",["always","schedule","after_no_answer"]) as CallPolicy["agent_mode"],
  translation_mode:one("translation_mode",["always","schedule"]) as CallPolicy["translation_mode"],
  coexistence:one("coexistence",["menu","agent_first","translation_first"]) as CallPolicy["coexistence"],
  outside_action:one("outside_action",["translation","message"]) as CallPolicy["outside_action"],
  ring_seconds:count,time_zone:zone,use_business_hours:p.use_business_hours,
  schedule:Object.fromEntries(keyList.map(k=>[k,{...(p.schedule as Week)[k]}])) as Week,
  closed_message:p.closed_message.trim()
 };
}
/** Existing business hours are authoritative when the owner selects that source. */
export function businessWeek(configuration:Record<string,unknown>|null):Week|null{
 if(!configuration)return null;
 const out={} as Week;
 for(const d of keyList){
  const on=configuration["h_"+d+"_active"];
  const start=configuration["h_"+d+"_open"],end=configuration["h_"+d+"_close"];
  if(on!=="Sí"&&on!=="No")return null;
  if(typeof start!=="string"||typeof end!=="string"||!t.test(start)||!t.test(end)||
   start===end)return null;
  out[d]={enabled:on==="Sí",start,end};
 }
 return out;
}
export function localParts(date:Date,zone:string):{day:DayName;minutes:number}{
 const pieces=new Intl.DateTimeFormat("en-US",{
  timeZone:zone,weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
 }).formatToParts(date);
 const get=(kind:string)=>pieces.find(p=>p.type===kind)?.value||"";
 const day=get("weekday").slice(0,3).toLowerCase() as DayName;
 if(!keyList.includes(day))throw Error("Invalid timezone date");
 return {day,minutes:Number(get("hour"))*60+Number(get("minute"))};
}
export function inWeek(week:Week,day:DayName,minutes:number):boolean{
 const idx=keyList.indexOf(day),now=week[day],prev=week[keyList[(idx+6)%7]];
 if(!now||!prev)return false;
 const start=minute(now.start),end=minute(now.end);
 const overnightCarry=prev.enabled&&minute(prev.end)<minute(prev.start)&&
  minutes<minute(prev.end);
 if(!now.enabled)return overnightCarry;
 // An overnight opening belongs to its START day. Early morning is open
 // only when the preceding day actually opened an overnight shift.
 return (start<end?minutes>=start&&minutes<end:minutes>=start)||
  overnightCarry;
}
export function localPreview(day:DayName,time:string):{day:DayName;minutes:number}{
 if(!keyList.includes(day)||!t.test(time))throw Error("Selecciona un día y hora válidos.");
 return {day,minutes:minute(time)};
}
export function decideCall(policy:CallPolicy,at:{day:DayName;minutes:number},
 week:Week=policy.schedule):CallDecision{
 const inside=inWeek(week,at.day,at.minutes);
 const agentAvailable=policy.agent_enabled&&
  (policy.agent_mode==="always"||policy.agent_mode==="after_no_answer"||inside);
 const translationAvailable=policy.translation_enabled&&
  (policy.translation_mode==="always"||inside);
 let action:CallDecision["action"],reason:CallDecision["reason"];
 if(agentAvailable&&translationAvailable){
  action=policy.coexistence==="menu"?"menu":
   policy.coexistence==="translation_first"?"translation":
   policy.agent_mode==="after_no_answer"?"ring_owner":"agent";
  reason=action==="menu"?"menu":action==="ring_owner"?"owner_first":
   action==="agent"?"agent":"translation";
 }else if(agentAvailable){
  action=policy.agent_mode==="after_no_answer"?"ring_owner":"agent";
  reason=action==="ring_owner"?"owner_first":"agent";
 }else if(translationAvailable){
  action="translation";reason="translation";
 }else{action="message";reason=inside?"disabled":"outside_hours";}
 return {action,reason,agentAvailable,translationAvailable};
}
