export type SignupAnswer=Record<string,string>;
export type SignupOption={value:string;es:string;en:string};
export type SignupQuestion={
 id:string;es:string;en:string;hintEs?:string;hintEn?:string;
 kind?:"text"|"textarea"|"choice"|"multi"|"email"|"tel"|"url"|"password"|"number"|"timewindow"|"date"|"time";
 optional?:boolean;max?:number;options?:SignupOption[];section:string;
};
const option=(value:string,es:string,en=es):SignupOption=>({value,es,en});
const yesNo=[option("yes","Sí, vamos a hacerlo","Yes, let's do it"),option("no","Ahora no","Not right now")];
const q=(id:string,es:string,en:string,section:string,kind:SignupQuestion["kind"]="text",optional=false,max=200,options?:SignupOption[]):SignupQuestion=>
 ({id,es,en,section,kind,optional,max,options});
const weekdays=[
 ["mon","lunes","Monday"],["tue","martes","Tuesday"],["wed","miércoles","Wednesday"],
 ["thu","jueves","Thursday"],["fri","viernes","Friday"],["sat","sábado","Saturday"],
 ["sun","domingo","Sunday"]
] as const;
const categories=[
 option("bakery","Panadería y repostería","Bakery & pastry"),
 option("restaurant","Restaurante","Restaurant"),option("cafe","Cafetería","Café"),
 option("barber","Barbería","Barbershop"),option("beauty-salon","Belleza y estética","Beauty salon"),
 option("spa","Spa y masajes","Spa & massage"),option("fitness","Gimnasio","Fitness"),
 option("carpentry","Carpintería","Carpentry"),option("general-contractor","Construcción y contratistas","Construction"),
 option("remodeling","Remodelación","Remodeling"),option("cleaning","Limpieza","Cleaning"),
 option("automotive","Mecánica automotriz","Auto repair"),option("landscaping","Jardinería","Landscaping"),
 option("real-estate","Inmobiliaria","Real estate"),option("consulting","Consultoría y servicios profesionales","Consulting & professional services"),
 option("retail","Comercio","Retail"),option("software","Tecnología","Technology"),
 option("other","Otro","Other")
];
export function signupQuestions(data:SignupAnswer):SignupQuestion[]{
 const sections:SignupQuestion[]=[
  q("first","¡Hola! ¿Cómo te llamas?","Hi! What's your name?","Conozcámonos","text",false,60),
  q("agent_name",`¡Qué bueno tenerte por aquí, ${data.first?.trim()||"amigo"}! ¿Cómo quieres llamarme?`,
    `Great to have you here, ${data.first?.trim()||"friend"}! What would you like to call me?`,"Tu agente","text",false,40),
  q("business_now","¿Quieres registrar tu negocio ahora?","Would you like to register your business now?","Tu negocio","choice",false,10,yesNo)
 ];
 if(data.business_now==="yes"){
  sections.push(
   q("business_name","¿Cómo se llama tu negocio?","What's your business name?","Tu negocio","text",false,120),
   q("legal_name","¿Tiene un nombre legal distinto?","Is its legal name different?","Tu negocio","text",true,150),
   q("category","¿A qué se dedica tu negocio?","What does your business do?","Tu negocio","choice",false,80,categories),
   q("description","¿Cómo explicarías tu negocio a un cliente?","How would you describe your business to a customer?","Tu negocio","textarea",false,550),
   q("business_type","¿Dónde atiendes a tus clientes?","Where do you serve customers?","Tu negocio","choice",false,30,[
    option("storefront","En mi local","At my location"),option("service_area","Voy donde el cliente","I travel to customers"),
    option("hybrid","Ambas opciones","Both")
   ]),
   q("country","¿En qué país trabajas?","What country do you operate in?","Tu ubicación","choice",false,2,[
    option("US","Estados Unidos","United States"),option("CA","Canadá","Canada"),option("MX","México","Mexico"),
    option("CU","Cuba","Cuba"),option("other","Otro país","Another country")
   ]),
   q("city","¿En qué ciudad está tu negocio?","What city is your business in?","Tu ubicación","text",false,120),
   q("region","¿En qué estado o provincia?","What state or province?","Tu ubicación","text",false,120),
   q("postal","¿Cuál es tu código postal?","What's your postal code?","Tu ubicación","text",true,20)
  );
  if(data.country==="other")sections.push(
   q("country_code","¿Cuáles son las dos letras de tu país?","What's your country's two-letter code?","Tu ubicación","text",false,2)
  );
  if(data.business_type!=="service_area")sections.push(
   q("street","¿Cuál es la dirección de tu local?","What's your business street address?","Tu ubicación","text",false,180),
   q("unit","¿Hay número de oficina o local?","Any suite or unit number?","Tu ubicación","text",true,80)
  );
  if(data.business_type!=="storefront")sections.push(
   q("service_areas","¿Qué ciudades o zonas atiendes?","What cities or areas do you serve?","Tu ubicación","textarea",false,500)
  );
  sections.push(
   q("business_phone","¿Qué teléfono pueden llamar tus clientes?","What number can customers call?","Contacto","tel",false,35),
   q("business_email","¿Cuál es el correo de tu negocio?","What's your business email?","Contacto","email",false,254),
   q("website","¿Tienes una página web?","Do you have a website?","Contacto","url",true,250),
   q("instagram","¿Cuál es tu Instagram?","What's your Instagram?","Redes sociales","text",true,150),
   q("facebook","¿Cuál es tu Facebook?","What's your Facebook?","Redes sociales","text",true,250),
   q("whatsapp","¿Qué WhatsApp usas para clientes?","What WhatsApp number do you use for customers?","Redes sociales","tel",true,35),
   q("hours_policy","¿Cuándo abre tu negocio?","When is your business open?","Horarios","choice",false,20,[
    option("weekly","Tengo un horario semanal","I have weekly opening hours"),
    option("appointments","Solo con cita","By appointment only")
   ])
  );
  if(data.hours_policy==="weekly")for(const [id,es,en] of weekdays){
   sections.push(q("hours_"+id,`¿Qué horario tienes el ${es}?`,`What are your ${en} hours?`,
     "Horarios","timewindow",false,20));
  }
  sections.push(
   q("business_services","¿Qué servicios ofreces?","What services do you offer?","Servicios","textarea",false,800),
   q("business_products","¿Qué productos vendes?","What products do you sell?","Servicios","textarea",true,700),
   q("policies","¿Qué deben saber tus clientes sobre cambios o cancelaciones?","What should customers know about changes or cancellations?","Políticas","textarea",true,650),
   q("capabilities","¿Con qué quieres que te ayude tu agente?","How should your agent help you?","Funciones","multi",false,250,[
    option("support","Atender clientes","Customer support"),option("bookings","Gestionar reservas","Manage bookings"),
    option("calls","Responder llamadas","Answer calls"),option("sales","Ayudar con ventas","Assist with sales"),
    option("website","Mi página web","My website"),option("marketing","Marketing y redes","Marketing & social"),
    option("ads","Anuncios","Advertising"),option("inventory","Inventario","Inventory")
   ])
  );
  const caps=(data.capabilities||"").split(",");
  if(caps.includes("bookings")){
   sections.push(
    q("booking_count","¿Cuántos servicios se podrán reservar?","How many services can customers book?","Reservas","choice",false,1,[
     option("1","Uno","One"),option("2","Dos","Two"),option("3","Tres","Three"),option("4","Cuatro","Four"),
     option("5","Cinco","Five"),option("6","Seis","Six"),option("8","Ocho","Eight"),
     option("10","Diez","Ten")
    ])
   );
   const count=Math.min(10,Math.max(0,Number(data.booking_count)||0));
   for(let i=1;i<=count;i++){
    sections.push(
     q("service_"+i+"_name",`¿Cómo se llama el servicio ${i}?`,`What is service ${i} called?`,"Reservas","text",false,120),
     q("service_"+i+"_description",`¿Qué incluye el servicio ${i}?`,`What does service ${i} include?`,"Reservas","textarea",false,500),
     q("service_"+i+"_duration",`¿Cuántos minutos dura el servicio ${i}?`,`How long is service ${i} in minutes?`,"Reservas","choice",false,3,[
      option("15","15 min"),option("30","30 min"),option("45","45 min"),option("60","1 hora","1 hour"),
      option("90","90 min"),option("120","2 horas","2 hours"),option("180","3 horas","3 hours"),option("240","4 horas","4 hours")
     ]),
     q("service_"+i+"_price",`¿Cuál es el precio del servicio ${i} en USD?`,
      `What's the price of service ${i} in USD?`,"Reservas","number",true,12)
    );
   }
   sections.push(
    q("booking_confirm","¿Puede confirmar citas automáticamente cuando haya disponibilidad?","Can the agent automatically confirm verified slots?","Reservas","choice",false,8,[
     option("yes","Sí, autorízalo","Yes, authorize it"),option("no","Prefiero aprobarlas","I prefer to approve")
    ]),
    q("booking_zone","¿En qué zona horaria reservas?","What time zone do you book in?","Reservas","choice",false,30,[
     option("America/New_York","Este / Eastern"),option("America/Chicago","Central"),option("America/Denver","Montaña / Mountain"),
     option("America/Los_Angeles","Pacífico / Pacific"),option("America/Phoenix","Arizona"),
     option("America/Anchorage","Alaska"),option("Pacific/Honolulu","Hawái / Hawaii"),option("America/Puerto_Rico","Puerto Rico")
    ]),
    q("booking_cancellation","¿Qué política de cancelaciones aplica a las citas?","What's your appointment cancellation policy?","Reservas","textarea",false,450),
    q("availability_mode","¿Cómo quieres abrir tu disponibilidad inicial?","How should we set your initial availability?","Reservas","choice",false,20,[
     ...(data.hours_policy==="weekly"?[option("weekly","Usar mis horarios semanales (próximos 60 días)","Use my weekly hours (next 60 days)")]:[]),
     option("single","Elegir un día y horario","Choose a specific date and time"),
     option("later","Publicaré mis horarios más adelante","I'll publish hours later")
    ])
   );
  }
  if(caps.includes("bookings")&&data.availability_mode==="single")sections.push(
   q("availability_day","¿Qué día podrás atender las primeras citas?","What's your first available date?","Reservas","date",false,10),
   q("availability_start","¿A qué hora comienza tu disponibilidad?","When does availability start?","Reservas","time",false,5),
   q("availability_end","¿A qué hora termina?","When does availability end?","Reservas","time",false,5)
  );
  if(caps.includes("calls"))sections.push(
   q("call_number","¿Qué número debe usar tu negocio para llamadas?","What number should your business use for calls?","Llamadas","tel",false,35),
   q("call_greeting","¿Cómo debe saludar el agente al contestar?","How should the agent greet callers?","Llamadas","textarea",false,280),
   q("call_after_hours","¿Qué hará cuando estés cerrado?","What should happen outside business hours?","Llamadas","choice",false,20,[
    option("message","Tomar un mensaje","Take a message"),option("hours","Informar los horarios","Share opening hours"),
    option("human","Ofrecer contacto humano","Offer human follow-up")
   ])
  );
  if(caps.includes("sales"))sections.push(
   q("sales_prices","¿Qué precios y ofertas puede explicar el agente?","What prices and offers may the agent discuss?","Ventas","textarea",false,750),
   q("sales_handoff","¿Qué hacer cuando alguien quiera comprar?","What should happen when someone wants to buy?","Ventas","choice",false,20,[
    option("human","Derivar a una persona","Handoff to a person"),option("review","Preparar solicitud para revisar","Prepare a request for review")
   ])
  );
  if(caps.includes("website"))sections.push(
   q("website_goal","¿Qué quieres lograr con tu web?","What should your website achieve?","Web","choice",false,30,[
    option("leads","Conseguir contactos","Capture leads"),option("bookings","Recibir citas","Receive bookings"),
    option("sales","Vender","Sell"),option("presence","Presentar mi negocio","Present my business")
   ])
  );
  if(caps.includes("marketing"))sections.push(
   q("marketing_goal","¿Qué resultado buscas con marketing?","What result do you want from marketing?","Marketing","choice",false,30,[
    option("leads","Más clientes interesados","More leads"),option("bookings","Más citas","More appointments"),
    option("sales","Más ventas","More sales"),option("reputation","Mejor reputación","Better reputation")
   ]),
   q("brand_voice","¿Cómo debe sonar tu marca?","How should your brand sound?","Marketing","choice",false,30,[
    option("friendly","Cercana","Friendly"),option("premium","Elegante","Premium"),option("direct","Directa","Direct"),
    option("playful","Divertida","Playful")
   ])
  );
  if(caps.includes("ads"))sections.push(
   q("ads_goal","¿Qué quieres conseguir con tus anuncios?","What should your ads achieve?","Anuncios","choice",false,25,[
    option("leads","Contactos","Leads"),option("bookings","Reservas","Bookings"),option("sales","Ventas","Sales")
   ]),
   q("ads_budget","¿Cuál sería tu presupuesto mensual de anuncios?","What would your monthly ad budget be?","Anuncios","number",true,10)
  );
  if(caps.includes("inventory"))sections.push(
   q("inventory_categories","¿Qué productos quieres que conozca el agente?","What products should the agent know?","Inventario","textarea",false,700)
  );
 }
 sections.push(
  q("agent_language","¿En qué idioma quieres que hable tu agente?","What language should your agent speak?","Tu agente","choice",false,10,[
   option("es","Español","Spanish"),option("en","Inglés","English"),option("both","Ambos","Both")
  ]),
  q("agent_personality","¿Qué personalidad tendrá tu agente?","What personality should your agent have?","Tu agente","choice",false,30,[
   option("Amable y profesional","Amable y profesional","Warm and professional"),
   option("Cercano y alegre","Cercano y alegre","Friendly and upbeat"),
   option("Formal y directo","Formal y directo","Formal and direct")
  ]),
  q("agent_mission","¿Cuál es la misión principal de tu agente?","What's your agent's main mission?","Tu agente","textarea",false,240),
  q("agent_faq","¿Qué preguntas frecuentes debe saber responder?","What common questions should the agent answer?","Tu agente","textarea",true,1100),
  q("agent_limits","¿Qué cosas nunca debe prometer o hacer?","What should your agent never promise or do?","Seguridad","textarea",true,700),
  q("last","¿Cuál es tu apellido?","What's your last name?","Tu cuenta","text",false,80),
  q("user_phone","¿Cuál es tu número de contacto?","What's your contact phone number?","Tu cuenta","tel",false,35),
  q("email","¿A qué correo enviamos tu confirmación?","What email should we send your confirmation to?","Tu cuenta","email",false,254),
  q("password","Crea tu contraseña segura","Create a secure password","Tu cuenta","password",false,128),
  q("repeat_password","Confirma tu contraseña","Confirm your password","Tu cuenta","password",false,128)
 );
 return sections;
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
 if(step.kind==="number"&&(!/^\d+(?:\.\d{1,2})?$/.test(s)||Number(s)>1000000))return "Escribe un importe válido.";
 if(step.kind==="url"&&!/^https?:\/\//i.test(s))try{new URL("https://"+s);}catch{return "Escribe una dirección web válida.";}
 if(step.id==="country_code"&&!/^[A-Za-z]{2}$/.test(s))return "Escribe el código de país de dos letras, por ejemplo FR.";
 if(step.kind==="date"&&(!/^20\d{2}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||
  s<new Date().toISOString().slice(0,10)||s>new Date(Date.now()+89*86400000).toISOString().slice(0,10)))
  return "Selecciona una fecha válida dentro de los próximos 90 días.";
 if(step.kind==="time"&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))return "Usa una hora válida: 11:00.";
 if(step.id==="availability_end"&&data.availability_start&&s<=data.availability_start)return "Debe terminar después de la hora inicial.";
 if(step.kind==="multi"&&!s)return "Selecciona al menos una función.";
 if(step.kind==="timewindow"&&!/^(?:cerrado|closed|(?:[01]\d|2[0-3]):[0-5]\d\s*-\s*(?:[01]\d|2[0-3]):[0-5]\d)$/i.test(s))
  return "Usa 09:00-17:00 o Cerrado.";
 if(step.kind==="timewindow"&&/\d/.test(s)){
  const [start,end]=s.replace(/\s/g,"").split("-");if(start>=end)return "La hora de cierre debe ser posterior a la apertura.";
 }
 if(step.id==="first"||step.id==="last"||step.id==="agent_name"||step.id==="business_name"||step.id.startsWith("service_")&&step.id.endsWith("_name")){
  if(s.length<2)return "Escribe al menos dos caracteres.";
 }
 return "";
}
export function signupHours(data:SignupAnswer){
 return weekdays.map(([id])=>{
  const raw=(data["hours_"+id]||"cerrado").trim().toLowerCase().replace(/\s/g,"");
  if(raw==="closed"||raw==="cerrado")return {closed:true,start:"09:00",end:"17:00"};
  const [start,end]=raw.split("-");return {closed:false,start,end};
 });
}
