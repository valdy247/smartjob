// Keep realtime input bounded without dropping an active phone call
// when the provider socket experiences brief network backpressure.
import {mulaw8ToPcm24} from './media-codec.mjs';

export const INPUT_FRAME_BYTES = 1600; // 200 ms of 8 kHz mu-law audio.
export const MAX_PENDING_AUDIO_BYTES = 16000; // At most two seconds awaiting delivery.
export const MAX_PROVIDER_BUFFER_BYTES = 262144; // Allow transient socket jitter.

export function queueInput(ai, samples) {
  if (!Buffer.isBuffer(samples) || !samples.length) return 0;
  ai.pending = ai.pending.length ? Buffer.concat([ai.pending, samples]) : Buffer.from(samples);
  if (ai.pending.length <= MAX_PENDING_AUDIO_BYTES) return 0;
  // Keep the most recent audio if the provider stalls; never grow memory without bound.
  // Dropping full 200 ms frames also keeps the sample boundary predictable.
  const dropped = Math.ceil((ai.pending.length - MAX_PENDING_AUDIO_BYTES) / INPUT_FRAME_BYTES) * INPUT_FRAME_BYTES;
  ai.pending = Buffer.from(ai.pending.subarray(dropped));
  return dropped;
}

export function flushInput(ai) {
  if (!ai.ready || ai.ws?.readyState !== 1) return 0;
  let frames = 0;
  while (ai.pending.length >= INPUT_FRAME_BYTES) {
    const pcm = mulaw8ToPcm24(ai.pending.subarray(0, INPUT_FRAME_BYTES));
    const message = JSON.stringify({type: 'session.input_audio_buffer.append', audio: pcm.toString('base64')});
    if (ai.ws.bufferedAmount + Buffer.byteLength(message) > MAX_PROVIDER_BUFFER_BYTES) break;
    ai.ws.send(message);
    ai.pending = Buffer.from(ai.pending.subarray(INPUT_FRAME_BYTES));
    frames++;
  }
  return frames;
}
