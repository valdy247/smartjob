import {billingAdmin,eligible,getBillingAccount} from "@/lib/vmv-billing";
export type VoiceChoice="default"|"bright"|"calm";
export type CallPreferences={
 voice_customer:VoiceChoice;voice_owner:VoiceChoice;
 greeting_customer:string;greeting_owner:string
};
export const choices=[
 {id:"default",label:"Voz estándar"},
 {id:"bright",label:"Clara"},
 {id:"calm",label:"Serena"}
] as const;
export const isVoice=(s:unknown):s is VoiceChoice=>
 s==="default"||s==="bright"||s==="calm";
const voices:Record<Exclude<VoiceChoice,"default">,Record<"en-US"|"es-ES",string>>={
 bright:{"en-US":"21m00Tcm4TlvDq8ikWAM-v4","es-ES":"uDhfdG2VwEjWZ4JYzggn-v4"},
 calm:{"en-US":"UgBBYS2sOqTuMpoF3BR0-v4","es-ES":"6xftrpatV0jGmFHxDjUv-v4"}
};
export function selectedVoice(choice:VoiceChoice,lang:"en-US"|"es-ES"){
 return choice==="default"?null:voices[choice][lang];
}
export const sanitizedGreeting=(s:unknown):string|null=>{
 if(typeof s!=="string"||s.length>180||/[<>\r\n]/.test(s))return null;
 const clean=s.trim();
 if(clean&&clean.length<10)return null;
 return clean;
};
export async function getPaidCallPreferences(userId:string):Promise<CallPreferences|null>{
 const account=await getBillingAccount(userId);
 if(!eligible(account)||!["pro","premium"].includes(account?.plan_code||""))return null;
 const db=billingAdmin();if(!db)return null;
 const {data,error}=await db.from("smartjob_call_preferences")
  .select("voice_customer,voice_owner,greeting_customer,greeting_owner")
  .eq("user_id",userId).maybeSingle();
 if(error||!data||!isVoice(data.voice_customer)||!isVoice(data.voice_owner))return null;
 return data as CallPreferences;
}
