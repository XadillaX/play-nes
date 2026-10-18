import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseOptions } from '../dist/cli.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

test('CLI preserves ROM aliases, defaults and short options', () => {
  assert.deepEqual(parseOptions([ 'contra' ]), {
    rom: path.resolve(dirname, '../roms/Contra (U).nes'),
    frameRate: 60,
    scale: 2,
  });
  for (const [ alias, filename ] of [
    [ 'croom', 'croom.nes' ],
    [ 'dgolf', 'dgolf.nes' ],
    [ 'transmissing', 'InterglacticTransmissing.nes' ],
  ]) {
    assert.equal(parseOptions([ alias ]).rom, path.resolve(dirname, '../roms', filename));
  }
  assert.deepEqual(parseOptions([ 'my game.nes', '-f', '30', '-s', '1.5' ]), {
    rom: path.resolve('my game.nes'),
    frameRate: 30,
    scale: 1.5,
  });
});

test('CLI rejects missing ROMs, extra arguments and invalid numeric options', () => {
  assert.throws(() => parseOptions([]), /ROM/i);
  assert.throws(() => parseOptions([ 'contra', 'croom' ]), /ROM/i);
  for (const value of [ '0', '1', '9', '-1', 'NaN', 'Infinity', '241', '1.5' ]) {
    assert.throws(() => parseOptions([ 'contra', `--frameRate=${value}` ]), /frameRate/);
  }
  for (const value of [ '0', '-1', 'NaN', 'Infinity', '0.1', '16777216' ]) {
    assert.throws(() => parseOptions([ 'contra', `--scale=${value}` ]), /scale/);
  }
});

test('help and invalid arguments exit without initializing native graphics', () => {
  const help = spawnSync(process.execPath, [ 'bin/nes', '--help' ], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage: nes <rom>/);
  assert.equal(help.stderr, '');
  const missing = spawnSync(process.execPath, [ 'bin/nes' ], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /ROM/i);
  assert.doesNotMatch(missing.stderr, /dlopen|at .*\.js:\d/);
});
