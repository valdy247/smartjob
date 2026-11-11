import test from "node:test";
import assert from "node:assert/strict";
import {canStreamTranslation,createVoiceChunks,streamTranslation} from "./translate-stream.mjs";
const key="sk-"+"T".repeat(32);
const packet=(fragment,finish=null)=>"data: "+JSON.stringify({
  choices:[{delta:fragment?{content:fragment}:{},finish_reason:finish}]
})+"\n\n";
function reply(parts,{crlf=false,breakEvery=0}={}){
  const full=parts.join("")+"data: [DONE]\n\n";
  const bytes=new TextEncoder().encode(crlf?full.replaceAll("\n","\r\n"):full);
  const size=breakEvery||bytes.length;
  return {ok:true,body:new ReadableStream({start(controller){
    for(let i=0;i<bytes.length;i+=size)controller.enqueue(bytes.slice(i,i+size));
    controller.close();
  }})};
}
test("safe conversational phrases stream; quantities, dates and prices use verified complete lane",()=>{
  for(const x of ["Hi, how are you?","I would like some help.","Muchas gracias, nos vemos pronto."]){
    assert.equal(canStreamTranslation(x),true,x);
  }
  for(const x of ["The cake is $50","I need two cakes","I am allergic to milk",
    "Can we meet tomorrow?", "Call 7065551222", "<script>", "x".repeat(221)]){
    assert.equal(canStreamTranslation(x),false,x);
  }
});
test("Twilio receives ordered complete-word chunks and a non-empty final token",()=>{
  const result=[],sender=createVoiceChunks((t,last)=>{result.push({token:t,last});return true;});
  for(const piece of ["Hola", " buenos", " días, ", "¿cómo ", "estás?", " Gracias."])sender.push(piece);
  assert.equal(sender.finish(),true);
  assert.equal(result.map(x=>x.token).join(""),"Hola buenos días, ¿cómo estás? Gracias.");
  assert.equal(result.at(-1).last,true);
  assert.ok(result.slice(0,-1).every(x=>x.last===false));
  assert.ok(result.every(x=>x.token.length>0));
});
test("SSE response is reconstructed over random byte boundaries; no JSON leaked to TTS",async()=>{
  const received=[],parts=["Hello",", how"," are ","you?"];
  const chunks=parts.map(x=>packet(x));
  chunks.push(packet("", "stop"));
  const res=await streamTranslation("Hola, ¿cómo estás?","es-ES","en-US",{
    key,fetcher:async (_url,opts)=>{
      const body=JSON.parse(opts.body);
      assert.equal(body.stream,true);
      assert.equal(body.model,"gpt-4.1-mini");
      return reply(chunks,{crlf:true,breakEvery:3});
    },onDelta:x=>received.push(x)
  });
  assert.equal(res.reason,null);assert.equal(res.translation,"Hello, how are you?");
  assert.deepEqual(received,parts);
  assert.equal(res.started,true);
  assert.ok(res.firstTokenMs>=0);
});
test("incomplete streams fail closed with explicit streamed state",async()=>{
  const raw=packet("Hello") + packet("", "length");
  const res=await streamTranslation("Hola","es-ES","en-US",{
    key,fetcher:async()=>({ok:true,body:new ReadableStream({start(controller){
      controller.enqueue(new TextEncoder().encode(raw));controller.close();
    }})}),onDelta:()=>{}
  });
  assert.equal(res.translation,null);
  assert.equal(res.reason,"incomplete_stream");
  assert.equal(res.started,true);
});
test("missing API key and risk terms cannot invoke a streamed provider",async()=>{
  let called=false;
  const fetcher=async()=>{called=true;throw Error("unexpected");};
  const result=await streamTranslation("Price is $15","en-US","es-ES",{key,fetcher,onDelta:()=>{}});
  assert.equal(result.reason,"invalid_input");
  const noKey=await streamTranslation("Hello","en-US","es-ES",{key:"",fetcher,onDelta:()=>{}});
  assert.equal(noKey.reason,"missing_key");
  assert.equal(called,false);
});
test("callback refusal stops streaming; caller can end the Twilio room",async()=>{
  const chunks=[packet("Good morning everyone."),packet("", "stop")];
  const res=await streamTranslation("Buenos días","es-ES","en-US",{
    key,fetcher:async()=>reply(chunks),
    onDelta:()=>{throw Error("voice_unavailable")}
  });
  assert.equal(res.translation,null);assert.equal(res.reason,"voice_unavailable");
});
