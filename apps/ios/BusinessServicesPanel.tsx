import React,{useEffect,useState} from "react";
import {Alert,Pressable,Share,StyleSheet,Text,TextInput,View} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as SecureStore from "expo-secure-store";
import type {Session} from "@supabase/supabase-js";
import {offersFor,deliveryLabel,type OfferCharge,type ServiceOffer} from "./serviceOffers";

type ProfileDraft={
  business:string;category:string;phone:string;website:string;address:string;
  area:string;hours:string;description:string;googleEmail:string;assets:string;
  authorized:boolean;
};
const EMPTY:ProfileDraft={
  business:"",category:"",phone:"",website:"",address:"",
  area:"",hours:"",description:"",googleEmail:"",assets:"",authorized:false
};
const fields:{key:Exclude<keyof ProfileDraft,"authorized">;label:string;max:number;lines?:boolean;keyboard?:"email-address"|"phone-pad"|"url"}[]=[
  {key:"business",label:"Nombre del negocio *",max:100},
  {key:"category",label:"Categoría *",max:80},
  {key:"phone",label:"Teléfono",max:24,keyboard:"phone-pad"},
  {key:"website",label:"Sitio web",max:150,keyboard:"url"},
  {key:"address",label:"Dirección",max:180},
  {key:"area",label:"Zona de servicio",max:120},
  {key:"hours",label:"Horarios",max:150,lines:true},
  {key:"description",label:"Descripción",max:300,lines:true},
  {key:"googleEmail",label:"Correo de Google *",max:150,keyboard:"email-address"},
  {key:"assets",label:"Logo / fotos (enlace)",max:150,keyboard:"url"}
];

const colors={ink:"#29213D",muted:"#8E83A1",accent:"#895DE4",line:"#E7DFF2",bg:"#FBFAFF"};
const iconName=(name:string):React.ComponentProps<typeof Ionicons>["name"]=>
  name as React.ComponentProps<typeof Ionicons>["name"];

function OfferCard({item,onPress}:{item:ServiceOffer;onPress?:()=>void}){
 const inner=<>
  <View style={[styles.offerIcon,{backgroundColor:"#FFFFFFA8"}]}>
   <Ionicons name={iconName(item.icon)} size={26} color={item.accent}/>
  </View>
  <View style={styles.offerBottom}>
   <Text style={styles.offerName}>{item.name}</Text>
   <View style={styles.offerBadges}>
    <Text style={[styles.offerBadge,{color:item.accent}]}>{deliveryLabel(item.delivery)}</Text>
    <Text style={styles.offerState}>{item.state==="pilot"?"Piloto":"Próximamente"}</Text>
   </View>
  </View>
  {onPress?<Ionicons name="arrow-up-outline" size={17} color={item.accent} style={styles.offerArrow}/>:null}
 </>;
 const cardStyle=[styles.offerCard,{backgroundColor:item.background}];
 return onPress?
  <Pressable accessibilityRole="button" accessibilityLabel={"Preparar "+item.name}
    style={cardStyle} onPress={onPress}>{inner}</Pressable>:
  <View style={cardStyle}>{inner}</View>;
}

export function BusinessServicesPanel({session}:{session:Session}){
 const [charge,setCharge]=useState<OfferCharge>("subscription");
 const [editing,setEditing]=useState(false);
 const [draft,setDraft]=useState<ProfileDraft>({...EMPTY});
 const [saved,setSaved]=useState(false);
 const [busy,setBusy]=useState(false);
 const storageKey="vmv.gbp.draft.v1."+session.user.id;

 useEffect(()=>{
  let active=true;
  setDraft({...EMPTY});setEditing(false);setSaved(false);
  void SecureStore.getItemAsync(storageKey).then(raw=>{
   if(!active||!raw)return;
   const value:unknown=JSON.parse(raw);
   if(!value||typeof value!=="object"||Array.isArray(value))return;
   const record=value as Record<string,unknown>;
   const clean={...EMPTY};
   for(const field of fields){
    const input=record[field.key];
    if(typeof input==="string")clean[field.key]=input.slice(0,field.max);
   }
   clean.authorized=record.authorized===true;
   setDraft(clean);
   setSaved(true);
  }).catch(()=>{});
  return()=>{active=false;};
 },[storageKey]);

 const change=(key:Exclude<keyof ProfileDraft,"authorized">,value:string)=>{
  setDraft(current=>({...current,[key]:value}));setSaved(false);
 };
 async function saveDraft(){
  if(busy)return;
  setBusy(true);
  try{
   await SecureStore.setItemAsync(storageKey,JSON.stringify(draft));
   setSaved(true);
  }catch{
   Alert.alert("Error","No se pudo guardar el borrador.");
  }finally{setBusy(false);}
 }
 async function shareDraft(){
  if(busy)return;
  if(!draft.business.trim()||!draft.category.trim()||
     !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.googleEmail.trim())||
     !(draft.address.trim()||draft.area.trim())){
   Alert.alert("Faltan datos","Completa el nombre, categoría, correo y dirección o zona.");
   return;
  }
  if(!draft.authorized){
   Alert.alert("Autorización","Confirma que puedes solicitar esta gestión.");
   return;
  }
  setBusy(true);
  try{
   const form=[
    "Google Business Profile",
    ...fields.map(field=>field.label.replace(/\s\*$/,"")+": "+(draft[field.key].trim()||"—")),
    "Autorización: Sí"
   ].join("\n");
   await Share.share({message:form,title:"Google Business Profile"});
   // Share sheet completion does not prove delivery to VMV; no order is created.
  }catch{
   Alert.alert("No disponible","No se pudo abrir Compartir.");
  }finally{setBusy(false);}
 }
 if(editing)return <View style={styles.wrapper}>
  <Pressable accessibilityRole="button" accessibilityLabel="Volver a servicios"
   onPress={()=>setEditing(false)} style={styles.back}>
   <Ionicons name="chevron-back" size={20} color={colors.accent}/><Text style={styles.backText}>Servicios</Text>
  </Pressable>
  <View style={styles.formHead}>
   <View style={styles.formIcon}><Ionicons name="location-outline" size={29} color="#6941A1"/></View>
   <View style={{flex:1}}><Text style={styles.formTitle}>Google Business Profile</Text>
    <Text style={styles.formChip}>Pago único · Asistido</Text></View>
  </View>
  <View style={styles.formCard}>
   {fields.map(field=><View key={field.key} style={styles.fieldWrap}>
    <Text style={styles.fieldLabel}>{field.label}</Text>
    <TextInput accessibilityLabel={field.label} autoCapitalize="none"
     autoCorrect={false} spellCheck={false} keyboardType={field.keyboard||"default"}
     placeholder={field.label.replace(" *","")} placeholderTextColor="#ACA1BC"
     value={draft[field.key]} maxLength={field.max} multiline={field.lines||false}
     textAlignVertical={field.lines?"top":"center"}
     onChangeText={value=>change(field.key,value)}
     style={[styles.input,field.lines&&styles.multiline]}/>
   </View>)}
   <Pressable accessibilityRole="checkbox" accessibilityState={{checked:draft.authorized}}
    style={styles.consent} onPress={()=>{setDraft(current=>({...current,authorized:!current.authorized}));setSaved(false);}}>
    <View style={[styles.checkbox,draft.authorized&&styles.checkboxActive]}>
     {draft.authorized?<Ionicons name="checkmark" size={14} color="#FFFFFF"/>:null}
    </View>
    <Text style={styles.consentText}>Autorizo la gestión de mi perfil.</Text>
   </Pressable>
   <Pressable accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy}
    onPress={()=>void saveDraft()} style={styles.secondaryButton}>
    <Ionicons name="save-outline" size={18} color={colors.accent}/>
    <Text style={styles.secondaryText}>{saved?"Borrador guardado":"Guardar borrador"}</Text>
   </Pressable>
   <Pressable accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy}
    onPress={()=>void shareDraft()} style={styles.primaryButton}>
    <Text style={styles.primaryText}>Compartir ficha</Text>
    <Ionicons name="arrow-up-outline" size={18} color="#FFFFFF"/>
   </Pressable>
  </View>
 </View>;

 return <View style={styles.wrapper}>
  <View style={styles.headingRow}>
   <Text style={styles.heading}>Servicios<Text style={{color:colors.accent}}>.</Text></Text>
   <View style={styles.smallSymbol}><Ionicons name="apps-outline" size={19} color={colors.accent}/></View>
  </View>
  <View style={styles.segmented} accessibilityRole="tablist">
   {([{id:"subscription",label:"En planes"},{id:"one_time",label:"Pago único"}] as const).map(item=>
    <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{selected:charge===item.id}}
     onPress={()=>setCharge(item.id)}
     style={[styles.segment,charge===item.id&&styles.segmentActive]}>
     <Text style={[styles.segmentText,charge===item.id&&styles.segmentTextActive]}>{item.label}</Text>
    </Pressable>)}
  </View>
  <View style={styles.grid}>
   {offersFor(charge).map(item=><OfferCard key={item.id} item={item}
    onPress={item.id==="google-business-profile"?()=>setEditing(true):undefined}/>)}
  </View>
 </View>;
}

const styles=StyleSheet.create({
 wrapper:{marginTop:25,paddingBottom:30},
 headingRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:15},
 heading:{fontSize:25,fontWeight:"900",letterSpacing:-1.1,color:colors.ink},
 smallSymbol:{width:37,height:37,borderRadius:13,backgroundColor:"#EEE3FF",justifyContent:"center",alignItems:"center"},
 segmented:{flexDirection:"row",backgroundColor:"#F1ECF9",borderRadius:17,padding:5,gap:5,marginBottom:14},
 segment:{flex:1,alignItems:"center",paddingVertical:12,borderRadius:13},
 segmentActive:{backgroundColor:"#FFFFFF",shadowColor:"#7C53AA",shadowOpacity:.08,shadowRadius:6,shadowOffset:{width:0,height:2}},
 segmentText:{fontWeight:"800",fontSize:13,color:"#847698"},
 segmentTextActive:{color:"#6541AD"},
 grid:{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between",rowGap:12},
 offerCard:{width:"48%",minHeight:158,borderRadius:22,padding:15,justifyContent:"space-between",overflow:"hidden"},
 offerIcon:{width:44,height:44,borderRadius:14,alignItems:"center",justifyContent:"center"},
 offerBottom:{gap:8},
 offerName:{color:colors.ink,fontSize:16,fontWeight:"900",letterSpacing:-.6},
 offerBadges:{flexDirection:"row",gap:6,flexWrap:"wrap",alignItems:"center"},
 offerBadge:{fontSize:10,fontWeight:"800",paddingHorizontal:8,paddingVertical:6,backgroundColor:"#FFFFFFBA",overflow:"hidden",borderRadius:9},
 offerState:{color:"#73667E",fontSize:10,fontWeight:"700"},
 offerArrow:{position:"absolute",right:14,top:17},
 back:{flexDirection:"row",alignItems:"center",gap:5,marginBottom:18},
 backText:{color:colors.accent,fontSize:14,fontWeight:"800"},
 formHead:{flexDirection:"row",gap:13,alignItems:"center",marginBottom:19},
 formIcon:{width:54,height:54,borderRadius:19,backgroundColor:"#DED0FF",alignItems:"center",justifyContent:"center"},
 formTitle:{fontSize:20,fontWeight:"900",letterSpacing:-.8,color:colors.ink,flexShrink:1},
 formChip:{fontSize:11,color:"#7D68A4",fontWeight:"700",marginTop:5},
 formCard:{backgroundColor:"#FFFFFF",borderColor:colors.line,borderWidth:1,borderRadius:23,padding:17},
 fieldWrap:{marginBottom:14},
 fieldLabel:{fontSize:12,fontWeight:"800",color:"#6B5789",marginBottom:8},
 input:{backgroundColor:colors.bg,color:colors.ink,borderRadius:13,borderWidth:1,borderColor:"#E6DAF2",minHeight:49,padding:12,fontSize:14},
 multiline:{minHeight:80,textAlignVertical:"top"},
 consent:{flexDirection:"row",alignItems:"center",gap:10,paddingVertical:13,marginTop:3},
 checkbox:{width:21,height:21,borderRadius:6,borderWidth:1.5,borderColor:"#9C87C3",alignItems:"center",justifyContent:"center"},
 checkboxActive:{backgroundColor:colors.accent,borderColor:colors.accent},
 consentText:{fontSize:13,fontWeight:"700",color:colors.ink,flex:1},
 primaryButton:{borderRadius:15,backgroundColor:colors.accent,flexDirection:"row",gap:9,justifyContent:"center",alignItems:"center",padding:16,marginTop:9},
 primaryText:{color:"#FFFFFF",fontWeight:"900",fontSize:14},
 secondaryButton:{borderRadius:15,borderColor:"#E8DDF6",borderWidth:1,flexDirection:"row",gap:8,justifyContent:"center",alignItems:"center",padding:15,marginTop:10},
 secondaryText:{color:colors.accent,fontWeight:"800",fontSize:13}
});
