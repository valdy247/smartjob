import type {CSSProperties} from "react";

export function RangeField({value,onChange,label,min=0,max=100,step=1,unit="%",disabled=false}:{
 value?:unknown;onChange:(v:number)=>void;label:string;min?:number;max?:number;step?:number;unit?:string;disabled?:boolean
}){
 const safe=typeof value==="number"&&Number.isFinite(value)?Math.min(max,Math.max(min,value)):min;
 return <label className="vmv-inspector-range">
  <span>{label}<strong>{safe}{unit}</strong></span>
  <input aria-label={label} type="range" min={min} max={max} step={step} value={safe}
   onChange={event=>onChange(Number(event.target.value))} disabled={disabled}/>
 </label>;
}
const colorSwatches=["#30243F","#FFFFFF","#8E5DE4","#168A6F","#BE6D42","#D6557B","#23476D","#101418"];
export function ColorField({value,onChange,label="Color",allowTransparent=false}:{
 value?:unknown;onChange:(v:string)=>void;label?:string;allowTransparent?:boolean
}){
 const valid=typeof value==="string"&&/^#[a-f\d]{6}$/i.test(value);
 const color=valid?String(value):"#30243F";
 return <div className="vmv-inspector-color">
  <label>{label}
   <input type="color" aria-label={label+" personalizado"} value={color} onChange={e=>onChange(e.target.value)}/>
  </label>
  <div className="vmv-inspector-swatches">
   {colorSwatches.map(swatch=><button key={swatch} type="button" aria-label={label+": "+swatch}
    aria-pressed={color.toLowerCase()===swatch.toLowerCase()} title={swatch}
    onClick={()=>onChange(swatch)} style={{backgroundColor:swatch} as CSSProperties}/>)}
   {allowTransparent?<button className="vmv-inspector-auto-color" type="button"
    onClick={()=>onChange("")}>Automático</button>:null}
  </div>
 </div>;
}
const typefaceOptions=[
 {id:"site",name:"Fuente de la web",style:{fontFamily:"inherit"}},
 {id:"modern",name:"Moderna",style:{fontFamily:"Arial, sans-serif"}},
 {id:"editorial",name:"Editorial",style:{fontFamily:"Georgia, serif"}},
 {id:"rounded",name:"Redondeada",style:{fontFamily:"Trebuchet MS, sans-serif"}},
 {id:"geometric",name:"Geométrica",style:{fontFamily:"Avenir Next, Arial, sans-serif"}},
 {id:"mono",name:"Monoespaciada",style:{fontFamily:"ui-monospace, monospace"}}
] as const;
export function FontField({value,onChange}:{value?:unknown;onChange:(v:string)=>void}){
 return <div className="vmv-inspector-fonts" role="group" aria-label="Fuentes del texto">
  {typefaceOptions.map(item=><button type="button" key={item.id} aria-pressed={value===item.id}
   onClick={()=>onChange(item.id)} style={item.style}>{item.name}</button>)}
 </div>;
}
export const NUMBER_CONTROL={
 imageWidth:{label:"Tamaño",min:25,max:100,unit:"%"},
 imageRadius:{label:"Esquinas redondas",min:0,max:80,unit:"px"},
 imageOpacity:{label:"Transparencia",min:0,max:100,unit:"%"},
 imageBorder:{label:"Grosor del borde",min:0,max:12,unit:"px"},
 imageMoveX:{label:"Mover horizontalmente",min:-150,max:150,unit:"px"},
 imageMoveY:{label:"Mover verticalmente",min:-150,max:150,unit:"px"},
 fontSize:{label:"Tamaño de texto",min:12,max:110,unit:"px"},
 textMoveX:{label:"Mover horizontalmente",min:-150,max:150,unit:"px"},
 textMoveY:{label:"Mover verticalmente",min:-150,max:150,unit:"px"},
 letterSpacing:{label:"Separación de letras",min:-3,max:12,unit:"px"}
} as const;
export function numericEditorField(key:keyof typeof NUMBER_CONTROL){
 const config=NUMBER_CONTROL[key];
 return {type:"custom" as const,
  render:({value,onChange}:{value?:unknown;onChange:(v:number)=>void})=>
   <RangeField value={typeof value==="number"?value:config.min} onChange={onChange}
    label={config.label} min={config.min} max={config.max} unit={config.unit}/>
 };
}
export function colorEditorField(label:string){
 return {type:"custom" as const,
  render:({value,onChange}:{value?:unknown;onChange:(v:string)=>void})=>
   <ColorField value={value} onChange={onChange} label={label} allowTransparent/>
 };
}
export const fontEditorField={type:"custom" as const,
 render:({value,onChange}:{value?:unknown;onChange:(v:string)=>void})=>
  <FontField value={value} onChange={onChange}/>
};
