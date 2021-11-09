import { Address, Byte } from './types';
import { Mapper, NameTableMirroring } from './mapper';

export class PictureBus {
  ram: Byte[];
  nameTable0 = 0;
  nameTable1 = 0;
  nameTable2 = 0;
  nameTable3 = 0;

  palette: Byte[];
  mapper: Mapper;

  constructor() {
    this.ram = [];
    for (let i = 0; i < 0x800; i++) this.ram.push(0);
    this.palette = [];
    for (let i = 0; i < 0x20; i++) this.ram.push(0);
  }

  read(addr: Address): Byte {
    if (addr < 0x2000) {
      return this.mapper.readCHR(addr);
    } else if (addr < 0x3eff) {
      // Name tables upto 0x3000, then mirrored upto 3eff
      const index = addr & 0x3ff;
      if (addr < 0x2400) { // NT0
        return this.ram[this.nameTable0 + index];
      } else if (addr < 0x2800) { // NT1
        return this.ram[this.nameTable1 + index];
      } else if (addr < 0x2c00) { // NT2
        return this.ram[this.nameTable2 + index];
      }

      // NT3
      return this.ram[this.nameTable3 + index];
    } else if (addr < 0x3fff) {
      return this.palette[addr & 0x1f];
    }

    return 0;
  }

  readPalette(paletteAddr: Byte): Byte {
    return this.palette[paletteAddr];
  }

  write(addr: Address, value: Byte) {
    value = value & 0xff;
    if (addr < 0x2000) {
      this.mapper.writeCHR(addr, value);
    } else if (addr < 0x3eff) {
      // Name tables upto 0x3000, then mirrored upto 3eff
      const index = addr & 0x3ff;
      if (addr < 0x2400) { // NT0
        this.ram[this.nameTable0 + index] = value;
      } else if (addr < 0x2800) { // NT1
        this.ram[this.nameTable1 + index] = value;
      } else if (addr < 0x2c00) { // NT2
        this.ram[this.nameTable2 + index] = value;
      } else { // NT3
        this.ram[this.nameTable3 + index] = value;
      }
    } else if (addr < 0x3fff) {
      if (addr === 0x3f10) {
        this.palette[0] = value;
      } else {
        this.palette[addr & 0x1f] = value;
      }
    }
  }

  updateMirroring() {
    switch (this.mapper.getNameTableMirroring()) {
      case NameTableMirroring.Horizontal:
        this.nameTable0 = this.nameTable1 = 0;
        this.nameTable2 = this.nameTable3 = 0x400;
        console.log(
          'Horizontal Name Table mirroring set. (Vertical Scrolling)');
        break;

      case NameTableMirroring.Vertical:
        this.nameTable0 = this.nameTable2 = 0;
        this.nameTable1 = this.nameTable3 = 0x400;
        console.log(
          'Vertical Name Table mirroring set. (Horizontal Scrolling)');
        break;

      case NameTableMirroring.OneScreenLower:
        this.nameTable0 = this.nameTable1 =
        this.nameTable2 = this.nameTable3 = 0;
        console.log('Single Screen mirroring set with lower bank.');
        break;

      case NameTableMirroring.OneScreenHigher:
        this.nameTable0 = this.nameTable1 =
        this.nameTable2 = this.nameTable3 = 0x400;
        console.log('Single Screen mirroring set with higher bank.');
        break;

      default:
        this.nameTable0 = this.nameTable1 =
        this.nameTable2 = this.nameTable3 = 0;
        console.error(
          'Unsupported Name Table mirroring : ' +
          this.mapper.getNameTableMirroring());
    }
  }

  setMapper(mapper: Mapper): void {
    this.mapper = mapper;
    this.updateMirroring();
  }
}
