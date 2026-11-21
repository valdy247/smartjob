import {websiteAddress} from "./website-address";
export type SignupAnswer=Record<string,string>;
export type SignupOption={value:string;es:string;en:string};
export type SignupQuestion={
 id:string;es:string;en:string;section:string;
 kind?:"text"|"textarea"|"choice"|"multi"|"email"|"tel"|"url"|"password"|"number"|"date"|"time"|"google_category"|"location_region"|"location_city"|"natural_hours";
 optional?:boolean;max?:number;options?:SignupOption[];
};
const o=(value:string,es:string,en=es):SignupOption=>({value,es,en});
const q=(id:string,es:string,en:string,section:string,kind:SignupQuestion["kind"]="text",optional=false,max=200,options?:SignupOption[]):SignupQuestion=>({id,es,en,section,kind,optional,max,options});
export const weekdays=["mon","tue","wed","thu","fri","sat","sun"] as const;
export function signupQuestions(data:SignupAnswer):SignupQuestion[]{
 const out:SignupQuestion[]=[
  q("first","¡Hola! ¿Cómo te llamas?","Hi! What's your name?","Tu cuenta","text",false,60),
  q("agent_name","¡Qué bueno tenerte por aquí, "+(data.first?.trim()||"amigo")+"! ¿Cómo quieres llamarme?",
   "Great to have you here, "+(data.first?.trim()||"friend")+"! What would you like to call me?","Tu agente","text",false,40),
  q("business_now","¿Registramos tu negocio ahora?","Register your business now?","Tu negocio","choice",false,10,[
   o("yes","Sí","Yes"),o("no","Más tarde","Later")
  ])
 ];
 if(data.business_now==="yes"){
  out.push(
   q("business_name","¿Cómo se llama tu negocio?","What's your business called?","Tu negocio","text",false,120),
   q("country","¿En qué país trabajas?","What country do you work in?","Ubicación","choice",false,5,[
    o("US","Estados Unidos","United States"),o("CA","Canadá","Canada"),
    o("MX","México","Mexico"),o("CU","Cuba","Cuba"),o("other","Otro","Other")
   ])
   ...(data.country==="other"?[q("country_code","Código de país","Country code","Ubicación","text",false,2)]:[]),
   q("category","¿A qué se dedica tu negocio?","What does your business do?","Tu negocio","google_category",false,100),
   q("description","Describe brevemente tu negocio","Describe your business briefly","Tu negocio","textarea",false,550),
   q("business_type","¿Dónde atiendes?","Where do you serve customers?","Tu negocio","choice",false,30,[
    o("storefront","En mi local","At my location"),o("service_area","Voy al cliente","At the customer's location"),
    o("hybrid","Ambos","Both")
   ]),

  );
  out.push(
   q("region","Selecciona tu estado o provincia","Select your state or province","Ubicación","location_region",false,120),
   q("city","Selecciona tu ciudad","Select your city","Ubicación","location_city",false,120),
   q("postal","¿Cuál es tu código postal?","What's your postal code?","Ubicación","text",true,20)
  );
  if(data.business_type!=="service_area")out.push(q("street","¿Cuál es la dirección de tu local?","What's your business street address?","Ubicación","text",false,180));
  if(data.business_type!=="storefront")out.push(q("service_areas","¿En qué zonas atiendes?","What areas do you serve?","Ubicación","textarea",false,350));
  out.push(
   q("website","¿Tienes sitio web?","Do you have a website?","Tu negocio","url",true,250),
   q("hours_natural","¿Qué días y horarios abres?","What days and hours are you open?","Horario","natural_hours",false,400),
   q("services_mode","¿Quieres agregar servicios?","Would you like to add services?","Servicios","choice",false,10,[
    o("now","Agregar ahora","Add now"),o("later","Más tarde","Later"),o("none","No ofrezco servicios","I don't offer services")
   ])
  );
  if(data.services_mode==="now"){
   for(let i=1;i<=10;i++){
    if(i>1&&data["service_"+(i-1)+"_more"]!=="yes")break;
    out.push(
     q("service_"+i+"_name","Nombre del servicio "+i,"Service "+i+" name","Servicios","text",false,120),
     q("service_"+i+"_duration","¿Cuánto dura "+(data["service_"+i+"_name"]||"este servicio")+"?",
      "How long is "+(data["service_"+i+"_name"]||"this service")+"?","Servicios","choice",false,3,[
       o("15","15 min"),o("30","30 min"),o("45","45 min"),o("60","1 hora","1 hour"),
       o("90","90 min"),o("120","2 horas","2 hours"),o("180","3 horas","3 hours"),o("240","4 horas","4 hours")
      ]),
     q("service_"+i+"_price","¿Qué precio tiene?","What's its price?","Servicios","number",true,12)
    );
    if(i<10)out.push(q("service_"+i+"_more","¿Agregamos otro servicio?","Add another service?","Servicios","choice",false,3,[
     o("yes","Sí, otro","Yes, another"),o("no","Terminar servicios","Finish services")
    ]));
   }
  }
  out.push(q("products_mode","¿Quieres agregar productos?","Would you like to add products?","Productos","choice",false,10,[
   o("now","Agregar ahora","Add now"),o("later","Más tarde","Later"),o("none","No vendo productos","I don't sell products")
  ]));
  if(data.products_mode==="now"){
   for(let i=1;i<=10;i++){
    if(i>1&&data["product_"+(i-1)+"_more"]!=="yes")break;
    out.push(
     q("product_"+i+"_name","Nombre del producto "+i,"Product "+i+" name","Productos","text",false,120),
     q("product_"+i+"_price","¿Qué precio tiene?","What's its price?","Productos","number",false,12)
    );
    if(i<10)out.push(q("product_"+i+"_more","¿Agregamos otro producto?","Add another product?","Productos","choice",false,3,[
     o("yes","Sí, otro","Yes, another"),o("no","Terminar productos","Finish products")
    ]));
   }
  }
  out.push(q("capabilities","¿Qué hará tu agente?","What will your agent do?","Tu agente","multi",false,250,[
   o("support","Atender clientes","Support customers"),o("bookings","Reservas","Bookings"),
   o("calls","Responder llamadas","Answer calls"),o("sales","Ayudar a vender","Help with sales"),
   o("website","Mi web","My website"),o("marketing","Marketing","Marketing"),
   o("ads","Anuncios","Ads"),o("inventory","Inventario","Inventory")
  ]));
  const caps=(data.capabilities||"").split(",");
  if(caps.includes("bookings")){
   out.push(
    q("booking_confirm","¿Confirmar citas automáticamente?","Automatically confirm appointments?","Reservas","choice",false,5,[
     o("yes","Sí, solo si hay espacio","Yes, only when available"),
     o("no","Prefiero aprobar","I'll approve them")
    ]),
    q("booking_zone","¿Qué zona horaria utilizas?","What time zone do you use?","Reservas","choice",false,30,[
     o("America/New_York","Este / Eastern"),o("America/Chicago","Central"),
     o("America/Denver","Montaña / Mountain"),o("America/Los_Angeles","Pacífico / Pacific"),
     o("America/Phoenix","Arizona"),o("America/Anchorage","Alaska"),
     o("Pacific/Honolulu","Hawái / Hawaii"),o("America/Puerto_Rico","Puerto Rico")
    ]),
    q("availability_mode","¿Cuándo podrá reservar tu agente?","When can your agent accept bookings?","Reservas","choice",false,20,[
     ...(data.hours_policy==="weekly"?[o("weekly","Usar horarios del negocio","Use business hours")]:[]),
     o("single","Elegir un día","Choose a day"),o("later","Lo configuraré después","I'll configure later")
    ])
   );
   if(data.availability_mode==="single")out.push(
    q("availability_day","¿Qué día estarás disponible?","What day are you available?","Reservas","date",false,10),
    q("availability_start","¿Desde qué hora?","From what time?","Reservas","time",false,5),
    q("availability_end","¿Hasta qué hora?","Until what time?","Reservas","time",false,5)
   );
  }
  if(caps.includes("calls"))out.push(
   q("call_after_hours","¿Qué hará con llamadas fuera de horario?","What about after-hours calls?","Llamadas","choice",false,20,[
    o("message","Tomar un mensaje","Take a message"),
    o("hours","Informar el horario","Share opening hours"),
    o("human","Ofrecer contacto humano","Offer human follow-up")
   ])
  );
  if(caps.includes("sales"))out.push(q("sales_handoff","¿Cómo manejará una compra?","How should it handle purchases?","Ventas","choice",false,20,[
   o("human","Transferir a una persona","Hand off to a person"),
   o("review","Preparar para aprobar","Prepare for approval")
  ]));
  if(caps.includes("inventory")||caps.includes("sales")||caps.includes("bookings"))
   out.push(q("inventory_connections","¿Qué catálogo podrá consultar?","What catalogs may it consult?","Tu agente","multi",true,100,[
    o("services","Servicios","Services"),o("products","Productos","Products")
   ]));
  if(caps.includes("website"))out.push(q("website_goal","¿Qué buscas con tu web?","What's your website goal?","Web","choice",false,30,[
   o("leads","Conseguir contactos","Leads"),o("bookings","Recibir citas","Appointments"),
   o("sales","Vender","Sales"),o("presence","Presentarme","Presence")
  ]));
  if(caps.includes("marketing"))out.push(q("marketing_goal","¿Qué buscas con marketing?","What's your marketing goal?","Marketing","choice",false,30,[
   o("leads","Más contactos","More leads"),o("bookings","Más citas","More appointments"),
   o("sales","Más ventas","More sales"),o("reputation","Mejor reputación","Better reputation")
  ]));
  if(caps.includes("ads"))out.push(q("ads_goal","¿Qué buscas con anuncios?","What's your advertising goal?","Anuncios","choice",false,30,[
   o("leads","Contactos","Leads"),o("bookings","Reservas","Bookings"),o("sales","Ventas","Sales")
  ]));
 }
 out.push(
  q("agent_language","¿En qué idioma hablaré?","What language should I speak?","Tu agente","choice",false,10,[
   o("es","Español","Spanish"),o("en","Inglés","English"),o("both","Ambos","Both")
  ]),
  q("agent_personality","¿Qué personalidad quieres?","What personality would you like?","Tu agente","choice",false,30,[
   o("Amable y profesional","Amable y profesional","Warm and professional"),
   o("Cercano y alegre","Cercano y alegre","Friendly and upbeat"),
   o("Formal y directo","Formal y directo","Formal and direct")
  ]),
  q("agent_response","¿Cómo debo responder a los clientes?","How should I respond to customers?","Tu agente","choice",false,20,[
   o("helpful","Resolver y confirmar datos","Help and verify facts"),
   o("brief","Breve y al grano","Brief and direct"),
   o("consultative","Escuchar y recomendar","Listen and recommend")
  ]),
  q("agent_handoff","Si no sé algo, ¿qué hago?","If I don't know, what should I do?","Tu agente","choice",false,20,[
   o("human","Transferir a una persona","Hand off to a person"),
   o("message","Tomar un mensaje","Take a message"),
   o("request","Crear una solicitud","Create a request")
  ]),
  q("agent_guardrails","¿Qué reglas debo seguir?","What rules should I follow?","Tu agente","multi",true,150,[
   o("no_invent","No inventar datos","Never invent facts"),
   o("no_discounts","No ofrecer descuentos","No unsolicited discounts"),
   o("confirm","Confirmar antes de reservar","Confirm before booking"),
   o("privacy","Proteger datos personales","Protect personal data")
  ]),
  q("last","¿Cuál es tu apellido?","What's your last name?","Tu cuenta","text",false,80),
  q("user_phone","¿Cuál es tu teléfono de contacto?","What's your contact phone number?","Tu cuenta","tel",false,35),
  q("email","¿Cuál es tu correo?","What's your email?","Tu cuenta","email",false,254),
  q("password","Crea una contraseña segura","Create a secure password","Tu cuenta","password",false,128),
  q("repeat_password","Confirma tu contraseña","Confirm your password","Tu cuenta","password",false,128)
 );
 return out;
}
export function signupValidation(step:SignupQuestion,value:string,data:SignupAnswer):string{
 const s=value.trim();
 if(!step.optional&&!s)return "Completa esta respuesta para continuar.";
 if(!s)return "";
 if(s.length>(step.max||250))return "Escribe una respuesta más corta.";
 if(step.kind==="email"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))return "Escribe un correo válido.";
 if(step.kind==="password"&&s.length<10)return "Usa al menos 10 caracteres.";
 if(step.id==="repeat_password"&&s!==data.password)return "Las contraseñas deben coincidir.";
 if(step.kind==="tel"&&!/^\+?[0-9 ()-]{7,35}$/.test(s))return "Comprueba el teléfono.";
 if(step.kind==="number"&&(!/^\d+(?:\.\d{1,2})?$/.test(s)||Number(s)>1000000))return "Escribe un precio válido.";
 if(/^product_\d+_price$/.test(step.id)&&Number(s)<=0)return "Indica un precio mayor que cero.";
 if(step.kind==="url"&&!websiteAddress(s))return "Escribe un sitio web válido, por ejemplo minegocio.com.";
 if(step.id==="country_code"&&!/^[A-Za-z]{2}$/.test(s))return "Usa dos letras, por ejemplo FR.";
 if(step.kind==="date"&&(!/^20\d{2}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||
  s<new Date().toISOString().slice(0,10)||s>new Date(Date.now()+89*86400000).toISOString().slice(0,10)))
  return "Selecciona una fecha de los próximos 90 días.";
 if(step.kind==="time"&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))return "Selecciona una hora válida.";
 if(step.id==="availability_end"&&data.availability_start&&s<=data.availability_start)return "La hora final debe ser posterior.";
 if(step.kind==="natural_hours"&&data.hours_policy!=="appointments"&&data.hours_approved!=="yes")
  return "Revisa y confirma tu horario.";
 if(step.kind==="google_category"&&!data.google_category_id&&data.category_source!=="pending")
  return "Selecciona una categoría de la lista.";
 if(step.kind==="location_region"&&!data.region_place_id)return "Selecciona un estado de Google.";
 if(step.kind==="location_city"&&!data.city_place_id)return "Selecciona una ciudad de Google.";
 if(step.kind==="multi"&&!step.optional&&!s)return "Selecciona al menos una opción.";
 if(["first","last","agent_name","business_name"].includes(step.id)||/^service_\d+_name$/.test(step.id)||/^product_\d+_name$/.test(step.id)){
  if(s.length<2)return "Escribe al menos dos caracteres.";
 }
 return "";
}
export function signupHours(data:SignupAnswer){
 return weekdays.map(day=>{
  const raw=(data["hours_"+day]||"closed").trim().toLowerCase().replace(/\s/g,"");
  if(raw==="closed"||raw==="cerrado")return {closed:true,start:"09:00",end:"17:00"};
  const [start,end]=raw.split("-");
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start||"")||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end||"")||start>=end)
   return {closed:true,start:"09:00",end:"17:00"};
  return {closed:false,start,end};
 });
}
