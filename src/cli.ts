import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { GameOptions } from './game.js';

/** Bundled ROM aliases; paths are relative to the installed package. */
const ROMS: Readonly<Record<string, string>> = {
  contra: 'Contra (U).nes',
  croom: 'croom.nes',
  dgolf: 'dgolf.nes',
  transmissing: 'InterglacticTransmissing.nes',
};

/** CLI usage; displaying help does not initialize SFML. */
const HELP = `Usage: nes <rom> [options]

rom   A ROM file path or built-in name: contra, croom, dgolf, transmissing.

Options:
  -f, --frameRate RATE   Emulation and display rate, 10–240 fps. [60]
  -s, --scale SCALE     Window scale; must produce whole pixels. [2]
  -h, --help            Show this help.
`;

/**
 * Resolve ROM paths and validate dimensions and emulation speed.
 * @param args Command-line arguments without the executable.
 * @return {object} Game options or a help request.
 */
export function parseOptions(args: string[]): GameOptions | { help: true } {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      frameRate: { type: 'string', short: 'f', default: '60' },
      scale: { type: 'string', short: 's', default: '2' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) return { help: true };
  if (positionals.length !== 1) throw new Error('Provide exactly one ROM path or built-in name.');
  const frameRate = Number(values.frameRate);
  const scale = Number(values.scale);
  if (!Number.isInteger(frameRate) || frameRate < 10 || frameRate > 240) {
    throw new Error('frameRate must be an integer from 10 to 240.');
  }
  if (!Number.isFinite(scale) || scale <= 0 ||
      !Number.isSafeInteger(256 * scale) || !Number.isSafeInteger(240 * scale) ||
      256 * scale > 0xffffffff) {
    throw new Error('scale must produce positive whole-pixel dimensions within the uint32 range.');
  }
  const name = positionals[0];
  const rom = Object.prototype.hasOwnProperty.call(ROMS, name) ?
    fileURLToPath(new URL(`../roms/${ROMS[name]}`, import.meta.url)) : path.resolve(name);
  return { rom, frameRate, scale };
}

/**
 * Load the native player after validating command-line arguments.
 * @param args Command-line arguments.
 */
export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseOptions(args);
  if ('help' in options) {
    process.stdout.write(HELP);
    return;
  }
  const { Game } = await import('./game.js');
  const game = await Game.create(options);
  await game.run();
}
