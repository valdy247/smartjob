import React,{useRef,useState} from "react";
import {ActivityIndicator,Linking,Pressable,StyleSheet,Text,View} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import WebView,{type WebViewNavigation} from "react-native-webview";

/**
 * Private iPhone beta: present the exact responsive VMV Business Preview,
 * without a fake iPhone frame or an external browser.
 *
 * Web and native authentication are deliberately separate. Do NOT inject
 * Supabase access/refresh tokens, cookies, credentials or user information
 * into URLs or into the page. WebView uses an ephemeral session so signing
 * out of the native account cannot expose another person's web workspace.
 *
 * This component does not modify Twilio, phone routing or call permissions.
 * Native CallKit remains owned by App.tsx and stays mounted behind this view.
 */
const DEFAULT_PREVIEW="https://smartjob-n60sd49pz-valdys-projects-b97fc7a6.vercel.app";
const supplied=process.env.EXPO_PUBLIC_VMV_BETA_WEB_URL||DEFAULT_PREVIEW;
function validPreviewOrigin(raw:string):string|null {
 try {
  const parsed=new URL(raw);
  // Only this project's Vercel Preview deployment (or branch alias).
  if(parsed.protocol!=="https:"||parsed.username||parsed.password||
    parsed.port||parsed.search||parsed.hash||parsed.pathname!=="/")return null;
  if(!/^smartjob-[a-z0-9-]+\.vercel\.app$/i.test(parsed.hostname)||
     !parsed.hostname.endsWith("-valdys-projects-b97fc7a6.vercel.app"))return null;
  return parsed.origin;
 }catch{return null;}
}
const origin=validPreviewOrigin(supplied);
const startUrl=origin?origin+"/vista-app":null;

export function PreviewWorkspace({onOpenNative}:{onOpenNative:()=>void}){
 const web=useRef<WebView>(null);
 const [loading,setLoading]=useState(true);
 const [failed,setFailed]=useState(false);
 const [canGoBack,setCanGoBack]=useState(false);
 const [showControls,setShowControls]=useState(false);

 function openExternal(url:string){
  if(!/^https:\/\//i.test(url)&&!/^mailto:/i.test(url)&&!/^tel:/i.test(url))return;
  void Linking.openURL(url).catch(()=>{setFailed(true);});
 }
 function allowNavigation(request:{url:string}){
  if(request.url==="about:blank")return true;
  try{
   const target=new URL(request.url);
   if(origin&&target.origin===origin)return true;
  }catch{/* Unknown schemes never execute inside the WebView. */}
  openExternal(request.url);
  return false;
 }

 if(!startUrl)return <View style={styles.failure}>
   <Text style={styles.failureTitle}>Preview no configurado</Text>
   <Text style={styles.failureText}>Revisa la dirección HTTPS de VMV.</Text>
   <Pressable style={styles.fallback} onPress={onOpenNative}>
    <Text style={styles.fallbackText}>Abrir versión nativa</Text>
   </Pressable>
  </View>;

 return <View style={styles.root}>
  <WebView
   ref={web}
   source={{uri:startUrl}}
   style={styles.web}
   originWhitelist={["https://*"]}
   javaScriptEnabled
   domStorageEnabled
   sharedCookiesEnabled={false}
   thirdPartyCookiesEnabled={false}
   incognito
   allowsBackForwardNavigationGestures
   startInLoadingState
   onLoadStart={()=>{setFailed(false);setLoading(true);}}
   onLoadEnd={()=>setLoading(false)}
   onNavigationStateChange={(state:WebViewNavigation)=>setCanGoBack(state.canGoBack)}
   onShouldStartLoadWithRequest={allowNavigation}
   onError={()=>{setFailed(true);setLoading(false);}}
   onContentProcessDidTerminate={()=>{setFailed(true);setLoading(false);}}
   renderLoading={()=><View style={styles.loading}><ActivityIndicator size="large" color="#8754DA"/></View>}
  />
  {failed?<View style={styles.errorPanel}>
   <Text style={styles.failureTitle}>No se pudo cargar VMV.</Text>
   <Text style={styles.failureText}>Comprueba la conexión y vuelve a intentarlo.</Text>
   <Pressable style={styles.retry} onPress={()=>{setFailed(false);web.current?.reload();}}>
    <Text style={styles.retryText}>Reintentar</Text>
   </Pressable>
   <Pressable onPress={onOpenNative} style={styles.textButton}>
    <Text style={styles.textButtonText}>Abrir versión nativa</Text>
   </Pressable>
  </View>:null}
  {!failed?<View pointerEvents="box-none" style={styles.tools}>
   {showControls?<View style={styles.toolbox}>
    <Pressable accessibilityRole="button" accessibilityLabel="Volver en el Preview"
     disabled={!canGoBack} style={styles.toolButton}
     onPress={()=>web.current?.goBack()}>
     <Ionicons name="arrow-back" size={19} color={canGoBack?"#653BA8":"#B7A8C7"}/>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Recargar Preview"
     style={styles.toolButton} onPress={()=>web.current?.reload()}>
     <Ionicons name="refresh" size={19} color="#653BA8"/>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Abrir controles nativos de iPhone"
     style={styles.nativeButton} onPress={onOpenNative}>
     <Ionicons name="phone-portrait-outline" size={18} color="#FFFFFF"/>
     <Text style={styles.nativeButtonText}>Nativo</Text>
    </Pressable>
   </View>:null}
   <Pressable accessibilityRole="button" accessibilityLabel={showControls?"Ocultar herramientas":"Herramientas de la beta"}
    onPress={()=>setShowControls(x=>!x)} style={styles.fab}>
    <Ionicons name={showControls?"close":"ellipsis-horizontal"} size={20} color="#6641A1"/>
   </Pressable>
  </View>:null}
 </View>;
}

const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:"#FDFCFF"},
 web:{flex:1,backgroundColor:"#FDFCFF"},
 loading:{flex:1,alignItems:"center",justifyContent:"center",backgroundColor:"#FDFCFF"},
 tools:{position:"absolute",right:11,bottom:15,alignItems:"flex-end",gap:8},
 fab:{width:39,height:39,borderRadius:20,backgroundColor:"#FFFFFFE8",borderWidth:1,borderColor:"#E4D6F6",
  alignItems:"center",justifyContent:"center",shadowColor:"#4D297E",shadowOpacity:.1,shadowRadius:8,
  shadowOffset:{width:0,height:3},elevation:3},
 toolbox:{flexDirection:"row",alignItems:"center",padding:5,borderRadius:16,gap:5,backgroundColor:"#FFFFFFF5",
  borderColor:"#E8E0F2",borderWidth:1},
 toolButton:{width:39,height:39,borderRadius:11,alignItems:"center",justifyContent:"center"},
 nativeButton:{height:39,borderRadius:11,paddingHorizontal:11,backgroundColor:"#8754DA",
  flexDirection:"row",alignItems:"center",justifyContent:"center",gap:5},
 nativeButtonText:{color:"#FFFFFF",fontSize:12,fontWeight:"800"},
 errorPanel:{position:"absolute",top:0,right:0,bottom:0,left:0,
  justifyContent:"center",alignItems:"center",padding:24,backgroundColor:"#FDFCFF"},
 failure:{flex:1,justifyContent:"center",alignItems:"center",padding:24,backgroundColor:"#FDFCFF"},
 failureTitle:{fontSize:20,fontWeight:"900",color:"#291D40",textAlign:"center"},
 failureText:{fontSize:13,color:"#7D7090",textAlign:"center",marginTop:9,marginBottom:17},
 retry:{borderRadius:14,backgroundColor:"#8754DA",paddingHorizontal:20,paddingVertical:13},
 retryText:{fontWeight:"900",color:"#FFFFFF"},
 textButton:{paddingVertical:15,paddingHorizontal:20},
 textButtonText:{fontSize:12,fontWeight:"700",color:"#6E4BA7"},
 fallback:{borderRadius:14,backgroundColor:"#8754DA",paddingHorizontal:20,paddingVertical:13},
 fallbackText:{color:"#FFFFFF",fontWeight:"800"},
});
