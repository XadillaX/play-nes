import { Address, Byte, ByteArrayAndIdx } from '../types';
import { Cartridge } from '../cartridge';
import { Mapper, Type } from '../mapper';

export class MapperUxROM extends Mapper {
  usesCharacterRAM: boolean;
  characterRAM: Byte[];
  selectPRG: Address;
  lastBankPtr: ByteArrayAndIdx;

  constructor(cart: Cartridge) {
    super(cart, Type.UxROM);

    this.selectPRG = 0;
    if (cart.getVROM().length === 0) {
      this.usesCharacterRAM = true;
      for (let i = 0; i < 0x2000; i++) {
        this.characterRAM.push(0);
        console.log('Use character RAM.');
      }
    } else {
      this.usesCharacterRAM = false;
    }

    this.lastBankPtr = {
      arr: cart.getROM(),
      idx: cart.getROM().length - 0x4000,
    };
  }

  readPRG(addr: Address): Byte {
    if (addr < 0xc000) {
      return this.cartridge.getROM()[
        ((addr - 0x8000) & 0x3fff) | (this.selectPRG << 14)
      ];
    }

    return this.lastBankPtr.arr[this.lastBankPtr.idx + (addr & 0x3fff)];
  }

  writePRG(_: Address, value: Byte) {
    this.selectPRG = value & 0xff;
  }

  getPagePtr(addr: Address): ByteArrayAndIdx {
    if (addr < 0xc000) {
      return {
        arr: this.cartridge.getROM(),
        idx: ((addr - 0x8000) & 0x3fff) | (this.selectPRG << 14),
      };
    }

    return {
      arr: this.lastBankPtr.arr,
      idx: this.lastBankPtr.idx + (addr & 0x3fff),
    };
  }

  readCHR(addr: Address): Byte {
    if (this.usesCharacterRAM) {
      return this.characterRAM[addr];
    }

    return this.cartridge.getVROM()[addr];
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
