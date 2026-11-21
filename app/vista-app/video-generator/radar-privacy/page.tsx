import Link from "next/link";
import {ArrowLeft,ShieldCheck,Trash2,Youtube} from "lucide-react";
export default function RadarPrivacy(){
 const card:React.CSSProperties={background:"#fff",border:"1px solid #e9e1f2",borderRadius:19,
  padding:"22px",lineHeight:1.75,color:"#5f536f",fontSize:14};
 return <main style={{minHeight:"100vh",background:"#faf7fe",color:"#322542",padding:"22px 15px 60px",fontFamily:"Inter,system-ui,sans-serif"}}>
  <div style={{maxWidth:740,margin:"0 auto",display:"grid",gap:16}}>
   <Link href="/vista-app/video-generator?setup=autopilot" style={{color:"#704aa3",display:"flex",alignItems:"center",gap:8,textDecoration:"none",fontWeight:800,fontSize:13}}>
    <ArrowLeft size={17}/> Volver al Piloto Automático</Link>
   <div style={{display:"flex",alignItems:"center",gap:12}}>
    <div style={{width:54,height:54,display:"grid",placeItems:"center",borderRadius:17,background:"#e9dff8",color:"#744bb2"}}><ShieldCheck size={28}/></div>
    <div><small style={{color:"#8c6bac",fontWeight:900}}>VMV BUSINESS · RADAR VIRAL IA</small>
     <h1 style={{fontSize:29,letterSpacing:"-.05em",margin:"5px 0"}}>Privacidad y uso de datos</h1></div>
   </div>
   <section style={card}>
    <h2 style={{color:"#3e2c51",fontSize:18,marginTop:0}}>Qué hacemos</h2>
    Buscamos videos públicos mediante <strong>YouTube Data API</strong> cuando tú pulsas Buscar.
    Guardamos temporalmente tu consulta, fecha, títulos, canales, enlaces, miniaturas y estadísticas públicas
    devueltas por YouTube. Tu cuenta de VMV determina qué investigaciones puedes consultar.
    No accedemos a cuentas privadas de YouTube.
   </section>
   <section style={card}>
    <h2 style={{color:"#3e2c51",fontSize:18,marginTop:0}}>Ideas con IA</h2>
    Solo cuando pulsas «Crear 3 ideas con IA», se envía una selección de esos metadatos al proveedor de IA
    configurado para VMV Business. La IA propone contenido original; <strong>no ve el video completo,
    no conoce su retención y no certifica su viralidad</strong>.
    No descargamos videos ajenos ni publicamos en tu nombre con esta función.
   </section>
   <section style={card}>
    <h2 style={{color:"#3e2c51",fontSize:18,marginTop:0}}>Conservación y control</h2>
    Las investigaciones se eliminan automáticamente antes de cumplir 30 días.
    Puedes borrar todas tus investigaciones cuando quieras desde «Borrar mis investigaciones».
    Esta acción también desvincula las ideas guardadas desde ese Radar en tu plan; no borra videos de YouTube.
    Tu plan general puede continuar guardado en VMV.
   </section>
   <section style={card}>
    <h2 style={{color:"#3e2c51",fontSize:18,marginTop:0}}>Servicios externos</h2>
    YouTube es la fuente de sus propios resultados y puede tener sus propios términos y políticas.
    Para utilizar el Radar debes aceptar este aviso y consultar:
    <div style={{display:"flex",gap:15,flexWrap:"wrap",marginTop:14}}>
     <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" style={{color:"#764ba8",fontWeight:850}}>Términos de YouTube</a>
     <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{color:"#764ba8",fontWeight:850}}>Privacidad de Google</a>
    </div>
   </section>
   <p style={{fontSize:11,color:"#9786a3",textAlign:"center",lineHeight:1.7}}>
    Piloto privado de VMV Business. Última actualización: 20 de noviembre de 2026.
    La conexión de YouTube requiere una credencial oficial configurada por el administrador.
   </p>
  </div>
 </main>;
}
