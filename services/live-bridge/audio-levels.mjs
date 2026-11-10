// Audio-level diagnostics only. No voice content or transcripts are retained.
export function pcm16Level(samples) {
  if (!Buffer.isBuffer(samples) || samples.length < 2 || samples.length % 2 !== 0) {
    throw new Error("invalid_pcm16_for_level");
  }
  // Sample a bounded number of frames to keep realtime instrumentation cheap.
  const count = samples.length / 2;
  const step = Math.max(1, Math.ceil(count / 1024));
  let n = 0, sum = 0, peak = 0;
  for (let i = 0; i < count; i += step) {
    const amplitude = Math.abs(samples.readInt16LE(i * 2));
    sum += amplitude;
    peak = Math.max(peak, amplitude);
    n++;
  }
  return {meanAbs: Math.round(sum / n), peak};
}
