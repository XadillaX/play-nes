/* eslint-disable no-bitwise */
import { NES, type ButtonKey } from 'jsnes';
import { SharedState } from './shared-state.js';

/** Initial data cloned into the SFML audio Worker. */
export interface EmulatorOptions {
  /** Raw iNES ROM bytes, cloned once into the audio Worker. */
  rom: Uint8Array;
  /** Emulation speed in frames per second. */
  frameRate: number;
  /** Shared video frame and controller state. */
  buffer: SharedArrayBuffer;
}

/** Convert a normalized sample to signed PCM without positive full-scale wraparound. */
export function toPCM16(sample: number): number {
  return Math.max(-32768, Math.min(32767, Math.trunc(sample * 32768)));
}

/** Drives emulation from audio demand while preserving samples between blocks. */
export class Emulator {
  /** Core is confined to the audio Worker. */
  private readonly nes: NES;
  /** Shared frame and controller mailbox. */
  private readonly state: SharedState;
  /** Reused staging space for one emulated frame's interleaved stereo PCM. */
  private readonly samples: Int16Array;
  /** Read cursor and populated length within the staging buffer. */
  private offset = 0;
  private length = 0;
  /** Last input masks applied to the core, indexed by player minus one. */
  private readonly inputs = [ 0, 0 ];

  /** Initialize the core using the audio device's actual sample rate. */
  constructor(options: EmulatorOptions, sampleRate: number) {
    this.state = new SharedState(options.buffer);
    // A frame averages sampleRate / frameRate samples; leave room for timing jitter.
    this.samples = new Int16Array(Math.ceil(sampleRate / options.frameRate + 2048) * 2);
    this.nes = new NES({
      sampleRate,
      onFrame: pixels => this.state.writeFrame(pixels),
      onAudioSample: (left, right) => {
        if (this.length + 2 > this.samples.length) throw new Error('NES audio frame exceeds its buffer.');
        this.samples[this.length++] = toPCM16(left);
        this.samples[this.length++] = toPCM16(right);
      },
    });
    this.nes.loadROM(options.rom);
    this.nes.setFramerate(options.frameRate);
  }

  /** Fill a reusable native PCM slot, retaining the unused tail for the next slot. */
  fillAudio(target: Int16Array): void {
    let written = 0;
    while (written < target.length) {
      if (this.offset === this.length) {
        this.offset = 0;
        this.length = 0;
        this.applyInput();
        this.nes.frame();
      }
      const count = Math.min(this.length - this.offset, target.length - written);
      target.set(this.samples.subarray(this.offset, this.offset + count), written);
      this.offset += count;
      written += count;
    }
  }

  /** Apply only changed buttons before emulating the next frame. */
  private applyInput(): void {
    for (const player of [ 1, 2 ] as const) {
      const next = this.state.buttons(player);
      const changed = next ^ this.inputs[player - 1];
      for (let button = 0; button < 8; button++) {
        const bit = 1 << button;
        if (changed & bit) {
          if (next & bit) this.nes.buttonDown(player, button as ButtonKey);
          else this.nes.buttonUp(player, button as ButtonKey);
        }
      }
      this.inputs[player - 1] = next;
    }
  }
}
