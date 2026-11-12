import React,{useMemo,useState} from "react";
import {Alert,Pressable,ScrollView,Share,StyleSheet,Text,View} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type {Agent} from "./aiAgentsData";
import {inspectAgent,type ReadinessCheck} from "./aiAgentQuality";

type Props={agent:Agent;onClose:()=>void;onEdit:(step:0|1|2|3)=>void};
type Tab="checklist"|"tests"|"brief";
const C={bg:"#FAF9FD",ink:"#2A203B",muted:"#887B95",purple:"#8A5BE8",line:"#EAE4F3"};
type Icon=React.ComponentProps<typeof Ionicons>["name"];

function SmallButton({title,icon,onPress}:{title:string;icon:Icon;onPress:()=>void}){
 return <Pressable accessibilityRole="button" onPress={onPress} style={styles.smallButton}>
  <Ionicons name={icon} size={15} color={C.purple}/>
  <Text style={styles.smallButtonLabel}>{title}</Text>
 </Pressable>;
}
function QualityIssue({item,onPress}:{item:ReadinessCheck;onPress:()=>void}){
 const critical=item.priority==="required";
 return <View style={styles.issue}>
  <View style={[styles.issueIcon,{backgroundColor:critical?"#FFF0E6":"#F1E9FB"}]}>
   <Ionicons name={critical?"alert-circle-outline":"bulb-outline"} size={21}
    color={critical?"#B76845":"#8C66BE"}/>
  </View>
  <View style={{flex:1}}>
   <Text style={styles.issueTitle}>{item.title}</Text>
   <Text style={styles.issueText}>{item.detail}</Text>
   <Pressable accessibilityRole="button" onPress={onPress} style={styles.fixLink}>
    <Text style={styles.fixText}>Completar ahora</Text>
    <Ionicons name="arrow-forward" size={14} color={C.purple}/>
   </Pressable>
  </View>
 </View>;
}
export function AIAgentQualityLab({agent,onClose,onEdit}:Props){
 const report=useMemo(()=>inspectAgent(agent),[agent]);
 const [tab,setTab]=useState<Tab>("checklist");
 const [expanded,setExpanded]=useState<string|null>(null);
 const missingEssential=report.missing.filter(c=>c.priority==="required").length;
 const share=async()=>{
  try{await Share.share({title:"Ficha de entrenamiento · "+agent.name,message:report.brief});}
  catch{Alert.alert("Compartir","No se pudo compartir la ficha.");}
 };
 return <ScrollView style={{flex:1,backgroundColor:C.bg}} contentContainerStyle={styles.container}>
  <View style={styles.top}>
   <SmallButton icon="arrow-back" title="Mis agentes" onPress={onClose}/>
   <Text style={styles.preview}>AGENT QUALITY LAB</Text>
  </View>
  <View style={styles.hero}>
   <View style={styles.heroTop}><Ionicons name="sparkles-outline" color="#FFF" size={17}/>
    <Text style={styles.heroTag}>CONTROL DE CALIDAD</Text></View>
   <Text style={styles.heroTitle}>Antes de hablar,{"\n"}que esté preparado.</Text>
   <Text style={styles.heroText}>Descubre qué necesita aprender tu agente.</Text>
   <View style={styles.scoreCard}>
    <View style={styles.scoreCircle}>
     <Text style={styles.scoreValue}>{report.percent}%</Text>
     <Text style={styles.scoreCaption}>Configurado</Text>
    </View>
    <View style={{flex:1,gap:5}}>
     <Text style={styles.scoreTitle}>{report.requiredPassed?"Configuración esencial cubierta":"Aún faltan datos esenciales"}</Text>
     <Text style={styles.scoreSub}>{report.checks.filter(c=>c.passed).length} de {report.checks.length} puntos cubiertos</Text>
     <Text style={styles.scoreRemaining}>{missingEssential} requisitos esenciales pendientes</Text>
     <View style={styles.progressTrack}><View style={[styles.progressFilled,{width:report.percent+"%" as `${number}%`}]}/></View>
    </View>
   </View>
  </View>
  <View style={styles.facts}>
   <Ionicons name="shield-checkmark-outline" size={16} color={C.purple}/>
   <Text style={styles.factText}>Evalúa datos configurados, no conversaciones reales. No activa llamadas ni integraciones.</Text>
  </View>
  <View style={styles.tabs}>
   {(["checklist","tests","brief"] as const).map((id,i)=><Pressable key={id}
     accessibilityRole="button" accessibilityState={{selected:tab===id}} onPress={()=>setTab(id)}
     style={[styles.tab,tab===id&&styles.tabActive]}>
     <Text style={[styles.tabLabel,tab===id&&styles.tabLabelActive]}>
      {["Chequeo","Pruebas","Ficha"][i]}</Text>
   </Pressable>)}
  </View>

  {tab==="checklist"?<View>
   <Text style={styles.section}>Lo que aún necesita</Text>
   <Text style={styles.intro}>Toca una recomendación para completar esa parte del asistente.</Text>
   {report.missing.length===0?<View style={styles.allGood}>
    <Ionicons name="checkmark-circle-outline" size={28} color="#258060"/>
    <Text style={styles.allGoodTitle}>Ficha completa</Text>
    <Text style={styles.allGoodDescription}>Ahora debes probar sus respuestas reales antes de activar cualquier canal.</Text>
   </View>:<View style={{gap:9}}>{report.missing.map(item=>
    <QualityIssue key={item.id} item={item} onPress={()=>onEdit(item.step)}/>)}</View>}
   {report.checks.some(c=>c.passed)?<>
    <Text style={[styles.section,{marginTop:22}]}>Información confirmada</Text>
    <View style={styles.passedCard}>{report.checks.filter(c=>c.passed).map(item=>
     <View key={item.id} style={styles.passedRow}>
      <Ionicons name="checkmark-circle" size={17} color="#3C8A65"/>
      <Text style={styles.passedText}>{item.title}</Text>
     </View>)}</View>
   </>:null}
  </View>:null}

  {tab==="tests"?<View>
   <Text style={styles.section}>Ensayo con clientes</Text>
   <Text style={styles.intro}>Preguntas adaptadas a tu negocio. Comprueba las respuestas cuando tengas el simulador conectado.</Text>
   <View style={{gap:11}}>{report.tests.map((item,i)=><View key={item.id} style={styles.testCard}>
    <Text style={styles.testLabel}>{String(i+1).padStart(2,"0")} · {item.area.toUpperCase()}</Text>
    <Text style={styles.testQuestion}>“{item.question}”</Text>
    <Pressable accessibilityRole="button" onPress={()=>setExpanded(prev=>prev===item.id?null:item.id)}
     style={styles.expandRow}>
     <Text style={styles.expandLabel}>Qué debería responder</Text>
     <Ionicons name={expanded===item.id?"chevron-up":"chevron-down"} size={16} color={C.purple}/>
    </Pressable>
    {expanded===item.id?<View style={styles.expected}>
     <Ionicons name="checkmark" size={18} color="#408362"/>
     <Text style={styles.expectedText}>{item.expected}</Text>
    </View>:null}
   </View>)}</View>
   <Text style={styles.disclaimer}>Estas son pruebas sugeridas, no resultados de un modelo. Todavía no se evaluaron llamadas reales.</Text>
  </View>:null}

  {tab==="brief"?<View>
   <Text style={styles.section}>Ficha de entrenamiento</Text>
   <Text style={styles.intro}>Resumen organizado con las respuestas de tu negocio.</Text>
   <View style={styles.briefHeader}>
    <Ionicons name="document-text-outline" color={C.purple} size={21}/>
    <Text style={styles.briefTitle} numberOfLines={1}>{agent.name}</Text>
    <SmallButton title="Compartir" icon="share-outline" onPress={()=>void share()}/>
   </View>
   <View style={styles.briefCard}><Text style={styles.briefBody} selectable>{report.brief}</Text></View>
   <Text style={styles.disclaimer}>Este documento no confirma respuestas del modelo ni conexiones externas.</Text>
  </View>:null}
  <Pressable accessibilityRole="button" onPress={()=>onEdit(report.missing[0]?.step??2)} style={styles.cta}>
   <Ionicons name="sparkles-outline" color="#FFF" size={18}/>
   <Text style={styles.ctaText}>{report.missing.length?"Completar configuración":"Revisar agente"}</Text>
  </Pressable>
 </ScrollView>;
}
const styles=StyleSheet.create({
 container:{paddingHorizontal:18,paddingVertical:14,paddingBottom:75},
 top:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:16},
 smallButton:{flexDirection:"row",alignItems:"center",gap:5,paddingHorizontal:7,paddingVertical:8},
 smallButtonLabel:{fontSize:11,fontWeight:"800",color:C.purple},
 preview:{fontSize:9,fontWeight:"900",color:C.purple,letterSpacing:.6},
 hero:{borderRadius:27,backgroundColor:C.purple,padding:20},
 heroTop:{flexDirection:"row",alignItems:"center",gap:7},
 heroTag:{color:"#FFF",fontSize:10,fontWeight:"900",letterSpacing:1},
 heroTitle:{fontSize:25,lineHeight:29,fontWeight:"900",color:"#FFF",letterSpacing:-.7,marginTop:18},
 heroText:{color:"#F3E9FF",fontSize:12,lineHeight:18,marginTop:8,marginBottom:18},
 scoreCard:{backgroundColor:"#FFF",padding:14,borderRadius:21,flexDirection:"row",alignItems:"center",gap:12},
 scoreCircle:{width:90,height:90,borderRadius:45,borderWidth:8,borderColor:"#D9C4F7",
  justifyContent:"center",alignItems:"center",backgroundColor:"#FFF"},
 scoreValue:{fontSize:21,color:"#7544C9",fontWeight:"900"},
 scoreCaption:{fontSize:9,color:"#89749C",fontWeight:"800"},
 scoreTitle:{color:C.ink,fontSize:13,fontWeight:"900"},
 scoreSub:{color:C.muted,fontSize:11},
 scoreRemaining:{color:C.purple,fontSize:10,fontWeight:"800"},
 progressTrack:{height:6,borderRadius:10,backgroundColor:"#E8E0F1",overflow:"hidden",marginTop:4},
 progressFilled:{height:6,borderRadius:10,backgroundColor:C.purple},
 facts:{flexDirection:"row",alignItems:"flex-start",gap:8,padding:15},
 factText:{fontSize:10,lineHeight:16,color:C.muted,flex:1},
 tabs:{padding:4,borderRadius:16,backgroundColor:"#F0EAF9",flexDirection:"row",gap:5,marginBottom:22},
 tab:{flex:1,paddingVertical:12,alignItems:"center",borderRadius:13},
 tabActive:{backgroundColor:"#FFF"},
 tabLabel:{fontSize:12,fontWeight:"800",color:"#8D7B9E"},
 tabLabelActive:{color:C.purple},
 section:{fontSize:20,fontWeight:"900",color:C.ink,letterSpacing:-.5},
 intro:{fontSize:11,lineHeight:18,color:C.muted,marginTop:5,marginBottom:16},
 issue:{flexDirection:"row",gap:11,padding:13,borderRadius:17,backgroundColor:"#FFF",borderWidth:1,borderColor:C.line},
 issueIcon:{height:37,width:37,borderRadius:13,justifyContent:"center",alignItems:"center"},
 issueTitle:{fontSize:13,fontWeight:"900",color:C.ink},
 issueText:{fontSize:11,lineHeight:17,color:C.muted,marginTop:4},
 fixLink:{flexDirection:"row",alignItems:"center",gap:7,marginTop:8},
 fixText:{fontSize:11,color:C.purple,fontWeight:"900"},
 passedCard:{padding:15,backgroundColor:"#F0FAF3",borderRadius:15,gap:13,marginTop:9},
 passedRow:{flexDirection:"row",alignItems:"center",gap:9},
 passedText:{color:"#44735B",fontSize:12,fontWeight:"700"},
 allGood:{backgroundColor:"#ECFAF1",padding:23,borderRadius:18,alignItems:"center",gap:7},
 allGoodTitle:{fontSize:15,fontWeight:"900",color:"#367957"},
 allGoodDescription:{fontSize:11,color:"#5A8D6E",textAlign:"center",lineHeight:17},
 testCard:{backgroundColor:"#FFF",borderWidth:1,borderColor:C.line,borderRadius:18,padding:15},
 testLabel:{color:C.purple,fontSize:10,letterSpacing:.5,fontWeight:"900"},
 testQuestion:{color:C.ink,fontSize:13,lineHeight:20,fontWeight:"800",marginTop:10},
 expandRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:13},
 expandLabel:{color:C.purple,fontSize:11,fontWeight:"800"},
 expected:{flexDirection:"row",gap:8,backgroundColor:"#EEF8F2",padding:11,borderRadius:12,marginTop:10},
 expectedText:{flex:1,color:"#48745B",lineHeight:18,fontSize:11},
 disclaimer:{fontSize:10,color:C.muted,lineHeight:17,marginTop:16},
 briefHeader:{flexDirection:"row",alignItems:"center",gap:9,padding:12,
  backgroundColor:"#F1E8FF",borderTopLeftRadius:17,borderTopRightRadius:17},
 briefTitle:{flex:1,fontSize:12,color:"#7051A0",fontWeight:"900"},
 briefCard:{backgroundColor:"#FFF",padding:15,borderWidth:1,borderColor:"#E7DAF4",borderBottomLeftRadius:17,borderBottomRightRadius:17},
 briefBody:{fontSize:11,color:"#5D4E68",lineHeight:19},
 cta:{marginTop:20,backgroundColor:C.purple,padding:15,borderRadius:15,flexDirection:"row",
 justifyContent:"center",alignItems:"center",gap:8},
 ctaText:{color:"#FFF",fontSize:12,fontWeight:"900"}
});
