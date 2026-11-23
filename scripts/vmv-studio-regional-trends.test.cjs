const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");
const read=p=>fs.readFileSync(p,"utf8");
const source=read("app/api/video-studio/trends/route.ts");
const ui=read("app/vista-app/video-studio/page.tsx");
const plan=read("app/api/video-studio/plan/route.ts");
const countries=read("lib/vmv-studio-countries.ts");

function regionalRequest(country,language="en",invalidRegion=false){
 const scanned=[];
 const fetched=[];
 const id="11111111-1111-4111-8111-111111111111";
 const videos=[1,2,3,4].map(i=>({
  id:"abcdefghij"+i,thumbnail:"https://example.com/"+i+".jpg",
  title:"Video "+i,url:"https://www.youtube.com/watch?v=abcdefghij"+i,channel:"Creator",
  description:"Trending",views:1000+i
 }));
 const current={id,owner_id:"owner",query:"Tecnología [region:"+country+"]",
  status:"ready",results:videos,failure_code:null};
 const db={
  rpc:async(name,args)=>{scanned.push({name,args});return {data:{id,reused:false},error:null};},
  from:()=>({
   update:()=>({
    eq(){return this;},
    select(){return this;},
    async single(){return {data:current,error:null};}
   })
  })
 };
 const requireMock=name=>{
  if(name==="next/server")return {NextResponse:{json:(body,{status=200}={})=>({body,status})}};
  if(name==="@/lib/auth-server")return {authenticatedUser:async()=>"owner"};
  if(name==="@/lib/vmv-video-generator")return {videoDb:()=>db,validUuid:x=>x===id};
  if(name==="@/lib/vmv-video-radar")return {
   cleanRadarQuery:x=>typeof x==="string"&&x.length>=3?x:null,
   videoToRadar:x=>({id:x.id,url:"https://www.youtube.com/watch?v="+x.id,title:x.snippet.title,
    description:"Public metadata",thumbnail:"https://example.com/thumb.jpg",channel:"Creator",views:Number(x.statistics.viewCount)})
  };
  if(name==="@/lib/vmv-studio-countries")return {isVideoStudioCountry:x=>/^[A-Z]{2}$/.test(x)};
  throw Error("Unexpected import: "+name);
 };
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 const context={module:mod,exports:mod.exports,require:requireMock,
  process:{env:{YOUTUBE_DATA_API_KEY:"mock-provider-key"}},URL,URLSearchParams,AbortSignal,
  Date,console,fetch:async(url)=>{
   const requestUrl=new URL(url);fetched.push(requestUrl);
   if(invalidRegion)return {ok:false,status:400,json:async()=>({error:{errors:[{reason:"invalidRegionCode"}]}})};
   return {ok:true,status:200,json:async()=>({
    items:videos.map(v=>({id:v.id,snippet:{title:v.title},statistics:{viewCount:v.views}}))
   })};
  }};
 vm.runInNewContext(code,context,{timeout:5000});
 const url="https://preview.local/api/video-studio/trends?q=Tecnolog%C3%ADa&country="+country+
  "&language="+language;
 return {scanned,fetched,invoke:()=>mod.exports.GET({
  headers:{get:n=>n==="x-vmv-youtube-consent"?"accepted":null},
  nextUrl:{searchParams:new URL(url).searchParams}
 })};
}
test("country chart is real regional popularity, not global or language-filtered search",async()=>{
 const flow=regionalRequest("MX","ja");
 const response=await flow.invoke();
 assert.equal(response.status,200);
 assert.equal(response.body.scan.country,"MX");
 assert.equal(response.body.scan.items.length,3);
 assert.equal(flow.fetched.length,1);
 const query=flow.fetched[0].searchParams;
 assert.equal(flow.fetched[0].pathname,"/youtube/v3/videos");
 assert.equal(query.get("chart"),"mostPopular");
 assert.equal(query.get("regionCode"),"MX");
 assert.equal(query.get("videoCategoryId"),"28");
 assert.equal(query.has("relevanceLanguage"),false);
 assert.equal(query.has("language"),false);
 assert.equal(query.has("hl"),false);
 assert.equal(flow.scanned[0].args.p_query,"Tecnología [region:MX]");
});
test("trend search never couples its cache or its country to a language selector",async()=>{
 const french=regionalRequest("FR","fr");
 const spanish=regionalRequest("FR","es");
 await french.invoke();await spanish.invoke();
 assert.equal(french.scanned[0].args.p_query,spanish.scanned[0].args.p_query);
 assert.equal(french.fetched[0].searchParams.get("regionCode"),"FR");
 assert.equal(spanish.fetched[0].searchParams.get("regionCode"),"FR");
 assert.equal(french.fetched[0].searchParams.has("relevanceLanguage"),false);
 assert.equal(spanish.fetched[0].searchParams.has("relevanceLanguage"),false);
});
test("unsupported country returns a regional error and never falls back to worldwide results",async()=>{
 const request=regionalRequest("AQ","es",true);
 const response=await request.invoke();
 assert.equal(response.status,422);
 assert.equal(response.body.error,"studio_country_unavailable");
 assert.ok(request.fetched.length>=1);
 assert.ok(request.fetched.every(u=>u.searchParams.get("regionCode")==="AQ"));
});
test("wizard locale controls idea and narration, regardless of country or original language",()=>{
 assert.match(ui,/source:chosenTrend\?\{platform,sourceId:chosenTrend\.sourceId,title:chosenTrend\.title,url:chosenTrend\.url,country:trendCountry\}:null/);
 assert.match(ui,/style:visual,seconds,language/);
 assert.doesNotMatch(ui,/trendLanguage/);
 assert.match(plan,/pilotLanguageName\(language\)/);
 assert.match(plan,/ONLY language governing the proposed idea/);
 assert.match(plan,/Never infer or change the writing language from the selected country/);
 assert.match(plan,/Use an incoming trend title in any language only as thematic inspiration/);
 assert.match(countries,/VIDEO_STUDIO_COUNTRY_CODES/);
 assert.match(countries,/Intl\.DisplayNames/);
});
