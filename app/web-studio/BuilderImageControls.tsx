"use client";
import {useState} from "react";
import {ColorField,RangeField} from "./BuilderContextFields";
import {normalizeImageSettings} from "@/lib/web-builder-images";

export default function BuilderImageControls({value,onChange,radius=16}:{
 value:Record<string,unknown>;onChange:(patch:Record<string,unknown>)=>void;radius?:number
}){
 const [mobile,setMobile]=useState(false);
 const p=normalizeImageSettings(value,radius);
 const key=(name:string)=>name+(mobile?"Mobile":"");
 return <div className="vmv-image-controls">
  <div className="vmv-context-switch" role="group" aria-label="Dispositivo de la imagen">
   <button type="button" aria-pressed={!mobile} onClick={()=>setMobile(false)}>Escritorio</button>
   <button type="button" aria-pressed={mobile} onClick={()=>setMobile(true)}>Móvil</button>
  </div>
  <RangeField label="Tamaño" min={25} max={100} value={p[key("imageWidth")]} onChange={v=>onChange({[key("imageWidth")]:v})}/>
  <div className="vmv-context-switch" role="group" aria-label="Alinear imagen">
   {([['left','Izquierda'],['center','Centro'],['right','Derecha']] as const).map(([align,label])=>
    <button key={align} type="button" aria-pressed={p[key("imageAlign")]===align}
     onClick={()=>onChange({[key("imageAlign")]:align,[key("imageMoveX")]:0})}>{label}</button>)}
  </div>
  <RangeField label="Esquinas redondas" min={0} max={80} unit="px" value={p.imageRadius} onChange={v=>onChange({imageRadius:v})}/>
  <RangeField label="Transparencia" min={0} max={100} value={p.imageOpacity} onChange={v=>onChange({imageOpacity:v})}/>
  <RangeField label="Grosor del borde" min={0} max={12} unit="px" value={p.imageBorder} onChange={v=>onChange({imageBorder:v})}/>
  <ColorField label="Color del borde" value={p.borderColor} onChange={v=>onChange({borderColor:v})}/>
  <button className="vmv-image-reset" type="button" onClick={()=>onChange({[key("imageMoveX")]:0,[key("imageMoveY")]:0,[key("imageAlign")]:"left"})}>Restablecer posición {mobile?"móvil":""}</button>
 </div>;
}
export const imageSettingsField={type:"custom" as const,
 render:({value,onChange}:{value?:unknown;onChange:(value:Record<string,unknown>)=>void})=>{
  const settings=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
  return <BuilderImageControls value={settings} onChange={patch=>onChange({...settings,...patch})}/>;
 }
};
