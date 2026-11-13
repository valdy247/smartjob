"use client";
import type {ChangeEvent} from "react";
import styles from "./GoogleProfileWizard.module.css";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import type {MessageKey} from "@/lib/i18n";
const labelKeys:Record<string,MessageKey>={"Tipo de perfil":"marketing.google.profile_type","Ubicación":"marketing.google.location","Contacto":"marketing.google.contact","Horarios":"marketing.google.hours","Negocio y servicios":"marketing.google.business_and_services","Fotos":"marketing.google.photos","¿Qué necesitas hacer?":"marketing.google.what_do_you_need","Crear un perfil":"marketing.google.create_a_listing","Reclamar uno existente":"marketing.google.claim_an_existing_listing","Mejorar el actual":"marketing.google.improve_my_listing","Nombre del negocio":"marketing.google.business_name","Necesario":"marketing.google.required","Opcional":"marketing.google.optional","Recomendada":"marketing.google.recommended","Categoría principal en Google":"marketing.google.main_google_category","Ej. Panadería, Pastelería, Restaurante":"marketing.google.e_g_bakery_cake_shop_restaurant","Enlace de tu perfil actual":"marketing.google.existing_listing_url","Otras categorías":"marketing.google.other_categories","Separadas por comas":"marketing.google.separated_by_commas","La categoría debe existir en Google. Nuestro equipo comprobará que coincida antes de gestionarla.":"marketing.google.google_must_support_the_category_our_team_will_check_i","¿Dónde atiendes?":"marketing.google.where_do_you_serve_customers","En un local":"marketing.google.at_a_storefront","Voy al cliente / entregas":"marketing.google.at_customers_locations_delivery","Ambos":"marketing.google.both","Calle y número":"marketing.google.street_address","Dirección comercial":"marketing.google.business_address","Local / suite":"marketing.google.unit_suite","Local 2":"marketing.google.suite_2","Ciudad":"marketing.google.city","Estado":"marketing.google.state","Código postal":"marketing.google.zip_code","País":"marketing.google.country","Solo ingresa una dirección donde realmente atiendes clientes. Google puede mostrarla públicamente.":"marketing.google.only_enter_an_address_where_you_actually_serve_custome","La dirección residencial no se publicará ni te la pediremos para esta solicitud. Google puede solicitarla privadamente durante su verificación.":"marketing.google.we_will_not_request_or_publish_your_home_address_googl","Áreas donde atiendes":"marketing.google.service_areas","Ciudades o códigos postales separados por comas":"marketing.google.cities_or_zip_codes_separated_by_commas","¿Cómo pueden contactarte?":"marketing.google.how_can_customers_contact_you","Teléfono comercial":"marketing.google.business_phone","Ej. +1 706 555 1234":"marketing.google.e_g_1_706_555_1234","Teléfono adicional":"marketing.google.additional_phone","Sitio web":"marketing.google.website","Sin página web":"marketing.google.no_website","Enlace para reservar o pedir":"marketing.google.booking_or_ordering_link","Nunca necesitamos tu contraseña de Google. La conexión y verificación se hacen con tu autorización.":"marketing.google.we_never_need_your_google_password_connections_and_ver","Horarios habituales":"marketing.google.regular_hours","Quiero indicar mis horarios":"marketing.google.add_my_business_hours","Abierto":"marketing.google.open","Puedes dejar los horarios pendientes si todavía no los tienes definidos.":"marketing.google.you_can_leave_business_hours_pending_if_they_are_not_s","Fecha de apertura":"marketing.google.opening_date","AAAA-MM-DD":"marketing.google.yyyy_mm_dd","Los horarios especiales de feriados se configuran después. Tu horario real debe coincidir con lo que ofreces.":"marketing.google.holiday_hours_can_be_set_later_your_posted_hours_must_","Cuéntales qué ofreces":"marketing.google.tell_customers_what_you_offer","Descripción comercial":"marketing.google.business_description","Qué hace tu negocio, productos o servicios principales y qué lo distingue":"marketing.google.describe_your_business_products_services_and_what_make","Servicios":"marketing.google.services","Ej. pedidos personalizados, entregas, catering":"marketing.google.e_g_custom_orders_delivery_catering","Productos destacados":"marketing.google.featured_products","Ej. chocoflan, pastel de cumpleaños, cupcakes":"marketing.google.e_g_flan_cake_birthday_cake_cupcakes","La descripción no debe incluir enlaces, promociones ni afirmaciones falsas.":"marketing.google.do_not_add_links_promotions_or_misleading_claims_in_th","Fotos del negocio":"marketing.google.business_photos","Todas son opcionales, pero ayudan a presentar tu negocio. Fotos reales: JPG o PNG, 10 KB a 5 MB cada una.":"marketing.google.photos_are_optional_but_helpful_use_genuine_jpg_or_png","Foto de portada":"marketing.google.cover_photo","Productos, local o trabajos (hasta 8)":"marketing.google.products_premises_or_work_up_to_8","Se guardarán de forma privada en VMV al enviar la solicitud. Google solo mostrará fotos después de verificar tu perfil.":"marketing.google.photos_are_stored_privately_in_vmv_when_you_submit_goo","fotos seleccionadas":"marketing.google.photos_selected","Mon":"marketing.google.mon","Lun":"marketing.google.mon_2","Mar":"marketing.google.tue","Mié":"marketing.google.wed","Jue":"marketing.google.thu","Vie":"marketing.google.fri","Sáb":"marketing.google.sat","Dom":"marketing.google.sun","Apertura":"marketing.google.opening","Cierre":"marketing.google.closing","Elegir imágenes (opcional)":"marketing.google.choose_images_optional"};


export type GoogleKind="storefront"|"service_area"|"hybrid";
export type GoogleHour={closed:boolean;start:string;end:string};
export type GoogleData={
 action:"create"|"claim"|"improve";kind:GoogleKind;googleCategory:string;otherCategories:string;
 street:string;unit:string;city:string;region:string;postal:string;country:string;serviceAreas:string;
 phone:string;secondaryPhone:string;description:string;services:string;products:string;
 bookingUrl:string;existingProfileUrl?:string;openingDate:string;hoursEnabled:boolean;hours:GoogleHour[];
};
export type GoogleMedia={logo:File|null;cover:File|null;photos:File[]};
export const emptyGoogle:GoogleData={
 action:"create",kind:"storefront",googleCategory:"",otherCategories:"",street:"",unit:"",city:"",region:"",postal:"",country:"US",serviceAreas:"",
 phone:"",secondaryPhone:"",description:"",services:"",products:"",bookingUrl:"",existingProfileUrl:"",openingDate:"",hoursEnabled:false,
 hours:Array.from({length:7},()=>({closed:true,start:"09:00",end:"17:00"}))
};
export const emptyMedia:GoogleMedia={logo:null,cover:null,photos:[]};
export const googleStepNames=["Tipo de perfil","Ubicación","Contacto","Horarios","Negocio y servicios","Fotos"] as const;
export function validateGoogleStep(step:number,v:GoogleData){
 if(step===0&&!v.googleCategory.trim())return "Indica la categoría principal de Google.";
 if(step===1&&v.kind!=="service_area"&&(!v.street.trim()||!v.city.trim()||!v.region.trim()||!v.postal.trim()))return "Completa la dirección donde recibes clientes.";
 if(step===1&&v.kind!=="storefront"&&!v.serviceAreas.trim())return "Indica las ciudades o códigos postales donde atiendes.";
 if(step===2&&v.phone.trim()&&v.phone.replace(/[^0-9]/g,"").length<7)return "Revisa el teléfono comercial.";
 if(step===3&&v.hoursEnabled&&v.hours.some(h=>!h.closed&&(!h.start||!h.end||h.start>=h.end)))return "Revisa los horarios de apertura y cierre.";
 return "";
}
export function validateGoogleAll(v:GoogleData){
 for(let i=0;i<6;i++){const error=validateGoogleStep(i,v);if(error)return {step:i,error};}
 return null;
}
const days=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const isHttps=(v:string)=>{if(!v.trim())return true;try{const u=new URL(v.trim());return u.protocol==="https:"&&!u.username&&!u.password;}catch{return false;}};
export function validateGoogleLinks(v:GoogleData){return !isHttps(v.bookingUrl)?"El enlace de reservas debe empezar con https://":!isHttps(v.existingProfileUrl||"")?"El enlace del perfil debe empezar con https://":"";}
function FilePicker({label,value,onChange,multiple=false}:{label:string;value:File[];onChange:(files:File[])=>void;multiple?:boolean}){
 const onPick=(e:ChangeEvent<HTMLInputElement>)=>{const files=Array.from(e.target.files||[]);onChange(files);e.target.value="";};
 return <label className={styles.upload}><span><strong>{label}</strong><small>{value.length?value.map(f=>f.name).join(", "):"Elegir imágenes (opcional)"}</small></span><input aria-label={label} type="file" accept="image/jpeg,image/png" multiple={multiple} onChange={onPick}/></label>;
}
export default function GoogleProfileWizard({step,data,onData,media,onMedia,business,website}:{step:number;data:GoogleData;onData:(v:GoogleData)=>void;media:GoogleMedia;onMedia:(v:GoogleMedia)=>void;business:string;website:string}){
 const {language,translate}=useInterfaceLanguage();const en=language==="en";
 const tx=(text:string)=>{const key=labelKeys[text];return key?translate(key):text;};
 const patch=<K extends keyof GoogleData>(key:K,value:GoogleData[K])=>onData({...data,[key]:value});
 const field=(key:keyof GoogleData,label:string,placeholder:string,optional=true)=>(
  <label className={styles.field}><span>{tx(label)} <em>{tx(optional?"Opcional":"Necesario")}</em></span>
  <input value={String(data[key])} maxLength={250} placeholder={tx(placeholder)} onChange={e=>onData({...data,[key]:e.target.value})}/></label>
 );
 return <div className={styles.root}>
   <div className={styles.progress}><span>Google Business Profile</span><strong>{step+1} / {googleStepNames.length} · {tx(googleStepNames[step])}</strong></div>
   {step===0?<div className={styles.group}>
    <h3>{tx("¿Qué necesitas hacer?")}</h3>
    <div className={styles.choices}>{([["create","Crear un perfil"],["claim","Reclamar uno existente"],["improve","Mejorar el actual"]] as const).map(([id,label])=>
     <button type="button" aria-pressed={data.action===id} key={id} onClick={()=>patch("action",id)}>{tx(label)}</button>)}</div>
    <label className={styles.field}><span>{tx("Nombre del negocio")} <em>{tx("Necesario")}</em></span><input value={business} disabled readOnly/></label>
    <label className={styles.field}><span>{tx("Categoría principal en Google")} <em>{tx("Necesario")}</em></span>
     <input value={data.googleCategory} maxLength={100} onChange={e=>patch("googleCategory",e.target.value)} placeholder={tx("Ej. Panadería, Pastelería, Restaurante")}/></label>
    {data.action!=="create"?<label className={styles.field}><span>{tx("Enlace de tu perfil actual")} <em>{tx("Opcional")}</em></span><input type="url" inputMode="url" maxLength={500} value={data.existingProfileUrl||""} placeholder="https://maps.google.com/..." onChange={e=>patch("existingProfileUrl",e.target.value)}/></label>:null}
    {field("otherCategories","Otras categorías","Separadas por comas")}
    <p className={styles.hint}>{tx("La categoría debe existir en Google. Nuestro equipo comprobará que coincida antes de gestionarla.")}</p>
   </div>:null}
   {step===1?<div className={styles.group}>
    <h3>{tx("¿Dónde atiendes?")}</h3>
    <div className={styles.choices}>{([["storefront","En un local"],["service_area","Voy al cliente / entregas"],["hybrid","Ambos"]] as const).map(([id,label])=>
     <button type="button" key={id} aria-pressed={data.kind===id} onClick={()=>patch("kind",id)}>{tx(label)}</button>)}</div>
    {data.kind!=="service_area"?<>
      {field("street","Calle y número","Dirección comercial",false)}
      {field("unit","Local / suite","Local 2")}
      <div className={styles.two}>{field("city","Ciudad","Columbus",false)}{field("region","Estado","Georgia",false)}</div>
      <div className={styles.two}>{field("postal","Código postal","31901",false)}{field("country","País","US",false)}</div>
      <p className={styles.hint}>{tx("Solo ingresa una dirección donde realmente atiendes clientes. Google puede mostrarla públicamente.")}</p>
     </>:<p className={styles.hint}>{tx("La dirección residencial no se publicará ni te la pediremos para esta solicitud. Google puede solicitarla privadamente durante su verificación.")}</p>}
    {data.kind!=="storefront"?<label className={styles.field}><span>{tx("Áreas donde atiendes")} <em>{tx("Necesario")}</em></span>
      <textarea rows={3} value={data.serviceAreas} onChange={e=>patch("serviceAreas",e.target.value)} maxLength={400} placeholder={tx("Ciudades o códigos postales separados por comas")}/></label>:null}
   </div>:null}
   {step===2?<div className={styles.group}>
    <h3>{tx("¿Cómo pueden contactarte?")}</h3>
    {field("phone","Teléfono comercial","Ej. +1 706 555 1234")}
    {field("secondaryPhone","Teléfono adicional","Opcional")}
    <label className={styles.field}><span>{tx("Sitio web")} <em>{tx("Opcional")}</em></span><input value={website} disabled readOnly placeholder={tx("Sin página web")}/></label>
    {field("bookingUrl","Enlace para reservar o pedir","https://...")}
    <p className={styles.hint}>{tx("Nunca necesitamos tu contraseña de Google. La conexión y verificación se hacen con tu autorización.")}</p>
   </div>:null}
   {step===3?<div className={styles.group}>
    <h3>{tx("Horarios habituales")}</h3>
    <label className={styles.toggle}><input type="checkbox" checked={data.hoursEnabled} onChange={e=>patch("hoursEnabled",e.target.checked)}/><span>{tx("Quiero indicar mis horarios")}</span></label>
    {data.hoursEnabled?<div className={styles.hours}>{data.hours.map((h,i)=><div key={tx(days[i])} className={styles.day}>
     <strong>{tx(days[i])}</strong><label><input type="checkbox" checked={!h.closed} onChange={e=>patch("hours",data.hours.map((x,j)=>j===i?{...x,closed:!e.target.checked}:x))}/> {tx("Abierto")}</label>
     {!h.closed?<><input aria-label={tx("Apertura")+" "+tx(days[i])} type="time" value={h.start} onChange={e=>patch("hours",data.hours.map((x,j)=>j===i?{...x,start:e.target.value}:x))}/><input aria-label={tx("Cierre")+" "+tx(days[i])} type="time" value={h.end} onChange={e=>patch("hours",data.hours.map((x,j)=>j===i?{...x,end:e.target.value}:x))}/></>:null}
    </div>)}</div>:<p className={styles.hint}>{tx("Puedes dejar los horarios pendientes si todavía no los tienes definidos.")}</p>}
    {field("openingDate","Fecha de apertura","AAAA-MM-DD")}
    <p className={styles.hint}>{tx("Los horarios especiales de feriados se configuran después. Tu horario real debe coincidir con lo que ofreces.")}</p>
   </div>:null}
   {step===4?<div className={styles.group}>
    <h3>{tx("Cuéntales qué ofreces")}</h3>
    <label className={styles.field}><span>{tx("Descripción comercial")} <em>{tx("Recomendada")}</em></span><textarea rows={5} value={data.description} onChange={e=>patch("description",e.target.value)} maxLength={750} placeholder={tx("Qué hace tu negocio, productos o servicios principales y qué lo distingue")}/><small>{data.description.length}/750</small></label>
    <label className={styles.field}><span>{tx("Servicios")} <em>{tx("Opcional")}</em></span><textarea rows={3} value={data.services} onChange={e=>patch("services",e.target.value)} maxLength={900} placeholder={tx("Ej. pedidos personalizados, entregas, catering")}/></label>
    <label className={styles.field}><span>{tx("Productos destacados")} <em>{tx("Opcional")}</em></span><textarea rows={3} value={data.products} onChange={e=>patch("products",e.target.value)} maxLength={900} placeholder={tx("Ej. chocoflan, pastel de cumpleaños, cupcakes")}/></label>
    <p className={styles.hint}>{tx("La descripción no debe incluir enlaces, promociones ni afirmaciones falsas.")}</p>
   </div>:null}
   {step===5?<div className={styles.group}>
    <h3>{tx("Fotos del negocio")}</h3>
    <p className={styles.hint}>{tx("Todas son opcionales, pero ayudan a presentar tu negocio. Fotos reales: JPG o PNG, 10 KB a 5 MB cada una.")}</p>
    <FilePicker label="Logo" value={media.logo?[media.logo]:[]} onChange={files=>onMedia({...media,logo:files[0]||null})}/>
    <FilePicker label={tx("Foto de portada")} value={media.cover?[media.cover]:[]} onChange={files=>onMedia({...media,cover:files[0]||null})}/>
    <FilePicker label={tx("Productos, local o trabajos (hasta 8)")} value={media.photos} multiple onChange={files=>onMedia({...media,photos:files.slice(0,8)})}/>
    <p className={styles.hint}>{tx("Se guardarán de forma privada en VMV al enviar la solicitud. Google solo mostrará fotos después de verificar tu perfil.")}</p>
    <p className={styles.count}>{[media.logo,media.cover,...media.photos].filter(Boolean).length} {tx("fotos seleccionadas")}</p>
   </div>:null}
 </div>;
}
