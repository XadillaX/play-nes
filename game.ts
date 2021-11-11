import { Keyboard } from 'sfml.js';
import * as nomnom from 'nomnom';

import { Emulator } from './lib/emulator';

const p1: Keyboard.Keys[] = [
  Keyboard.Keys.J, Keyboard.Keys.K, Keyboard.Keys.RShift, Keyboard.Keys.Enter,
  Keyboard.Keys.W, Keyboard.Keys.S, Keyboard.Keys.A, Keyboard.Keys.D,
];

const p2: Keyboard.Keys[] = [
  Keyboard.Keys.Numpad5, Keyboard.Keys.Numpad6, Keyboard.Keys.Numpad8, Keyboard.Keys.Numpad9,
  Keyboard.Keys.Up, Keyboard.Keys.Down, Keyboard.Keys.Left, Keyboard.Keys.Right,
];

const emulator = new Emulator();

const opts = nomnom
  .options({
    romPath: {
      position: 0,
      help: 'The ROM file path.',
    },
  })
  .parse();

emulator.setKeys(p1, p2);
emulator.run(opts.romPath).then(() => {
  // Empty
}).catch(err => {
  console.error(err);
  process.exit(4);
});
