# play-nes

A cross-platform desktop NES emulator powered by OpenGL in Node.js.

## Usage

### Installation

```bash
$ npm install -g play-nes
```

> Only support Linux and macOS (M1 not included) so far.

### Play

```bash
$ nes --help

Usage: nes <rom> [options]

rom     The ROM file path or built-in ROM name.

Options:
   -f RATE, --frameRate RATE   The frame rate.  [60]
   -s SCALE, --scale SCALE     The scale value.  [2]
```

So you just need to type command like this:

```bash
$ nes <YOUR NES ROM PATH>
$ nes <BUILT-IN NES ROM NAME>
```

Currently supported built-in ROM names:

+ `contra`
+ `croom`
+ `dgolf`
+ `transmissing`

## Contribution

PR and Issue are welcomed!
