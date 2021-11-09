import { Address, Byte } from './types';
import { Mapper } from './mapper';

export enum IORegisters {
  PPUCTRL = 0x2000,
  PPUMASK,
  PPUSTATUS,
  OAMADDR,
  OAMDATA,
  PPUSCROL,
  PPUADDR,
  PPUDATA,
  OAMDMA = 0x4014,
  JOY1 = 0x4016,
  JOY2 = 0x4017,
}

export class MainBus {
  #ram: Byte[] = [];
  #extRAM: Byte[] = [];
  #mapper: Mapper;

  #writeCallbacks: Map<IORegisters, (byte: Byte) => void> = new Map();
  #readCallbacks: Map<IORegisters, () => Byte> = new Map();

  constructor() {
    for (let i = 0; i < 0x800; i++) this.#ram.push(0);
  }

  write(addr: Address, value: Byte): void {
    // TODO
    addr;
    value;
  }

  read(addr: Address): Byte {
    // TODO
    return addr;
  }
}
