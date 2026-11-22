"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Check,Download,Film,LoaderCircle,Maximize2,X} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {saveQuickVideo} from "@/lib/vmv-video-quick-library";
import css from "./VMVPilotRenderDock.module.css";

type PilotStyle="stickman"|"realistic"|"cinematic"|"animated"|"product";
export type PilotRenderRequest={pilotId:string;topic:string;audience:string;goal:string;
 style:PilotStyle;seconds:15|30|60;narration:boolean;subtitles:boolean;language:"es"|"en"};
type Scene={index:number;start:number;end:number;speech:string;imagePrompt:string;caption:string};
type JobState="idle"|"working"|"completed"|"failed";
const STYLE_BIBLE:Record<PilotStyle,string>={
 stickman:"STRICTLY 2D stickman explainer cartoon, consistent round white head, tiny black eyes, messy black tuft, BLUE shirt, thin black arms and legs, black bold contours, flat bright vector color palette. NEVER 3D, NEVER realistic people or photographic backgrounds. ",
 realistic:"STRICT photorealistic natural style, coherent realistic light, physical textures, no drawn or cartoon features. ",
 cinematic:"STRICT premium cinematic live-action composition, warm film grade, dramatic depth of field, no cartoons. ",
 animated:"STRICT flat 2D animated cartoon, bold colorful backgrounds, consistent line-weight and character design, never live-action. ",
 product:"STRICT clean luxury product-ad photography, neutral consistent studio background and commercial lighting, no cartoon style. "
};
function b64bytes(value:string):ArrayBuffer{
 const raw=atob(value),buffer=new ArrayBuffer(raw.length),out=new Uint8Array(buffer);
 for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
 return buffer;
}
function wrap(ctx:CanvasRenderingContext2D,text:string,maxWidth:number):string[]{
 const lines:string[]=[];let line="";
 for(const word of text.trim().split(/\s+/)){
  const next=(line+" "+word).trim();
  if(line&&ctx.measureText(next).width>maxWidth){lines.push(line);line=word;}
  else line=next;
 }
 if(line)lines.push(line);
 return lines.slice(0,4);
}
function captionsFor(text:string):string[]{
 const words=text.split(/\s+/).filter(Boolean),count=Math.max(1,Math.ceil(words.length/4));
 return Array.from({length:count},(_,n)=>words.slice(n*4,n*4+4).join(" "));
}
function mediaType(){
 for(const type of ["video/mp4;codecs=avc1.42E01E,mp4a.40.2","video/mp4",
  "video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"]){
  if(MediaRecorder.isTypeSupported(type))return type;
 }
 throw Error("video_browser_unsupported");
}
export default function VMVPilotRenderDock(){
 const [status,setStatus]=useState<JobState>("idle");
 const [percent,setPercent]=useState(0),[phase,setPhase]=useState("");
 const [visible,setVisible]=useState(true),[failure,setFailure]=useState("");
 const [videoUrl,setVideoUrl]=useState(""),[savedId,setSavedId]=useState("");
 const [videoMime,setVideoMime]=useState("video/webm");
 const busy=useRef(false),resultUrl=useRef("");
 const update=(pct:number,label:string)=>{setPercent(Math.min(99,Math.max(0,Math.floor(pct))));setPhase(label);};
 const generate=useCallback(async (input:PilotRenderRequest)=>{
  if(busy.current)return;
  busy.current=true;setStatus("working");setVisible(true);setFailure("");
  setVideoUrl("");setSavedId("");update(1,"Guion");
  const images:ImageBitmap[]=[];
  let audioContext:AudioContext|null=null,stream:MediaStream|null=null;
  let recorder:MediaRecorder|null=null;
  let videoCreated=false;
  try{
   if(![15,30,60].includes(input.seconds)||!STYLE_BIBLE[input.style]||
    input.topic.trim().length<3||!navigator.mediaDevices && typeof MediaRecorder==="undefined")
    throw Error("Configuración inválida");
   if(typeof MediaRecorder==="undefined")throw Error("Este navegador no permite exportar video.");
   const session=await getSupabase()?.auth.getSession();
   const access=session?.data.session?.access_token;
   if(!access)throw Error("Inicia sesión.");
   const post=async(path:string,body:Record<string,unknown>)=>{
    const response=await fetch("/api/video-generator/"+path,{method:"POST",cache:"no-store",
     headers:{Authorization:"Bearer "+access,"Content-Type":"application/json"},
     body:JSON.stringify(body)});
    if(!response.ok){
     const error=await response.json().catch(()=>({error:"network"}));
     throw Error(String(error.error||"network"));
    }
    return response;
   };
   const storyResponse=await post("pilot-storyboard",{topic:input.topic,audience:input.audience,
    seconds:input.seconds,style:input.style,language:input.language});
   const story=await storyResponse.json() as {title:string;scenes:Scene[]};
   const scenes=story.scenes;
   if(scenes.length!==input.seconds/5||scenes.some((s,i)=>s.start!==i*5||s.end!==(i+1)*5))
    throw Error("El guion no tiene escenas sincronizadas.");
   const voiceBytes:ArrayBuffer[]=[];
   if(input.narration){
    update(12,"Voz");
    const res=await post("speech/scenes",{scenes:scenes.map(s=>s.speech),voice:"alloy",confirmCost:true});
    const data=await res.json() as {scenes:Array<{audio:string}>};
    if(data.scenes?.length!==scenes.length)throw Error("La voz no está sincronizada.");
    for(const voice of data.scenes)voiceBytes.push(b64bytes(voice.audio));
   }
   update(23,"Escenas");
   const ratio="portrait";
   for(let i=0;i<scenes.length;i++){
    const prompt=STYLE_BIBLE[input.style]+
     "Same immutable visual style, same recurring character appearance, same palette in ALL scenes. "+
     "Scene action: "+scenes[i].imagePrompt+
     ". Exactly one visual moment illustrating this phrase: "+scenes[i].speech+
     ". Vertical portrait 9:16 safe composition. No written words, no captions, no logos. 2D or photo style only as specified.";
    const result=await post("image",{output:"image",prompt:prompt.slice(0,2750),
     size:"1024x1536",quality:"standard"});
    const blob=await result.blob();
    if(!["image/jpeg","image/png","image/webp"].includes(blob.type))throw Error("Imagen inválida");
    images.push(await createImageBitmap(blob));
    update(23+53*(i+1)/scenes.length,"Escena "+(i+1)+"/"+scenes.length);
   }
   update(78,"Montaje");
   const width=540,height=960,canvas=document.createElement("canvas");
   canvas.width=width;canvas.height=height;
   const ctx=canvas.getContext("2d",{alpha:false});
   if(!ctx||!canvas.captureStream)throw Error("El navegador no puede montar el video.");
   const tracks=canvas.captureStream(24);
   stream=tracks;
   let voiceDurations:number[]=Array.from({length:scenes.length},()=>5);
   if(voiceBytes.length){
    audioContext=new AudioContext();
    await audioContext.resume();
    const decoded=await Promise.all(voiceBytes.map(b=>audioContext!.decodeAudioData(b.slice(0))));
    const destination=audioContext.createMediaStreamDestination();
    const startAt=audioContext.currentTime+0.18;
    for(let i=0;i<decoded.length;i++){
     const source=audioContext.createBufferSource();
     source.buffer=decoded[i];
     // Each phrase starts precisely at its own 5-second visual block.
     source.playbackRate.value=Math.max(1,decoded[i].duration/4.72);
     voiceDurations[i]=decoded[i].duration/source.playbackRate.value;
     source.connect(destination);
     source.start(startAt+i*5);
    }
    destination.stream.getAudioTracks().forEach(track=>tracks.addTrack(track));
   }
   const type=mediaType();
   recorder=new MediaRecorder(tracks,{mimeType:type,videoBitsPerSecond:1550000,
    audioBitsPerSecond:96000});
   const chunks:Blob[]=[];
   const finished=new Promise<Blob>((resolve,reject)=>{
    recorder!.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder!.onerror=()=>reject(Error("Error al exportar el video."));
    recorder!.onstop=()=>chunks.length?resolve(new Blob(chunks,{type})):reject(Error("Video vacío"));
   });
   const total=input.seconds;
   const draw=(time:number)=>{
    const index=Math.min(scenes.length-1,Math.floor(Math.max(0,time)/5));
    const local=Math.min(4.999,Math.max(0,time-index*5));
    const picture=images[index],zoom=1.035+0.065*local/5;
    const scale=Math.max(width/picture.width,height/picture.height)*zoom;
    const w=picture.width*scale,h=picture.height*scale;
    const slide=(index%2===0?1:-1)*10*(local/5);
    ctx.fillStyle="#10151d";ctx.fillRect(0,0,width,height);
    ctx.drawImage(picture,(width-w)/2+slide,(height-h)/2,w,h);
    if(input.subtitles){
     const grad=ctx.createLinearGradient(0,height*.62,0,height);
     grad.addColorStop(0,"rgba(0,0,0,0)");grad.addColorStop(1,"rgba(0,0,0,.79)");
     ctx.fillStyle=grad;ctx.fillRect(0,height*.62,width,height*.38);
     ctx.font="800 29px system-ui";ctx.textBaseline="middle";ctx.textAlign="center";
     const chunks=captionsFor(scenes[index].speech);
     const speaking=Math.min(4.95,voiceDurations[index]);
     const active=Math.min(chunks.length-1,Math.floor(local/Math.max(.25,speaking/chunks.length)));
     const lines=wrap(ctx,chunks[Math.max(0,active)]||scenes[index].caption,width*.85);
     ctx.strokeStyle="rgba(8,12,18,.9)";ctx.lineWidth=6;ctx.lineJoin="round";
     lines.forEach((line,j)=>{
      const y=height*.80+(j-(lines.length-1)/2)*43;
      ctx.strokeText(line,width/2,y);ctx.fillStyle="#fff";ctx.fillText(line,width/2,y);
     });
    }
   };
   draw(0);
   recorder.start(250);
   const started=performance.now()+150;
   await new Promise<void>(resolve=>{
    const tick=(now:number)=>{
     const time=Math.max(0,(now-started)/1000);
     draw(Math.min(total-.001,time));
     update(78+18*Math.min(1,time/total),"Montaje");
     if(time>=total){resolve();return;}
     requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
   });
   if(recorder.state!=="inactive")recorder.stop();
   const blob=await finished;
   videoCreated=true;
   if(resultUrl.current)URL.revokeObjectURL(resultUrl.current);
   resultUrl.current=URL.createObjectURL(blob);
   setVideoUrl(resultUrl.current);
   const format=blob.type.split(";")[0];
   setVideoMime(format);
   update(97,"Guardando");
   const db=getSupabase();
   if(db){
    try{
     const id=await saveQuickVideo(db,{
      title:story.title||input.topic,topic:input.topic.slice(0,220),kind:input.goal==="Atraer clientes"||
       input.goal==="Generar ventas"||input.goal==="Conseguir reservas"?"promo":"facts",
      visual:input.style==="stickman"?"sticks":"stills",seconds:input.seconds,ratio,
      narration:input.narration,scenes:scenes.map(s=>({speech:s.speech,imagePrompt:s.imagePrompt,caption:s.caption}))
     },blob);
     setSavedId(id);
    }catch{
     setFailure("No se guardó en la biblioteca. Descarga el video.");
    }
   }
   setPercent(100);setPhase("Listo");setStatus("completed");setVisible(true);
  }catch(error){
   if(!videoCreated){
    const message=error instanceof Error?error.message:"Error de generación";
    const safeMessage=message.startsWith("pilot_")||message.startsWith("video_")||
     message.startsWith("image_")||message.startsWith("voice_")
     ?"No se pudo generar. Revisa los créditos y vuelve a intentar.":message;
    setFailure(safeMessage);
    setStatus("failed");
    setVisible(true);
   }
  }finally{
   busy.current=false;
   images.forEach(frame=>frame.close());
   stream?.getTracks().forEach(track=>track.stop());
   if(audioContext)void audioContext.close();
  }
 },[]);
 useEffect(()=>{
  const listener=(event:Event)=>{
   const detail=(event as CustomEvent<PilotRenderRequest>).detail;
   if(detail?.pilotId)void generate(detail);
  };
  window.addEventListener("vmv-pilot:generate",listener);
  return()=>window.removeEventListener("vmv-pilot:generate",listener);
 },[generate]);
 useEffect(()=>()=>{if(resultUrl.current)URL.revokeObjectURL(resultUrl.current);},[]);
 if(status==="idle")return null;
 return <aside className={css.dock} aria-label="VMV Pilot">
  <button type="button" className={css.ring} onClick={()=>setVisible(v=>!v)}
   aria-label={"VMV Pilot "+percent+"%"}>
   <span className={css.circle} style={{background:"conic-gradient("+ (status==="failed"?"#c84f71":"#8c60c0")+
    " "+percent+"%,#e9e0f0 "+percent+"% 100%)"}}>
    <span>{status==="completed"?<Check size={20}/>:status==="failed"?<X size={18}/>:percent+"%"}</span>
   </span>
  </button>
  {visible?<section className={css.card} aria-live="polite">
   <div className={css.head}><strong>VMV Pilot</strong>
    <button type="button" aria-label="Minimizar" onClick={()=>setVisible(false)}><X size={18}/></button></div>
   {status==="working"?<div className={css.working}>
    <LoaderCircle className={css.spin} size={17}/><span>{phase}</span><strong>{percent}%</strong>
   </div>:null}
   {status==="completed"&&videoUrl?<div className={css.finished}>
    <video controls playsInline preload="metadata" src={videoUrl}/>
    <div className={css.actions}>
     <a href={videoUrl} download={"vmv-pilot."+(videoMime==="video/mp4"?"mp4":"webm")}>
      <Download size={16}/> Descargar</a>
     {savedId?<Link href={"/vista-app/video-generator?view=library&quick="+encodeURIComponent(savedId)}>
      <Film size={16}/> Biblioteca</Link>:null}
    </div>
   </div>:null}
   {status==="failed"?<p className={css.notice}>{failure}</p>:null}
   {status==="completed"&&failure?<p className={css.notice}>{failure}</p>:null}
   {status==="working"?<p className={css.hint}>Mantén abierta la app</p>:null}
  </section>:null}
 </aside>;
}