import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
// Pilot audio synthesis is disabled because there is no subscriber quota.
export async function GET(){return NextResponse.json({error:"legacy_pilot_disabled"},{status:403,headers:{"Cache-Control":"no-store"}});}
