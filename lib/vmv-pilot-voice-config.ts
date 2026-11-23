export const PILOT_LANGUAGES=[
 {id:"es",name:"Español",native:"Español"},
 {id:"en",name:"English",native:"English"},
 {id:"pt",name:"Português",native:"Português"},
 {id:"fr",name:"Français",native:"Français"},
 {id:"de",name:"Deutsch",native:"Deutsch"},
 {id:"it",name:"Italiano",native:"Italiano"}
] as const;
export type PilotLanguage=typeof PILOT_LANGUAGES[number]["id"];
export const validPilotLanguage=(v:unknown):v is PilotLanguage=>
 typeof v==="string"&&PILOT_LANGUAGES.some(l=>l.id===v);
// Supported by the speech models used for voice previews and final Video Studio narration.
export const PILOT_VOICES=[
 {id:"alloy",name:"Alloy",provider:"openai" as const},
 {id:"ash",name:"Ash",provider:"openai" as const},
 {id:"coral",name:"Coral",provider:"openai" as const},
 {id:"echo",name:"Echo",provider:"openai" as const},
 {id:"fable",name:"Fable",provider:"openai" as const},
 {id:"nova",name:"Nova",provider:"openai" as const},
 {id:"onyx",name:"Onyx",provider:"openai" as const},
 {id:"sage",name:"Sage",provider:"openai" as const},
 {id:"shimmer",name:"Shimmer",provider:"openai" as const}
];
export type PilotVoiceProvider="openai"|"elevenlabs"|"none";
export const validPilotVoice=(provider:unknown,id:unknown)=>{
 if(provider==="none")return id==="none";
 if(provider==="openai")return PILOT_VOICES.some(v=>v.id===id);
 return provider==="elevenlabs"&&typeof id==="string"&&/^[A-Za-z0-9]{15,32}$/.test(id);
};
export const pilotLanguageName=(id:PilotLanguage)=>{
 return PILOT_LANGUAGES.find(x=>x.id===id)?.name||"Español";
};
