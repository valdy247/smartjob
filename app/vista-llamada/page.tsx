import Link from "next/link";
import styles from "./call-preview.module.css";
export const metadata={title:"Vista previa de llamada | VMV Call",description:"Concepto visual de la pantalla de llamada entrante de VMV Call."};
export default function IncomingPreview(){return <main className={styles.stage}>
 <div className={styles.phone}>
  <div className={styles.notch}/><div className={styles.status}><span>9:41</span><span>▰ ▰ ◕</span></div>
  <div className={styles.callcard}>
   <p className={styles.eyebrow}>VMV CALL · VISTA PREVIA</p>
   <div className={styles.symbol}>◉</div>
   <h1>Cliente</h1><p className={styles.languages}>Inglés ⇄ Español</p>
   <p className={styles.calling}>Llamada entrante</p>
   <div className={styles.controls}><div><span className={styles.reject}>✕</span><small>Rechazar</small></div><div><span className={styles.accept}>☎</span><small>Aceptar</small></div></div>
   <div className={styles.slide}><span>☎</span>Desliza para responder <b>›</b></div>
  </div>
 </div>
 <div className={styles.caption}><strong>Diseño de llamada entrante</strong><p>Vista visual: no inicia ni contesta llamadas. Con el iPhone bloqueado se utiliza la interfaz nativa de iOS mediante CallKit.</p><Link href="/">Volver a VMV Call ↗</Link></div>
 </main>;}
