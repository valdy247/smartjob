/**
 * VMV Stickman Lab — deterministic 2D animation engine.
 * No generated images, external video providers, remote assets or API charges.
 * Render a 9:16 timeline from reusable geometry and five-second scene actions.
 */
export const STICKMAN_WIDTH=540;
export const STICKMAN_HEIGHT=960;
export const STICKMAN_SCENE_SECONDS=5;
export const STICKMAN_SECONDS=15;
export type StickmanTopic="space"|"race";
export type StickmanLanguage="es"|"en";
export type StickmanAction="earth"|"jupiter"|"comparison"|"track"|"beach"|"finish";
export type StickmanScene={action:StickmanAction;speech:string};
export type StickmanStory={name:string;scenes:[StickmanScene,StickmanScene,StickmanScene]};
const stories:Record<StickmanLanguage,Record<StickmanTopic,StickmanStory>>={
 es:{
  space:{name:"Planetas",scenes:[
   {action:"earth",speech:"La Tierra completa un giro sobre sí misma en unas veinticuatro horas."},
   {action:"jupiter",speech:"Júpiter, mucho más grande, tarda menos de diez horas en girar."},
   {action:"comparison",speech:"Por eso Júpiter rota más rápido que nuestro planeta, aunque sea gigante."}
  ]},
  race:{name:"Fórmula 1",scenes:[
   {action:"track",speech:"Un Fórmula uno moderno puede superar los trescientos kilómetros por hora."},
   {action:"beach",speech:"Imagina esa velocidad cruzando una playa, levantando una enorme nube de arena."},
   {action:"finish",speech:"Sería espectacular, pero esto es una animación, no una carrera real."}
  ]}
 },
 en:{
  space:{name:"Planets",scenes:[
   {action:"earth",speech:"Earth makes one full rotation in about twenty four hours."},
   {action:"jupiter",speech:"Huge Jupiter takes less than ten hours to rotate once."},
   {action:"comparison",speech:"That means giant Jupiter rotates faster than our own planet."}
  ]},
  race:{name:"Formula One",scenes:[
   {action:"track",speech:"A modern Formula One car can exceed three hundred kilometers per hour."},
   {action:"beach",speech:"Imagine that incredible speed racing across a beach, kicking up golden sand."},
   {action:"finish",speech:"It looks incredible, but this is animation, not a real race."}
  ]}
 }
};
export function stickmanStory(topic:StickmanTopic,language:StickmanLanguage):StickmanStory{
 return stories[language][topic];
}
const TAU=Math.PI*2;
const PI=Math.PI;
const oscillate=(n:number)=>Math.sin(n*TAU);
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
function ellipse(ctx:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,color:string|CanvasGradient){
 ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);ctx.fillStyle=color;ctx.fill();
}
function line(ctx:CanvasRenderingContext2D,points:number[],color:string,width=5){
 ctx.beginPath();ctx.moveTo(points[0],points[1]);
 for(let i=2;i<points.length;i+=2)ctx.lineTo(points[i],points[i+1]);
 ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap="round";ctx.lineJoin="round";ctx.stroke();
}
function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,color:string){
 ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();
}
function star(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,alpha=1){
 ctx.save();ctx.globalAlpha=alpha;
 line(ctx,[x-r,y,x+r,y],"#ded6fa",2);
 line(ctx,[x,y-r,x,y+r],"#ded6fa",2);
 ctx.restore();
}
function paintSpace(ctx:CanvasRenderingContext2D,t:number){
 const g=ctx.createLinearGradient(0,0,0,960);
 g.addColorStop(0,"#181334");g.addColorStop(.62,"#342e65");g.addColorStop(1,"#60517f");
 ctx.fillStyle=g;ctx.fillRect(0,0,540,960);
 for(let i=0;i<42;i++){
  const x=(i*137+23)%535,y=(i*89+39)%760;
  star(ctx,x,y,i%7===0?4:1.7,.24+.55*(.5+.5*oscillate(t*.2+i*.07)));
 }
 ellipse(ctx,270,765,330,70,"rgba(163,134,235,.14)");
}
function paintRace(ctx:CanvasRenderingContext2D,t:number,beach:boolean){
 const sky=ctx.createLinearGradient(0,0,0,700);
 sky.addColorStop(0,"#b4e7ee");sky.addColorStop(1,beach?"#fff0d9":"#ececff");
 ctx.fillStyle=sky;ctx.fillRect(0,0,540,960);
 ellipse(ctx,440,150,53,53,"#ffdf91");
 for(let i=0;i<4;i++){
  const x=(i*190-t*18)%730-100;
  ellipse(ctx,x+100,235+(i%2)*60,90,22,"rgba(255,255,255,.8)");
  ellipse(ctx,x+160,220+(i%2)*60,60,27,"rgba(255,255,255,.88)");
 }
 if(beach){
  rounded(ctx,0,553,540,205,0,"#64c5da");
  for(let i=0;i<5;i++)line(ctx,[0,600+i*33+Math.sin(t+i)*3,540,596+i*33+Math.sin(t+i)*3],"rgba(255,255,255,.55)",3);
  rounded(ctx,0,730,540,230,0,"#f4dca4");
  for(let i=0;i<16;i++){
   const x=(i*77-t*125)%680;
   ellipse(ctx,x,800+(i*21)%110,3,2,"#d8b878");
  }
 }else{
  rounded(ctx,0,625,540,335,0,"#afb2c3");
  for(let i=0;i<13;i++)rounded(ctx,(i*100-t*240)%760-90,765,58,9,4,"#f7f4e9");
  rounded(ctx,0,620,540,13,0,"#e88c92");
 }
}
function stickman(ctx:CanvasRenderingContext2D,x:number,y:number,s:number,t:number,pose:"point"|"cheer"|"walk"="point"){
 ctx.save();ctx.translate(x,y+Math.sin(t*4)*2);ctx.scale(s,s);
 const ink="#222139",blue="#865ed7";
 const swing=Math.sin(t*4.7);
 const foot=pose==="walk"?swing*17:0;
 // Shadow, legs and signature blue sweatshirt
 ellipse(ctx,0,116,58,10,"rgba(33,24,68,.12)");
 line(ctx,[-16,23,-22+foot,66,-38+foot,105],ink,9);
 line(ctx,[16,23,20-foot,68,40-foot,105],ink,9);
 line(ctx,[-44+foot,104,-21+foot,106],ink,10);
 line(ctx,[19-foot,105,48-foot,105],ink,10);
 rounded(ctx,-28,-45,56,75,16,blue);
 line(ctx,[-25,-25,-45,16+(pose==="walk"?swing*18:0),-60,23],ink,9);
 if(pose==="cheer"){
  line(ctx,[26,-22,48,-64+oscillate(t*.7)*4,66,-91],ink,9);
 }else{
  line(ctx,[26,-24,52,-47+Math.sin(t*3)*8,72,-44+Math.sin(t*3)*10],ink,9);
 }
 ellipse(ctx,-61,23,7,7,"#fff7ea");
 ellipse(ctx,pose==="cheer"?67:73,pose==="cheer"?-92:-44+Math.sin(t*3)*10,7,7,"#fff7ea");
 // Identical main character in every scene
 ellipse(ctx,0,-91,39,42,"#ffffff");
 ctx.beginPath();ctx.arc(0,-91,39,0,TAU);ctx.strokeStyle=ink;ctx.lineWidth=6;ctx.stroke();
 line(ctx,[-18,-129,-10,-143,1,-130,11,-142,18,-128],ink,7);
 ellipse(ctx,-14,-95,4.7,6.3,ink);
 ellipse(ctx,14,-95,4.7,6.3,ink);
 ctx.beginPath();ctx.arc(0,-80,9,.1,PI-.1);ctx.strokeStyle=ink;ctx.lineWidth=3;ctx.stroke();
 ellipse(ctx,-22,-78,6,3,"#f2bfc7");
 ellipse(ctx,21,-78,6,3,"#f2bfc7");
 ctx.restore();
}
function earth(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,t:number){
 ctx.save();ctx.translate(x,y);
 const glow=ctx.createRadialGradient(0,0,r*.4,0,0,r*1.55);
 glow.addColorStop(0,"rgba(120,205,253,.28)");glow.addColorStop(1,"rgba(120,205,253,0)");
 ellipse(ctx,0,0,r*1.55,r*1.55,glow);
 const sea=ctx.createLinearGradient(-r,-r,r,r);sea.addColorStop(0,"#6ed4ff");sea.addColorStop(1,"#2c89de");
 ellipse(ctx,0,0,r,r,sea);
 ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.clip();
 const shift=(t*42)%(r*2.8);
 for(let k=-2;k<3;k++){
  const px=k*r*1.3+shift-r;
  ctx.beginPath();ctx.moveTo(px-r*.7,-r*.28);
  ctx.bezierCurveTo(px-r*.5,-r*.85,px+r*.1,-r*.86,px+r*.12,-r*.3);
  ctx.bezierCurveTo(px+r*.68,-r*.16,px+r*.38,r*.3,px+r*.1,r*.32);
  ctx.bezierCurveTo(px-r*.5,r*.8,px-r*.52,r*.18,px-r*.7,-r*.28);
  ctx.fillStyle="#4ac98b";ctx.fill();
 }
 ellipse(ctx,-r*.3,-r*.75,r*.8,r*.15,"rgba(255,255,255,.35)");
 ellipse(ctx,r*.15,r*.63,r*.75,r*.12,"rgba(255,255,255,.26)");
 ctx.restore();
 ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.strokeStyle="rgba(204,246,255,.9)";ctx.lineWidth=4;ctx.stroke();
 ctx.restore();
}
function jupiter(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,t:number){
 ctx.save();ctx.translate(x,y);
 const base=ctx.createLinearGradient(-r,-r,r,r);base.addColorStop(0,"#f1d6ac");base.addColorStop(1,"#d39175");
 ellipse(ctx,0,0,r,r,base);
 ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.clip();
 const shift=(t*15)%45;
 for(let i=-8;i<9;i++){
  const cy=i*31+shift;
  rounded(ctx,-r,cy,r*2,11+(i%3)*4,0,i%3===0?"#f8d9ad":i%3===1?"#bf6e64":"#e7b98b");
 }
 ellipse(ctx,r*.42,-r*.03,r*.31,r*.16,"#bc675a");
 ellipse(ctx,r*.43,-r*.04,r*.22,r*.08,"#eb9e81");
 ctx.restore();
 ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.strokeStyle="#ffe4bc";ctx.lineWidth=4;ctx.stroke();
 ctx.restore();
}
function raceCar(ctx:CanvasRenderingContext2D,x:number,y:number,s:number,t:number){
 ctx.save();ctx.translate(x,y+Math.sin(t*19)*2);ctx.scale(s,s);
 for(let i=0;i<6;i++){
  const streak=(t*270+i*88)%520;
  line(ctx,[-streak-140,-35+i*15,-streak-210,-35+i*15],"rgba(116,87,160,.22)",3);
 }
 ellipse(ctx,0,56,200,23,"rgba(64,54,78,.17)");
 line(ctx,[-168,-10,-135,-10],"#352d44",12);
 // body is original design, no logo or sponsor livery
 rounded(ctx,-170,-40,350,52,17,"#6544a5");
 ctx.beginPath();ctx.moveTo(-65,-40);ctx.lineTo(-22,-101);ctx.lineTo(49,-101);ctx.lineTo(95,-40);ctx.closePath();
 ctx.fillStyle="#916ade";ctx.fill();
 rounded(ctx,-157,-17,325,14,8,"#c9b5fc");
 line(ctx,[140,-80,140,-36,181,-36],"#34294c",10);
 rounded(ctx,-185,-33,43,10,3,"#352b4d");
 for(const xWheel of [-107,110]){
  ellipse(ctx,xWheel,26,45,46,"#28263f");
  ellipse(ctx,xWheel,26,26,27,"#7d8198");
  for(let i=0;i<5;i++){
   const a=t*17+i*TAU/5;
   line(ctx,[xWheel+Math.cos(a)*8,26+Math.sin(a)*8,xWheel+Math.cos(a)*24,26+Math.sin(a)*24],"#d7d3e6",5);
  }
  ellipse(ctx,xWheel,26,7,7,"#373a53");
 }
 ctx.restore();
}
function subtitles(ctx:CanvasRenderingContext2D,text:string,local:number){
 const words=text.split(/\s+/).filter(Boolean);
 const count=Math.max(1,Math.ceil(words.length/4));
 const index=Math.min(count-1,Math.floor(clamp(local,0,4.999)/5*count));
 const part=words.slice(index*4,index*4+4).join(" ");
 ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="800 30px system-ui, sans-serif";
 const width=Math.min(495,ctx.measureText(part).width+45);
 rounded(ctx,(540-width)/2,813,width,75,23,"rgba(21,20,44,.82)");
 ctx.strokeStyle="rgba(20,17,38,.7)";ctx.lineWidth=2;
 ctx.fillStyle="#ffffff";ctx.fillText(part,270,849,480);
}
export function drawStickmanFrame(
 ctx:CanvasRenderingContext2D,story:StickmanStory,seconds:number,showSubtitles:boolean
){
 const time=clamp(seconds,0,STICKMAN_SECONDS-.001);
 const scene=Math.min(2,Math.floor(time/STICKMAN_SCENE_SECONDS));
 const local=time-scene*STICKMAN_SCENE_SECONDS;
 const action=story.scenes[scene].action;
 const isSpace=action==="earth"||action==="jupiter"||action==="comparison";
 ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,540,960);
 if(isSpace){
  paintSpace(ctx,time);
  if(action==="earth"){
   earth(ctx,278,355,155,local);
   for(let i=0;i<3;i++)star(ctx,110+i*140,225+Math.sin(local+i)*18,8,.7);
  }else if(action==="jupiter"){
   jupiter(ctx,286,365,171,local);
   ellipse(ctx,93,235,17,17,"#f1e7dd");ellipse(ctx,455,485,13,13,"#eec6a7");
  }else{
   earth(ctx,159,339,91,local);jupiter(ctx,392,339,124,local);
   line(ctx,[269,280,269,480],"rgba(216,205,250,.5)",3);
   for(let i=0;i<5;i++)ellipse(ctx,115+i*75,540+Math.sin(time+i)*6,3,3,"#e8dfff");
  }
  stickman(ctx,270,659,1.35,time,"point");
 }else{
  const beach=action!=="track";
  paintRace(ctx,time,beach);
  const bounce=Math.sin(local*4)*8;
  if(action==="track"){
   raceCar(ctx,270+bounce,702,.93,time);
   stickman(ctx,112,501,.65,time,"cheer");
  }else if(action==="beach"){
   for(let i=0;i<9;i++){
    const px=475-i*42-(time*80%380);
    ellipse(ctx,px,744+i%3*16,12+i%3*4,7,"rgba(239,206,144,.75)");
   }
   raceCar(ctx,283+bounce,682,1.04,time);
   stickman(ctx,112,508,.64,time,"point");
  }else{
   raceCar(ctx,280+Math.sin(local)*6,722,.90,time);
   for(let i=0;i<10;i++){
    const u=(i*53+time*35)%540;
    ellipse(ctx,u,260+i*31%180,5,9,i%2?"#905cc2":"#ffe28b");
   }
   stickman(ctx,157,523,.75,time,"cheer");
  }
 }
 if(showSubtitles)subtitles(ctx,story.scenes[scene].speech,local);
 ctx.restore();
}
