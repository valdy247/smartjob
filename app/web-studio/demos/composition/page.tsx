import type {Metadata} from "next";
import {Render} from "@puckeditor/core";
import {builderConfig,normalizeBuilderDocument} from "@/lib/web-builder-puck";
import "../../../web-builder-public.css";

export const metadata:Metadata={
 title:"DEMO · Composición flexible · VMV Web Studio",
 description:"Prueba visual de contenedores y columnas anidadas con controles de escritorio y móvil.",
 robots:{index:false,follow:false}
};
const example=normalizeBuilderDocument({
 root:{props:{palette:"terracotta",font:"editorial",style:"warm",width:"wide"}},
 content:[
  {type:"SectionLayout",props:{
   id:"example-main",width:"wide",surface:"soft",paddingDesktop:"airy",paddingMobile:"compact",
   gapDesktop:"normal",gapMobile:"compact",alignDesktop:"left",alignMobile:"left",visibility:"all",
   content:[
    {type:"ColumnsLayout",props:{
     id:"example-split",columns:"2",proportion:"left-wide",mobileOrder:"reverse",mobileColumns:"stack",
     gapDesktop:"airy",gapMobile:"normal",alignDesktop:"center",visibility:"all",
     left:[
      {type:"ComposeHeading",props:{id:"example-title",title:"Tu marca, con espacio para expresarse.",
       level:"h2",sizeDesktop:"huge",sizeMobile:"medium",alignDesktop:"left",alignMobile:"center"}},
      {type:"ComposeText",props:{id:"example-intro",text:"Combina textos, fotos y botones sin depender de una plantilla rígida. Todo el contenido de esta demostración es ilustrativo.",
       size:"large",alignDesktop:"left",alignMobile:"center"}},
      {type:"ComposeButton",props:{id:"example-cta",label:"Explorar el editor",url:"/web-studio",
       style:"solid",alignDesktop:"left",alignMobile:"center"}}
     ],
     right:[
      {type:"ComposeImage",props:{id:"example-photo",image:"",alt:"Ejemplo de fotografía pendiente",
       ratio:"portrait",position:"center",radius:"round"}}
     ],
     third:[]
    }}
   ]
  }},
  {type:"SectionLayout",props:{
   id:"example-second",surface:"transparent",width:"normal",paddingDesktop:"normal",paddingMobile:"normal",
   gapDesktop:"airy",gapMobile:"normal",visibility:"all",
   content:[
    {type:"ComposeHeading",props:{id:"example-secondary-title",title:"Diseña cada espacio a tu manera.",level:"h2",
     sizeDesktop:"large",sizeMobile:"medium",alignDesktop:"center",alignMobile:"center"}},
    {type:"ColumnsLayout",props:{id:"example-three",columns:"3",proportion:"equal",mobileColumns:"stack",
     mobileOrder:"normal",gapDesktop:"normal",gapMobile:"compact",alignDesktop:"start",visibility:"all",
     left:[{type:"ComposeText",props:{id:"example-left",text:"01 · Contenido que se puede mover entre columnas.",size:"medium"}}],
     right:[{type:"ComposeText",props:{id:"example-center",text:"02 · Tipografía que cambia entre móvil y escritorio.",size:"medium"}}],
     third:[{type:"ComposeText",props:{id:"example-right",text:"03 · Secciones que conservan sus elementos al guardar.",size:"medium"}}]
    }}
   ]
  }}
 ]
});
// Fail the static build if our own document normalizer ever discards nested Puck slots.
const top=example.content[0];
const nested=(top?.props?.content as Array<{type:string;props:{left?:unknown[];right?:unknown[]}}> | undefined)||[];
if(nested[0]?.type!=="ColumnsLayout"||!Array.isArray(nested[0].props.left)||nested[0].props.left.length!==3||
 !Array.isArray(nested[0].props.right)||nested[0].props.right.length!==1){
 throw new Error("Composition slots must survive normalization for publishing");
}
export default function CompositionDemo(){
 return <div>
  <header style={{padding:"13px 5%",background:"#292235",color:"#fff",fontFamily:"system-ui",
   display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap",fontSize:12}}>
   <strong>DEMO VMV · Composición flexible</strong>
   <a href="/web-studio" style={{color:"#e4c6ff"}}>Abrir editor</a>
  </header>
  <Render config={builderConfig} data={example}/>
  <footer style={{fontFamily:"system-ui",fontSize:11,padding:24,textAlign:"center",color:"#7c718b"}}>
   DEMOSTRACIÓN DE DISEÑO · No representa un negocio real.
  </footer>
 </div>;
}
