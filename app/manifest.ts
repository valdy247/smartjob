import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name:"VMV Call — Traducción de llamadas",short_name:"VMV Call",description:"Traducción y asistencia profesional en tiempo real",
    start_url:"/",display:"standalone",background_color:"#09141a",theme_color:"#09141a",
    icons:[{src:"/icon.svg",sizes:"any",type:"image/svg+xml"}] };
}
