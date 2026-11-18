import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {adsMetaReady,activeMeta,authorizedAccounts,metaPost,noCache} from "@/lib/vmv-marketing-ads-meta";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 if(!adsMetaReady())return NextResponse.json({error:"meta_not_configured"},{status:503,headers:noCache});
 const owner=await authenticatedUser(req);
 if(!owner)return NextResponse.json({error:"unauthorized"},{status:401,headers:noCache});
 try{
  const active=await activeMeta(owner);
  const accountId=active?.connection.selected_ad_account_id;
  if(!active||!accountId)return NextResponse.json({error:"account_selection_required"},{status:409,headers:noCache});
  const accounts=await authorizedAccounts(active.token);
  if(!accounts.some(a=>a.id===accountId&&a.status===1&&a.currency==="USD"))
   return NextResponse.json({error:"account_not_authorized"},{status:403,headers:noCache});
  const form=await req.formData();
  const file=form.get("image");
  if(!(file instanceof File)||!["image/png","image/jpeg"].includes(file.type)||
     file.size<1024||file.size>3*1024*1024)
   return NextResponse.json({error:"invalid_image_use_jpg_png_under_3mb"},{status:400,headers:noCache});
  const buffer=Buffer.from(await file.arrayBuffer());
  const png=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg=buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff;
  if(!(file.type==="image/png"&&png||file.type==="image/jpeg"&&jpg))
   return NextResponse.json({error:"image_content_invalid"},{status:400,headers:noCache});
  const result=await metaPost(accountId+"/adimages",active.token,{bytes:buffer.toString("base64")});
  const hashes=Object.values(result.images||{}) as Array<{hash?:string}>;
  const hash=hashes.find(x=>typeof x?.hash==="string")?.hash;
  if(!hash||!/^[a-f0-9]{32}$/i.test(hash))throw Error("image_upload_failed");
  return NextResponse.json({imageHash:hash},{headers:noCache});
 }catch{return NextResponse.json({error:"image_upload_unavailable_check_meta_permissions"},{status:502,headers:noCache});}
}
