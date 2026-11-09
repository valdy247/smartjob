import {response,smsReady} from "@/lib/signup-phone";
export const runtime="nodejs";export const dynamic="force-dynamic";
export function GET(){return response({available:smsReady()});}
