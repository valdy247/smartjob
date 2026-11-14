/** Normalize user-entered website addresses; does not authorize fetching them. */
export function websiteAddress(input:string):string|null{
 const raw=input.trim();if(!raw)return null;
 if(/\s/.test(raw)||raw.startsWith("//")||(/^[a-z][a-z0-9+.-]*:/i.test(raw)&&!/^https?:\/\//i.test(raw)))return null;
 try{
  const url=new URL(/^https?:\/\//i.test(raw)?raw:"https://"+raw);
  if(!["https:","http:"].includes(url.protocol)||!url.hostname.includes(".")||url.username||url.password)return null;
  return url.toString();
 }catch{return null;}
}
