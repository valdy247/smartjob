import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name:"Smart Job — asistente profesional",short_name:"Smart Job",description:"Traducción y asistencia profesional en tiempo real",
    start_url:"/",display:"standalone",background_color:"#090b10",theme_color:"#090b10",
    icons:[{src:"/icon.svg",sizes:"any",type:"image/svg+xml"}] };
}
