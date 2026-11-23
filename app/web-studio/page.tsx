"use client";
import {useEffect,useState} from "react";
import dynamic from "next/dynamic";
import "@puckeditor/core/puck.css";
import "../web-builder-public.css";

const Workspace=dynamic(()=>import("./WebBuilderWorkspace"),{ssr:false,loading:()=>(
 <div style={{padding:36,fontFamily:"system-ui",color:"#7555a8"}}>Abriendo Editor 2.0…</div>
)});
const AiStandalone=dynamic(()=>import("./WebAiStandalone"),{ssr:false,loading:()=>(
 <div style={{padding:36,fontFamily:"system-ui",color:"#7555a8"}}>Abriendo creador con IA…</div>
)});
export default function WebStudioHome(){
 const [mode,setMode]=useState<"checking"|"ai"|"templates">("checking");
 useEffect(()=>{setMode(new URLSearchParams(window.location.search).get("mode")==="ai"?"ai":"templates");},[]);
 if(mode==="checking")return <div role="status" style={{padding:36,fontFamily:"system-ui",color:"#7555a8"}}>Abriendo Web Studio…</div>;
 return mode==="ai"?<AiStandalone/>:<Workspace/>;
}
