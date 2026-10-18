import type { AudioWorkerContext, SoundStreamCallbacks } from 'sfml.js';
import { Emulator, EmulatorOptions } from './emulator.js';

/** Produce continuous stereo PCM directly in SFML's reusable native slots. */
export function createAudioWorker(
  context: AudioWorkerContext,
  options: EmulatorOptions,
): SoundStreamCallbacks {
  const emulator = new Emulator(options, context.sampleRate);
  return {
    onGetData(chunk) {
      emulator.fillAudio(chunk.samples);
      chunk.sampleCount = chunk.samples.length;
      return true;
    },
    // Live emulation has no seekable timeline; stop/close must not reload the ROM.
    onSeek() {},
  };
}
