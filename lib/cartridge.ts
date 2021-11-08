import fs from 'fs';
import path from 'path';

import { Byte } from './types';

export class Cartridge {
  prgROM: Byte[] = [];
  chrROM: Byte[] = [];
  nameTableMirroring: Byte = 0;
  mapperNumber: Byte = 0;
  extendedRAM = false;

  getROM(): Byte[] {
    return this.prgROM;
  }

  getVROM(): Byte[] {
    return this.chrROM;
  }

  getMapper(): Byte {
    return this.mapperNumber;
  }

  getNameTableMirroring(): Byte {
    return this.nameTableMirroring;
  }

  hasExtendedRAM(): boolean {
    return this.extendedRAM;
  }

  async loadFromFile(filename: string): Promise<void> {
    filename = path.join(process.cwd(), filename);
    const buff: Buffer = await fs.promises.readFile(filename);

    if (buff.byteLength < 0x10) {
      throw new Error('Reading iNES header failed.');
    }

    if (buff.slice(0, 4).toString() !== 'NES\x1A') {
      throw new Error(
        'Not a valid iNES image. Magic Number: ' +
        `${buff.slice(0, 4).toString()}, valid magic number: N E S 1a.`);
    }

    console.log('Reading header, it dictates:');

    const banks = buff.readUInt8(4);
    console.log(`16KB PRG-ROM Banks: ${banks}.`);
    if (!banks) {
      throw new Error('ROM has no PRG-ROM banks. Loading ROM failed.');
    }

    const vbanks: Byte = buff.readUInt8(5);
    console.log(`8KB CHR-ROM Banks: ${vbanks}.`);

    this.nameTableMirroring = buff.readUInt8(6) & 0xb;
    console.log(`Name Table Mirroring: ${this.nameTableMirroring}.`);

    this.mapperNumber = ((buff.readUInt8(6) >> 4) & 0xf) |
      buff.readUInt8(7) & 0xf0;
    console.log(`Mapper: #${this.mapperNumber}.`);

    this.extendedRAM = (buff.readUInt8(6) & 0x2) !== 0;
    console.log(`Extended (CPU) RAM: ${this.extendedRAM}.`);

    if (buff.readUInt8(6) & 0x4) {
      throw new Error('Trainer is not supported.');
    }

    if ((buff.readUInt8(0xa) & 0x3) === 0x2 || (buff.readUInt8(0xa) & 0x1)) {
      throw new Error('PAL ROM is not supporetd.');
    } else {
      console.log('ROM is NTSC compatible.');
    }

    if (buff.byteLength < 0x10 + 0x4000 * banks) {
      throw new Error('Reading PRG-ROM from image file failed.');
    }

    // PRG-ROM 16KB banks
    for (let i = 0x10; i < 0x10 + 0x4000 * banks; i++) {
      this.prgROM.push(buff.readUInt8(i));
    }

    // CHR-ROM 8KB banks
    if (vbanks) {
      if (buff.byteLength < 0x10 + 0x4000 * banks + 0x2000 * vbanks) {
        throw new Error('Reading CHR-ROM from image file failed.');
      }

      for (let i = 0x10 + 0x4000 * banks;
        i < 0x10 + 0x4000 * banks + 0x2000 * vbanks;
        i++) {
        this.chrROM.push(buff.readUInt8(i));
      }
    } else {
      console.log('Cartridge with CHR-RAM.');
    }
  }
}
