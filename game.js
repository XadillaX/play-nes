'use strict';

const fs = require('fs');
const path = require('path');

const {
  Font,
  IntRect,
  RenderWindow,
  Sound,
  SoundBuffer,
  Sprite,
  Text,
  Texture,
  VideoMode,
} = require('sfml.js');
const { NES } = require('jsnes');
const nomnom = require('nomnom');
const sleep = require('mz-modules/sleep');

const opts = nomnom
  .script('nes')
  .options({
    frameRate: {
      metavar: 'RATE',
      abbr: 'f',
      help: 'The frame rate.',
      default: 60,
    },
    rom: {
      position: 0,
      help: 'The ROM file path or built-in ROM name.',
      required: true,
    },
    scale: {
      metavar: 'SCALE',
      abbr: 's',
      help: 'The scale value.',
      default: 2,
    },
  })
  .parse();

switch (opts.rom) {
  case 'contra':
    opts.rom = path.join(__dirname, './roms/Contra (U).nes');
    break;

  case 'croom':
    opts.rom = path.join(__dirname, './roms/croom.nes');
    break;

  case 'dgolf':
    opts.rom = path.join(__dirname, './roms/dgolf.nes');
    break;

  case 'transmissing':
    opts.rom = path.join(__dirname, './roms/InterglacticTransmissing.nes');
    break;

  default: break;
}

const font = new Font();
font.loadFromFileSync(path.join(__dirname, './fixedsys.ttf'));
const fpsText = new Text('FPS: -', font, 12 * opts.scale);
fpsText.setPosition(20, 20);

const KBDController = require('./controller');

const SCREEN_WIDTH = 256;
const SCREEN_HEIGHT = 240;

const soundBuffer = new SoundBuffer();
const window = new RenderWindow(
  new VideoMode(SCREEN_WIDTH * opts.scale, SCREEN_HEIGHT * opts.scale),
  'NES Emulator',
  // eslint-disable-next-line
  RenderWindow.Style.Close | RenderWindow.Style.Titlebar);
window.setFramerateLimit(opts.frameRate);

const screenTexture = new Texture();
const screenBuffer = Buffer.alloc(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
for (let i = 0; i < screenBuffer.byteLength / 4; i++) {
  screenBuffer.writeUInt8(0xff, i * 4 + 3); // Each pixel's alpha
}
screenTexture.create(SCREEN_WIDTH, SCREEN_HEIGHT);

let currentSamples = [];
const nes = new NES({
  onFrame(frameBuffer) {
    for (let i = 0; i < frameBuffer.length; i++) {
      /* eslint-disable no-bitwise */
      screenBuffer.writeUInt8(frameBuffer[i] >> 16, i * 4);
      screenBuffer.writeUInt8((frameBuffer[i] >> 8) & 0xff, i * 4 + 1);
      screenBuffer.writeUInt8(frameBuffer[i] & 0xff, i * 4 + 2);
      /* eslint-enable */
    }
    screenTexture.update(screenBuffer);
  },
  onStatusUpdate: console.log,
  onAudioSample: (left, right) => {
    currentSamples.push(left * 32768);
    currentSamples.push(right * 32768);
  },
});

const p1 = new KBDController(nes, 1);
const p2 = new KBDController(nes, 2);

nes.loadROM(
  fs.readFileSync(
    path.resolve(process.cwd(), opts.rom), { encoding: 'binary' }));

function checkSound() {
  if (!currentSamples.length) return false;
  for (let i = 0; i < currentSamples.length; i += 2) {
    if (currentSamples[i] || currentSamples[i + 1]) {
      return true;
    }
  }
  return false;
}

(async () => {
  let last = Date.now();
  while (window.isOpen()) {
    let event;
    while ((event = window.pollEvent())) {
      if (
        event.type === 'Closed' ||
        (event.type === 'KeyPressed' && event.key.codeStr === 'Escape')
      ) {
        window.close();
        process.exit(0);
      } else if (event.type === 'KeyPressed') {
        p1.keyDown(event.key.codeStr);
        p2.keyDown(event.key.codeStr);
      } else if (event.type === 'KeyReleased') {
        p1.keyUp(event.key.codeStr);
        p2.keyUp(event.key.codeStr);
      }
    }

    nes.frame();
    const now = Date.now();
    const fps = (1000 / (now - last)).toFixed();
    fpsText.setString(`FPS: ${fps}`);
    last = now;

    window.clear(0xffffffff);
    const sprite = new Sprite(
      screenTexture,
      new IntRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT));
    sprite.scale(opts.scale, opts.scale);
    window.draw(sprite);
    window.draw(fpsText);
    window.display();

    if (checkSound()) {
      soundBuffer.loadFromSamples(currentSamples, 2, 44100);
      const sound = new Sound(soundBuffer);
      sound.setVolume(100);
      sound.play();
      currentSamples = [];
    }

    await sleep(0);
  }
})();
