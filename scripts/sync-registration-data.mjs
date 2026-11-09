#!/usr/bin/env node
/**
 * VMV signup reference catalog: O*NET 31.0 occupational titles (U.S.)
 * and U.S. Census Bureau 2026 Gazetteer populated places.
 * No external API keys required; generated static JSON is served by Next.js.
 * Sources:
 * https://www.onetcenter.org/dl_files/database/db_31_0_json/occupation_data.json
 * https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_place_national.zip
 */
import {mkdir,writeFile} from "node:fs/promises";
import {inflateRawSync} from "node:zlib";
import path from "node:path";
const output=path.resolve("public/vmv-data");
const sourceOccupations="https://www.onetcenter.org/dl_files/database/db_31_0_json/occupation_data.json";
const sourcePlaces="https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_place_national.zip";

async function retrieve(url){
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),25000);
 try {
  const response=await fetch(url,{signal:controller.signal,headers:{"User-Agent":"VMVCall-RegistrationCatalog/1.0"}});
  if(!response.ok)throw Error("Catalog download failed "+response.status);
  return Buffer.from(await response.arrayBuffer());
 } finally { clearTimeout(timeout); }
}
function extractFirstZipEntry(buf){
 if(buf.readUInt32LE(0)!==0x04034b50)throw Error("Invalid Census ZIP header");
 const method=buf.readUInt16LE(8),compressed=buf.readUInt32LE(18);
 const nameLength=buf.readUInt16LE(26),extraLength=buf.readUInt16LE(28);
 // Census Gazetteer ZIP stores a single deflated text file without data descriptors.
 if(method!==8||!compressed||compressed>16_000_000)throw Error("Unsupported Census ZIP encoding");
 const offset=30+nameLength+extraLength;
 if(offset+compressed>buf.length)throw Error("Invalid ZIP bounds");
 return inflateRawSync(buf.subarray(offset,offset+compressed)).toString("utf8").replace(/^\uFEFF/,"");
}
function csvCell(value){return value.replace(/^\s*["']|["']\s*$/g,"").trim();}
function removeType(value){return value.replace(/\s+(?:CDP|city|town|village|borough|municipality|urban county)$/i,"").trim();}
async function sync(){
 await mkdir(output,{recursive:true});
 const occupations=JSON.parse((await retrieve(sourceOccupations)).toString("utf8")).row;
 if(!Array.isArray(occupations)||occupations.length<950)throw Error("Incomplete O*NET catalog");
 const jobs=occupations.map(row=>({code:String(row.onetsoc_code),title:String(row.title)}))
 .filter(row=>/^\d{2}-\d{4}\.\d{2}$/.test(row.code)&&row.title.length>1)
 .sort((a,b)=>a.title.localeCompare(b.title,"en"));
 await writeFile(path.join(output,"occupations.json"),JSON.stringify(jobs),"utf8");
 const data=extractFirstZipEntry(await retrieve(sourcePlaces));
 const [header,...rows]=data.split(/\r?\n/);
 const index=header.split("|");
 const nameIndex=index.indexOf("NAME"),stateIndex=index.indexOf("USPS");
 if(nameIndex<0||stateIndex<0||rows.length<30000)throw Error("Incomplete Census places");
 const statePlaces=new Map();
 for(const row of rows){
  if(!row.trim())continue;
  const parts=row.split("|");const state=csvCell(parts[stateIndex]||"");
  const place=removeType(csvCell(parts[nameIndex]||""));
  if(!/^[A-Z]{2}$/.test(state)||!place)continue;
  if(!statePlaces.has(state))statePlaces.set(state,new Set());
  statePlaces.get(state).add(place);
 }
 let count=0;
 for(const [state,places] of statePlaces){
  const sorted=[...places].sort((a,b)=>a.localeCompare(b,"en"));
  count+=sorted.length;
  await writeFile(path.join(output,"places-"+state+".json"),JSON.stringify(sorted),"utf8");
 }
 if(count<30000||statePlaces.size<50)throw Error("Incomplete Census places");
 await writeFile(path.join(output,"catalog.json"),JSON.stringify({occupations:jobs.length,places:count,states:statePlaces.size,source:"O*NET 31.0 / Census Gazetteer 2026"}),"utf8");
 console.log("VMV catalog ready:",jobs.length,"occupations,",count,"places across",statePlaces.size,"states/territories.");
}
sync().catch(error=>{console.error("VMV catalog sync:",error.message);process.exit(1)});
