import React,{useCallback,useEffect,useState} from "react";
import {ActivityIndicator,Alert,Linking,Pressable,StyleSheet,Text,View} from "react-native";
import type {Session} from "@supabase/supabase-js";
import {centralChoices,type NativeCentralBusiness} from "./aiAgentsCentralData";
const endpoint=process.env.EXPO_PUBLIC_VMV_AI_API||
 "https://smartjob-git-feat-vmv-smart-cal-fcbaa4-valdys-projects-b97fc7a6.vercel.app";
type Status={
 configured:boolean;connected:boolean;ready?:boolean;availableCents?:number|null;
 pendingCents?:number|null;payouts?:{id:string;amountCents:number;status:string}[];
};
const usd=(cents?:number|null)=>typeof cents==="number"&&Number.isFinite(cents)?
 "$"+(cents/100).toFixed(2):"—";

export default function FinancesPanel({session}:{session:Session}){
 const [businesses,setBusinesses]=useState<NativeCentralBusiness[]>([]);
 const [businessId,setBusinessId]=useState("");
 const [status,setStatus]=useState<Status|null>(null);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const call=useCallback(async(path:string,action?:string)=>{
  const res=await fetch(endpoint+path,{
   method:action?"POST":"GET",
   headers:{Authorization:"Bearer "+session.access_token,
    ...(action?{"Content-Type":"application/json"}:{})},
   body:action?JSON.stringify({businessId,action}):undefined
  });
  const payload=await res.json() as Record<string,unknown>;
  if(!res.ok)throw Error(String(payload.error||"No se pudo acceder a Finanzas."));
  return payload;
 },[session.access_token,businessId]);
 useEffect(()=>{let live=true;
  void centralChoices(session).then(result=>{if(!live)return;
   setBusinesses(result.businesses);
   setBusinessId(old=>result.businesses.some(b=>b.id===old)?old:result.businesses[0]?.id||"");
  }).catch(e=>{if(live){setError(e instanceof Error?e.message:"No pudimos cargar tus negocios.");setLoading(false);}});
  return()=>{live=false;};
 },[session.user.id]);
 const refresh=useCallback(async()=>{
  if(!businessId){setLoading(false);setStatus(null);return;}
  setLoading(true);setError("");
  try{const data=await call("/api/vmv/finanzas/status?businessId="+encodeURIComponent(businessId));
   setStatus(data as Status);
  }catch(e){setError(e instanceof Error?e.message:"No pudimos consultar Stripe.");}
  finally{setLoading(false);}
 },[businessId,call]);
 useEffect(()=>{void refresh();},[refresh]);
 async function connect(){
  if(!businessId||busy||!status?.configured)return;
  setBusy(true);setError("");
  try{const data=await call("/api/vmv/finanzas/connect",status.ready?"dashboard":"onboard");
   const uri=String(data.url||"");
   const url=new URL(uri);
   if(url.protocol!=="https:"||url.hostname!=="connect.stripe.com")
    throw Error("Enlace Stripe no válido.");
   await Linking.openURL(uri);
  }catch(e){Alert.alert("Stripe",e instanceof Error?e.message:"No disponible.");}
  finally{setBusy(false);}
 }
 return <View style={styles.body}>
  <Text style={styles.title}>Finanzas</Text>
  <Text style={styles.sub}>Pagos y depósitos de tus negocios</Text>
  {businesses.map(b=><Pressable key={b.id} onPress={()=>{setBusinessId(b.id);setStatus(null);}}
   style={[styles.choice,businessId===b.id&&styles.selected]}>
   <Text style={styles.choiceText}>{b.name}{businessId===b.id?" ✓":""}</Text>
  </Pressable>)}
  {!businesses.length&&!loading?<Text style={styles.sub}>Primero crea un negocio en VMV Business.</Text>:null}
  {loading?<ActivityIndicator color="#8555DB"/>:null}
  {error?<Text style={styles.error}>{error}</Text>:null}
  {status&&!loading?<View style={styles.card}>
   <Text style={styles.heading}>Stripe Connect</Text>
   <Text style={styles.state}>{status.ready?"Listo para pruebas":status.connected?"Verificación pendiente":"Sin conectar"}</Text>
   <Text style={styles.sub}>{status.configured?"Prueba · Sin dinero real":"Entorno de prueba pendiente de configuración"}</Text>
   <Pressable disabled={busy||!status.configured} onPress={()=>void connect()}
    style={[styles.btn,(!status.configured||busy)&&styles.disabled]}>
    <Text style={styles.btnText}>{busy?"Abriendo…":!status.configured?"Pendiente de activar":
     status.ready?"Abrir Stripe":status.connected?"Continuar verificación":"Conectar Stripe"}</Text>
   </Pressable>
   <Pressable disabled={busy} onPress={()=>void refresh()} style={styles.update}>
    <Text style={styles.updateText}>Actualizar estado</Text>
   </Pressable>
  </View>:null}
  <View style={styles.balanceRow}>
   <View style={styles.balance}><Text style={styles.sub}>Disponible</Text>
    <Text style={styles.money}>{usd(status?.availableCents)}</Text></View>
   <View style={styles.balance}><Text style={styles.sub}>Pendiente</Text>
    <Text style={styles.money}>{usd(status?.pendingCents)}</Text></View>
  </View>
  <Text style={styles.foot}>Stripe gestiona los cobros y los depósitos bancarios. VMV no custodia los fondos.</Text>
 </View>;
}
const styles=StyleSheet.create({
 body:{gap:13,paddingBottom:25},title:{fontSize:27,fontWeight:"900",color:"#282239"},
 heading:{fontSize:18,fontWeight:"800",color:"#282239"},sub:{fontSize:12,color:"#82758E",lineHeight:19},
 card:{padding:18,backgroundColor:"white",borderRadius:18,borderColor:"#e8e1f1",borderWidth:1,gap:10},
 state:{color:"#7150B5",fontSize:13,fontWeight:"800"},
 choice:{backgroundColor:"white",borderRadius:12,borderWidth:1,borderColor:"#e5dced",padding:12},
 selected:{borderColor:"#8555DB",backgroundColor:"#f7f1ff"},
 choiceText:{fontSize:13,fontWeight:"700",color:"#463357"},
 btn:{backgroundColor:"#8555DB",borderRadius:12,padding:14,alignItems:"center"},
 disabled:{opacity:0.5},btnText:{fontSize:13,fontWeight:"800",color:"white"},
 update:{padding:10,alignItems:"center"},updateText:{fontSize:12,fontWeight:"800",color:"#7852c2"},
 balanceRow:{flexDirection:"row",gap:9},balance:{flex:1,padding:16,backgroundColor:"white",borderWidth:1,borderColor:"#e8e1f1",borderRadius:16,gap:9},
 money:{fontSize:21,fontWeight:"900",color:"#292239"},
 error:{fontSize:12,color:"#ad465a",backgroundColor:"#ffeff0",borderRadius:10,padding:10},
 foot:{fontSize:11,lineHeight:17,color:"#80748c",paddingHorizontal:5}
});
