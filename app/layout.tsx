import "./globals.css";
import "./vmv-mint.css";
import type { Metadata, Viewport } from "next";
export const metadata: Metadata = { title:"VMV Call | Habla sin fronteras.", description:"Traducción de llamadas y conversaciones en dos idiomas con IA." };
export const viewport: Viewport = { width:"device-width", initialScale:1, viewportFit:"cover", themeColor:"#f8fbfa" };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="es"><body>{children}</body></html>;
}
