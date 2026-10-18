import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { NES } from 'jsnes';
import { SharedState } from '../dist/shared-state.js';
import { Emulator, toPCM16 } from '../dist/emulator.js';
import { createAudioWorker } from '../dist/audio-worker.js';

const rom = fs.readFileSync(new URL('../roms/croom.nes', import.meta.url));

test('PCM conversion clamps full scale and preserves polarity', () => {
  assert.deepEqual([ -2, -1, -0.5, 0, 0.5, 1, 2 ].map(toPCM16), [
    -32768, -32768, -16384, 0, 16384, 32767, 32767,
  ]);
});

test('busy frame readers and writers retain the last complete frame without blocking', () => {
  const state = new SharedState();
  const header = new Int32Array(state.buffer, 0, 4);
  const first = new Uint32Array(256 * 240).fill(0x0000ff);
  const second = new Uint32Array(256 * 240).fill(0xff0000);
  const pixels = new Uint8Array(256 * 240 * 4);
  state.writeFrame(first);
  Atomics.store(header, 0, 1);
  state.writeFrame(second);
  assert.equal(state.readFrame(pixels, 0), 0);
  assert.equal(pixels[3], 0);
  Atomics.store(header, 0, 0);
  assert.equal(state.readFrame(pixels, 0), 1);
  assert.deepEqual(Array.from(pixels.slice(0, 4)), [ 255, 0, 0, 255 ]);
  state.writeFrame(second);
  assert.equal(state.readFrame(pixels, 1), 2);
  assert.deepEqual(Array.from(pixels.slice(0, 4)), [ 0, 0, 255, 255 ]);
});

test('shared frames preserve NES RGB colors and opaque alpha', () => {
  const writer = new SharedState();
  const reader = new SharedState(writer.buffer);
  const frame = new Uint32Array(256 * 240);
  frame.set([ 0x0000ff, 0x00ff00, 0xff0000, 0x563412 ]);
  const pixels = new Uint8Array(256 * 240 * 4);
  assert.equal(reader.readFrame(pixels, 0), 0);
  writer.writeFrame(frame);
  assert.equal(reader.readFrame(pixels, 0), 1);
  assert.deepEqual(Array.from(pixels.slice(0, 16)), [
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 18, 52, 86, 255,
  ]);
  assert.equal(pixels[pixels.length - 1], 255);
});

test('audio fills arbitrary block boundaries without dropping samples or silence', () => {
  const samples = [];
  const reference = new NES({
    sampleRate: 48000,
    onAudioSample(left, right) {
      samples.push(Math.max(-32768, Math.min(32767, Math.trunc(left * 32768))));
      samples.push(Math.max(-32768, Math.min(32767, Math.trunc(right * 32768))));
    },
  });
  reference.loadROM(rom);
  while (samples.length < 12000) reference.frame();
  const emulator = new Emulator({ rom, frameRate: 60, buffer: new SharedState().buffer }, 48000);
  let offset = 0;
  for (const length of [ 2, 2048, 66, 4096, 5788 ]) {
    const block = new Int16Array(length);
    emulator.fillAudio(block);
    assert.deepEqual(Array.from(block), samples.slice(offset, offset + length));
    offset += length;
  }
});

test('shared button masks reach both emulated controllers before each frame', () => {
  const state = new SharedState();
  const emulator = new Emulator({ rom, frameRate: 60, buffer: state.buffer }, 48000);
  state.buttonDown(1, 0);
  state.buttonDown(1, 4);
  state.buttonDown(2, 3);
  emulator.fillAudio(new Int16Array(2048));
  assert.equal(emulator.nes.controllers[1].state[0], 0x41);
  assert.equal(emulator.nes.controllers[1].state[4], 0x41);
  assert.equal(emulator.nes.controllers[2].state[3], 0x41);
  state.buttonUp(1, 0);
  state.buttonUp(1, 4);
  state.buttonUp(2, 3);
  emulator.fillAudio(new Int16Array(2048));
  assert.ok(emulator.nes.controllers[1].state.every(value => value === 0x40));
  assert.ok(emulator.nes.controllers[2].state.every(value => value === 0x40));
});

test('audio Worker writes into the supplied native slot and continues across blocks', () => {
  const state = new SharedState();
  const worker = createAudioWorker(
    { sampleRate: 48000, channelCount: 2, blockFrames: 512 },
    { rom, frameRate: 60, buffer: state.buffer }
  );
  const samples = new Int16Array(1024);
  const chunk = { samples, sampleCount: 0 };
  for (let i = 0; i < 10; i++) {
    assert.equal(worker.onGetData(chunk), true);
    assert.equal(chunk.samples, samples);
    assert.equal(chunk.sampleCount, samples.length);
  }
  assert.ok(state.frameNumber > 0);
});

test('invalid ROMs fail before the audio callback can start', () => {
  assert.throws(() => new Emulator({
    rom: Buffer.from('invalid'), frameRate: 60, buffer: new SharedState().buffer,
  }, 48000), /Not a valid NES ROM/i);
});

test('bundled ROMs keep pace with audio at the supported speed limits', () => {
  for (const filename of fs.readdirSync(new URL('../roms/', import.meta.url))) {
    const data = fs.readFileSync(new URL(`../roms/${filename}`, import.meta.url));
    for (const frameRate of [ 10, 60, 240 ]) {
      const state = new SharedState();
      const emulator = new Emulator({ rom: data, frameRate, buffer: state.buffer }, 48000);
      emulator.fillAudio(new Int16Array(48000 * 2));
      assert.ok(Math.abs(state.frameNumber - frameRate) <= 2,
        `${filename} at ${frameRate} fps produced ${state.frameNumber} frames per second of PCM`);
    }
  }
});
