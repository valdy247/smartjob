"use client";
import {contactPhoneE164} from "@/lib/contact-phone";
import {googleProfileLink} from "@/lib/google-profile-request";
import BusinessPhoneInput from "@/components/BusinessPhoneInput";
import {useEffect,useMemo,useState,type ChangeEvent} from "react";
import {CheckCircle2,MapPin,AlertCircle} from "lucide-react";
import GoogleCategoryLookup from "./GoogleCategoryLookup";
import styles from "./GoogleProfileWizard.module.css";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {t as labelText,type MessageKey,type InterfaceLanguage} from "@/lib/i18n";
const labelKeys:Record<string,MessageKey>={"Tipo de perfil":"marketing.google.profile_type","Ubicación":"marketing.google.location","Contacto":"marketing.google.contact","Horarios":"marketing.google.hours","Negocio y servicios":"marketing.google.business_and_services","Fotos":"marketing.google.photos","¿Qué necesitas hacer?":"marketing.google.what_do_you_need","Crear un perfil":"marketing.google.create_a_listing","Reclamar uno existente":"marketing.google.claim_an_existing_listing","Mejorar el actual":"marketing.google.improve_my_listing","Nombre del negocio":"marketing.google.business_name","Necesario":"marketing.google.required","Opcional":"marketing.google.optional","Recomendada":"marketing.google.recommended","Categoría principal en Google":"marketing.google.main_google_category","Ej. Panadería, Pastelería, Restaurante":"marketing.google.e_g_bakery_cake_shop_restaurant","Enlace de tu perfil actual":"marketing.google.existing_listing_url","Otras categorías":"marketing.google.other_categories","Separadas por comas":"marketing.google.separated_by_commas","La categoría debe existir en Google. Nuestro equipo comprobará que coincida antes de gestionarla.":"marketing.google.google_must_support_the_category_our_team_will_check_i","¿Dónde atiendes?":"marketing.google.where_do_you_serve_customers","En un local":"marketing.google.at_a_storefront","Voy al cliente / entregas":"marketing.google.at_customers_locations_delivery","Ambos":"marketing.google.both","Calle y número":"marketing.google.street_address","Dirección comercial":"marketing.google.business_address","Local / suite":"marketing.google.unit_suite","Local 2":"marketing.google.suite_2","Ciudad":"marketing.google.city","Estado":"marketing.google.state","Código postal":"marketing.google.zip_code","País":"marketing.google.country","Solo ingresa una dirección donde realmente atiendes clientes. Google puede mostrarla públicamente.":"marketing.google.only_enter_an_address_where_you_actually_serve_custome","La dirección residencial no se publicará ni te la pediremos para esta solicitud. Google puede solicitarla privadamente durante su verificación.":"marketing.google.we_will_not_request_or_publish_your_home_address_googl","Áreas donde atiendes":"marketing.google.service_areas","Ciudades o códigos postales separados por comas":"marketing.google.cities_or_zip_codes_separated_by_commas","¿Cómo pueden contactarte?":"marketing.google.how_can_customers_contact_you","Teléfono comercial":"marketing.google.business_phone","Ej. +1 706 555 1234":"marketing.google.e_g_1_706_555_1234","Teléfono adicional":"marketing.google.additional_phone","Sitio web":"marketing.google.website","Sin página web":"marketing.google.no_website","Enlace para reservar o pedir":"marketing.google.booking_or_ordering_link","Nunca necesitamos tu contraseña de Google. La conexión y verificación se hacen con tu autorización.":"marketing.google.we_never_need_your_google_password_connections_and_ver","Horarios habituales":"marketing.google.regular_hours","Quiero indicar mis horarios":"marketing.google.add_my_business_hours","Abierto":"marketing.google.open","Puedes dejar los horarios pendientes si todavía no los tienes definidos.":"marketing.google.you_can_leave_business_hours_pending_if_they_are_not_s","Fecha de apertura":"marketing.google.opening_date","AAAA-MM-DD":"marketing.google.yyyy_mm_dd","Los horarios especiales de feriados se configuran después. Tu horario real debe coincidir con lo que ofreces.":"marketing.google.holiday_hours_can_be_set_later_your_posted_hours_must_","Cuéntales qué ofreces":"marketing.google.tell_customers_what_you_offer","Descripción comercial":"marketing.google.business_description","Qué hace tu negocio, productos o servicios principales y qué lo distingue":"marketing.google.describe_your_business_products_services_and_what_make","Servicios":"marketing.google.services","Ej. pedidos personalizados, entregas, catering":"marketing.google.e_g_custom_orders_delivery_catering","Productos destacados":"marketing.google.featured_products","Ej. chocoflan, pastel de cumpleaños, cupcakes":"marketing.google.e_g_flan_cake_birthday_cake_cupcakes","La descripción no debe incluir enlaces, promociones ni afirmaciones falsas.":"marketing.google.do_not_add_links_promotions_or_misleading_claims_in_th","Fotos del negocio":"marketing.google.business_photos","Todas son opcionales, pero ayudan a presentar tu negocio. Fotos reales: JPG o PNG, 10 KB a 5 MB cada una.":"marketing.google.photos_are_optional_but_helpful_use_genuine_jpg_or_png","Foto de portada":"marketing.google.cover_photo","Productos, local o trabajos (hasta 8)":"marketing.google.products_premises_or_work_up_to_8","Se guardarán de forma privada en VMV al enviar la solicitud. Google solo mostrará fotos después de verificar tu perfil.":"marketing.google.photos_are_stored_privately_in_vmv_when_you_submit_goo","fotos seleccionadas":"marketing.google.photos_selected","Mon":"marketing.google.mon","Lun":"marketing.google.mon_2","Mar":"marketing.google.tue","Mié":"marketing.google.wed","Jue":"marketing.google.thu","Vie":"marketing.google.fri","Sáb":"marketing.google.sat","Dom":"marketing.google.sun","Apertura":"marketing.google.opening","Cierre":"marketing.google.closing","Elegir imágenes (opcional)":"marketing.google.choose_images_optional"};


export type {GoogleKind,GoogleHour,GoogleData} from "@/lib/google-profile-request";
import {googlePhotoKey,googleProfileIssue,type GoogleData} from "@/lib/google-profile-request";
export type GoogleMedia={logo:File|null;cover:File|null;photos:File[]};
export const emptyGoogle:GoogleData={
 action:"create",kind:"storefront",googleCategory:"",googleCategoryId:"",categoryPendingReview:false,locationChecked:false,locationPendingReview:false,locationConflict:false,otherCategories:"",street:"",unit:"",city:"",region:"",postal:"",country:"US",serviceAreas:"",
 phone:"",secondaryPhone:"",description:"",services:"",products:"",bookingUrl:"",existingProfileUrl:"",openingDate:"",hoursEnabled:false,
 hours:Array.from({length:7},()=>({closed:true,start:"09:00",end:"17:00"}))
};
export const emptyMedia:GoogleMedia={logo:null,cover:null,photos:[]};
export const googleStepNames=["Tipo de perfil","Ubicación","Contacto","Horarios","Negocio y servicios","Fotos"] as const;
export function validateGoogleStep(step:number,v:GoogleData,language:InterfaceLanguage="es"){
 const issue=googleProfileIssue(v,step);
 return issue?labelText(language,("marketing.google.validation."+issue.key) as MessageKey):"";
}
export function validateGoogleAll(v:GoogleData,language:InterfaceLanguage="es"){
 for(let i=0;i<6;i++){const error=validateGoogleStep(i,v,language);if(error)return {step:i,error};}
 return null;
}
const days=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const isHttps=(v:string)=>{if(!v.trim())return true;try{const u=new URL(v.trim());return u.protocol==="https:"&&!u.username&&!u.password;}catch{return false;}};
export function validateGoogleLinks(v:GoogleData,language:InterfaceLanguage="es"){return !isHttps(v.bookingUrl)?labelText(language,"marketing.google.validation.booking"):!isHttps(v.existingProfileUrl||"")?labelText(language,"marketing.google.validation.existing"):"";}
function FilePicker({label,value,onChange,multiple=false}:{label:string;value:File[];onChange:(files:File[])=>void;multiple?:boolean}){
 const {translate}=useInterfaceLanguage();
 const [fileError,setFileError]=useState("");
 const [checking,setChecking]=useState(false);
 const [previews,setPreviews]=useState<{file:File;url:string}[]>([]);
 useEffect(()=>{
  const next=value.map(file=>({file,url:URL.createObjectURL(file)}));
  setPreviews(next);
  return()=>next.forEach(item=>URL.revokeObjectURL(item.url));
 },[value]);
 const onPick=async(e:ChangeEvent<HTMLInputElement>)=>{
  const files=Array.from(e.target.files||[]);e.target.value="";
  if(!files.length)return;
  setFileError("");setChecking(true);
  try{
   // Validate every new file before deduplicating; metadata alone cannot identify photo content.
   for(const file of files){
    if(!["image/jpeg","image/png"].includes(file.type)||file.size<10240||file.size>5242880)throw new Error("photo");
    await googlePhotoKey(file);
    const url=URL.createObjectURL(file);
    try{
     const image=new Image();image.src=url;await image.decode();
     if(image.naturalWidth<250||image.naturalHeight<250)throw new Error("dimensions");
    }finally{URL.revokeObjectURL(url);}
   }
   const candidates=multiple?[...value,...files]:files;
   const seen=new Set<string>();
   const next:File[]=[];
   for(const file of candidates){
    const digest=await googlePhotoKey(file);
    if(!seen.has(digest)){seen.add(digest);next.push(file);}
   }
   if(multiple&&next.length>8){setFileError(translate("marketing.google.photoLimit"));return;}
   onChange(next);
  }catch{setFileError(translate("marketing.google.photoRequirements"));}
  finally{setChecking(false);}
 };
 return <section className={styles.photoField} aria-label={label}>
  <label className={styles.upload}><span><strong>{label}</strong><small>{translate("marketing.google.choose_images_optional")}</small></span>
   <input aria-label={label} type="file" accept="image/jpeg,image/png" multiple={multiple} disabled={checking} onChange={onPick}/></label>
  {fileError?<p role="alert" className={styles.hint}>{fileError}</p>:null}
  {checking?<p role="status" className={styles.hint}>{translate("marketing.google.checkingPhoto")}</p>:null}
  {previews.length?<div className={styles.photoGrid}>{previews.map(({file,url},index)=><figure className={styles.photoPreview} key={url}>
   <img src={url} alt={file.name} width={180} height={130}/>
   <figcaption>{file.name}</figcaption>
   <button type="button" onClick={()=>onChange(value.filter((_,i)=>i!==index))} aria-label={translate("marketing.google.removePhoto")+": "+file.name}>{translate("marketing.google.removePhoto")}</button>
  </figure>)}</div>:null}
 </section>;
}
function MoreInfo({children}:{children:import("react").ReactNode}){
 const {translate}=useInterfaceLanguage();
 return <details className={styles.moreInfo}><summary>{translate("marketing.google.moreInfo")}</summary>{children}</details>;
}
export default function GoogleProfileWizard({step,data,onData,media,onMedia,business,website,loadedData,editLoaded=false}:{loadedData?:GoogleData;editLoaded?:boolean;step:number;data:GoogleData;onData:(v:GoogleData)=>void;media:GoogleMedia;onMedia:(v:GoogleMedia)=>void;business:string;website:string}){
 const {language,translate}=useInterfaceLanguage();const en=language==="en";
 const [editing,setEditing]=useState(editLoaded);
 const hasSaved=(key:keyof GoogleData)=>{
  if(!loadedData||editing||!data[key]||!loadedData[key]||(typeof loadedData[key]==="string"&&!String(loadedData[key]).trim()))return false;
  if(key==="phone"||key==="secondaryPhone")return Boolean(contactPhoneE164(loadedData[key],loadedData.country));
  if(key==="description")return loadedData.description.length<=750&&!/(https?:\/\/|www\.)/i.test(loadedData.description);
  if(key==="products"||key==="services")return loadedData[key].length<=900;
  if(key==="country")return /^[A-Z]{2}$/.test(loadedData.country);
  if(key==="bookingUrl"||key==="existingProfileUrl")return Boolean(googleProfileLink(loadedData[key]));
  return true;
 };
 const hideHours=hasSaved("hoursEnabled")&&!validateGoogleStep(3,loadedData!,language);
 const tx=(text:string)=>{const key=labelKeys[text];return key?translate(key):text;};
 const [checkingLocation,setCheckingLocation]=useState(false);
 const [locationMessage,setLocationMessage]=useState("");
 const countries=useMemo(()=>{
  const intl=new Intl.DisplayNames([en?"en":"es"],{type:"region"});
  const excluded=new Set(["EU","EZ","UN","ZZ","XA","XB","QO","XK"]);
  const result:{code:string;name:string}[]=[];
  for(let a=65;a<=90;a++)for(let b=65;b<=90;b++){
   const code=String.fromCharCode(a,b),name=intl.of(code)||"";
   if(!name||name===code||/unknown region|regi[oó]n desconocida/i.test(name)||excluded.has(code))continue;
   result.push({code,name});
  }
  return result.sort((a,b)=>a.name.localeCompare(b.name,en?"en":"es"));
 },[en]);
 const patch=<K extends keyof GoogleData>(key:K,value:GoogleData[K])=>{
  const locationFields=["country","street","unit","city","region","postal","serviceAreas","kind"];
  onData({...data,[key]:value,...(locationFields.includes(String(key))?{locationChecked:false,locationPendingReview:false,locationConflict:false}:{}),...(key==="country"?{googleCategory:"",googleCategoryId:"",categoryPendingReview:false,otherCategories:""}:{})});
  if(locationFields.includes(String(key)))setLocationMessage("");
 };
 const verifyLocation=async()=>{
  if(!data.city.trim()||!data.country.trim()){setLocationMessage(en?"Enter a city and country first.":"Indica primero la ciudad y el país.");return;}
  setCheckingLocation(true);setLocationMessage("");
  try{
   const q=new URLSearchParams({country:data.country,city:data.city,region:data.region,postal:data.postal});
   const r=await fetch("/api/marketing/google-location?"+q,{cache:"no-store"});
   const result=await r.json() as {verified?:boolean;postalMatched?:boolean;error?:string};
   if(r.ok&&result.verified){
    onData({...data,locationChecked:true,locationPendingReview:false,locationConflict:false});
    setLocationMessage(en?"City, region and postal code matched Google Maps. This does not verify the storefront or street address.":"Ciudad, región y código postal coinciden con Google Maps. Esto no verifica el local ni la dirección exacta.");
   }else if(r.ok&&result.postalMatched){
    onData({...data,locationChecked:false,locationPendingReview:true,locationConflict:false});
    setLocationMessage(en?"City, state and ZIP match a postal directory. Google verification is still pending and VMV must review it.":"Ciudad, estado y código postal coinciden en un directorio postal. Google aún no los ha validado; VMV debe revisarlos.");
   }else{
    onData({...data,locationChecked:false,locationPendingReview:false,locationConflict:r.status===422});
    setLocationMessage(r.status===422?(en?"City, region and postal code do not match the available geographic records. Check your spelling and ZIP.":"La ciudad, región y código postal no coinciden con los registros geográficos consultados. Revisa los datos."):r.status===503?(en?"Automatic verification is unavailable. Request manual review by VMV.":"La comprobación automática no está disponible. Solicita revisión manual de VMV."):(en?"We could not confirm the location. Please check the details.":"No pudimos confirmar la ubicación. Revisa los datos."));
   }
  }catch{setLocationMessage(en?"Google location checking is temporarily unavailable.":"La comprobación de Google no está disponible ahora.");}
  finally{setCheckingLocation(false);}
 };
 const field=(key:keyof GoogleData,label:string,placeholder:string,optional=true)=>hasSaved(key)?null:(
  <label className={styles.field}><span>{tx(label)} <em>{tx(optional?"Opcional":"Necesario")}</em></span>
  <input value={String(data[key])} maxLength={250} placeholder={tx(placeholder)} onChange={e=>patch(key,e.target.value as GoogleData[typeof key])}/></label>
 );
 return <div className={styles.root}>
   <div className={styles.progress}><span>Google Business Profile</span><strong>{step+1} / {googleStepNames.length} · {tx(googleStepNames[step])}</strong></div>
   {loadedData?<div className={styles.loadedProfile}><span>{translate("marketing.google.profileLoadedShort")}</span><button type="button" onClick={()=>setEditing(v=>!v)}>{translate(editing?"marketing.google.onlyMissing":"marketing.copy.edit")}</button></div>:null}
   {step===0?<div className={styles.group}>
    <h3>{tx("¿Qué necesitas hacer?")}</h3>
    <div className={styles.choices}>{([["create","Crear un perfil"],["claim","Reclamar uno existente"],["improve","Mejorar el actual"]] as const).map(([id,label])=>
     <button type="button" aria-pressed={data.action===id} key={id} onClick={()=>onData({...data,action:id,openingDate:id==="create"?data.openingDate:""})}>{tx(label)}</button>)}</div>
    {!hasSaved("googleCategory")?<GoogleCategoryLookup key={data.country} data={data} onData={onData}/>:null}
    {data.action!=="create"&&!hasSaved("existingProfileUrl")?<label className={styles.field}><span>{tx("Enlace de tu perfil actual")} <em>{tx("Opcional")}</em></span><input type="url" inputMode="url" maxLength={500} value={data.existingProfileUrl||""} placeholder="https://maps.google.com/..." onChange={e=>patch("existingProfileUrl",e.target.value)}/></label>:null}
    <MoreInfo><p className={styles.hint}>{translate("marketing.google.eligibility")}</p></MoreInfo>
   </div>:null}
   {step===1?<div className={styles.group}>
    <h3>{tx("¿Dónde atiendes?")}</h3>
    {!hasSaved("kind")?<div className={styles.choices}>{([["storefront","En un local"],["service_area","Voy al cliente / entregas"],["hybrid","Ambos"]] as const).map(([id,label])=>
     <button type="button" key={id} aria-pressed={data.kind===id} onClick={()=>patch("kind",id)}>{tx(label)}</button>)}</div>:null}
    {data.kind!=="service_area"?<>
      {field("street","Calle y número","Dirección comercial",false)}
      {field("unit","Local / suite","Local 2")}
      <div className={styles.two}>{field("city","Ciudad","Columbus",false)}{field("region","Estado","Georgia",false)}</div>
      {field("postal","Código postal","31901",false)}
      <p className={styles.hint}>{tx("Solo ingresa una dirección donde realmente atiendes clientes. Google puede mostrarla públicamente.")}</p>
     </>:<p className={styles.hint}>{tx("La dirección residencial no se publicará ni te la pediremos para esta solicitud. Google puede solicitarla privadamente durante su verificación.")}</p>}
    {!hasSaved("country")?<label className={styles.field}><span>{en?"Country":"País"} <em>{en?"Required":"Necesario"}</em></span>
     <select className={styles.countrySelect} value={data.country} onChange={e=>patch("country",e.target.value)}>
      {!countries.some(x=>x.code===data.country)?<option value={data.country}>{en?"Select a valid country":"Selecciona un país válido"}</option>:null}
      {countries.map(x=><option key={x.code} value={x.code}>{x.name} ({x.code})</option>)}
     </select>
    </label>:null}
    {!loadedData||editing||!data.locationPendingReview?<div className={styles.locationCheck}>
     {data.kind!=="service_area"?<button type="button" disabled={checkingLocation||!data.city.trim()} onClick={()=>void verifyLocation()}><MapPin size={15}/>{checkingLocation?(en?"Checking…":"Comprobando…"):(en?"Check city, region and ZIP":"Comprobar ciudad, región y código postal")}</button>:null}
     {data.locationChecked?<p className={styles.locationVerified}><CheckCircle2 size={15}/>{en?"Location matched Google Maps":"Ubicación contrastada con Google Maps"}</p>:null}
     {locationMessage?<p className={styles.locationWarning} role="status"><AlertCircle size={15}/>{locationMessage}</p>:null}
     {!data.locationChecked?<button type="button" className={styles.manualLocation} aria-pressed={!!data.locationPendingReview} disabled={!!data.locationConflict} onClick={()=>patch("locationPendingReview",true)}>{en?"Request manual location verification":"Solicitar verificación manual de ubicación"}</button>:null}
     {data.locationPendingReview?<small>{en?"Pending VMV review":"Pendiente de revisión por VMV"}</small>:null}
    </div>:null}
    {data.kind!=="storefront"&&!hasSaved("serviceAreas")?<label className={styles.field}><span>{tx("Áreas donde atiendes")} <em>{tx("Necesario")}</em></span>
      <textarea rows={3} value={data.serviceAreas} onChange={e=>patch("serviceAreas",e.target.value)} maxLength={400} placeholder={tx("Ciudades o códigos postales separados por comas")}/></label>:null}
   </div>:null}
   {step===2?<div className={styles.group}>
    <h3>{tx("¿Cómo pueden contactarte?")}</h3>
    {!hasSaved("phone")?<label className={styles.field}><span>{tx("Teléfono comercial")} <em>{tx("Opcional")}</em></span><BusinessPhoneInput value={data.phone} onChange={value=>patch("phone",value)} country={data.country} label={tx("Teléfono comercial")}/></label>:null}
    {!hasSaved("secondaryPhone")?<label className={styles.field}><span>{tx("Teléfono adicional")} <em>{tx("Opcional")}</em></span><BusinessPhoneInput value={data.secondaryPhone} onChange={value=>patch("secondaryPhone",value)} country={data.country} label={tx("Teléfono adicional")}/></label>:null}
    {field("bookingUrl","Enlace para reservar o pedir","https://...")}
    <MoreInfo><p className={styles.hint}>{tx("Nunca necesitamos tu contraseña de Google. La conexión y verificación se hacen con tu autorización.")}</p></MoreInfo>
   </div>:null}
   {step===3?<div className={styles.group}>
    <h3>{tx("Horarios habituales")}</h3>
    {!hasSaved("hoursEnabled")?<label className={styles.toggle}><input type="checkbox" checked={data.hoursEnabled} onChange={e=>patch("hoursEnabled",e.target.checked)}/><span>{tx("Quiero indicar mis horarios")}</span></label>:null}
    {hideHours?null:data.hoursEnabled?<div className={styles.hours}>{data.hours.map((h,i)=><div key={tx(days[i])} className={styles.day}>
     <strong>{tx(days[i])}</strong><label><input type="checkbox" checked={!h.closed} onChange={e=>patch("hours",data.hours.map((x,j)=>j===i?{...x,closed:!e.target.checked}:x))}/> {tx("Abierto")}</label>
     {!h.closed?<><input aria-label={tx("Apertura")+" "+tx(days[i])} type="time" value={h.start} onChange={e=>patch("hours",data.hours.map((x,j)=>j===i?{...x,start:e.target.value}:x))}/><input aria-label={tx("Cierre")+" "+tx(days[i])} type="time" value={h.end} onChange={e=>patch("hours",data.hours.map((x,j)=>j===i?{...x,end:e.target.value}:x))}/></>:null}
    {h.end<h.start?<small>{translate("marketing.google.nextDay")}</small>:null}
    </div>)}</div>:null}
    {data.action==="create"&&!hasSaved("openingDate")?<label className={styles.field}><span>{tx("Fecha de apertura")} <em>{tx("Opcional")}</em></span><input type="date" value={data.openingDate} onChange={e=>patch("openingDate",e.target.value)}/></label>:null}
    <MoreInfo><p className={styles.hint}>{tx("Los horarios especiales de feriados se configuran después. Tu horario real debe coincidir con lo que ofreces.")}</p></MoreInfo>
   </div>:null}
   {step===4?<div className={styles.group}>
    <h3>{tx("Cuéntales qué ofreces")}</h3>
    {!hasSaved("description")?<label className={styles.field}><span>{tx("Descripción comercial")} <em>{tx("Recomendada")}</em></span><textarea rows={5} value={data.description} onChange={e=>patch("description",e.target.value)} maxLength={750} placeholder={tx("Qué hace tu negocio, productos o servicios principales y qué lo distingue")}/><small>{data.description.length}/750</small></label>:null}
    {!hasSaved("services")?<label className={styles.field}><span>{tx("Servicios")} <em>{tx("Opcional")}</em></span><textarea rows={3} value={data.services} onChange={e=>patch("services",e.target.value)} maxLength={900} placeholder={tx("Ej. pedidos personalizados, entregas, catering")}/></label>:null}
    {!hasSaved("products")?<label className={styles.field}><span>{tx("Productos destacados")} <em>{tx("Opcional")}</em></span><textarea rows={3} value={data.products} onChange={e=>patch("products",e.target.value)} maxLength={900} placeholder={tx("Ej. chocoflan, pastel de cumpleaños, cupcakes")}/></label>:null}
    <p className={styles.hint}>{tx("La descripción no debe incluir enlaces, promociones ni afirmaciones falsas.")}</p>
   </div>:null}
   {step===5?<div className={styles.group}>
    <h3>{tx("Fotos del negocio")}</h3>
    <p className={styles.hint}>{tx("Todas son opcionales, pero ayudan a presentar tu negocio. Fotos reales: JPG o PNG, 10 KB a 5 MB cada una.")}</p>
    <FilePicker label="Logo" value={media.logo?[media.logo]:[]} onChange={files=>onMedia({...media,logo:files[0]||null})}/>
    <FilePicker label={tx("Foto de portada")} value={media.cover?[media.cover]:[]} onChange={files=>onMedia({...media,cover:files[0]||null})}/>
    <FilePicker label={tx("Productos, local o trabajos (hasta 8)")} value={media.photos} multiple onChange={files=>onMedia({...media,photos:files.slice(0,8)})}/>
    <MoreInfo><p className={styles.hint}>{tx("Se guardarán de forma privada en VMV al enviar la solicitud. Google solo mostrará fotos después de verificar tu perfil.")}</p></MoreInfo>
    <p className={styles.count}>{[media.logo,media.cover,...media.photos].filter(Boolean).length} {tx("fotos seleccionadas")}</p>
   </div>:null}
 </div>;
}
