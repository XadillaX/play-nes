import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Game } from '../dist/game.js';
import { parseOptions } from '../dist/cli.js';
import { KeyboardKey } from 'sfml.js';

/**
 * Exercise the actual native window, texture and audio Worker with each bundled ROM.
 */
async function main() {
  for (const rom of [ 'contra', 'croom', 'dgolf', 'transmissing' ]) {
    const game = await Game.create(parseOptions([ rom, '-s', '1' ]));
    let stats;
    const run = game.run();
    try {
      await delay(1500);
      game.handleEvent({ kind: 'KeyPressed', code: KeyboardKey.Enter });
      await delay(100);
      game.handleEvent({ kind: 'KeyReleased', code: KeyboardKey.Enter });
      game.handleEvent({ kind: 'KeyPressed', code: KeyboardKey.J });
      game.handleEvent({ kind: 'KeyPressed', code: KeyboardKey.Numpad5 });
      assert.equal(game.state.buttons(1), 1);
      assert.equal(game.state.buttons(2), 1);
      game.handleEvent({ kind: 'FocusLost' });
      assert.equal(game.state.buttons(1), 0);
      assert.equal(game.state.buttons(2), 0);
      await delay(1500);
      stats = game.stream.getWorkerStats();
      assert.ok(stats.processed > 96000n, `${rom}: audio must progress`);
      assert.ok(game.state.frameNumber > 60, `${rom}: video must progress`);
      assert.equal(game.stream.getWorkerError(), undefined);
      const pixels = game.texture.copyToImage().pixels;
      assert.ok(new Set(new Uint32Array(pixels.buffer, pixels.byteOffset, pixels.length / 4)).size > 1,
        `${rom}: texture must contain a rendered game`);
      if (process.env.PLAY_NES_SCREENSHOT_DIR) {
        await game.texture.copyToImage().saveToFile(`${process.env.PLAY_NES_SCREENSHOT_DIR}/${rom}.png`);
      }
      game.handleEvent({ kind: 'KeyPressed', code: KeyboardKey.Escape });
      await run;
      assert.equal(game.window.isOpen(), false);
      console.log(JSON.stringify({ rom, frames: game.state.frameNumber, ...stats },
        (_key, value) => (typeof value === 'bigint' ? String(value) : value)));
    } finally {
      await game.close();
      await run;
    }
  }
  await assert.rejects(Game.create({
    ...parseOptions([ 'croom' ]), rom: fileURLToPath(import.meta.url),
  }), /Not a valid NES ROM/i);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
