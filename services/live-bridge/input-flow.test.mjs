import test from 'node:test';
import assert from 'node:assert/strict';
import {INPUT_FRAME_BYTES, MAX_PENDING_AUDIO_BYTES, MAX_PROVIDER_BUFFER_BYTES, queueInput, flushInput} from './input-flow.mjs';

function mockAi(ready = true) {
  const ws = {readyState: 1, bufferedAmount: 0, messages: [], send(message) {
    this.messages.push(JSON.parse(message));
    this.bufferedAmount += Buffer.byteLength(message);
  }};
  return {ready, ws, pending: Buffer.alloc(0)};
}

test('streams 200 ms u-law frames as 24 kHz PCM16 messages', () => {
  const ai = mockAi();
  assert.equal(queueInput(ai, Buffer.alloc(INPUT_FRAME_BYTES, 0xff)), 0);
  assert.equal(flushInput(ai), 1);
  assert.equal(ai.ws.messages[0].type, 'session.input_audio_buffer.append');
  assert.equal(Buffer.from(ai.ws.messages[0].audio, 'base64').length, 9600);
  assert.equal(ai.pending.length, 0);
});

test('brief socket congestion queues audio instead of throwing or hanging up', () => {
  const ai = mockAi();
  ai.ws.bufferedAmount = MAX_PROVIDER_BUFFER_BYTES;
  queueInput(ai, Buffer.alloc(INPUT_FRAME_BYTES, 0xff));
  assert.equal(flushInput(ai), 0);
  assert.equal(ai.pending.length, INPUT_FRAME_BYTES);
  ai.ws.bufferedAmount = 0;
  assert.equal(flushInput(ai), 1);
  assert.equal(ai.pending.length, 0);
});

test('continuous congestion bounds memory and drops only oldest whole frames', () => {
  const ai = mockAi();
  ai.ws.bufferedAmount = MAX_PROVIDER_BUFFER_BYTES;
  let dropped = 0;
  for (let i = 0; i < 100; i++) {
    dropped += queueInput(ai, Buffer.alloc(INPUT_FRAME_BYTES, i));
    flushInput(ai);
  }
  assert.equal(ai.pending.length, MAX_PENDING_AUDIO_BYTES);
  assert.equal(dropped, 90 * INPUT_FRAME_BYTES);
  assert.equal(ai.pending[0], 90);
});

test('buffers startup audio and flushes once the provider session is ready', () => {
  const ai = mockAi(false);
  queueInput(ai, Buffer.alloc(INPUT_FRAME_BYTES, 0xff));
  assert.equal(flushInput(ai), 0);
  ai.ready = true;
  assert.equal(flushInput(ai), 1);
});
