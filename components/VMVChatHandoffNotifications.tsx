"use client";
import {useEffect,useRef,useState} from "react";
import {BellRing,Headphones,X} from "lucide-react";
import {getSupabase} from "@/lib/supabase";

type Notice={id:string;session_id:string;created_at:string;source:string};
type Waiting={agent_id:string;site_slug:string;business_id?:string};
export default function VMVChatHandoffNotifications(){
 const [notice,setNotice]=useState<(Notice&{url:string})|null>(null);
 const known=useRef(new Set<string>());
 useEffect(()=>{
  if(!window.location.pathname.startsWith("/vista-app"))return;
  const db=getSupabase();if(!db)return;
  let cancelled=false;
  let currentOwner="";
  let channel:ReturnType<typeof db.channel>|null=null;
  const query=async()=>{
   const {data:{user}}=await db.auth.getUser();
   if(!user||user.is_anonymous){setNotice(null);return;}
   if(currentOwner!==user.id){currentOwner=user.id;known.current.clear();}
   const {data}=await db.from("vmv_web_chat_alerts")
    .select("id,session_id,created_at,source")
    .eq("owner_id",user.id).is("read_at",null)
    .order("created_at",{ascending:false}).limit(5);
   if(cancelled||!data?.length){if(!cancelled)setNotice(null);return;}
   const newest=data[0] as Notice;
   const {data:session}=await db.from("vmv_web_public_chat_sessions")
    .select("agent_id,site_slug").eq("owner_id",user.id)
    .eq("id",newest.session_id).maybeSingle();
   if(!session||cancelled)return;
   const url="/vista-app/ai-agents?chatWeb=conversations&agent="+encodeURIComponent(session.agent_id)+
    "&session="+encodeURIComponent(newest.session_id);
   if(!known.current.has(newest.id)){
    const isInitial=known.current.size===0;
    known.current.add(newest.id);
    if(!isInitial&&typeof Notification!=="undefined"&&Notification.permission==="granted"){
     const browserNotice=new Notification("Cliente esperando atención",{
      body:"Abre Chat web para responder al visitante.",tag:"vmv-chat-"+newest.id
     });
     browserNotice.onclick=()=>{window.focus();window.location.assign(url);};
    }
   }
   setNotice({...newest,url});
  };
  void query();
  const every=window.setInterval(()=>void query(),8000);
  const {data:auth}=db.auth.onAuthStateChange(()=>void query());
  return()=>{cancelled=true;window.clearInterval(every);auth.subscription.unsubscribe();
   if(channel)void db.removeChannel(channel);};
 },[]);
 if(!notice)return null;
 return <aside role="status" style={{position:"fixed",bottom:"calc(20px + env(safe-area-inset-bottom))",
  right:16,zIndex:1800,background:"#ffffff",color:"#3b2a4c",
  border:"1px solid #e4d6ee",borderRadius:18,
  boxShadow:"0 14px 40px #2f194432",maxWidth:320,width:"calc(100vw - 32px)",padding:15,
  fontFamily:"Inter,system-ui,sans-serif",display:"grid",gap:11}}>
  <div style={{display:"flex",alignItems:"center",gap:8}}>
   <BellRing size={20} color="#8152b5"/><strong style={{flex:1,fontSize:13}}>Cliente esperando</strong>
   <button type="button" aria-label="Cerrar aviso" onClick={()=>setNotice(null)}
    style={{border:0,background:"transparent",color:"#8b7b99",cursor:"pointer"}}><X size={16}/></button>
  </div>
  <a href={notice.url} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,
   borderRadius:12,padding:"12px 15px",background:"#8054b3",color:"white",
   textDecoration:"none",fontSize:12,fontWeight:850}}>
   <Headphones size={17}/> Atender ahora
  </a>
 </aside>;
}
