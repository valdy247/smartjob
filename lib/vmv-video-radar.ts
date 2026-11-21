/** YouTube Radar: evidence-based public-metadata analysis, not a full video/retention audit. */
export type RadarVideo={
 id:string;url:string;title:string;channel:string;channelId:string;publishedAt:string;
 thumbnail:string;description:string;views:number;likes:number|null;comments:number|null;
 averageViewsPerDay:number;engagementPercent:number|null;signalScore:number;
};
export type RadarIdea={sourceId:string;hook:string;concept:string;cta:string;reason:string};
export const validRadarId=(id:unknown):id is string=>typeof id==="string"&&/^[a-zA-Z0-9_-]{11}$/.test(id);
export const cleanRadarQuery=(input:unknown):string|null=>{
 if(typeof input!=="string")return null;
 const q=input.trim().replace(/\s+/g," ");
 if(q.length<3||q.length>90||/[<>\x00-\x1f]/.test(q))return null;
 return q;
};
export const clampNonnegative=(n:unknown):number=>{
 const result=Number(n);
 return Number.isFinite(result)&&result>=0?Math.min(Math.floor(result),1e14):0;
};
export const radarMetrics=(views:number,likes:number|null,comments:number|null,publishedAt:string,now=Date.now())=>{
 const ageDays=Math.max(1,(now-new Date(publishedAt).getTime())/86400000);
 const averageViewsPerDay=Math.round(views/ageDays);
 const engagementPercent=views>0&&(likes!==null||comments!==null)?
  Math.round(((likes??0)+(comments??0))/views*10000)/100:null;
 // Heuristic, not a live trend: longer-lived posts can score lower.
 const score=Math.max(0,Math.min(100,Math.round(
  Math.log10(averageViewsPerDay+1)*14+
  Math.min(12,(engagementPercent??0)*2)
 )));
 return {averageViewsPerDay,engagementPercent,signalScore:score};
};
export const videoToRadar=(raw:Record<string,unknown>,now=Date.now()):RadarVideo|null=>{
 const id=raw.id, snippet=raw.snippet as Record<string,unknown>|undefined;
 const statistics=raw.statistics as Record<string,unknown>|undefined;
 if(!validRadarId(id)||!snippet||!statistics)return null;
 const date=String(snippet.publishedAt||"");
 if(!date||!Number.isFinite(new Date(date).getTime())||new Date(date).getTime()>now)return null;
 const title=String(snippet.title||"").slice(0,180);
 const channel=String(snippet.channelTitle||"").slice(0,120);
 const channelId=String(snippet.channelId||"");
 const thumb=snippet.thumbnails as {medium?:{url?:string};default?:{url?:string}}|undefined;
 const thumbnail=String(thumb?.medium?.url||thumb?.default?.url||"");
 if(!/^https:\/\//.test(thumbnail))return null;
 const views=clampNonnegative(statistics.viewCount);
 const likes=statistics.likeCount==null?null:clampNonnegative(statistics.likeCount);
 const comments=statistics.commentCount==null?null:clampNonnegative(statistics.commentCount);
 return {id,url:"https://www.youtube.com/watch?v="+id,title,channel,channelId,
  thumbnail,description:String(snippet.description||"").slice(0,450),
  publishedAt:date,views,likes,comments,...radarMetrics(views,likes,comments,date,now)};
};
export const summarizeRadar=(videos:RadarVideo[])=>({
 count:videos.length,topAverageViewsPerDay:Math.max(0,...videos.map(v=>v.averageViewsPerDay)),
 totalViews:videos.reduce((sum,v)=>sum+v.views,0)
});
