import { Address, Byte, ByteArrayAndIdx } from '../types';
import { Cartridge } from '../cartridge';
import { Mapper, NameTableMirroring, Type } from '../mapper';

export class MapperSxROM extends Mapper {
  mirroringCallback: () => void;
  mirroring: NameTableMirroring;
  usesCharacterRAM: boolean;
  modeCHR: number;
  modePRG: number;

  tempRegister: Byte;
  writeCounter: number;

  regPRG: Byte;
  regCHR0: Byte;
  regCHR1: Byte;

  firstBankPRG: ByteArrayAndIdx;
  secondBankPRG: ByteArrayAndIdx;

  firstBankCHR: ByteArrayAndIdx;
  secondBankCHR: ByteArrayAndIdx;

  characterRAM: Byte[] = [];

  #calculatePRGPointers() {
    if (this.modePRG <= 1) { // 32KB changeable
      this.firstBankPRG = {
        arr: this.cartridge.getROM(),
        idx: 0x8000 * (this.regPRG >> 1),
      };

      this.secondBankPRG = {
        arr: this.firstBankPRG.arr,
        idx: this.firstBankPRG.idx + 0x4000, // add 16KB
      };
    } else if (this.modePRG === 2) { // Fix first switch second
      this.firstBankPRG = {
        arr: this.cartridge.getROM(),
        idx: 0,
      };

      this.secondBankPRG = {
        arr: this.firstBankPRG.arr,
        idx: this.firstBankPRG.idx + 0x4000 * this.regPRG,
      };
    } else { // switch first fix second
      this.firstBankPRG = {
        arr: this.cartridge.getROM(),
        idx: 0x4000 * this.regPRG,
      };

      this.secondBankPRG = {
        arr: this.cartridge.getROM(),
        idx: this.cartridge.getROM().length - 0x4000,
      };
    }
  }

  constructor(cart: Cartridge, mirroringCallback: () => void) {
    super(cart, Type.SxROM);

    this.mirroringCallback = mirroringCallback;
    this.mirroring = NameTableMirroring.Horizontal;
    this.modeCHR = 0;
    this.modePRG = 3;
    this.tempRegister = 0;
    this.writeCounter = 0;
    this.regPRG = 0;
    this.regCHR0 = 0;
    this.regCHR1 = 0;

    if (cart.getVROM().length === 0) {
      this.usesCharacterRAM = true;
      for (let i = 0; i < 0x2000; i++) this.characterRAM.push(0);
      console.log('Uses character RAM');
    } else {
      console.log('Using CHR-ROM');
      this.usesCharacterRAM = false;
      this.firstBankCHR = { arr: cart.getVROM(), idx: 0 };
      this.secondBankCHR = { arr: cart.getVROM(), idx: 0x1000 * this.regCHR1 };
    }

    this.firstBankPRG = { arr: cart.getROM(), idx: 0 };
    this.secondBankPRG = {
      arr: cart.getROM(),
      idx: cart.getROM().length - 0x4000,
    };
  }

  getNameTableMirroring(): NameTableMirroring {
    return this.mirroring;
  }

  readPRG(addr: Address): Byte {
    if (addr < 0xc000) {
      return this.firstBankPRG.arr[this.firstBankPRG.idx + (addr & 0x3fff)];
    } else {
      return this.secondBankPRG.arr[this.secondBankPRG.idx + (addr & 0x3fff)];
    }
  }

  writePRG(addr: Address, value: Byte) {
    value = value & 0xff;

    if (!(value & 0x80)) { // if reset bit is NOT set
      this.tempRegister = (this.tempRegister >> 1) | ((value & 1) << 4);
      this.writeCounter++;

      if (this.writeCounter === 5) {
        if (addr < 0x9fff) {
          switch (this.tempRegister & 0x3) {
            case 0: this.mirroring = NameTableMirroring.OneScreenLower; break;
            case 1: this.mirroring = NameTableMirroring.OneScreenHigher; break;
            case 2: this.mirroring = NameTableMirroring.Vertical; break;
            case 3: this.mirroring = NameTableMirroring.Horizontal; break;
          }

          this.mirroringCallback();

          this.modeCHR = (this.tempRegister & 0x10) >> 4;
          this.modePRG = (this.tempRegister & 0xc) >> 2;
          this.#calculatePRGPointers();

          // Recalculate CHR pointers.
          if (this.modeCHR == 0) { // One 8KB bank.
            this.firstBankCHR = {
              arr: this.cartridge.getVROM(),
              idx: 0x1000 * (this.regCHR0 | 1),
            }; // Ignore last bit

            this.secondBankCHR = {
              arr: this.firstBankCHR.arr,
              idx: this.firstBankCHR.idx + 0x1000,
            };
          } else { // Two 4KB banks.
            this.firstBankCHR = {
              arr: this.cartridge.getVROM(),
              idx: 0x1000 * this.regCHR0,
            }; // Ignore last bit

            this.secondBankCHR = {
              arr: this.cartridge.getVROM(),
              idx: 0x1000 * this.regCHR1,
            };
          }
        } else if (addr <= 0xbfff) { // CHR Reg 0
          this.regCHR0 = this.tempRegister;
          this.firstBankCHR = {
            arr: this.cartridge.getVROM(),
            idx: 0x1000 * (this.tempRegister | (1 - this.modeCHR)),
          }; // OR 1 if 8KB mode
          if (this.modeCHR === 0) {
            this.secondBankCHR = {
              arr: this.firstBankCHR.arr,
              idx: this.firstBankCHR.idx + 0x1000,
            };
          }
        } else {
          //TODO: PRG-RAM
          if ((this.tempRegister & 0x10) === 0x10) {
              console.log('PRG-RAM activated.');
          }

          this.tempRegister &= 0xf;
          this.regPRG = this.tempRegister;
          this.#calculatePRGPointers();
        }

        this.tempRegister = 0;
        this.writeCounter = 0;
      }
    } else { // Reset
      this.tempRegister = 0;
      this.writeCounter = 0;
      this.modePRG = 3;
      this.#calculatePRGPointers();
    }
  }

  getPagePtr(addr: Address): ByteArrayAndIdx {
    if (addr < 0xc000) {
      return {
        arr: this.firstBankPRG.arr,
        idx: this.firstBankPRG.idx + (addr & 0x3fff),
      };
    } else {
      return {
        arr: this.secondBankPRG.arr,
        idx: this.secondBankPRG.idx + (addr & 0x3fff),
      };
    }
  }

  readCHR(addr: Address): Byte {
    if (this.usesCharacterRAM) {
      return this.characterRAM[addr];
    } else if (addr < 0x1000) {
      return this.firstBankCHR.arr[this.firstBankCHR.idx + addr];
    } else {
      return this.secondBankCHR.arr[this.secondBankCHR.idx + (addr & 0xfff)];
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
