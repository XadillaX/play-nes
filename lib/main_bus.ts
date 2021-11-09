import { Address, Byte } from './types';

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
  #extRAM: Byte[] = []

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
