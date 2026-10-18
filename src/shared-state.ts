/* eslint-disable no-bitwise */
import type { ButtonSink } from './controller.js';

/** Native NES frame dimensions. */
export const SCREEN_WIDTH = 256;
export const SCREEN_HEIGHT = 240;

/** Header slots: frame lock, published frame number, player 1 and player 2 masks. */
const HEADER_BYTES = 4 * Int32Array.BYTES_PER_ELEMENT;

/** Latest complete video frame and two input masks shared with the audio Worker. */
export class SharedState implements ButtonSink {
  /** Shared backing storage passed to the Worker through structured cloning. */
  readonly buffer: SharedArrayBuffer;
  /** Atomic synchronization and input fields. */
  private readonly header: Int32Array;
  /** Frame pixels in JSNES's packed 0xBBGGRR format. */
  private readonly frame: Uint32Array;

  /** Allocate a mailbox or attach to the mailbox received by the Worker. */
  constructor(buffer = new SharedArrayBuffer(HEADER_BYTES + SCREEN_WIDTH * SCREEN_HEIGHT * 4)) {
    this.buffer = buffer;
    this.header = new Int32Array(buffer, 0, 4);
    this.frame = new Uint32Array(buffer, HEADER_BYTES);
  }

  /** Number of complete frames published for display. */
  get frameNumber(): number {
    return Atomics.load(this.header, 1);
  }

  /** Publish a complete frame; a busy renderer must never block audio production. */
  writeFrame(pixels: ArrayLike<number>): void {
    if (Atomics.compareExchange(this.header, 0, 0, 1) !== 0) return;
    try {
      this.frame.set(pixels);
      Atomics.add(this.header, 1, 1);
    } finally {
      Atomics.store(this.header, 0, 0);
    }
  }

  /**
   * Copy the newest complete frame into native-owned RGBA storage.
   * @param pixels Destination image pixels.
   * @param previous Last frame consumed by the renderer.
   * @return {number} The consumed frame number, unchanged when no frame was available.
   */
  readFrame(pixels: Uint8Array, previous: number): number {
    if (this.frameNumber === previous || Atomics.compareExchange(this.header, 0, 0, 1) !== 0) {
      return previous;
    }
    try {
      for (let i = 0; i < this.frame.length; i++) {
        const color = this.frame[i];
        const offset = i * 4;
        pixels[offset] = color & 0xff;
        pixels[offset + 1] = (color >>> 8) & 0xff;
        pixels[offset + 2] = (color >>> 16) & 0xff;
        pixels[offset + 3] = 0xff;
      }
      return this.frameNumber;
    } finally {
      Atomics.store(this.header, 0, 0);
    }
  }

  /** Atomically press one player's button without disturbing other held buttons. */
  buttonDown(player: number, button: number): void {
    Atomics.or(this.header, player + 1, 1 << button);
  }

  /** Atomically release one player's button. */
  buttonUp(player: number, button: number): void {
    Atomics.and(this.header, player + 1, ~(1 << button));
  }

  /** Read all eight buttons for one player at an emulated frame boundary. */
  buttons(player: number): number {
    return Atomics.load(this.header, player + 1);
  }
}
