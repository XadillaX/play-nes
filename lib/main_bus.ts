import { Address, Byte, ByteArrayAndIdx } from './types';
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

const emptyReadCallback = (addr: Address): Byte => {
  console.error(
    'No read callback registered for I/O register at ' +
    addr.toString(16));
  return 0;
};

const emptyWriteCallback = (addr: Address/* , _: Byte */): void => {
  console.error(
    'No write callback registered for I/O register at ' +
    addr.toString(16));
};

export type WriteCallback = (byte: Byte) => void;
export type ReadCallback = () => Byte;

export class MainBus {
  #ram: Byte[] = [];
  #extRAM: Byte[] = [];
  #mapper: Mapper;

  #writeCallbacks: Map<IORegisters, WriteCallback> = new Map();
  #readCallbacks: Map<IORegisters, ReadCallback> = new Map();

  constructor() {
    for (let i = 0; i < 0x800; i++) this.#ram.push(0);
  }

  getPagePtr(page: Byte): ByteArrayAndIdx | null {
    const addr: Address = page << 8;
    if (addr < 0x2000) {
      return {
        arr: this.#ram,
        idx: addr & 0x7ff,
      };
    } else if (addr < 0x4020) {
      console.error('Register address memory pointer access attempt.');
    } else if (addr < 0x6000) {
      console.error('Expansion ROM access attempted, which is unsupported.');
    } else if (addr < 0x8000) {
      if (this.#mapper.hasExtendedRAM()) {
        return {
          arr: this.#extRAM,
          idx: addr - 0x6000,
        };
      }
    } else {
      // Empty
    }

    return null;
  }

  read(addr: Address): Byte {
    if (addr < 0x2000) {
      return this.#ram[addr & 0x7ff];
    } else if (addr < 0x4020) {
      if (addr < 0x4000) { // PPU registers, mirrored
        return (this.#readCallbacks.get(addr & 0x2007) ||
          emptyReadCallback.bind(null, addr))();
      } else if (addr < 0x4018 && addr >= 0x4014) { // Only *some* IO registers
        return (this.#readCallbacks.get(addr) ||
          emptyReadCallback.bind(null, addr))();
      }

      console.error(`Read access attempt at: ${addr.toString(16)}.`);
    } else if (addr < 0x6000) {
      console.error(
        'Expansion ROM read attempted. This is currently unsupported.');
    } else if (addr < 0x8000) {
      if (this.#mapper.hasExtendedRAM()) {
        return this.#extRAM[addr - 0x6000];
      }
    } else {
      return this.#mapper.readPRG(addr);
    }

    return 0;
  }

  setMapper(mapper: Mapper): void {
    this.#mapper = mapper;

    if (mapper.hasExtendedRAM()) {
      this.#extRAM = [];
      for (let i = 0; i < 0x2000; i++) this.#extRAM.push(0);
    }
  }

  setWriteCallback(reg: IORegisters, callback: WriteCallback): void {
    this.#writeCallbacks.set(reg, callback);
  }

  setReadCallback(reg: IORegisters, callback: ReadCallback): void {
    this.#readCallbacks.set(reg, callback);
  }

  write(addr: Address, value: Byte): void {
    value = value & 0xff;
    if (addr < 0x2000) {
      this.#ram[addr & 0x7ff] = value;
    } else if (addr < 0x4020) {
      if (addr < 0x4000) { // PPU registers, mirrored
        (this.#writeCallbacks.get(addr & 0x2007) ||
          emptyWriteCallback.bind(null, addr))(value);
      } else if (addr < 0x4017 && addr >= 0x4014) { // Only *some* IO registers
        (this.#writeCallbacks.get(addr) ||
          emptyWriteCallback.bind(null, addr))(value);
      } else {
        console.error(`Write access attempt at: ${addr.toString(16)}.`);
      }
    } else if (addr < 0x6000) {
      console.error(
        'Expansion ROM access attempted. This is currently unsupported.');
    } else if (addr < 0x8000) {
      if (this.#mapper.hasExtendedRAM()) {
        this.#extRAM[addr - 0x6000] = value;
      }
    } else {
      this.#mapper.writePRG(addr, value);
    }
  }
}
