/** Recommendations come from the owner's stated needs, never inferred private activity. */
export const VMV_V1_NEEDS_KEY="vmv_business_v1_needs";
export const V1_SERVICE_IDS=["web","agents","video","quote","marketing","ads"] as const;
export type V1ServiceId=typeof V1_SERVICE_IDS[number];
export type V1NeedsAnswers={
 goal:"customers"|"time"|"presence"|"sales";
 web:"no"|"improve"|"yes";
 support:"yes"|"no";
 marketing:"no"|"yes"|"unsure";
 quotes:"often"|"sometimes"|"never";
 videos:"yes"|"no";
};
export type V1NeedsRecord={version:1;businessId:string;answers:V1NeedsAnswers;completedAt:string};
type QuestionOption={value:string;es:string;en:string};
export const V1_NEEDS_QUESTIONS:{id:keyof V1NeedsAnswers;es:string;en:string;options:QuestionOption[]}[]=[
 {id:"goal",es:"¿Cuál es tu prioridad ahora?",en:"What matters most right now?",options:[
  {value:"customers",es:"Conseguir más clientes",en:"Attract more customers"},
  {value:"time",es:"Ahorrar tiempo",en:"Save time"},
  {value:"presence",es:"Mejorar mi presencia digital",en:"Improve my online presence"},
  {value:"sales",es:"Vender y cotizar mejor",en:"Sell and quote more effectively"}]},
 {id:"web",es:"¿Cómo está la página web de tu negocio?",en:"How is your business website?",options:[
  {value:"no",es:"Todavía no tengo",en:"I don't have one yet"},
  {value:"improve",es:"Tengo una, pero quiero mejorarla",en:"I have one, but it needs work"},
  {value:"yes",es:"Funciona bien",en:"It's working well"}]},
 {id:"support",es:"¿Necesitas ayuda atendiendo clientes?",en:"Do you need help supporting customers?",options:[
  {value:"yes",es:"Sí, mensajes, preguntas o reservas",en:"Yes, messages, questions or bookings"},
  {value:"no",es:"Por ahora lo manejo bien",en:"I'm handling it well"}]},
 {id:"marketing",es:"¿Tu marketing está consiguiendo resultados?",en:"Is your marketing getting results?",options:[
  {value:"no",es:"No lo suficiente",en:"Not enough"},
  {value:"unsure",es:"Todavía no lo puedo medir",en:"I can't measure it yet"},
  {value:"yes",es:"Sí, estoy satisfecho",en:"Yes, I'm happy with it"}]},
 {id:"quotes",es:"¿Con qué frecuencia preparas cotizaciones?",en:"How often do you prepare quotes?",options:[
  {value:"often",es:"Muy seguido",en:"Very frequently"},
  {value:"sometimes",es:"De vez en cuando",en:"Sometimes"},
  {value:"never",es:"No las necesito",en:"I don't need quotes"}]},
 {id:"videos",es:"¿Quieres usar videos para atraer clientes?",en:"Do you want to attract customers with videos?",options:[
  {value:"yes",es:"Sí, quiero crear contenido",en:"Yes, I want to make content"},
  {value:"no",es:"No es prioridad por ahora",en:"Not a priority right now"}]}
];
const optionsByField=Object.fromEntries(V1_NEEDS_QUESTIONS.map(q=>[q.id,new Set(q.options.map(x=>x.value))])) as Record<keyof V1NeedsAnswers,Set<string>>;
export function completeV1Needs(v:unknown):v is V1NeedsAnswers{
 if(!v||typeof v!=="object"||Array.isArray(v))return false;
 const answers=v as Record<string,unknown>;
 return V1_NEEDS_QUESTIONS.every(q=>typeof answers[q.id]==="string"&&optionsByField[q.id].has(answers[q.id] as string));
}
export function readV1Needs(metadata:unknown,businessId:string):V1NeedsRecord|null{
 if(!metadata||typeof metadata!=="object"||!businessId)return null;
 const entry=(metadata as Record<string,unknown>)[VMV_V1_NEEDS_KEY];
 if(!entry||typeof entry!=="object"||Array.isArray(entry))return null;
 const candidate=entry as Partial<V1NeedsRecord>;
 return candidate.version===1&&candidate.businessId===businessId&&
  typeof candidate.completedAt==="string"&&Number.isFinite(Date.parse(candidate.completedAt))&&
  completeV1Needs(candidate.answers)?candidate as V1NeedsRecord:null;
}
const DEFAULT_SERVICES:V1ServiceId[]=["web","agents","marketing","video"];
/** Exactly four launch modules, never a deferred product. */
export function recommendV1Services(
 answers:V1NeedsAnswers|null,
 legacyAnswers:Record<string,string>|null=null
):V1ServiceId[]{
 if(!answers&&!legacyAnswers)return [...DEFAULT_SERVICES];
 const base:Record<V1ServiceId,number>={web:10,agents:9,video:7,quote:6,marketing:8,ads:5};
 const add=(id:V1ServiceId,points:number)=>{base[id]+=points;};
 const goal=answers?.goal||legacyAnswers?.goal||"";
 if(goal==="customers"){add("marketing",8);add("ads",6);add("video",4);}
 if(goal==="presence"){add("web",8);add("marketing",4);add("video",2);}
 if(goal==="time"){add("agents",8);add("quote",4);}
 if(goal==="sales"){add("quote",9);add("agents",3);add("marketing",4);}
 const webState=answers?.web||(
  legacyAnswers?.web==="no"?"no":legacyAnswers?.web==="yes"&&legacyAnswers.webGood==="no"?"improve":"yes"
 );
 if(webState==="no")add("web",13);
 if(webState==="improve")add("web",9);
 if(answers?.support==="yes"||legacyAnswers?.agents==="yes")add("agents",12);
 if(answers?.marketing==="no"||legacyAnswers?.marketing==="no"){add("marketing",10);add("ads",4);}
 if(answers?.marketing==="unsure"){add("marketing",7);add("ads",2);}
 if(answers?.quotes==="often"){add("quote",13);add("agents",2);}
 if(answers?.quotes==="sometimes")add("quote",5);
 if(answers?.quotes==="never")base.quote-=8;
 if(answers?.videos==="yes")add("video",12);
 if(answers?.videos==="no")base.video-=6;
 if(legacyAnswers?.webGoal==="orders"){add("web",3);add("quote",4);}
 if(legacyAnswers?.webGoal==="bookings"){add("web",3);add("agents",4);}
 if(legacyAnswers?.google==="no"||legacyAnswers?.googleGood==="no")add("marketing",4);
 const positions=new Map(V1_SERVICE_IDS.map((id,i)=>[id,i]));
 return [...V1_SERVICE_IDS].sort((a,b)=>base[b]-base[a]||(positions.get(a)!-positions.get(b)!)).slice(0,4);
}
