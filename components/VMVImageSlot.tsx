"use client";
import type {CSSProperties} from "react";

/**
 * Single image registry. Replace src:null with the committed WebP path when ready.
 * The home layout remains stable without an asset or after a failed image load.
 */
export const VMV_IMAGE_SLOTS={
 "imagen-1":{label:"Imagen 1",description:"Llamada traducida",src:null as string|null,alt:"Teléfono en una llamada con traducción español e inglés"},
 "imagen-2":{label:"Imagen 2",description:"Traductor IA",src:null as string|null,alt:"Burbujas de conversación con iconos de traducción"}
} as const;
export type VMVImageKey=keyof typeof VMV_IMAGE_SLOTS;

export function VMVImageSlot({slot,className=""}:{slot:VMVImageKey;className?:string}){
 const item=VMV_IMAGE_SLOTS[slot];
 return <div className={"vmv-artwork "+className}>
  {item.src?<img src={item.src} alt={item.alt} loading="lazy" decoding="async" onError={event=>{event.currentTarget.style.display="none";event.currentTarget.nextElementSibling?.classList.remove("vmv-artwork-hidden");}}/>:null}
  <div className={"vmv-artwork-placeholder "+(item.src?"vmv-artwork-hidden":"")} aria-label={item.description}>
   <span className="vmv-artwork-number">{item.label}</span>
   <small>{item.description}</small>
  </div>
 </div>;
}
