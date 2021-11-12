'use strict';

const fs = require('fs');
const path = require('path');

const { Controller, NES } = require('jsnes');
const { Image, IntRect, RenderWindow, Sprite, Texture, VideoMode } = require('sfml.js');
const nomnom = require('nomnom');
const opts = nomnom.options({
  frameRate: {
    abbr: 'f',
    help: 'The frame rate. (defaults to 60)',
    default: 60,
  },
  rom: {
    position: 0,
    help: 'The ROM file path.',
    required: true,
  }
  // keybindings: {
  //   abbr: 'k',
  //   help: 'Keybindings configuration file path.',
  // }
}).parse();

const KBDController = require('./controller');

const SCREEN_WIDTH = 256;
const SCREEN_HEIGHT = 240;

const window = new RenderWindow(
  new VideoMode(SCREEN_WIDTH * 2, SCREEN_HEIGHT * 2),
  'NES Emulator',
  RenderWindow.Style.Close | RenderWindow.Style.Titlebar);
window.setFramerateLimit(opts.frameRate);

const screenTexture = new Texture();
const screenBuffer = Buffer.alloc(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
screenTexture.create(SCREEN_WIDTH, SCREEN_HEIGHT);

const nes = new NES({
  onFrame(frameBuffer) {
    for (let i = 0; i < frameBuffer.length; i++) {
      screenBuffer.writeUInt8(frameBuffer[i] >> 16, i * 4);
      screenBuffer.writeUInt8((frameBuffer[i] >> 8) & 0xff, i * 4 + 1);
      screenBuffer.writeUInt8((frameBuffer[i]) & 0xff, i * 4 + 2);
      screenBuffer.writeUInt8(0xff, i * 4 + 3);
    }
    screenTexture.update(screenBuffer);
  },
  onStatusUpdate: console.log,
  onAudioSample: function(left, right) {
    //
  },
});

const p1 = new KBDController(nes, 1);
const p2 = new KBDController(nes, 2);

nes.loadROM(
  fs.readFileSync(
    path.resolve(process.cwd(), opts.rom),
    { encoding: 'binary' }));

(async () => {
  while (window.isOpen()) {
    let event;
    while ((event = window.pollEvent())) {
      if (event.type === 'Closed' ||
          (event.type === 'KeyPressed' && event.key.codeStr === 'Escape')) {
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

    window.clear(0xffffffff);
    const sprite = new Sprite(
      screenTexture,
      new IntRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT));
    sprite.scale(2, 2);
    window.draw(sprite);
    window.display();
  }
})();
