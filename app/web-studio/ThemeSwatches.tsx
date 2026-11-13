"use client";
const colors:{id:string;label:string;hex:string}[]=[
 {id:"violet",label:"Lavanda",hex:"#8e5de4"},{id:"mint",label:"Menta",hex:"#198d74"},
 {id:"amber",label:"Dorado",hex:"#a97b26"},{id:"ink",label:"Grafito",hex:"#30283a"},
 {id:"rose",label:"Rosa suave",hex:"#b64b70"},{id:"forest",label:"Bosque",hex:"#367457"},
 {id:"ocean",label:"Océano",hex:"#267a9c"},{id:"terracotta",label:"Terracota",hex:"#af6242"},
 {id:"charcoal",label:"Carbón",hex:"#24232b"}
];
export default function ThemeSwatches({value,onChange}:{value?:unknown;onChange:(v:string)=>void}){
 return <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:7,padding:"4px 0"}}>
  {colors.map(color=><button key={color.id} type="button" aria-label={"Paleta "+color.label}
   aria-pressed={value===color.id} onClick={()=>onChange(color.id)}
   title={color.label} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7,
    background:value===color.id?"#f2e9ff":"#fff",color:"#4b385f",
    border:value===color.id?"2px solid #8b57d4":"1px solid #dcd2e8",
    borderRadius:11,padding:9,fontSize:11,fontWeight:750,cursor:"pointer"}}>
   <span aria-hidden="true" style={{display:"block",width:29,height:29,background:color.hex,
    borderRadius:"50%",border:"2px solid white",boxShadow:"0 0 0 1px #38264a22"}}/>
   {color.label}
  </button>)}
 </div>;
}
export function AccentPicker({value,onChange}:{value?:unknown;onChange:(v:string)=>void}){
 const valid=typeof value==="string"&&/^#[0-9a-f]{6}$/i.test(value);
 return <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0"}}>
  <input type="color" aria-label="Color de marca personalizado" value={valid?String(value):"#8e5de4"}
   onChange={e=>onChange(e.target.value)} style={{height:45,width:65,border:"1px solid #e2d8ec",
    borderRadius:12,cursor:"pointer",padding:5}}/>
  <span style={{fontSize:12,color:"#685978"}}>{valid?String(value).toUpperCase():"Opcional"}</span>
  <button type="button" onClick={()=>onChange("")}
   style={{marginLeft:"auto",border:"1px solid #e4d8ee",borderRadius:8,
    padding:"8px 10px",background:"white",fontSize:11,color:"#70528d"}}>Usar paleta</button>
 </div>;
}
