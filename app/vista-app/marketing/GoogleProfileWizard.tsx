"use client";
import type {ChangeEvent} from "react";
import styles from "./GoogleProfileWizard.module.css";
import {useInterfaceLanguage} from "@/lib/i18n-web";
const enLabels:Record<string,string>={"Tipo de perfil":"Profile type","Ubicación":"Location","Contacto":"Contact","Horarios":"Hours","Negocio y servicios":"Business and services","Fotos":"Photos","¿Qué necesitas hacer?":"What do you need?","Crear un perfil":"Create a listing","Reclamar uno existente":"Claim an existing listing","Mejorar el actual":"Improve my listing","Nombre del negocio":"Business name","Necesario":"Required","Opcional":"Optional","Recomendada":"Recommended","Categoría principal en Google":"Main Google category","Ej. Panadería, Pastelería, Restaurante":"E.g. Bakery, Cake shop, Restaurant","Enlace de tu perfil actual":"Existing listing URL","Otras categorías":"Other categories","Separadas por comas":"Separated by commas","La categoría debe existir en Google. Nuestro equipo comprobará que coincida antes de gestionarla.":"Google must support the category. Our team will check it before proceeding.","¿Dónde atiendes?":"Where do you serve customers?","En un local":"At a storefront","Voy al cliente / entregas":"At customers' locations / delivery","Ambos":"Both","Calle y número":"Street address","Dirección comercial":"Business address","Local / suite":"Unit / suite","Local 2":"Suite 2","Ciudad":"City","Estado":"State","Código postal":"ZIP code","País":"Country","Solo ingresa una dirección donde realmente atiendes clientes. Google puede mostrarla públicamente.":"Only enter an address where you actually serve customers. Google may display it publicly.","La dirección residencial no se publicará ni te la pediremos para esta solicitud. Google puede solicitarla privadamente durante su verificación.":"We will not request or publish your home address. Google may request it privately during verification.","Áreas donde atiendes":"Service areas","Ciudades o códigos postales separados por comas":"Cities or ZIP codes, separated by commas","¿Cómo pueden contactarte?":"How can customers contact you?","Teléfono comercial":"Business phone","Ej. +1 706 555 1234":"E.g. +1 706 555 1234","Teléfono adicional":"Additional phone","Sitio web":"Website","Sin página web":"No website","Enlace para reservar o pedir":"Booking or ordering link","Nunca necesitamos tu contraseña de Google. La conexión y verificación se hacen con tu autorización.":"We never need your Google password. Connections and verification require your approval.","Horarios habituales":"Regular hours","Quiero indicar mis horarios":"Add my business hours","Abierto":"Open","Puedes dejar los horarios pendientes si todavía no los tienes definidos.":"You can leave business hours pending if they are not set yet.","Fecha de apertura":"Opening date","AAAA-MM-DD":"YYYY-MM-DD","Los horarios especiales de feriados se configuran después. Tu horario real debe coincidir con lo que ofreces.":"Holiday hours can be set later. Your posted hours must match your real business hours.","Cuéntales qué ofreces":"Tell customers what you offer","Descripción comercial":"Business description","Qué hace tu negocio, productos o servicios principales y qué lo distingue":"Describe your business, products, services and what makes it different.","Servicios":"Services","Ej. pedidos personalizados, entregas, catering":"E.g. custom orders, delivery, catering","Productos destacados":"Featured products","Ej. chocoflan, pastel de cumpleaños, cupcakes":"E.g. flan cake, birthday cake, cupcakes","La descripción no debe incluir enlaces, promociones ni afirmaciones falsas.":"Do not add links, promotions or misleading claims in the description.","Fotos del negocio":"Business photos","Todas son opcionales, pero ayudan a presentar tu negocio. Fotos reales: JPG o PNG, 10 KB a 5 MB cada una.":"Photos are optional but helpful. Use genuine JPG or PNG images, 10 KB to 5 MB each.","Foto de portada":"Cover photo","Productos, local o trabajos (hasta 8)":"Products, premises or work (up to 8)","Se guardarán de forma privada en VMV al enviar la solicitud. Google solo mostrará fotos después de verificar tu perfil.":"Photos are stored privately in VMV when you submit. Google only displays them after the listing is verified.","fotos seleccionadas":"photos selected","Mon":"Mon","Lun":"Mon","Mar":"Tue","Mié":"Wed","Jue":"Thu","Vie":"Fri","Sáb":"Sat","Dom":"Sun","Apertura":"Opening","Cierre":"Closing","Elegir imágenes (opcional)":"Choose images (optional)"};


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
 const {language}=useInterfaceLanguage();const en=language==="en";
 const tx=(text:string)=>en?enLabels[text]||text:text;
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
    <label className={styles.field}><span>Nombre del negocio <em>{tx("Necesario")}</em></span><input value={business} disabled readOnly/></label>
    <label className={styles.field}><span>Categoría principal en Google <em>{tx("Necesario")}</em></span>
     <input value={data.googleCategory} maxLength={100} onChange={e=>patch("googleCategory",e.target.value)} placeholder={tx("Ej. Panadería, Pastelería, Restaurante")}/></label>
    {data.action!=="create"?<label className={styles.field}><span>Enlace de tu perfil actual <em>{tx("Opcional")}</em></span><input type="url" inputMode="url" maxLength={500} value={data.existingProfileUrl||""} placeholder="https://maps.google.com/..." onChange={e=>patch("existingProfileUrl",e.target.value)}/></label>:null}
    {field("otherCategories","Otras categorías","Separadas por comas")}
    <p className={styles.hint}>{tx("La categoría debe existir en Google. Nuestro equipo comprobará que coincida antes de gestionarla.")}</p>
   </div>:null}
   {step===1?<div className={styles.group}>
    <h3>{tx("¿Dónde atiendes?")}</h3>
    <div className={styles.choices}>{([["storefront","En un local"],["service_area","Voy al cliente / entregas"],["hybrid","Ambos"]] as const).map(([id,label])=>
     <button type="button" key={id} aria-pressed={data.kind===id} onClick={()=>patch("kind",id)}>{label}</button>)}</div>
    {data.kind!=="service_area"?<>
      {field("street","Calle y número","Dirección comercial",false)}
      {field("unit","Local / suite","Local 2")}
      <div className={styles.two}>{field("city","Ciudad","Columbus",false)}{field("region","Estado","Georgia",false)}</div>
      <div className={styles.two}>{field("postal","Código postal","31901",false)}{field("country","País","US",false)}</div>
      <p className={styles.hint}>{tx("Solo ingresa una dirección donde realmente atiendes clientes. Google puede mostrarla públicamente.")}</p>
     </>:<p className={styles.hint}>{tx("La dirección residencial no se publicará ni te la pediremos para esta solicitud. Google puede solicitarla privadamente durante su verificación.")}</p>}
    {data.kind!=="storefront"?<label className={styles.field}><span>Áreas donde atiendes <em>{tx("Necesario")}</em></span>
      <textarea rows={3} value={data.serviceAreas} onChange={e=>patch("serviceAreas",e.target.value)} maxLength={400} placeholder={tx("Ciudades o códigos postales separados por comas")}/></label>:null}
   </div>:null}
   {step===2?<div className={styles.group}>
    <h3>{tx("¿Cómo pueden contactarte?")}</h3>
    {field("phone","Teléfono comercial","Ej. +1 706 555 1234")}
    {field("secondaryPhone","Teléfono adicional","Opcional")}
    <label className={styles.field}><span>Sitio web <em>{tx("Opcional")}</em></span><input value={website} disabled readOnly placeholder={tx("Sin página web")}/></label>
    {field("bookingUrl","Enlace para reservar o pedir","https://...")}
    <p className={styles.hint}>{tx("Nunca necesitamos tu contraseña de Google. La conexión y verificación se hacen con tu autorización.")}</p>
   </div>:null}
   {step===3?<div className={styles.group}>
    <h3>{tx("Horarios habituales")}</h3>
    <label className={styles.toggle}><input type="checkbox" checked={data.hoursEnabled} onChange={e=>patch("hoursEnabled",e.target.checked)}/><span>{tx("Quiero indicar mis horarios")}</span></label>
    {data.hoursEnabled?<div className={styles.hours}>{data.hours.map((h,i)=><div key={tx(days[i])} className={styles.day}>
     <strong>{days[i]}</strong><label><input type="checkbox" checked={!h.closed} onChange={e=>patch("hours",data.hours.map((x,j)=>j===i?{...x,closed:!e.target.checked}:x))}/> Abierto</label>
     {!h.closed?<><input aria-label={tx("Apertura")+" "+tx(days[i])} type="time" value={h.start} onChange={e=>patch("hours",data.hours.map((x,j)=>j===i?{...x,start:e.target.value}:x))}/><input aria-label={tx("Cierre")+" "+tx(days[i])} type="time" value={h.end} onChange={e=>patch("hours",data.hours.map((x,j)=>j===i?{...x,end:e.target.value}:x))}/></>:null}
    </div>)}</div>:<p className={styles.hint}>{tx("Puedes dejar los horarios pendientes si todavía no los tienes definidos.")}</p>}
    {field("openingDate","Fecha de apertura","AAAA-MM-DD")}
    <p className={styles.hint}>{tx("Los horarios especiales de feriados se configuran después. Tu horario real debe coincidir con lo que ofreces.")}</p>
   </div>:null}
   {step===4?<div className={styles.group}>
    <h3>{tx("Cuéntales qué ofreces")}</h3>
    <label className={styles.field}><span>Descripción comercial <em>{tx("Recomendada")}</em></span><textarea rows={5} value={data.description} onChange={e=>patch("description",e.target.value)} maxLength={750} placeholder={tx("Qué hace tu negocio, productos o servicios principales y qué lo distingue")}/><small>{data.description.length}/750</small></label>
    <label className={styles.field}><span>Servicios <em>{tx("Opcional")}</em></span><textarea rows={3} value={data.services} onChange={e=>patch("services",e.target.value)} maxLength={900} placeholder={tx("Ej. pedidos personalizados, entregas, catering")}/></label>
    <label className={styles.field}><span>Productos destacados <em>{tx("Opcional")}</em></span><textarea rows={3} value={data.products} onChange={e=>patch("products",e.target.value)} maxLength={900} placeholder={tx("Ej. chocoflan, pastel de cumpleaños, cupcakes")}/></label>
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
