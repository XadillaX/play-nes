import { Address, Byte, ByteArrayAndIdx } from '../types';
import { Cartridge } from '../cartridge';
import { Mapper, Type } from '../mapper';

export class MapperCNROM extends Mapper {
  oneBank: boolean;
  selectCHR: Address;

  constructor(cart: Cartridge) {
    super(cart, Type.CNROM);
    this.selectCHR = 0;
    if (cart.getROM().length === 0x4000) { // 1 bank
      this.oneBank = true;
    } else {
      this.oneBank = false;
    }
  }

  readPRG(addr: Address): Byte {
    if (!this.oneBank) {
      return this.cartridge.getROM()[addr - 0x8000];
    }

    // mirrored
    return this.cartridge.getROM()[(addr - 0x8000) & 0x3fff];
  }

  writePRG(_: Address, value: Byte) {
    this.selectCHR = value & 0x3;
  }

  getPagePtr(addr: Address): ByteArrayAndIdx {
    if (!this.oneBank) {
      return { arr: this.cartridge.getROM(), idx: addr - 0x8000 };
    }

    return { arr: this.cartridge.getROM(), idx: (addr - 0x8000) & 0x3fff };
  }

  readCHR(addr: Address): Byte {
    return this.cartridge.getVROM()[addr | (this.selectCHR << 13)];
  }

  writeCHR(addr: Address, _: Byte) {
    _;
    console.log(`Read-only CHR memory write attempt at ${addr.toString(16)}.`);
  }
}
