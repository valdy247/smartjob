// Twilio Media Streams: 8 kHz G.711 mu-law <-> OpenAI: 24 kHz PCM16LE.
// No native audio modules or per-call dependencies required.
const BIAS=0x84;
export function decodeMulaw(byte) {
  const u=(~byte)&255;
  let value=((u&15)<<3)+BIAS;
  value<<=(u&112)>>4;
  return (u&128)?BIAS-value:value-BIAS;
}
export function encodeMulaw(sample) {
  let pcm=Math.max(-32768,Math.min(32767,Math.trunc(sample)));
  const negative=pcm<0;
  if(negative)pcm=-pcm;
  pcm=Math.min(32635,pcm)+BIAS;
  let exponent=7;
  for(let mask=0x4000;exponent>0&&!(pcm&mask);mask>>=1)exponent--;
  const mantissa=(pcm>>(exponent+3))&15;
  return (~((negative?0x80:0)|(exponent<<4)|mantissa))&255;
}
export function mulaw8ToPcm24(input) {
  if(!Buffer.isBuffer(input)||input.length>16000)throw new Error("bad_ulaw_input");
  const output=Buffer.allocUnsafe(input.length*6);
  for(let i=0;i<input.length;i++){
    const a=decodeMulaw(input[i]);
    const b=i+1<input.length?decodeMulaw(input[i+1]):a;
    for(let phase=0;phase<3;phase++)
      output.writeInt16LE(Math.round(a+(b-a)*phase/3), (i*3+phase)*2);
  }
  return output;
}
export function pcm24ToMulaw8(input) {
  if(!Buffer.isBuffer(input)||input.length%6!==0||input.length>960000)
    throw new Error("bad_pcm_input");
  const output=Buffer.allocUnsafe(input.length/6);
  for(let i=0;i<output.length;i++){
    const offset=i*6;
    // Three-sample downsampling averaging smooths high frequencies.
    const sample=Math.round((input.readInt16LE(offset)+input.readInt16LE(offset+2)+input.readInt16LE(offset+4))/3);
    output[i]=encodeMulaw(sample);
  }
  return output;
}
export function safePcm24Chunk(bytes) {
  if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>960000||bytes.length%2!==0)
    throw new Error("invalid_pcm_chunk");
  return bytes;
}
