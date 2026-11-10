// Keep translated speech responsive by not queueing near-digital silence
// for Twilio playback. The OpenAI INPUT stream must remain continuous.
//
// Work at 20ms, preserving 40ms before and after each voiced segment so
// unvoiced consonants and short pauses are not clipped. This is output-only.
// PCM/telephone mu-law samples are never recorded or logged here.
import {decodeMulaw} from "./media-codec.mjs";

export const AUDIO_FRAME_BYTES=160; // 20ms at 8kHz mu-law.
const GUARD_FRAMES=2; // 40ms before/after voice.

export function createOutputState(){
  return {remainder:Buffer.alloc(0),preRoll:[],hangover:0};
}

function containsVoice(frame){
  let total=0,peak=0;
  for(let i=0;i<frame.length;i++){
    const a=Math.abs(decodeMulaw(frame[i]));
    total+=a;
    if(a>peak)peak=a;
  }
  // Intentionally permissive: skip genuine digital silence, not soft speech.
  return peak>=512||total/frame.length>=80;
}

export function compactOutputAudio(input,state){
  if(!Buffer.isBuffer(input)||!state||!Array.isArray(state.preRoll))
    throw new Error("invalid_output_audio");
  const joined=state.remainder.length?Buffer.concat([state.remainder,input]):input;
  const usable=Math.floor(joined.length/AUDIO_FRAME_BYTES)*AUDIO_FRAME_BYTES;
  state.remainder=Buffer.from(joined.subarray(usable));
  const out=[];
  let suppressedMs=0;
  for(let offset=0;offset<usable;offset+=AUDIO_FRAME_BYTES){
    const frame=Buffer.from(joined.subarray(offset,offset+AUDIO_FRAME_BYTES));
    if(containsVoice(frame)){
      out.push(...state.preRoll,frame);
      state.preRoll=[];
      state.hangover=GUARD_FRAMES;
    }else if(state.hangover>0){
      out.push(frame);
      state.hangover--;
    }else{
      state.preRoll.push(frame);
      if(state.preRoll.length>GUARD_FRAMES){
        state.preRoll.shift();
        suppressedMs+=20;
      }
    }
  }
  return {audio:out.length?Buffer.concat(out):Buffer.alloc(0),suppressedMs};
}
