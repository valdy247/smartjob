/**
 * VMV Business: non-transactional needs assessment shared by web and iOS.
 * Answers are user-provided preferences, NEVER proof of purchased services,
 * entitlement, provisioning, or official Google/phone ownership.
 */
export const DIAGNOSTIC_METADATA_KEY="vmv_business_diagnostic_v1";

export type DiagnosticLanguage="es"|"en";
export type DiagnosticAnswers=Record<string,string>;
export type DiagnosticRecord={
 version:1;
 businessId:string;
 answers:DiagnosticAnswers;
 completedAt:string;
};
type Localized={es:string;en:string};
export type DiagnosticQuestion={
 id:string;
 title:Localized;
 options:readonly {value:string;label:Localized}[];
};
export type DiagnosticService="smart-call"|"web-services"|"google-business"|"ai-agents"|"marketing";
export type DiagnosticRecommendation={
 id:DiagnosticService;
 name:string;
 reason:Localized;
 rank:number;
};
const yesNo=[
 {value:"yes",label:{es:"Sí",en:"Yes"}},
 {value:"no",label:{es:"No",en:"No"}}
] as const;
const yesNoUnsure=[
 ...yesNo,
 {value:"unsure",label:{es:"No sé",en:"Not sure"}}
] as const;
const question=(id:string,es:string,en:string,options:DiagnosticQuestion["options"]=yesNo):DiagnosticQuestion=>({
 id,title:{es,en},options
});
export function getDiagnosticQuestions(answers:DiagnosticAnswers):DiagnosticQuestion[]{
 const result:DiagnosticQuestion[]=[
  question("phone","¿Tu negocio ya tiene línea telefónica?","Does your business already have a phone line?")
 ];
 if(answers.phone==="yes")result.push(question("missed","¿Pierdes llamadas o necesitas atender fuera de horario?","Do you miss calls or need after-hours coverage?"));
 result.push(question("web","¿Tu negocio tiene página web?","Does your business have a website?"));
 if(answers.web==="yes")result.push(question("webGood","¿Tu página funciona como necesitas?","Does your website work the way you need?"));
 if(answers.web==="no")result.push(question("webGoal","¿Qué necesitas de tu página web?","What do you need from your website?",[
  {value:"show",label:{es:"Mostrar mi negocio",en:"Showcase my business"}},
  {value:"orders",label:{es:"Recibir pedidos",en:"Take orders"}},
  {value:"bookings",label:{es:"Recibir citas",en:"Take bookings"}},
  {value:"unsure",label:{es:"No estoy seguro",en:"Not sure yet"}}
 ]));
 result.push(question("google","¿Tu negocio aparece en Google Maps?","Is your business listed on Google Maps?",yesNoUnsure));
 if(answers.google==="yes")result.push(question("googleGood","¿Tu ficha está verificada y actualizada?","Is your listing verified and up to date?",yesNoUnsure));
 result.push(question("agents","¿Necesitas ayuda para atender clientes, mensajes o citas?","Do you need help handling customers, messages, or bookings?"));
 result.push(question("marketing","¿Tu publicidad está dando buenos resultados?","Is your advertising getting good results?"));
 result.push(question("goal","¿Qué te gustaría conseguir primero?","What would you like to achieve first?",[
  {value:"customers",label:{es:"Más clientes",en:"More customers"}},
  {value:"time",label:{es:"Ahorrar tiempo",en:"Save time"}},
  {value:"presence",label:{es:"Mejor presencia online",en:"Improve online presence"}},
  {value:"none",label:{es:"Nada por ahora",en:"Nothing right now"}}
 ]));
 return result;
}
export function diagnosticComplete(answers:DiagnosticAnswers):boolean{
 return getDiagnosticQuestions(answers).every(q=>q.options.some(o=>o.value===answers[q.id]));
}
export function normalizeDiagnosticAnswers(answers:DiagnosticAnswers):DiagnosticAnswers{
 const result:DiagnosticAnswers={};
 for(const q of getDiagnosticQuestions(answers)){
  const answer=answers[q.id];
  if(q.options.some(o=>o.value===answer))result[q.id]=answer;
 }
 return result;
}
export function readDiagnosticRecord(metadata:unknown,businessId:string):DiagnosticRecord|null{
 if(!metadata||typeof metadata!=="object"||!businessId)return null;
 const candidate=(metadata as Record<string,unknown>)[DIAGNOSTIC_METADATA_KEY];
 if(!candidate||typeof candidate!=="object")return null;
 const r=candidate as Partial<DiagnosticRecord>;
 if(r.version!==1||r.businessId!==businessId||typeof r.completedAt!=="string"||
  !Number.isFinite(Date.parse(r.completedAt))||!r.answers||typeof r.answers!=="object"||Array.isArray(r.answers))return null;
 const answers=normalizeDiagnosticAnswers(r.answers as DiagnosticAnswers);
 return diagnosticComplete(answers)?{version:1,businessId,answers,completedAt:r.completedAt}:null;
}
export function makeDiagnosticRecord(businessId:string,answers:DiagnosticAnswers):DiagnosticRecord{
 const clean=normalizeDiagnosticAnswers(answers);
 if(!businessId||!diagnosticComplete(clean))throw new Error("Incomplete business diagnostic");
 return {version:1,businessId,answers:clean,completedAt:new Date().toISOString()};
}
export function getDiagnosticRecommendations(a:DiagnosticAnswers):DiagnosticRecommendation[]{
 if(!diagnosticComplete(a)||a.goal==="none")return [];
 const suggestions:DiagnosticRecommendation[]=[];
 const add=(id:DiagnosticService,name:string,reason:Localized,rank:number)=>suggestions.push({id,name,reason,rank});
 if(a.phone==="no")add("smart-call","Smart Call",
  {es:"Una línea profesional para tu negocio.",en:"A professional line for your business."},a.goal==="time"?1:2);
 if(a.phone==="yes"&&a.missed==="yes")add("smart-call","Smart Call",
  {es:"Atiende las llamadas que hoy se te escapan, sin comprar otra línea.",en:"Handle calls you currently miss, without buying another line."},a.goal==="time"?0:2);
 if(a.web==="no")add("web-services","Web Services",{
  es:a.webGoal==="orders"?"Una web preparada para recibir pedidos.":a.webGoal==="bookings"?"Una web para recibir citas.":"Crear la web que tu negocio necesita.",
  en:a.webGoal==="orders"?"A website built to take orders.":a.webGoal==="bookings"?"A website for bookings.":"Create the website your business needs."
 },a.goal==="presence"?0:2);
 if(a.web==="yes"&&a.webGood==="no")add("web-services","Web Services",
  {es:"Mejorar tu web actual sin venderte otra.",en:"Improve your existing site rather than selling you another."},a.goal==="presence"?0:2);
 if(a.google==="no"||a.google==="yes"&&a.googleGood==="no")
  add("google-business","Google Business",
   {es:a.google==="no"?"Ayuda para aparecer en las búsquedas locales.":"Mejorar tu ficha de Google existente.",
    en:a.google==="no"?"Help appearing in local searches.":"Improve your existing Google listing."},a.goal==="customers"||a.goal==="presence"?0:2);
 if(a.agents==="yes")add("ai-agents","AI Agents",
  {es:"Automatiza tareas y atención al cliente.",en:"Automate tasks and customer service."},a.goal==="time"?0:2);
 if(a.marketing==="no")add("marketing","Marketing",
  {es:"Oportunidades para atraer clientes y medir resultados.",en:"Opportunities to attract customers and measure results."},a.goal==="customers"?0:3);
 return suggestions.sort((x,y)=>x.rank-y.rank).slice(0,3);
}
