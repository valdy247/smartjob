"use client";
import type {ChangeEvent} from "react";
import styles from "./GoogleProfileWizard.module.css";

export type GoogleKind="storefront"|"service_area"|"hybrid";
export type GoogleHour={closed:boolean;start:string;end:string};
export type GoogleData={
 action:"create"|"claim"|"improve";kind:GoogleKind;googleCategory:string;otherCategories:string;
 street:string;unit:string;city:string;region:string;postal:string;country:string;serviceAreas:string;
 phone:string;secondaryPhone:string;description:string;services:string;products:string;
 bookingUrl:string;openingDate:string;hoursEnabled:boolean;hours:GoogleHour[];
};
export type GoogleMedia={logo:File|null;cover:File|null;photos:File[]};
export const emptyGoogle:GoogleData={
 action:"create",kind:"storefront",googleCategory:"",otherCategories:"",street:"",unit:"",city:"",region:"",postal:"",country:"US",serviceAreas:"",
 phone:"",secondaryPhone:"",description:"",services:"",products:"",bookingUrl:"",openingDate:"",hoursEnabled:false,
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
export function validateGoogleLinks(v:GoogleData){return isHttps(v.bookingUrl)?"":"El enlace de reservas debe empezar con https://";}
function FilePicker({label,value,onChange,multiple=false}:{label:string;value:File[];onChange:(files:File[])=>void;multiple?:boolean}){
 const onPick=(e:ChangeEvent<HTMLInputElement>)=>{const files=Array.from(e.target.files||[]);onChange(files);e.target.value="";};
 return <label className={styles.upload}><span><strong>{label}</strong><small>{value.length?value.map(f=>f.name).join(", "):"Elegir imágenes (opcional)"}</small></span><input aria-label={label} type="file" accept="image/jpeg,image/png" multiple={multiple} onChange={onPick}/></label>;
}
export default function GoogleProfileWizard({step,data,onData,media,onMedia,business,website}:{step:number;data:GoogleData;onData:(v:GoogleData)=>void;media:GoogleMedia;onMedia:(v:GoogleMedia)=>void;business:string;website:string}){
 const patch=<K extends keyof GoogleData>(key:K,value:GoogleData[K])=>onData({...data,[key]:value});
 const field=(key:keyof GoogleData,label:string,placeholder:string,optional=true)=>(
  <label className={styles.field}><span>{label} <em>{optional?"Opcional":"Necesario"}</em></span>
  <input value={String(data[key])} maxLength={250} placeholder={placeholder} onChange={e=>onData({...data,[key]:e.target.value})}/></label>
 );
 return <div className={styles.root}>
   <div className={styles.progress}><span>Google Business Profile</span><strong>{step+1} / {googleStepNames.length} · {googleStepNames[step]}</strong></div>
   {step===0?<div className={styles.group}>
    <h3>¿Qué necesitas hacer?</h3>
    <div className={styles.choices}>{([["create","Crear un perfil"],["claim","Reclamar uno existente"],["improve","Mejorar el actual"]] as const).map(([id,label])=>
     <button type="button" aria-pressed={data.action===id} key={id} onClick={()=>patch("action",id)}>{label}</button>)}</div>
    <label className={styles.field}><span>Nombre del negocio <em>Necesario</em></span><input value={business} disabled readOnly/></label>
    <label className={styles.field}><span>Categoría principal en Google <em>Necesario</em></span>
     <input value={data.googleCategory} maxLength={100} onChange={e=>patch("googleCategory",e.target.value)} placeholder="Ej. Panadería, Pastelería, Restaurante"/></label>
    {field("otherCategories","Otras categorías","Separadas por comas")}
    <p className={styles.hint}>La categoría debe existir en Google. Nuestro equipo comprobará que coincida antes de gestionarla.</p>
   </div>:null}
   {step===1?<div className={styles.group}>
    <h3>¿Dónde atiendes?</h3>
    <div className={styles.choices}>{([["storefront","En un local"],["service_area","Voy al cliente / entregas"],["hybrid","Ambos"]] as const).map(([id,label])=>
     <button type="button" key={id} aria-pressed={data.kind===id} onClick={()=>patch("kind",id)}>{label}</button>)}</div>
    {data.kind!=="service_area"?<>
      {field("street","Calle y número","Dirección comercial",false)}
      {field("unit","Local / suite","Local 2")}
      <div className={styles.two}>{field("city","Ciudad","Columbus",false)}{field("region","Estado","Georgia",false)}</div>
      <div className={styles.two}>{field("postal","Código postal","31901",false)}{field("country","País","US",false)}</div>
      <p className={styles.hint}>Solo ingresa una dirección donde realmente atiendes clientes. Google puede mostrarla públicamente.</p>
     </>:<p className={styles.hint}>La dirección residencial no se publicará ni te la pediremos para esta solicitud. Google puede solicitarla privadamente durante su verificación.</p>}
    {data.kind!=="storefront"?<label className={styles.field}><span>Áreas donde atiendes <em>Necesario</em></span>
      <textarea rows={3} value={data.serviceAreas} onChange={e=>patch("serviceAreas",e.target.value)} maxLength={400} placeholder="Ciudades o códigos postales separados por comas"/></label>:null}
   </div>:null}
   {step===2?<div className={styles.group}>
    <h3>¿Cómo pueden contactarte?</h3>
    {field("phone","Teléfono comercial","Ej. +1 706 555 1234")}
    {field("secondaryPhone","Teléfono adicional","Opcional")}
    <label className={styles.field}><span>Sitio web <em>Opcional</em></span><input value={website} disabled readOnly placeholder="Sin página web"/></label>
    {field("bookingUrl","Enlace para reservar o pedir","https://...")}
    <p className={styles.hint}>Nunca necesitamos tu contraseña de Google. La conexión y verificación se hacen con tu autorización.</p>
   </div>:null}
   {step===3?<div className={styles.group}>
    <h3>Horarios habituales</h3>
    <label className={styles.toggle}><input type="checkbox" checked={data.hoursEnabled} onChange={e=>patch("hoursEnabled",e.target.checked)}/><span>Quiero indicar mis horarios</span></label>
    {data.hoursEnabled?<div className={styles.hours}>{data.hours.map((h,i)=><div key={days[i]} className={styles.day}>
     <strong>{days[i]}</strong><label><input type="checkbox" checked={!h.closed} onChange={e=>patch("hours",data.hours.map((x,j)=>j===i?{...x,closed:!e.target.checked}:x))}/> Abierto</label>
     {!h.closed?<><input aria-label={"Apertura "+days[i]} type="time" value={h.start} onChange={e=>patch("hours",data.hours.map((x,j)=>j===i?{...x,start:e.target.value}:x))}/><input aria-label={"Cierre "+days[i]} type="time" value={h.end} onChange={e=>patch("hours",data.hours.map((x,j)=>j===i?{...x,end:e.target.value}:x))}/></>:null}
    </div>)}</div>:<p className={styles.hint}>Puedes dejar los horarios pendientes si todavía no los tienes definidos.</p>}
    {field("openingDate","Fecha de apertura","AAAA-MM-DD")}
    <p className={styles.hint}>Los horarios especiales de feriados se configuran después. Tu horario real debe coincidir con lo que ofreces.</p>
   </div>:null}
   {step===4?<div className={styles.group}>
    <h3>Cuéntales qué ofreces</h3>
    <label className={styles.field}><span>Descripción comercial <em>Recomendada</em></span><textarea rows={5} value={data.description} onChange={e=>patch("description",e.target.value)} maxLength={750} placeholder="Qué hace tu negocio, productos o servicios principales y qué lo distingue"/><small>{data.description.length}/750</small></label>
    <label className={styles.field}><span>Servicios <em>Opcional</em></span><textarea rows={3} value={data.services} onChange={e=>patch("services",e.target.value)} maxLength={900} placeholder="Ej. pedidos personalizados, entregas, catering"/></label>
    <label className={styles.field}><span>Productos destacados <em>Opcional</em></span><textarea rows={3} value={data.products} onChange={e=>patch("products",e.target.value)} maxLength={900} placeholder="Ej. chocoflan, pastel de cumpleaños, cupcakes"/></label>
    <p className={styles.hint}>La descripción no debe incluir enlaces, promociones ni afirmaciones falsas.</p>
   </div>:null}
   {step===5?<div className={styles.group}>
    <h3>Fotos del negocio</h3>
    <p className={styles.hint}>Todas son opcionales, pero ayudan a presentar tu negocio. Fotos reales: JPG o PNG, 10 KB a 5 MB cada una.</p>
    <FilePicker label="Logo" value={media.logo?[media.logo]:[]} onChange={files=>onMedia({...media,logo:files[0]||null})}/>
    <FilePicker label="Foto de portada" value={media.cover?[media.cover]:[]} onChange={files=>onMedia({...media,cover:files[0]||null})}/>
    <FilePicker label="Productos, local o trabajos (hasta 8)" value={media.photos} multiple onChange={files=>onMedia({...media,photos:files.slice(0,8)})}/>
    <p className={styles.hint}>Se guardarán de forma privada en VMV al enviar la solicitud. Google solo mostrará fotos después de verificar tu perfil.</p>
    <p className={styles.count}>{[media.logo,media.cover,...media.photos].filter(Boolean).length} fotos seleccionadas</p>
   </div>:null}
 </div>;
}
