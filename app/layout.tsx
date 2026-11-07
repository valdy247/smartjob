import "./globals.css";
import type { Metadata, Viewport } from "next";
export const metadata: Metadata = { title:"Smart Job | Tu idioma. Tu trabajo. Sin límites.", description:"Asistente profesional que interpreta en vivo, ayuda con clientes y prepara cotizaciones con contexto." };
export const viewport: Viewport = { width:"device-width", initialScale:1, viewportFit:"cover", themeColor:"#0b1016" };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="es"><body>{children}</body></html>;
}
