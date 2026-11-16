import React,{useState} from "react";
import {Pressable,StyleSheet,Text,View} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
 diagnosticComplete,getDiagnosticQuestions,getDiagnosticRecommendations,
 type DiagnosticAnswers,type DiagnosticLanguage,type DiagnosticRecord,type DiagnosticService
} from "../../lib/business-diagnostic";

type Props={
 language:DiagnosticLanguage;
 businessName:string;
 record:DiagnosticRecord|null;
 onSave:(answers:DiagnosticAnswers)=>Promise<void>;
 onClose:()=>void;
 onExplore:(service:DiagnosticService)=>void;
};
export function BusinessDiagnostic({language,businessName,record,onSave,onClose,onExplore}:Props){
 const [answers,setAnswers]=useState<DiagnosticAnswers>(record?.answers||{});
 const [step,setStep]=useState(record?getDiagnosticQuestions(record.answers).length:0);
 const [saving,setSaving]=useState(false);
 const [saved,setSaved]=useState(Boolean(record));
 const [error,setError]=useState("");
 const questions=getDiagnosticQuestions(answers);
 const complete=step>=questions.length&&diagnosticComplete(answers);
 const recommendations=getDiagnosticRecommendations(answers);
 const es=language==="es";
 const msg=(esText:string,enText:string)=>es?esText:enText;
 async function save(next:DiagnosticAnswers){
  setSaving(true);setSaved(false);setError("");
  try{await onSave(next);setSaved(true);}
  catch{setError(msg("No pudimos guardar tus respuestas. Reintenta.","We couldn't save your answers. Try again."));}
  finally{setSaving(false);}
 }
 function choose(id:string,value:string){
  const next={...answers,[id]:value};setAnswers(next);
  const nextStep=step+1;setStep(nextStep);
  if(nextStep>=getDiagnosticQuestions(next).length)void save(next);
 }
 return <View style={styles.screen}>
  <View style={styles.header}>
   <Pressable accessibilityRole="button" onPress={onClose} style={styles.back}>
    <Ionicons name="arrow-back-outline" size={19} color="#654b88"/><Text style={styles.backText}>{msg("Inicio","Home")}</Text>
   </Pressable>
   <Text style={styles.logo}>VMV Business</Text>
  </View>
  {!complete?<>
   <Text style={styles.kicker}>{msg("CONOZCAMOS TU NEGOCIO","LET'S LEARN ABOUT YOUR BUSINESS")}</Text>
   <Text style={styles.heading}>{businessName}</Text>
   <Text style={styles.description}>{msg("Responde unas preguntas para descubrir qué te ayudaría a crecer.","Answer a few questions to discover what could help you grow.")}</Text>
   <View style={styles.progress}><View style={[styles.progressFill,{width:`${Math.min(100,Math.round(step/questions.length*100))}%`}]}/></View>
   <Text style={styles.count}>{msg("Pregunta","Question")} {step+1} {msg("de","of")} {questions.length}</Text>
   <Text style={styles.question}>{questions[step].title[language]}</Text>
   {questions[step].options.map((option,i)=><Pressable key={option.value} accessibilityRole="button"
    style={[styles.option,{backgroundColor:["#EEE4FC","#E5F7E6","#FCE9F0"][i%3]}]}
    onPress={()=>choose(questions[step].id,option.value)}>
    <Text style={styles.optionText}>{option.label[language]}</Text>
    <Ionicons name="arrow-forward-outline" size={19} color="#2f2140"/>
   </Pressable>)}
   {step>0?<Pressable accessibilityRole="button" onPress={()=>setStep(step-1)} style={styles.previous}>
    <Text style={styles.previousText}>{msg("Anterior","Back")}</Text>
   </Pressable>:null}
  </>:<>
   <View style={styles.finished}>
    <Ionicons name="checkmark-circle-outline" size={40} color="#7851C3"/>
    <Text style={styles.heading}>{msg("Diagnóstico completado","Assessment complete")}</Text>
    <Text style={styles.description}>{recommendations.length?msg("Encontramos estas oportunidades para tu negocio.","We found these opportunities for your business."):msg("No necesitas destacar servicios nuevos por ahora.","You don't need to feature new services right now.")}</Text>
   </View>
   {recommendations.map((item,i)=><View key={item.id} style={[styles.result,{backgroundColor:["#EEE3FF","#E1F6E3","#FAE5ED"][i%3]}]}>
    <Text style={styles.resultTitle}>{item.name}</Text><Text style={styles.resultDescription}>{item.reason[language]}</Text>
    {saved?<Pressable accessibilityRole="button" onPress={()=>onExplore(item.id)} style={styles.explore}>
     <Text style={styles.exploreText}>{msg("Explorar servicio","Explore service")}</Text>
     <Ionicons name="arrow-forward-outline" size={16} color="#392458"/>
    </Pressable>:null}
   </View>)}
   {saving?<Text style={styles.notice}>{msg("Guardando respuestas…","Saving your answers…")}</Text>:null}
   {error?<Text style={styles.error} accessibilityRole="alert">{error}</Text>:null}
   {error?<Pressable accessibilityRole="button" style={styles.primary} onPress={()=>void save(answers)}>
    <Text style={styles.primaryText}>{msg("Reintentar guardado","Retry saving")}</Text>
   </Pressable>:null}
   {saved?<Pressable accessibilityRole="button" style={styles.primary} onPress={onClose}>
    <Text style={styles.primaryText}>{msg("Volver a mi inicio","Return to my Home")}</Text>
   </Pressable>:null}
   {!saving?<Pressable accessibilityRole="button" style={styles.retake} onPress={()=>{setAnswers({});setStep(0);setSaved(false);setError("");}}>
    <Text style={styles.previousText}>{msg("Actualizar mis respuestas","Update my answers")}</Text>
   </Pressable>:null}
  </>}
 </View>;
}
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:"#FAF9FD",paddingHorizontal:5,paddingTop:4,paddingBottom:35},
 header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:26,gap:8},
 back:{flexDirection:"row",alignItems:"center",gap:7,paddingVertical:8},
 backText:{fontSize:13,fontWeight:"800",color:"#654B88"},
 logo:{fontSize:17,fontWeight:"900",color:"#8B5BCB",letterSpacing:-.5},
 kicker:{color:"#8964B9",fontSize:11,fontWeight:"900",letterSpacing:1,marginBottom:10},
 heading:{fontSize:26,fontWeight:"900",lineHeight:30,letterSpacing:-1.1,color:"#23182F",marginBottom:9},
 description:{color:"#635971",fontSize:13,lineHeight:20,marginBottom:20},
 progress:{height:7,borderRadius:20,backgroundColor:"#EBE5F5",overflow:"hidden",marginBottom:12},
 progressFill:{height:7,borderRadius:20,backgroundColor:"#A58ADF"},
 count:{fontSize:11,color:"#80669E",fontWeight:"800"},
 question:{fontSize:23,lineHeight:29,letterSpacing:-.5,fontWeight:"900",color:"#23182F",marginTop:18,marginBottom:22},
 option:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",padding:18,borderRadius:17,marginBottom:11,minHeight:60,gap:10},
 optionText:{flex:1,fontSize:15,fontWeight:"800",color:"#261B34"},
 previous:{marginTop:12,paddingVertical:12},
 previousText:{fontSize:13,fontWeight:"800",color:"#705C8E",textAlign:"center"},
 finished:{alignItems:"center",gap:5,marginBottom:18},
 result:{padding:17,borderRadius:19,marginBottom:11},
 resultTitle:{fontSize:17,fontWeight:"900",color:"#30263D"},
 resultDescription:{fontSize:13,lineHeight:19,color:"#30263D",marginTop:7,marginBottom:9},
 explore:{flexDirection:"row",alignItems:"center",gap:6,alignSelf:"flex-start",backgroundColor:"#FFFFFFB3",paddingHorizontal:11,paddingVertical:9,borderRadius:20},
 exploreText:{fontSize:12,fontWeight:"800",color:"#392458"},
 primary:{marginTop:16,backgroundColor:"#211629",minHeight:51,justifyContent:"center",alignItems:"center",borderRadius:17},
 primaryText:{color:"#fff",fontSize:14,fontWeight:"850"},
 retake:{paddingVertical:14,marginTop:2},
 notice:{fontSize:13,color:"#514465",marginTop:12},
 error:{fontSize:13,color:"#B42F4F",marginTop:12}
});
