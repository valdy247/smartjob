"use client";
import dynamic from "next/dynamic";
import "@puckeditor/core/puck.css";
import "../web-builder-public.css";

const Workspace=dynamic(()=>import("./WebBuilderWorkspace"),{ssr:false,loading:()=>(
 <div style={{padding:36,fontFamily:"system-ui",color:"#7555a8"}}>Abriendo Web Studio…</div>
)});
export default function WebStudioHome(){return <Workspace/>;}
