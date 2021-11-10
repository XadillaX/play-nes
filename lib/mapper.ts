import { Cartridge } from './cartridge';
import { Address, Byte, ByteArrayAndIdx } from './types';
import {
  MapperCNROM,
  MapperNROM,
  MapperSxROM,
  MapperUxROM,
} from './mappers';

export enum Type {
  NROM = 0,
  SxROM = 1,
  UxROM = 2,
  CNROM = 3,
}

export enum NameTableMirroring {
  Horizontal = 0,
  Vertical = 1,
  FourScreen = 8,
  OneScreenLower,
  OneScreenHigher,
}

export class Mapper {
  cartridge: Cartridge;
  type: Type;

  static createMapper(
    mapperT: Type,
    cart: Cartridge,
    mirroringCb: () => void = () => {}
  ) {
    switch (mapperT) {
      case Type.NROM: return new MapperNROM(cart);
      case Type.SxROM: return new MapperSxROM(cart, mirroringCb);
      case Type.UxROM: return new MapperUxROM(cart);
      case Type.CNROM: return new MapperCNROM(cart);
    }
  }

  constructor(cart: Cartridge, t: Type) {
    this.cartridge = cart;
    this.type = t;
  }

  writeCHR(addr: Address, value: Byte): void {
    addr;
    value;
    throw new Error('Not implemented.');
  }

  readCHR(addr: Address): Byte {
    addr;
    throw new Error('Not implemented.');
  }

  writePRG(addr: Address, value: Byte): void {
    addr;
    value;
    throw new Error('Not implemented.');
  }

  readPRG(addr: Address): Byte {
    addr;
    throw new Error('Not implemented.');
  }

  getPagePtr(addr: Address): ByteArrayAndIdx {
    addr;
    throw new Error('Not implemented.');
  }

  getNameTableMirroring(): NameTableMirroring {
    return this.cartridge.getNameTableMirroring();
  }

  hasExtendedRAM(): boolean {
    return this.cartridge.hasExtendedRAM();
  }
}
