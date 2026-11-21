export const SOCIAL_PLATFORMS=[
 {id:"instagram",label:"Instagram",placeholder:"https://www.instagram.com/tu_negocio/"},
 {id:"facebook",label:"Facebook",placeholder:"https://www.facebook.com/tu_negocio"},
 {id:"tiktok",label:"TikTok",placeholder:"https://www.tiktok.com/@tu_negocio"},
 {id:"youtube",label:"YouTube",placeholder:"https://www.youtube.com/@tu_negocio"}
] as const;
export type SocialPlatform=(typeof SOCIAL_PLATFORMS)[number]["id"];
export type BusinessSocialLinks=Record<SocialPlatform,string>;
export const EMPTY_SOCIAL_LINKS:BusinessSocialLinks={instagram:"",facebook:"",tiktok:"",youtube:""};
const allowedHosts:Record<SocialPlatform,readonly string[]>={
 instagram:["instagram.com","www.instagram.com"],
 facebook:["facebook.com","www.facebook.com","m.facebook.com","fb.com","www.fb.com"],
 tiktok:["tiktok.com","www.tiktok.com","m.tiktok.com","vm.tiktok.com","vt.tiktok.com"],
 youtube:["youtube.com","www.youtube.com","m.youtube.com"]
};
export function normalizeSocialUrl(value:unknown,platform:SocialPlatform):string{
 if(typeof value!=="string")return "";
 const trimmed=value.trim();
 if(!trimmed||trimmed.length>500)return "";
 // People usually paste a full copied profile URL; no arbitrary schemes or redirects.
 const candidate=/^https?:\/\//i.test(trimmed)?trimmed:"https://"+trimmed;
 try{
  const parsed=new URL(candidate);
  if(parsed.protocol!=="https:"||parsed.username||parsed.password||
   !allowedHosts[platform].includes(parsed.hostname.toLowerCase())||parsed.port)return "";
  if(parsed.pathname==="/"&&!parsed.search)return "";
  parsed.hash="";
  return parsed.href.slice(0,500);
 }catch{return "";}
}
export function normalizeSocialLinks(value:unknown):BusinessSocialLinks{
 const data=value&&typeof value==="object"&&!Array.isArray(value)?
  value as Record<string,unknown>:{};
 return {
  instagram:normalizeSocialUrl(data.instagram,"instagram"),
  facebook:normalizeSocialUrl(data.facebook,"facebook"),
  tiktok:normalizeSocialUrl(data.tiktok,"tiktok"),
  youtube:normalizeSocialUrl(data.youtube,"youtube")
 };
}
export function socialLinksAreEmpty(value:BusinessSocialLinks):boolean{
 return !SOCIAL_PLATFORMS.some(p=>Boolean(value[p.id]));
}
