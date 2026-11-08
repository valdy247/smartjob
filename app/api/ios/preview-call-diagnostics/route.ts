import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 if(process.env.VERCEL_ENV!=="preview")return NextResponse.json({error:"not_found"},{status:404});
 const sid=process.env.TWILIO_ACCOUNT_SID||"", token=process.env.TWILIO_AUTH_TOKEN||"";
 if(!/^AC[a-f\d]{32}$/i.test(sid)||!token)return NextResponse.json({error:"missing_config"},{status:503});
 const calls=[["inbound","CAd67df931bfcc277f51adb2c09b1933ef"],["outbound","CA5caa248519f6788608395926ba76a206"]];
 const auth="Basic "+Buffer.from(sid+":"+token).toString("base64");
 const output=[];
 for(const [leg,call] of calls){
  const base="https://api.twilio.com/2010-04-01/Accounts/"+sid+"/Calls/"+call;
  const row:{leg:string;callStatus?:string;duration?:string|null;http?:number;notifications?:unknown;events?:unknown}={leg};
  try{
   const callRes=await fetch(base+".json",{headers:{Authorization:auth},cache:"no-store",signal:AbortSignal.timeout(8000)});
   row.http=callRes.status;
   if(callRes.ok){const j=await callRes.json();row.callStatus=j.status;row.duration=j.duration;}
   const notRes=await fetch(base+"/Notifications.json",{headers:{Authorization:auth},cache:"no-store",signal:AbortSignal.timeout(8000)});
   if(notRes.ok){const j=await notRes.json();row.notifications=(j.notifications||[]).slice(0,12).map((n:{error_code?:string;message_text?:string})=>({code:n.error_code,message:String(n.message_text||"").slice(0,100)}));}else row.notifications="http_"+notRes.status;
   const evRes=await fetch(base+"/Events.json",{headers:{Authorization:auth},cache:"no-store",signal:AbortSignal.timeout(8000)});
   if(evRes.ok){const j=await evRes.json();row.events=(j.events||[]).slice(0,12).map((e:{event_type?:string;request?:{url?:string;method?:string};response?:{response_code?:number}})=>({type:e.event_type,requestPath:e.request?.url?new URL(e.request.url).pathname:null,code:e.response?.response_code}));}else row.events="http_"+evRes.status;
  }catch(e){row.events=e instanceof Error?e.name:"fetch_failed";}
  output.push(row);
 }
 return NextResponse.json({output},{headers:{"Cache-Control":"no-store"}});
}
