/** Official standard-engine samples, matching the explicit Polly voices in <Say>.
 * Source: https://aws.amazon.com/polly/features/ . Never substitute device TTS.
 * Account-default Twilio voice can be remapped externally and has no fixed sample.
 */
export const PHONE_VOICES={
 es:{female:{voice:"Polly.Lupe",name:"Lupe",sample:"https://d1.awsstatic.com/product-marketing/Polly/voices/Lupe%20%28Standard%29.85d69fc3a36ee08455b352221435154afd19420c.mp3"},
 male:{voice:"Polly.Miguel",name:"Miguel",sample:"https://d1.awsstatic.com/product-marketing/Polly/voices/miguel.91030339cc81f8df461e3ab7325168fa5fdc0035.mp3"}},
 en:{female:{voice:"Polly.Joanna",name:"Joanna",sample:"https://d1.awsstatic.com/product-marketing/Polly/voices/joanna.84722a684fbb16e766944ea6e34dd0042195571c.mp3"},
 male:{voice:"Polly.Matthew",name:"Matthew",sample:"https://d1.awsstatic.com/product-marketing/Polly/voices/matthew.b2a8b7d5b329742fc718c7a8d0efdad1c11fb25f.mp3"}}
} as const;
export function phoneVoice(preset:string,language:"es"|"en"){
 return preset==="female"||preset==="male"?PHONE_VOICES[language][preset]:null;
}
