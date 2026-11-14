import "./globals.css";
import "./vmv-mint.css";
import type {Metadata,Viewport} from "next";
import {cookies,headers} from "next/headers";
import {InterfaceLanguageProvider} from "@/lib/i18n-web";
import {t,visitorLanguage,type InterfaceLanguage} from "@/lib/i18n";

async function requestLanguage():Promise<InterfaceLanguage>{
 const selected=(await cookies()).get("vmv_ui_language")?.value;
 const device=(await headers()).get("accept-language")?.split(",")[0]||"";
 return visitorLanguage(selected,device);
}
export async function generateMetadata():Promise<Metadata>{
 const language=await requestLanguage();
 return {title:t(language,"meta.title"),description:t(language,"meta.description")};
}
export const viewport:Viewport={width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#f8fbfa"};
export default async function RootLayout({children}:{children:React.ReactNode}){
 const language=await requestLanguage();
 return <html lang={language} suppressHydrationWarning><body><InterfaceLanguageProvider>{children}</InterfaceLanguageProvider></body></html>;
}
