import { Address, Byte, ByteArrayAndIdx } from '../types';
import { Cartridge } from '../cartridge';
import { Mapper, Type } from '../mapper';

export class MapperNROM extends Mapper {
  oneBank: boolean;
  usesCharacterRAM: boolean;
  characterRAM: Byte[];

  constructor(cart: Cartridge) {
    super(cart, Type.NROM);
    if (cart.getROM().length === 0x4000) { // 1 bank
      this.oneBank = true;
    } else {
      this.oneBank = false;
    }

    if (cart.getVROM().length === 0) {
      this.usesCharacterRAM = true;
      for (let i = 0; i < 0x2000; i++) {
        this.characterRAM.push(0);
        console.log('Use character RAM.');
      }
    } else {
      this.usesCharacterRAM = false;
    }
  }

  readPRG(addr: Address): Byte {
    if (!this.oneBank) {
      return this.cartridge.getROM()[addr - 0x8000];
    } else { // mirrored
      return this.cartridge.getROM()[(addr - 0x8000) & 0x3fff];
    }
  }

  writePRG(addr: Address, value: Byte) {
    console.log(`ROM memory write attempt at ${addr} to set ${value}.`);
  }

  getPagePtr(addr: Address): ByteArrayAndIdx {
    if (!this.oneBank) {
      return { arr: this.cartridge.getROM(), idx: addr - 0x8000 };
    } else {
      return { arr: this.cartridge.getROM(), idx: (addr - 0x8000) & 0x3fff };
    }
  }

  readCHR(addr: Address): Byte {
    if (this.usesCharacterRAM) {
      return this.characterRAM[addr];
    } else {
      return this.cartridge.getVROM()[addr];
    }
  }

  writeCHR(addr: Address, value: Byte) {
    value = value & 0xff;
    if (this.usesCharacterRAM) {
      this.characterRAM[addr] = value;
    } else {
      console.log(
        `Read-only CHR memory write attempt at ${addr.toString(16)}.`);
    }
  }
}
