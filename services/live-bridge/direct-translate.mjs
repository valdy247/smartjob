// Secure, server-side speech-text translation for dual Twilio ConversationRelay.
// Uses the same OpenAI key that previously powered Render's Realtime bridge;
// no extra Vercel network hop, no transcript storage, no client credentials.
const LANGS=new Set(["en-US","es-ES"]);
export const directTranslationReady=(env=process.env)=>
  typeof env.OPENAI_API_KEY==="string"&&/^sk-[A-Za-z0-9_-]{10,}$/.test(env.OPENAI_API_KEY);
const numberTokens=value=>(value.match(/(?<![\p{L}\d])(?:[$€£]\s*)?\d+(?:[.,]\d{3})*(?:[.,]\d+)?/gu)||[])
  .map(t=>t.replace(/[$€£\s]/g,""))
  .map(t=>{
    if(/^(\d{1,3})([.,]\d{3})+$/.test(t))return t.replace(/[.,]/g,"");
    if(t.includes(".")&&t.includes(","))return t.lastIndexOf(".")>t.lastIndexOf(",")
      ?t.replace(/,/g,""):t.replace(/\./g,"").replace(",",".");
    return t.replace(",",".");
  }).sort();
export const numbersPreserved=(original,translation)=>{
  const before=numberTokens(original);
  return !before.length||JSON.stringify(before)===JSON.stringify(numberTokens(translation));
};
export async function translateDirect(original,sourceLanguage,targetLanguage,{
  key=process.env.OPENAI_API_KEY,fetcher=fetch,timeoutMs=6500
}={}){
  if(typeof original!=="string"||!original.trim()||original.length>500||
     !LANGS.has(sourceLanguage)||!LANGS.has(targetLanguage)||
     sourceLanguage===targetLanguage)return {translation:null,reason:"invalid_input"};
  if(typeof key!=="string"||!/^sk-[A-Za-z0-9_-]{10,}$/.test(key))
    return {translation:null,reason:"missing_key"};
  const source=sourceLanguage==="en-US"?"English":"Spanish";
  const target=targetLanguage==="en-US"?"English":"Spanish";
  try{
    const res=await fetcher("https://api.openai.com/v1/chat/completions",{
      method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
      body:JSON.stringify({model:"gpt-4.1-mini",temperature:0,max_tokens:260,
        response_format:{type:"json_object"},
        messages:[
          {role:"system",content:"You are a faithful live telephone interpreter. Translate "+
            source+" into "+target+". Return ONLY a JSON object with key 'translation'."+
            " Do not answer, omit or add information. Preserve proper nouns, allergies,"+
            " quantities, prices, numbers, dates, times and intent. Use concise natural phrasing."},
          {role:"user",content:original}
        ]}),signal:AbortSignal.timeout(timeoutMs),cache:"no-store"
    });
    if(!res.ok)return {translation:null,reason:"provider_http_"+res.status};
    const json=await res.json();
    let data;
    try{data=JSON.parse(json?.choices?.[0]?.message?.content||"{}");}
    catch{return {translation:null,reason:"invalid_json_response"};}
    const translation=data?.translation;
    if(typeof translation!=="string"||!translation.trim()||translation.length>700)
      return {translation:null,reason:"invalid_translation"};
    if(!numbersPreserved(original,translation))
      return {translation:null,reason:"number_mismatch"};
    return {translation:translation.trim(),reason:null};
  }catch(e){
    return {translation:null,reason:e instanceof Error?e.name:"provider_error"};
  }
}
