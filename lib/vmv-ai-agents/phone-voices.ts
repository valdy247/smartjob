/** Curated ElevenLabs preview voices. IDs are server allowlisted, never user supplied. */
export const PHONE_VOICE_CATALOG=[
 {id:"default",name:"Voz estándar",lang:"both",voiceId:"",preview:""},
 {id:"es_maria",name:"María · Español latino",lang:"es",voiceId:"5Cv0Ai2PG63GLyPEHsNy",preview:"https://storage.googleapis.com/eleven-public-prod/database/workspace/22cf16fbf8454665ba3cc3618c7e6044/voices/5Cv0Ai2PG63GLyPEHsNy/35EdYtnn4eLzx7waNJk7.mp3"},
 {id:"es_fernanda",name:"Fernanda · Español latino",lang:"es",voiceId:"4GKdbc9GdbAJeZWRtLST",preview:"https://storage.googleapis.com/eleven-public-prod/database/workspace/705e72145481438b9dc10e4c4a2accd6/voices/4GKdbc9GdbAJeZWRtLST/kozqmpVm9DPrBze1p3rG.mp3"},
 {id:"es_mateo",name:"Mateo · Español latino",lang:"es",voiceId:"hxn0ELcpNBviuwFSIfDf",preview:"https://storage.googleapis.com/eleven-public-prod/database/workspace/d0c45e08226c48e6a62b5bce60281d4d/voices/hxn0ELcpNBviuwFSIfDf/LAUvkRBa8fIZJUh5ypOv.mp3"},
 {id:"en_jessica",name:"Jessica · English",lang:"en",voiceId:"cgSgspJ2msm6clMCkdW9",preview:"https://storage.googleapis.com/eleven-public-prod/premade/voices/cgSgspJ2msm6clMCkdW9/56a97bf8-b69b-448f-846c-c3a11683d45a.mp3"},
 {id:"en_river",name:"River · English",lang:"en",voiceId:"SAz9YHcvj6GT2YYXdXww",preview:"https://storage.googleapis.com/eleven-public-prod/premade/voices/SAz9YHcvj6GT2YYXdXww/e6c95f0b-2227-491a-b3d7-2249240decb7.mp3"},
 {id:"en_roger",name:"Roger · English",lang:"en",voiceId:"CwhRBWXzGAHq8TQ4Fs17",preview:"https://storage.googleapis.com/eleven-public-prod/premade/voices/CwhRBWXzGAHq8TQ4Fs17/58ee3ff5-f6f2-4628-93b8-e38eb31806b0.mp3"}
] as const;
export type PhoneVoiceId=typeof PHONE_VOICE_CATALOG[number]["id"];
export function validPhoneVoice(value:unknown,lang:"es"|"en"):value is PhoneVoiceId{
 return typeof value==="string"&&PHONE_VOICE_CATALOG.some(v=>v.id===value&&(v.lang===lang||v.lang==="both"));
}
export function voiceById(value:unknown,lang:"es"|"en"){
 return PHONE_VOICE_CATALOG.find(v=>v.id===value&&(v.lang===lang||v.lang==="both"))||
  PHONE_VOICE_CATALOG[0];
}
/** Twilio Say Public Beta: voice="ElevenLabs.<ID>". */
export function sayElevenVoice(value:unknown,lang:"es"|"en"){
 const option=voiceById(value,lang);return option.voiceId?"ElevenLabs."+option.voiceId:"";
}
/** ConversationRelay recommends the -v4 suffix. */
export function relayElevenVoice(value:unknown,lang:"es"|"en"){
 const option=voiceById(value,lang);return option.voiceId?option.voiceId+"-v4":"";
}
