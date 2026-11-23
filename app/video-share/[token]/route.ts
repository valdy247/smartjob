import {NextRequest,NextResponse} from "next/server";
import {videoDb} from "@/lib/vmv-video-generator";
import {readMotionShareToken} from "@/lib/vmv-motion-share";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const responseHeaders={
 "Cache-Control":"no-store",
 "Referrer-Policy":"no-referrer",
 "X-Robots-Tag":"noindex, nofollow, noarchive",
 "X-Content-Type-Options":"nosniff"
};
function page(title:string,content:string,status=200){
 const html='<!doctype html><html lang="es"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<meta name="robots" content="noindex,nofollow"><title>'+title+' · VMV Motion</title>'+
  '<style>*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;'+
  'font-family:system-ui,sans-serif;background:#f8f4fc;color:#352441;padding:20px}main{width:min(100%,480px);'+
  'padding:34px 27px;border:1px solid #e4d6f0;background:white;border-radius:22px;text-align:center;'+
  'box-shadow:0 18px 50px #2d1d3d17}.brand{color:#8e5bc2;font-weight:850;font-size:12px;letter-spacing:.12em}'+
  'h1{font-size:25px;margin:22px 0 14px}p{color:#756681;line-height:1.6;font-size:14px}a{display:block;'+
  'background:#9059c5;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;padding:15px;'+
  'margin:23px 0}.hint{font-size:12px}</style></head><body><main><span class="brand">VMV MOTION</span>'+
  '<h1>'+title+'</h1>'+content+'</main></body></html>';
 return new NextResponse(html,{status,headers:{"Content-Type":"text/html; charset=utf-8",...responseHeaders}});
}
export async function GET(req:NextRequest,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;
 const share=readMotionShareToken(token);
 if(!share)return page("Enlace no disponible",
  "<p>Este enlace no es válido o caducó. Solicita uno nuevo a quien compartió el video.</p>",410);
 if(req.nextUrl.searchParams.get("download")==="1"){
  try{
   const signed=await videoDb().storage.from("vmv-motion-renders")
    .createSignedUrl(share.path,120,{download:share.filename});
   if(signed.error||!signed.data?.signedUrl)
    return page("Video no disponible","<p>El archivo no se encuentra en el almacenamiento.</p>",404);
   return NextResponse.redirect(signed.data.signedUrl,{status:307,headers:responseHeaders});
  }catch{
   return page("Descarga no disponible","<p>Inténtalo de nuevo o solicita otro enlace.</p>",503);
  }
 }
 const link="/video-share/"+encodeURIComponent(token)+"?download=1";
 return page("Descarga tu video",
  "<p>Te compartieron un video original de VMV Motion. No necesitas iniciar sesión."+
  " El archivo se descarga sin recompresión adicional.</p>"+
  '<a href="'+link+'">Descargar video original</a>'+
  '<p class="hint">Disponible hasta el '+
  new Date(share.expiresAt).toLocaleDateString("es-ES",{day:"numeric",month:"long",year:"numeric"})+
  ". En iPhone puedes guardarlo en Archivos.</p>");
}