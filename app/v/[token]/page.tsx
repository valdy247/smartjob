import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {publicSharedVideo,validVideoShareToken} from "@/lib/vmv-studio-video-sharing";
import styles from "./page.module.css";

export const dynamic="force-dynamic";
export const revalidate=0;
export const metadata:Metadata={
 title:"Video compartido | VMV Business",
 description:"Mira o descarga este video de VMV Business sin necesidad de iniciar sesión.",
 robots:{index:false,follow:false,noarchive:true}
};
export default async function SharedVideoPage({params}:{params:Promise<{token:string}>}){
 const {token}=await params;
 if(!validVideoShareToken(token))notFound();
 const video=await publicSharedVideo(token).catch(()=>null);
 if(!video)notFound();
 const url="/api/video-studio/public/"+token+"/file";
 return <main className={styles.screen}>
  <section className={styles.content}>
   <div className={styles.brand}><span className={styles.brandMark}>VMV</span> Business <span className={styles.dot}>•</span> Video Studio</div>
   <div className={styles.playerSection}>
    <h1>{video.title}</h1>
    <p>Te han compartido este video. Puedes reproducirlo o guardarlo directamente, sin crear una cuenta.</p>
    <video className={styles.video} src={url} controls playsInline preload="metadata"
     aria-label={"Reproducir video: "+video.title}/>
    <a className={styles.download} href={url+"?download=1"}>
     <span aria-hidden="true">↓</span> Descargar video MP4
    </a>
    <p className={styles.note}>El enlace funciona mientras quien compartió el video mantenga habilitado el acceso.</p>
   </div>
   <footer>Creado con VMV Business</footer>
  </section>
 </main>;
}
