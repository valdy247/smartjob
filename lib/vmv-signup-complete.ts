import type {SupabaseClient} from "@supabase/supabase-js";
import {initialAccountProfile} from "@/lib/account-profile";
import {centralBusinessDefaults,centralBusinessWritePayload,validCentralBusiness} from "@/lib/vmv-central-business";
import {signupHours,type SignupAnswer} from "@/lib/vmv-signup-flow";
import {categoryById} from "@/lib/vmv-business-categories";
import {provisionAiWorkspace,choosePrincipalAgent} from "@/app/vista-app/ai-agents/centralBusiness";

export type SignupBlueprint={
 version:2;businessId:string;agentId:string;serviceIds:string[];productIds?:string[];answers:SignupAnswer;
};
const isId=(s:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
const clean=(v:unknown,max:number)=>typeof v==="string"?v.trim().slice(0,max):"";
const url=(s:string)=>{
 if(!s.trim())return null;
 try{const u=new URL(/^https?:\/\//i.test(s)?s:"https://"+s);return u.protocol==="https:"&&u.hostname.includes(".")?u.href:null;}
 catch{return null;}
};
const contactNumber=(s:string)=>{
 const trimmed=s.trim(),digits=trimmed.replace(/\D/g,"");
 if(trimmed.startsWith("+"))return digits.length>=8&&digits.length<=15?"+"+digits:"";
 return digits.length===10?"+1"+digits:digits.length===11&&digits.startsWith("1")?"+"+digits:"";
};
const kind=(s:string)=>s==="service_area"||s==="hybrid"?s:"storefront";
const countryCode=(data:SignupAnswer)=>data.country==="other"?clean(data.country_code,2).toUpperCase():clean(data.country,2).toUpperCase();
const caps=(s:string)=>new Set(s.split(",").filter(x=>["support","calls","bookings","sales","website","marketing","ads","inventory"].includes(x)));
const safeMeta=(value:unknown):SignupBlueprint=>{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("No encontramos el registro guiado de esta cuenta.");
 const v=value as Record<string,unknown>;
 if(v.version!==2||typeof v.businessId!=="string"||typeof v.agentId!=="string"||
  !isId(v.businessId)||!isId(v.agentId)||!Array.isArray(v.serviceIds)||
  v.serviceIds.length!==10||!v.serviceIds.every(x=>typeof x==="string"&&isId(x))||
  !v.answers||typeof v.answers!=="object"||Array.isArray(v.answers)||
  (v.productIds!==undefined&&(!Array.isArray(v.productIds)||v.productIds.length!==10||!v.productIds.every(x=>typeof x==="string"&&isId(x)))))
  throw Error("Los datos iniciales no son válidos. Contacta a soporte.");
 const answers:SignupAnswer={};
 for(const [key,x] of Object.entries(v.answers as Record<string,unknown>)){
  if(/^[a-z0-9_]{1,55}$/i.test(key)&&typeof x==="string")answers[key]=x.slice(0,1100);
 }
 return {version:2,businessId:v.businessId,agentId:v.agentId,serviceIds:v.serviceIds as string[],productIds:v.productIds as string[]|undefined,answers};
};
export function blueprintForSignup(data:SignupAnswer):SignupBlueprint{
 const answers=Object.fromEntries(Object.entries(data).filter(([key])=>key!=="password"&&key!=="repeat_password"));
 return {version:2,businessId:crypto.randomUUID(),agentId:crypto.randomUUID(),
  serviceIds:Array.from({length:10},()=>crypto.randomUUID()),productIds:Array.from({length:10},()=>crypto.randomUUID()),answers};
}
/** Retriable, owner-scoped provisioning ONLY after Supabase confirms verified email. */
export async function completeSignup(db:SupabaseClient):Promise<{business:boolean;agent:string}>{
 const {data:auth,error:authError}=await db.auth.getUser();
 const user=auth.user;
 if(authError||!user||user.is_anonymous||!user.email_confirmed_at)throw Error("Confirma tu correo y accede con tu cuenta antes de continuar.");
 const {data:token}=await db.auth.getSession();
 if(!token.session||token.session.user.id!==user.id)throw Error("Tu sesión no está activa. Vuelve a entrar.");
 const blueprint=safeMeta(user.user_metadata?.vmv_signup_v2);
 const data=blueprint.answers,owner=user.id;
 if(clean(data.first,60).length<2||clean(data.last,80).length<2||
  clean(data.agent_name,40).length<2||!contactNumber(data.user_phone||""))
  throw Error("Falta información del registro. Revisa el teléfono y tu nombre.");
 // No metadata can ever set a paid plan, activate routing, authorize charges or grant other accounts.
 const metadata={
  first_name:clean(data.first,60),last_name:clean(data.last,80),phone:contactNumber(data.user_phone),
  occupation:clean(data.business_now==="yes"?data.category:"Emprendedor",120)||"Emprendedor",
  account_type:data.business_now==="yes"?"business":"personal",
  assistant_name:clean(data.agent_name,40),owner_language:data.agent_language==="en"?"en":"es",
  customer_language:data.agent_language==="en"?"es":"en",
  business_name:data.business_now==="yes"?clean(data.business_name,120):"",
  city:data.business_now==="yes"?clean(data.city,120):"",
  state:data.business_now==="yes"?clean(data.region,120):"",
  country:/^[A-Z]{2}$/.test(countryCode(data))?countryCode(data):"US",
  website_url:data.business_now==="yes"?url(data.website||""):null
 };
 const initial=initialAccountProfile(owner,metadata);
 if(!initial)throw Error("No se pudo preparar tu perfil. Comprueba tu información.");
 const {error:profileError}=await db.from("smartjob_profiles")
  .upsert({...initial,plan_prompt_seen:true},{onConflict:"id",ignoreDuplicates:true});
 if(profileError)throw Error("No se pudo crear tu perfil personal: "+profileError.message);
 const {data:profile,error:profileReadError}=await db.from("smartjob_profiles")
  .select("id").eq("id",owner).maybeSingle();
 if(profileReadError||!profile)throw Error("Tu perfil no se pudo verificar.");
 if(data.business_now!=="yes")return {business:false,agent:clean(data.agent_name,40)};
 if(clean(data.business_name,120).length<2||!clean(data.description,550)||
  !clean(data.city,120)||!clean(data.region,120)||!contactNumber(data.user_phone||""))
  throw Error("Faltan datos imprescindibles de tu negocio.");
 // Verify the selected state and city against Google before persisting the central record.
 // Neither free typing nor a forged signup metadata value is considered a valid location.
 if(!data.city_place_id||!data.region_place_id)throw Error("Selecciona estado y ciudad desde Google Places.");
 const geoResponse=await fetch("/api/vmv/signup-geo",{
  method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({action:"validateCity",country:countryCode(data),region:data.region,
   city:data.city,regionPlaceId:data.region_place_id,cityPlaceId:data.city_place_id})
 });
 const geoResult=await geoResponse.json() as {verified?:boolean};
 if(!geoResponse.ok||!geoResult.verified)throw Error("No pudimos validar ciudad y estado con Google. Revisa la ubicación.");
 const catalogId=categoryById(data.category||"")?.id||"other";
 let googleCategoryId="",googleCategoryName="";
 if(data.category_source==="verified"&&data.google_category_id&&data.google_category_name){
  const endpoint="/api/marketing/google-categories?q="+encodeURIComponent(data.google_category_name)+
   "&country="+encodeURIComponent(countryCode(data))+"&lang=es";
  const response=await fetch(endpoint,{cache:"no-store"});
  if(response.ok){
   const record=await response.json() as {categories?:{id:string;label:string}[]};
   const match=record.categories?.find(item=>item.id===data.google_category_id&&item.label===data.google_category_name);
   if(match){googleCategoryId=match.id;googleCategoryName=match.label;}
  }
 }
 const defaults=centralBusinessDefaults(clean(data.business_name,120));
 const socials:Record<string,string>={};
 if(url(data.instagram||""))socials.instagram=url(data.instagram||"")!;
 else if(/^@?[a-zA-Z0-9_.]{2,30}$/.test(data.instagram||""))socials.instagram=
  "https://www.instagram.com/"+(data.instagram||"").replace(/^@/,"")+"/";
 if(url(data.facebook||""))socials.facebook=url(data.facebook||"")!;
 const central={...defaults,
  id:blueprint.businessId,owner_id:owner,name:clean(data.business_name,120),
  legal_name:clean(data.legal_name,150),description:clean(data.description,550),
  category_id:catalogId,google_category_id:googleCategoryId,google_category_name:googleCategoryName,
  country:/^[A-Z]{2}$/.test(countryCode(data))?countryCode(data):"US",
  kind:kind(data.business_type) as "storefront"|"service_area"|"hybrid",
  street:kind(data.business_type)==="service_area"?"":clean(data.street,180),
  unit:kind(data.business_type)==="service_area"?"":clean(data.unit,80),
  city:clean(data.city,120),region:clean(data.region,120),postal:clean(data.postal,20),
  service_areas:kind(data.business_type)==="storefront"?"":clean(data.service_areas,500),
  address_visibility:"private" as const,phone:contactNumber(data.user_phone),
  email:clean(user.email||"",254),website_url:url(data.website||""),
  booking_url:url(data.booking_url||"")||"",
  social_links:socials,services:Array.from({length:10},(_,i)=>clean(data["service_"+(i+1)+"_name"],120)).filter(Boolean).join(", ").slice(0,800),
  products:Array.from({length:10},(_,i)=>clean(data["product_"+(i+1)+"_name"],120)).filter(Boolean).join(", ").slice(0,700),
  hours_enabled:data.hours_policy==="weekly",hours:data.hours_policy==="weekly"?signupHours(data):[],
  source_system:"vmv_signup",source_record_id:owner
 };
 const problem=validCentralBusiness(central);
 if(problem)throw Error("Los datos del negocio necesitan una corrección: "+problem);
 const {data:existingCentral,error:existingError}=await db.from("vmv_marketing_businesses")
  .select("id").eq("id",blueprint.businessId).eq("owner_id",owner).maybeSingle();
 if(existingError)throw Error("No se pudo verificar tu negocio.");
 if(!existingCentral){
  const {error:insertError}=await db.from("vmv_marketing_businesses")
   .insert({...centralBusinessWritePayload(central),id:central.id,owner_id:owner});
  if(insertError){
   const {data:retry}=await db.from("vmv_marketing_businesses")
    .select("id").eq("id",central.id).eq("owner_id",owner).maybeSingle();
   if(!retry)throw Error("No se pudo guardar el negocio: "+insertError.message);
  }
 }
 const workspaceId=await provisionAiWorkspace(blueprint.businessId);
 const {data:existingAgent,error:agentReadError}=await db.from("vmv_ai_agents")
  .select("id").eq("id",blueprint.agentId).eq("owner_id",owner).maybeSingle();
 if(agentReadError)throw Error("No se pudo verificar tu agente.");
 if(!existingAgent){
  const enabled=caps(data.capabilities||"");
  const kindAgent=enabled.has("bookings")?"bookings":enabled.has("calls")?"calls":
   enabled.has("sales")?"sales":"support";
  const setup:Record<string,string>={
   central_business_id:blueprint.businessId,
   business_name:central.name,industry:central.category_id,
   channel:enabled.has("calls")?"Teléfono y chat":"Chat",
   language_rule:data.agent_language==="both"?"Bilingüe":data.agent_language==="en"?"English":"Español",
   personality_rule:clean(data.agent_personality,60)||"Amable y profesional",
   agent_limit:(data.agent_guardrails||"no_invent,privacy").split(",").join(", ").slice(0,280),
   agent_response:clean(data.agent_response,35),agent_handoff:clean(data.agent_handoff,35),
   human_review:"Reconocerlo y derivar a un humano",
   data_scope:"Solo nombre y medio de contacto con permiso",
   cap_bookings:enabled.has("bookings")?"Sí":"No",
   perm_book_service:enabled.has("bookings")&&data.booking_confirm==="yes"?"Sí":"No",
   cap_catalog:(data.inventory_connections||"").includes("products")?"Sí":"No",perm_prepare_order:"No",
   catalog_services:(data.inventory_connections||"").includes("services")?"Sí":"No",
   booking_confirmation:data.booking_confirm==="yes"?"Solo con disponibilidad verificada":"Después de aprobación humana",
   booking_cancel:"Cambios sujetos a confirmación del negocio",
   booking_services:central.services.slice(0,500),
   support_topics:central.description.slice(0,500),
   call_hello:("Gracias por contactar a "+central.name+". Soy "+clean(data.agent_name,40)+", ¿en qué puedo ayudarte?").slice(0,280),
   call_after_hours:clean(data.call_after_hours,30),
   call_number:contactNumber(data.user_phone||""),
   sales_catalog:(central.services+"; "+central.products).slice(0,500),
   sales_handoff:clean(data.sales_handoff,30),
   website_goal:clean(data.website_goal,30),
   marketing_goal:clean(data.marketing_goal,30),
   brand_voice:clean(data.brand_voice,30),
   ads_goal:clean(data.ads_goal,30),ads_budget:clean(data.ads_budget,20),
   inventory_goal:clean(data.inventory_connections,100),
   signup_complete:"Sí"
  };
  const configuration=Object.fromEntries(Object.entries(setup).filter(([k,v])=>k.length<=50&&v));
  const {error:agentError}=await db.from("vmv_ai_agents").insert({
   id:blueprint.agentId,owner_id:owner,business_id:workspaceId,
   name:clean(data.agent_name,40),kind:kindAgent,
   purpose:("Atender clientes de "+central.name+"; "+[...enabled].join(", ")).slice(0,240),
   personality:clean(data.agent_personality,60)||"Amable y profesional",
   language:["es","en","both"].includes(data.agent_language)?data.agent_language:"es",
   instructions:[
    "Estilo de respuesta: "+clean(data.agent_response,35),
    "Escalar cuando sea necesario: "+clean(data.agent_handoff,35),
    "Reglas elegidas: "+clean(data.agent_guardrails,150),
    "Nunca inventar datos, precios, disponibilidad ni prometer funciones no conectadas."
   ].filter(Boolean).join("\n").slice(0,2400),
   knowledge:(central.description+"\n"+central.services+"\n"+central.products).slice(0,1100),configuration,
   status:"draft"
  });
  if(agentError){
   const {data:retry}=await db.from("vmv_ai_agents")
    .select("id").eq("id",blueprint.agentId).eq("owner_id",owner).maybeSingle();
   if(!retry)throw Error("No se pudo guardar tu agente: "+agentError.message);
  }
 }
 const {data:workspace,error:workspaceError}=await db.from("vmv_ai_businesses")
  .select("primary_agent_id").eq("id",workspaceId).eq("owner_id",owner).maybeSingle();
 if(workspaceError||!workspace)throw Error("No se pudo verificar el agente principal.");
 if(!workspace.primary_agent_id)await choosePrincipalAgent(workspaceId,blueprint.agentId,null);
 const enabledBookings=caps(data.capabilities||"").has("bookings");
 const zone=["America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
   "America/Phoenix","America/Anchorage","Pacific/Honolulu","America/Puerto_Rico"].includes(data.booking_zone)?
   data.booking_zone:"America/New_York";
 const serviceCount=data.services_mode==="now"?10:
  !data.services_mode?Math.min(10,Math.max(0,Number(data.booking_count)||0)):0;
 for(let i=1;i<=serviceCount;i++){
  const name=clean(data["service_"+i+"_name"],120);
  if(!name)break;
  const minutes=Number(data["service_"+i+"_duration"]);
  if(![15,30,45,60,90,120,180,240].includes(minutes))throw Error("Comprueba la duración de "+name+".");
  const rawPrice=clean(data["service_"+i+"_price"],12);
  const price=rawPrice?Math.round(Number(rawPrice)*100):null;
  if(price!==null&&(!Number.isInteger(price)||price<0||price>10000000))throw Error("Precio no válido.");
  const {data:existing,error:checkError}=await db.from("vmv_ai_booking_services")
   .select("id").eq("id",blueprint.serviceIds[i-1]).eq("owner_id",owner).maybeSingle();
  if(checkError)throw Error("No se pudieron revisar tus servicios.");
  if(!existing){
   const {error:serviceError}=await db.from("vmv_ai_booking_services").insert({
    id:blueprint.serviceIds[i-1],owner_id:owner,business_id:workspaceId,name,
    description:clean(data["service_"+i+"_description"],500)||name,duration_minutes:minutes,
    price_cents:price,approved:true,active:true,auto_confirm:enabledBookings&&data.booking_confirm==="yes",
    time_zone:zone
   });
   if(serviceError){
    const {data:retry}=await db.from("vmv_ai_booking_services").select("id")
     .eq("id",blueprint.serviceIds[i-1]).eq("owner_id",owner).maybeSingle();
    if(!retry)throw Error("No pudimos guardar "+name+": "+serviceError.message);
   }
  }
 }
 if(data.products_mode==="now"){
  if(!blueprint.productIds||blueprint.productIds.length!==10)throw Error("No pudimos preparar los identificadores de productos.");
  for(let i=1;i<=10;i++){
   const name=clean(data["product_"+i+"_name"],120);
   if(!name)break;
   const price=Math.round(Number(data["product_"+i+"_price"])*100);
   if(!Number.isInteger(price)||price<1||price>10000000)throw Error("Comprueba el precio de "+name+".");
   const productId=blueprint.productIds[i-1];
   const {data:existing,error:checkError}=await db.from("vmv_ai_catalog_items")
    .select("id").eq("id",productId).eq("owner_id",owner).maybeSingle();
   if(checkError)throw Error("No pudimos revisar tus productos.");
   if(!existing){
    const {error:saveError}=await db.from("vmv_ai_catalog_items").insert({
     id:productId,owner_id:owner,business_id:workspaceId,
     name,sku:"REG-"+productId.slice(0,8).toUpperCase()+"-"+i,
     description:clean(data["product_"+i+"_description"],500),
     price_cents:price,currency:"usd",stock_mode:"manual",
     approved:true,active:true,variants:[],extras:[]
    });
    if(saveError){
     const {data:retry}=await db.from("vmv_ai_catalog_items").select("id")
      .eq("id",productId).eq("owner_id",owner).maybeSingle();
     if(!retry)throw Error("No pudimos guardar "+name+": "+saveError.message);
    }
   }
  }
 }
 if(enabledBookings){
  // The initial availability also comes from the owner, never from an AI guess.
  if(data.availability_mode==="weekly"&&data.hours_policy==="weekly"){
   const result=await db.rpc("vmv_ai_owner_seed_signup_availability",{
    p_workspace:workspaceId,p_zone:zone,p_days:60
   });
   if(result.error)throw Error("No pudimos preparar tu disponibilidad: "+result.error.message);
  }else if(data.availability_mode==="single"){
   const day=clean(data.availability_day,10),start=clean(data.availability_start,5),
    end=clean(data.availability_end,5);
   if(!/^20\d{2}-\d{2}-\d{2}$/.test(day)||!/^\d{2}:\d{2}$/.test(start)||
    !/^\d{2}:\d{2}$/.test(end)||start>=end)
    throw Error("Revisa la primera fecha y el horario de disponibilidad.");
   const {data:existingWindow,error:windowReadError}=await db.from("vmv_ai_booking_availability")
    .select("id").eq("owner_id",owner).eq("business_id",workspaceId)
    .eq("day",day).eq("start_local",start).eq("end_local",end)
    .eq("time_zone",zone).maybeSingle();
   if(windowReadError)throw Error("No se pudo revisar tu disponibilidad inicial.");
   if(!existingWindow){
    const result=await db.rpc("vmv_ai_owner_add_availability",{
     p_business:workspaceId,p_date:day,p_start:start,p_end:end,p_zone:zone
    });
    if(result.error||!result.data){
     const {data:retry}=await db.from("vmv_ai_booking_availability")
      .select("id").eq("owner_id",owner).eq("business_id",workspaceId)
      .eq("day",day).eq("start_local",start).eq("end_local",end)
      .eq("time_zone",zone).maybeSingle();
     if(!retry)throw Error("No se pudo publicar tu primer horario. Selecciona otro día o rango.");
    }
   }
  }
 }
 return {business:true,agent:clean(data.agent_name,40)};
}
