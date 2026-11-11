import {createHmac,timingSafeEqual} from "node:crypto";
import {callSid} from "./relay-core.mjs";

// RAM-only live captions. Never save, record, or log spoken text.
// A room is deleted when either Twilio leg disconnects.
export const MAX_TRANSCRIPT_TURNS=2000;
const languages=new Set(["en-US","es-ES"]);
export function appendOwnerTranscript(room,{role,text,failed=false}){
  if(!room||room.closing||!["customer","professional"].includes(role)||
     typeof text!=="string"||!text.trim()||text.length>800)return false;
  if(!Array.isArray(room.transcript))room.transcript=[];
  room.nextTranscriptSequence=(room.nextTranscriptSequence||0)+1;
  room.transcript.push({
    seq:room.nextTranscriptSequence,
    speaker:role,
    text:text.trim(),
    failed:failed===true,
    atSeconds:Math.max(0,Math.floor((Date.now()-room.created)/1000))
  });
  // Visible calls have bounded memory. The owner can see if the oldest messages
  // were dropped; no transcript is ever persisted.
  if(room.transcript.length>MAX_TRANSCRIPT_TURNS)room.transcript.shift();
  return true;
}
export function transcriptSignature(secret,stamp,bridge,outbound){
  return createHmac("sha256",secret)
    .update(["vmv-transcript-owner-v1",stamp,bridge,outbound].join("\n")).digest("hex");
}
export function verifyTranscriptRequest(secret,{stamp,bridge,outbound,signature}){
  if(!secret||!callSid(bridge)||!callSid(outbound)||
     !/^\d{10}$/.test(stamp||"")||
     Math.abs(Date.now()/1000-Number(stamp))>25||
     !/^[a-f0-9]{64}$/i.test(signature||""))return false;
  const actual=Buffer.from(signature,"hex");
  const expected=Buffer.from(transcriptSignature(secret,stamp,bridge,outbound),"hex");
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export function snapshotOwnerTranscript(room,outbound,after=0){
  const owner=room?.legs?.professional;
  if(!room||room.closing||!owner||owner.callSid!==outbound||
     !room.legs.customer||!languages.has(owner.sourceLanguage))return null;
  const since=Number.isSafeInteger(after)&&after>=0?after:0;
  const all=Array.isArray(room.transcript)?room.transcript:[];
  const first=all[0]?.seq||0;
  const turns=all.filter(t=>t.seq>since).slice(0,80);
  return {
    language:owner.sourceLanguage,
    turns,
    truncated:first>since+1,
    hasMore:all.some(t=>t.seq>(turns.at(-1)?.seq||since))
  };
}
