import type {CSSProperties,ReactNode} from "react";
import {safeWebImageUrl} from "./web-services-site";
import {SOCIAL_PLATFORMS,normalizeSocialLinks} from "./web-builder-social";

export function websiteVisualStyle(palette:unknown,accentColor:unknown,secondaryColor?:unknown,tertiaryColor?:unknown):CSSProperties{
 const colors:Record<string,[string,string]>={
  violet:["#8e5de4","#f0e9fd"],mint:["#198d74","#e5f8f0"],
  amber:["#a97b26","#fff4d8"],ink:["#30283a","#eae8ed"],
  rose:["#b64b70","#fff0f4"],forest:["#367457","#e9f4eb"],
  ocean:["#267a9c","#e8f6fb"],terracotta:["#af6242","#fbede2"],
  charcoal:["#24232b","#efedf2"]
 };
 const [accent,pale]=colors[String(palette)]||colors.violet;
 const secondary=typeof secondaryColor==="string"&&/^#[0-9a-f]{6}$/i.test(secondaryColor)?secondaryColor:null;
 const tertiary=typeof tertiaryColor==="string"&&/^#[0-9a-f]{6}$/i.test(tertiaryColor)?tertiaryColor:null;
 return {"--vmv-accent":typeof accentColor==="string"&&/^#[0-9a-f]{6}$/i.test(accentColor)?
  accentColor:accent,"--vmv-pale":secondary?`color-mix(in srgb, ${secondary} 14%, white)`:pale,
  "--vmv-secondary":secondary||pale,"--vmv-tertiary":tertiary||accent} as CSSProperties;
}
export type WebsiteMenuItem={page_slug:string;title:string};
export function WebsiteChrome({siteName,baseUrl,menu,logo,family,language="es",siteStyle="light",siteWidth="regular",font="modern",socialLinks,visualStyle,children}:{
 siteName:string;baseUrl:string;menu:WebsiteMenuItem[];logo?:string|null;family:string;
 language?:"es"|"en";siteStyle?:string;siteWidth?:string;font?:string;socialLinks?:unknown;visualStyle?:CSSProperties;children:ReactNode
}){
 const safeLogo=logo?safeWebImageUrl(logo):null;
 const social=normalizeSocialLinks(socialLinks);
 const activeSocial=SOCIAL_PLATFORMS.filter(p=>Boolean(social[p.id]));
 const families:Record<string,string>={modern:'ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif',editorial:'Georgia,"Times New Roman",serif',rounded:'"Trebuchet MS",ui-sans-serif,system-ui,sans-serif',geometric:'"Avenir Next",Montserrat,ui-sans-serif,system-ui,sans-serif'};
 return <div lang={language} className="vmv-site" data-site-family={family}
  data-site-style={siteStyle} data-site-width={siteWidth} style={{...visualStyle,fontFamily:families[font]||families.modern}}>
  <header className="vmv-site-nav" data-header-family={family}>
   <a className="vmv-site-mark" href={baseUrl||"/"}>
    {safeLogo?<img src={safeLogo} width={52} height={52} alt={"Logo de "+siteName}/>:null}
    <span className="vmv-site-brand-name">{siteName}<span>.</span></span>
   </a>
   <nav aria-label="Páginas del sitio">
    {menu.map(item=><a key={item.page_slug}
     href={item.page_slug==="home"?(baseUrl||"/"):(baseUrl+"/"+item.page_slug)}>
     {item.page_slug==="home"?(language==="en"?"Home":"Inicio"):item.title}
    </a>)}
   </nav>
  </header>
  <main>{children}</main>
  <footer className="vmv-site-footer">
   <span>{siteName}</span>
   {activeSocial.length?<nav className="vmv-social-links" aria-label={language==="en"?"Social media":"Redes sociales"}>
    {activeSocial.map(p=><a key={p.id} href={social[p.id]} target="_blank" rel="noopener noreferrer"
     aria-label={(language==="en"?"Our ":"Nuestro perfil en ")+p.label}>{p.label}</a>)}
   </nav>:null}
   <span>© {new Date().getUTCFullYear()}</span>
  </footer>
 </div>;
}
