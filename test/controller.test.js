import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import ini from 'ini';
import { NES, Controller as Buttons } from 'jsnes';
import { Controller } from '../dist/controller.js';

const bindings = ini.parse(fs.readFileSync(new URL('../keybindings.conf', import.meta.url), 'utf8'));
// Numeric key codes stand in for SFML's enum without loading a native window.
const keys = Object.fromEntries(
  [ ...new Set(Object.values(bindings).flatMap(Object.values)) ].map((name, index) => [ name, index ])
);

test('configured numeric keys operate both JSNES controllers independently', () => {
  const nes = new NES();
  const p1 = new Controller(nes, 1, bindings.Player1, keys);
  const p2 = new Controller(nes, 2, bindings.Player2, keys);
  for (const [ player, controller ] of [[ 1, p1 ], [ 2, p2 ]]) {
    for (const [ button, key ] of Object.entries(bindings[`Player${player}`])) {
      const code = Buttons[`BUTTON_${button.toUpperCase()}`];
      p1.keyDown(keys[key]);
      p2.keyDown(keys[key]);
      assert.equal(nes.controllers[player].state[code], 0x41);
      assert.equal(nes.controllers[3 - player].state[code], 0x40);
      controller.keyUp(keys[key]);
      assert.equal(nes.controllers[player].state[code], 0x40);
    }
  }
  p1.keyDown(-1);
  assert.ok(nes.controllers[1].state.every(value => value === 0x40));
});

test('focus loss can release every held key', () => {
  const nes = new NES();
  const controller = new Controller(nes, 1, bindings.Player1, keys);
  controller.keyDown(keys.W);
  controller.keyDown(keys.J);
  controller.releaseAll();
  assert.ok(nes.controllers[1].state.every(value => value === 0x40));
});
