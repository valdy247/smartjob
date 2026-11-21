import {INTERFACE_LANGUAGE_METADATA_KEY as ACCOUNT_LANGUAGE_KEY,interfaceLanguage,visitorLanguage,type InterfaceLanguage as Language} from "./i18n";
const isLanguage=(value:unknown):value is Language=>interfaceLanguage(value)!==null;
const resolveLanguage=(account:unknown,local:unknown,locale:string)=>interfaceLanguage(account)||visitorLanguage(local,locale);
type User={id:string;user_metadata?:Record<string,unknown>};
type Result={data:{user:User|null};error:unknown};
export type LanguageAuth={
 getUser:()=>Promise<Result>;
 updateUser:(attributes:{data:Record<string,unknown>})=>Promise<Result>;
};
type Storage={read:()=>Promise<string|null>;write:(language:Language)=>Promise<void>};
export type LanguageState={language:Language;ready:boolean;saving:boolean;error:"load"|"save"|null};
/** One controller shared by the web and native adapters; no database migration or elevated credentials. */
export class LanguagePreference {
 private state:LanguageState={language:"en",ready:false,saving:false,error:null};
 private listeners=new Set<()=>void>();
 private version=0;
 private cachePending:Promise<void>=Promise.resolve();
 private userId:string|null=null;
 private pending:Promise<void>=Promise.resolve();
 constructor(private auth:LanguageAuth|null,private storage:Storage,private locale:string){}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private publish(patch:Partial<LanguageState>){this.state={...this.state,...patch};this.listeners.forEach(fn=>fn());}
 private async cache(language:Language){
  this.cachePending=this.cachePending.then(async()=>{try{await this.storage.write(language);}catch{/* Account remains the source of truth if local storage is unavailable. */}});
  await this.cachePending;
 }
 accountChanged(userId:string|null){
  if(userId!==this.userId){++this.version;this.publish({ready:false,saving:false,error:null});}
 }
 async refresh(){
  // Do not re-read stale account metadata in the middle of an explicit user choice.
  // SIGNED_OUT and accountChanged still invalidate that choice independently.
  if(this.state.saving)return;
  const version=++this.version;
  this.publish({saving:false});
  let local:string|null=null;
  try{local=await this.storage.read();}catch{}
  try{
   const result=this.auth?await this.auth.getUser():null;
   if(version!==this.version)return;
   // A missing session is normal for visitors; a failed account lookup is not.
   if(result?.error&&!(typeof result.error==="object"&&result.error!==null&&"name" in result.error&&result.error.name==="AuthSessionMissingError"))throw result.error;
   const user=result?.data.user;
   this.userId=user?.id||null;
   const account=user?.user_metadata?.[ACCOUNT_LANGUAGE_KEY];
   const language=resolveLanguage(account,local,this.locale);
   this.publish({language,ready:true,error:null});
   await this.cache(language);
   // Seed only missing preferences, using a second fresh read before writing.
   if(user&&!isLanguage(account))await this.save(language,version,true);
  }catch{
   if(version===this.version)this.publish({ready:false,error:"load"});
  }
 }
 async choose(language:Language){
  if(!isLanguage(language))return;
  const version=++this.version;
  this.publish({language,ready:true,error:null,saving:!!(this.auth&&this.userId)});
  await this.cache(language);
  await this.save(language,version,false);
 }
 private async save(language:Language,version:number,onlyMissing:boolean){
  if(!this.auth||!this.userId)return;
  const owner=this.userId;
  this.publish({saving:true});
  const task=this.pending.then(async()=>{
   if(version!==this.version||owner!==this.userId)return;
   try{
    const {data,error}=await this.auth!.getUser();
    if(error||data.user?.id!==owner)throw error||new Error("Account changed");
    if(version!==this.version)return;
    const existing=data.user.user_metadata?.[ACCOUNT_LANGUAGE_KEY];
    if(onlyMissing&&isLanguage(existing)){
     this.publish({language:existing});await this.cache(existing);return;
    }
    const result=await this.auth!.updateUser({data:{[ACCOUNT_LANGUAGE_KEY]:language}});
    if(result.error)throw result.error;
   }catch{if(version===this.version)this.publish({error:"save"});}
  });
  this.pending=task.catch(()=>{});
  await task;
  if(version===this.version)this.publish({saving:false});
 }
 /** Auth events must call this outside the Supabase auth lock. */
 async signedOut(){this.userId=null;++this.version;this.publish({saving:false,error:null});await this.refresh();}
}
