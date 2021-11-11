import { Address, Byte, Int8 } from './types';
import { MainBus } from './main_bus';
import * as CPUOpcodes from './cpu_opcodes';

export enum InterruptType {
  IRQ,
  NMI,
  BRK_,
}

export class CPU {
  skipCycles: number;
  cycles: number;

  rPC: Address;
  rSP: Byte;
  rA: Byte;
  rX: Byte;
  rY: Byte;

  fC: boolean;
  fZ: boolean;
  fI: boolean;
  fD: boolean;
  fV: boolean;
  fN: boolean;

  bus: MainBus;

  #executeBranch(opcode: Byte): boolean {
    if (
      (opcode & CPUOpcodes.branchInstructionMask) ===
      CPUOpcodes.branchInstructionMaskResult
    ) {
      // branch is initialized to the condition required (for the flag specified
      // later).
      let branch: boolean = (opcode & CPUOpcodes.branchConditionMask) !== 0;

      // Set branch to true if the given condition is met by the given flag.
      // We use xnor here, it is true if either both operands are true or false.
      switch (
        (opcode >> CPUOpcodes.branchOnFlagShift) as CPUOpcodes.BranchOnFlag
      ) {
        case CPUOpcodes.BranchOnFlag.Negative: {
          branch = branch === this.fN;
          break;
        }

        case CPUOpcodes.BranchOnFlag.Overflow: {
          branch = branch === this.fV;
          break;
        }

        case CPUOpcodes.BranchOnFlag.Carry: {
          branch = branch === this.fC;
          break;
        }

        case CPUOpcodes.BranchOnFlag.Zero: {
          branch = branch === this.fZ;
          break;
        }

        default:
          return false;
      }

      if (branch) {
        const offset: Int8 = this.bus.read(this.rPC++);
        ++this.skipCycles;
        const newPC: Address = this.rPC + offset;
        this.#setPageCrossed(this.rPC, newPC, 2);
        this.rPC = newPC;
      } else {
        ++this.rPC;
      }

      return true;
    }

    return false;
  }

  // Instructions are split into five sets to make decoding easier.
  // These functions return true if they succeed
  #executeImplied(opcode: CPUOpcodes.OperationImplied): boolean {
    switch (opcode) {
      case CPUOpcodes.OperationImplied.NOP:
        break;
      case CPUOpcodes.OperationImplied.BRK: {
        this.interrupt(InterruptType.BRK_);
        break;
      }

      case CPUOpcodes.OperationImplied.JSR: {
        // Push address of next instruction - 1, thus r_PC + 1 instead of
        // r_PC + 2 since r_PC and r_PC + 1 are address of subroutine.
        this.#pushStack((this.rPC + 1) >> 8);
        this.#pushStack(this.rPC + 1);
        this.rPC = this.#readAddress(this.rPC);
        break;
      }

      case CPUOpcodes.OperationImplied.RTS: {
        this.rPC = this.#pullStack();
        this.rPC |= this.#pullStack() << 8;
        ++this.rPC;
        break;
      }

      case CPUOpcodes.OperationImplied.RTI: {
        const flags: Byte = this.#pullStack();
        this.fN = (flags & 0x80) !== 0;
        this.fV = (flags & 0x40) !== 0;
        this.fD = (flags & 0x8) !== 0;
        this.fI = (flags & 0x4) !== 0;
        this.fZ = (flags & 0x2) !== 0;
        this.fC = (flags & 0x1) !== 0;

        this.rPC = this.#pullStack();
        this.rPC |= this.#pullStack() << 8;

        break;
      }

      case CPUOpcodes.OperationImplied.JMP: {
        this.rPC = this.#readAddress(this.rPC);
        break;
      }

      case CPUOpcodes.OperationImplied.JMPI: {
        const location: Address = this.#readAddress(this.rPC);

        // 6502 has a bug such that the when the vector of anindirect address
        // begins at the last byte of a page, the second byte is fetched from
        // the beginning of that page rather than the beginning of the next
        // Recreating here:
        const page: Address = location & 0xff00;
        this.rPC =
          this.bus.read(location) |
          (this.bus.read(page | ((location + 1) & 0xff)) << 8);

        break;
      }

      case CPUOpcodes.OperationImplied.PHP: {
        const flags: Byte =
          ((this.fN as any) << 7) |
          ((this.fV as any) << 6) |
          (1 << 5) | // supposed to always be 1
          (1 << 4) | // PHP pushes with the B flag as 1, no matter what
          ((this.fD as any) << 3) |
          ((this.fI as any) << 2) |
          ((this.fZ as any) << 1) |
          (this.fC as any);

        this.#pushStack(flags);
        break;
      }

      case CPUOpcodes.OperationImplied.PLP: {
        const flags: Byte = this.#pullStack();
        this.fN = (flags & 0x80) !== 0;
        this.fV = (flags & 0x40) !== 0;
        this.fD = (flags & 0x8) !== 0;
        this.fI = (flags & 0x4) !== 0;
        this.fZ = (flags & 0x2) !== 0;
        this.fC = (flags & 0x1) !== 0;
        break;
      }

      case CPUOpcodes.OperationImplied.PHA: {
        this.#pushStack(this.rA);
        break;
      }

      case CPUOpcodes.OperationImplied.PLA: {
        this.rA = this.#pullStack();
        this.#setZN(this.rA);
        break;
      }

      case CPUOpcodes.OperationImplied.DEY: {
        --this.rY;
        this.#setZN(this.rY);
        break;
      }

      case CPUOpcodes.OperationImplied.DEX: {
        --this.rX;
        this.#setZN(this.rX);
        break;
      }

      case CPUOpcodes.OperationImplied.TAY: {
        this.rY = this.rA;
        this.#setZN(this.rY);
        break;
      }

      case CPUOpcodes.OperationImplied.INY: {
        ++this.rY;
        this.#setZN(this.rY);
        break;
      }

      case CPUOpcodes.OperationImplied.INX: {
        ++this.rX;
        this.#setZN(this.rX);
        break;
      }

      case CPUOpcodes.OperationImplied.CLC: {
        this.fC = false;
        break;
      }

      case CPUOpcodes.OperationImplied.SEC: {
        this.fC = true;
        break;
      }

      case CPUOpcodes.OperationImplied.CLI: {
        this.fI = false;
        break;
      }

      case CPUOpcodes.OperationImplied.SEI: {
        this.fI = true;
        break;
      }

      case CPUOpcodes.OperationImplied.CLD: {
        this.fD = false;
        break;
      }

      case CPUOpcodes.OperationImplied.SED: {
        this.fD = true;
        break;
      }

      case CPUOpcodes.OperationImplied.TYA: {
        this.rA = this.rY;
        this.#setZN(this.rA);
        break;
      }

      case CPUOpcodes.OperationImplied.CLV: {
        this.fV = false;
        break;
      }

      case CPUOpcodes.OperationImplied.TXA: {
        this.rA = this.rX;
        this.#setZN(this.rA);
        break;
      }

      case CPUOpcodes.OperationImplied.TXS: {
        this.rSP = this.rX;
        break;
      }

      case CPUOpcodes.OperationImplied.TAX: {
        this.rX = this.rA;
        this.#setZN(this.rX);
        break;
      }

      case CPUOpcodes.OperationImplied.TSX: {
        this.rX = this.rSP;
        this.#setZN(this.rX);
        break;
      }

      default:
        return false;
    }

    return true;
  }

  #executeType0(opcode: Byte): boolean {
    if ((opcode & CPUOpcodes.instructionModeMask) === 0x0) {
      let location: Address = 0;
      switch (
        ((opcode & CPUOpcodes.addrModeMask) >>
          CPUOpcodes.addrModeShift) as CPUOpcodes.AddrMode2
      ) {
        case CPUOpcodes.AddrMode2.Immediate_:
          location = this.rPC++;
          break;

        case CPUOpcodes.AddrMode2.ZeroPage_:
          location = this.bus.read(this.rPC++);
          break;

        case CPUOpcodes.AddrMode2.Absolute_:
          location = this.#readAddress(this.rPC);
          this.rPC += 2;
          break;

        case CPUOpcodes.AddrMode2.Indexed:
          // Address wraps around in the zero page.
          location = (this.bus.read(this.rPC++) + this.rX) & 0xff;
          break;

        case CPUOpcodes.AddrMode2.AbsoluteIndexed:
          location = this.#readAddress(this.rPC);
          this.rPC += 2;
          this.#setPageCrossed(location, location + this.rX);
          location += this.rX;
          break;

        default:
          return false;
      }

      let operand = 0;
      switch (
        ((opcode & CPUOpcodes.operationMask) >>
          CPUOpcodes.operationShift) as CPUOpcodes.Operation0
      ) {
        case CPUOpcodes.Operation0.BIT:
          operand = this.bus.read(location);
          this.fZ = !(this.rA & operand);
          this.fV = (operand & 0x40) !== 0;
          this.fN = (operand & 0x80) !== 0;
          break;

        case CPUOpcodes.Operation0.STY:
          this.bus.write(location, this.rY);
          break;

        case CPUOpcodes.Operation0.LDY:
          this.rY = this.bus.read(location);
          this.#setZN(this.rY);
          break;

        case CPUOpcodes.Operation0.CPY: {
          const diff: number = this.rY - this.bus.read(location);
          this.fC = !(diff & 0x100);
          this.#setZN(diff & 0xff);
          break;
        }

        case CPUOpcodes.Operation0.CPX: {
          const diff: number = this.rX - this.bus.read(location);
          this.fC = !(diff & 0x100);
          this.#setZN(diff & 0xff);
          break;
        }

        default:
          return false;
      }

      return true;
    }

    return false;
  }

  #executeType1(opcode: Byte): boolean {
    if ((opcode & CPUOpcodes.instructionModeMask) === 0x1) {
      let location: Address = 0; // Location of the operand, could be in RAM.
      const op: CPUOpcodes.Operation1 =
        (opcode & CPUOpcodes.operationMask) >> CPUOpcodes.operationShift;
      switch (
        ((opcode & CPUOpcodes.addrModeMask) >>
          CPUOpcodes.addrModeShift) as CPUOpcodes.AddrMode1
      ) {
        case CPUOpcodes.AddrMode1.IndexedIndirectX: {
          const zeroAddr: Byte = (this.rX + this.bus.read(this.rPC++)) & 0xff;

          // Addresses wrap in zero page mode, thus pass through a mask
          location =
            this.bus.read(zeroAddr & 0xff) |
            (this.bus.read((zeroAddr + 1) & 0xff) << 8);
          break;
        }

        case CPUOpcodes.AddrMode1.ZeroPage: {
          location = this.bus.read(this.rPC++);
          break;
        }

        case CPUOpcodes.AddrMode1.Immediate: {
          location = this.rPC++;
          break;
        }

        case CPUOpcodes.AddrMode1.Absolute: {
          location = this.#readAddress(this.rPC);
          this.rPC += 2;
          break;
        }

        case CPUOpcodes.AddrMode1.IndirectY: {
          const zeroAddr: Byte = this.bus.read(this.rPC++);
          location =
            this.bus.read(zeroAddr & 0xff) |
            (this.bus.read((zeroAddr + 1) & 0xff) << 8);
          if (op !== CPUOpcodes.Operation1.STA) {
            this.#setPageCrossed(location, location + this.rY);
          }

          location += this.rY;
          break;
        }

        case CPUOpcodes.AddrMode1.IndexedX: {
          // Address wraps around in the zero page
          location = (this.bus.read(this.rPC++) + this.rX) & 0xff;
          break;
        }

        case CPUOpcodes.AddrMode1.AbsoluteY: {
          location = this.#readAddress(this.rPC);
          this.rPC += 2;
          if (op !== CPUOpcodes.Operation1.STA) {
            this.#setPageCrossed(location, location + this.rY);
          }

          location += this.rY;
          break;
        }

        case CPUOpcodes.AddrMode1.AbsoluteX: {
          location = this.#readAddress(this.rPC);
          this.rPC += 2;
          if (op !== CPUOpcodes.Operation1.STA) {
            this.#setPageCrossed(location, location + this.rX);
          }
          location += this.rX;
          break;
        }

        default:
          false;
      }

      switch (op) {
        case CPUOpcodes.Operation1.ORA: {
          this.rA |= this.bus.read(location);
          this.#setZN(this.rA);
          break;
        }

        case CPUOpcodes.Operation1.AND: {
          this.rA &= this.bus.read(location);
          this.#setZN(this.rA);
          break;
        }

        case CPUOpcodes.Operation1.EOR: {
          this.rA ^= this.bus.read(location);
          this.#setZN(this.rA);
          break;
        }

        case CPUOpcodes.Operation1.ADC: {
          const operand: Byte = this.bus.read(location);
          const sum = (this.rA + operand + (this.fC ? 1 : 0)) & 0xffff;

          // Carry forward or UNSIGNED overflow.
          this.fC = (sum & 0x100) !== 0;

          // SIGNED overflow, would only happen if the sign of sum is different
          // from BOTH the operands.
          this.fV = ((this.rA ^ sum) & (operand ^ sum) & 0x80) !== 0;
          this.rA = sum & 0xff;
          this.#setZN(this.rA);
          break;
        }

        case CPUOpcodes.Operation1.STA: {
          this.bus.write(location, this.rA);
          break;
        }

        case CPUOpcodes.Operation1.LDA: {
          this.rA = this.bus.read(location);
          this.#setZN(this.rA);
          break;
        }

        case CPUOpcodes.Operation1.SBC: {
          // High carry means "no borrow", thus negate and subtract.
          const subtrahend: number = this.bus.read(location);
          const diff: number =
            (this.rA - subtrahend - (this.fC ? 0 : 1)) & 0xffff;

          // If the ninth bit is 1, the resulting number is
          // negative => borrow => low carry
          this.fC = !(diff & 0x100);
          // Same as ADC, except instead of the subtrahend, substitute with it's
          // one complement.
          this.fV = ((this.rA ^ diff) & (~subtrahend ^ diff) & 0x80) !== 0;
          this.rA = diff;
          this.#setZN(diff);
          break;
        }

        case CPUOpcodes.Operation1.CMP: {
          const diff = (this.rA - this.bus.read(location)) & 0xffff;
          this.fC = !(diff & 0x100);
          this.#setZN(diff);
          break;
        }

        default:
          return false;
      }

      return true;
    }

    return false;
  }

  #executeType2(opcode: Byte): boolean {
    if ((opcode & CPUOpcodes.instructionModeMask) === 2) {
      let location: Address = 0;
      const op: CPUOpcodes.Operation2 =
        (opcode & CPUOpcodes.operationMask) >> CPUOpcodes.operationShift;
      const addrMode: CPUOpcodes.AddrMode2 =
        (opcode & CPUOpcodes.addrModeMask) >> CPUOpcodes.addrModeShift;
      switch (addrMode) {
        case CPUOpcodes.AddrMode2.Immediate_: {
          location = this.rPC++;
          break;
        }

        case CPUOpcodes.AddrMode2.ZeroPage_: {
          location = this.bus.read(this.rPC++);
          break;
        }

        case CPUOpcodes.AddrMode2.Accumulator:
          break;

        case CPUOpcodes.AddrMode2.Absolute_: {
          location = this.#readAddress(this.rPC);
          this.rPC += 2;
          break;
        }

        case CPUOpcodes.AddrMode2.Indexed: {
          location = this.bus.read(this.rPC++);
          let index: Byte;
          if (
            op === CPUOpcodes.Operation2.LDX ||
            op === CPUOpcodes.Operation2.STX
          ) {
            index = this.rY;
          } else {
            index = this.rX;
          }

          // The mask wraps address around zero page.
          location = (location + index) & 0xff;

          break;
        }

        case CPUOpcodes.AddrMode2.AbsoluteIndexed: {
          location = this.bus.read(this.rPC++);
          this.rPC += 2;
          let index: Byte;
          if (
            op === CPUOpcodes.Operation2.LDX ||
            op === CPUOpcodes.Operation2.STX
          ) {
            index = this.rY;
          } else {
            index = this.rX;
          }
          this.#setPageCrossed(location, location + index);
          location += index;
          break;
        }

        default:
          return false;
      }

      let operand = 0;
      switch (op) {
        case CPUOpcodes.Operation2.ASL:
        case CPUOpcodes.Operation2.ROL: {
          const prevC: boolean = this.fC;
          if (addrMode === CPUOpcodes.AddrMode2.Accumulator) {
            this.fC = (this.rA & 0x80) !== 0;
            this.rA <<= 1;
            // If Rotating, set the bit-0 to the the previous carry.
            this.rA =
              this.rA | (prevC && op === CPUOpcodes.Operation2.ROL ? 1 : 0);
            this.rA = this.rA & 0xff;
            this.#setZN(this.rA);
          } else {
            operand = this.bus.read(location);
            this.fC = (operand & 0x80) !== 0;
            operand =
              (operand << 1) |
              (prevC && op === CPUOpcodes.Operation2.ROL ? 1 : 0);
            operand = operand & 0xff;
            this.#setZN(operand);
            this.bus.write(location, operand);
          }
          break;
        }

        case CPUOpcodes.Operation2.LSR:
        case CPUOpcodes.Operation2.ROR: {
          const prevC: boolean = this.fC;
          if (addrMode === CPUOpcodes.AddrMode2.Accumulator) {
            this.fC = (this.rA & 1) !== 0;
            this.rA >>= 1;
            // If Rotating, set the bit-7 to the previous carry.
            this.rA =
              this.rA |
              ((prevC && op === CPUOpcodes.Operation2.ROR ? 1 : 0) << 7);
            this.rA = this.rA & 0xff;
            this.#setZN(this.rA);
          } else {
            operand = this.bus.read(location);
            this.fC = (operand & 1) !== 0;
            operand =
              (operand >> 1) |
              ((prevC && op === CPUOpcodes.Operation2.ROR ? 1 : 0) << 7);
            operand = operand & 0xff;
            this.#setZN(operand);
            this.bus.write(location, operand);
          }

          break;
        }

        case CPUOpcodes.Operation2.STX: {
          this.bus.write(location, this.rX);
          break;
        }

        case CPUOpcodes.Operation2.LDX: {
          this.rX = this.bus.read(location);
          this.#setZN(this.rX);
          break;
        }

        case CPUOpcodes.Operation2.DEC: {
          const tmp = this.bus.read(location) - 1;
          this.#setZN(tmp);
          this.bus.write(location, tmp);
          break;
        }

        case CPUOpcodes.Operation2.INC: {
          const tmp = this.bus.read(location) + 1;
          this.#setZN(tmp);
          this.bus.write(location, tmp);
          break;
        }

        default:
          return false;
      }

      return true;
    }

    return false;
  }

  #pullStack(): Byte {
    return this.bus.read(0x100 | ++this.rSP) & 0xff;
  }

  #pushStack(value: Byte): void {
    // Regard `value` as Byte.
    this.bus.write(0x100 | this.rSP, value & 0xff);
    --this.rSP; // Hardware stacks grow downward!
  }

  #readAddress(addr: Address): Address {
    return this.bus.read(addr) | (this.bus.read(addr + 1) << 8);
  }

  #setPageCrossed(a: Address, b: Address, inc = 1): void {
    if ((a & 0xff00) !== (b & 0xff00)) {
      this.skipCycles += inc;
    }
  }

  #setZN(value: Byte): void {
    // Regard `value` as Byte.
    value = value & 0xff;

    this.fZ = !value;
    this.fN = (value & 0x80) !== 0;
  }

  constructor(bus: MainBus) {
    this.bus = bus;
  }

  getPC() {
    return this.rPC;
  }

  // Assuming sequential execution, for asynchronously calling this with
  // Execute, further work needed.
  interrupt(type: InterruptType): void {
    if (this.fI && type !== InterruptType.NMI && type !== InterruptType.BRK_) {
      return;
    }

    // Add one if BRK, a quirk of 6502.
    if (type === InterruptType.BRK_) {
      ++this.rPC;
    }

    this.#pushStack(this.rPC >> 8);

    const flags: Byte =
      ((this.fN as any) << 7) |
      ((this.fV as any) << 6) |
      (1 << 5) |
      (((type === InterruptType.BRK_) as any) << 4) |
      ((this.fD as any) << 3) |
      ((this.fI as any) << 2) |
      ((this.fZ as any) << 1) |
      (this.fC as any);
    this.#pushStack(flags);

    this.fI = true;
    switch (type) {
      case InterruptType.IRQ:
      case InterruptType.BRK_: {
        this.rPC = this.#readAddress(CPUOpcodes.iRQVector);
        break;
      }

      case InterruptType.NMI: {
        this.rPC = this.#readAddress(CPUOpcodes.nmiVector);
        break;
      }

      default: {
        break;
      }
    }

    this.skipCycles += 7;
  }

  reset(startAddr?: Address): void {
    if (startAddr === undefined) {
      return this.reset(this.#readAddress(CPUOpcodes.resetVector));
    }

    this.skipCycles = this.cycles = 0;
    this.rA = this.rX = this.rY = 0;
    this.fI = true;
    this.fC = this.fD = this.fN = this.fV = this.fZ = false;
    this.rPC = startAddr;
    this.rSP = 0xfd; // Documented startup state.
  }

  skipDMACycles() {
    this.skipCycles += 513; // 256 read + 256 write + 1 dummy read.
    this.skipCycles += this.cycles & 1; // +1 if on odd cycle.
  }

  step(): void {
    ++this.skipCycles;

    if (this.skipCycles-- > 1) {
      return;
    }

    this.skipCycles = 0;

    const psw: number =
      ((this.fN as any) << 7) |
      ((this.fV as any) << 6) |
      (1 << 5) |
      ((this.fD as any) << 3) |
      ((this.fI as any) << 2) |
      ((this.fZ as any) << 1) |
      (this.fC as any);

    console.debug(
      `CPU: ${this.rPC.toString(16)} -> ` +
        `${this.bus.read(this.rPC).toString(16)}\n` +
        `     A: ${this.rA.toString(16)}\n` +
        `     X: ${this.rX.toString(16)}\n` +
        `     Y: ${this.rY.toString(16)}\n` +
        `     P: ${psw.toString(16)}\n` +
        `     SP: ${this.rSP.toString(16)}\n` +
        `     CYC: ${((this.cycles - 1) * 3) % 341}\n`);

    const opcode: Byte = this.bus.read(this.rPC++);
    const cycleLength: number = CPUOpcodes.operationCycles[opcode];

    // Using short-circuit evaluation, call the other function only if the first
    // failed.
    //
    // ExecuteImplied must be called first and ExecuteBranch must be before
    // ExecuteType0.
    if (
      cycleLength &&
      (this.#executeImplied(opcode) ||
        this.#executeBranch(opcode) ||
        this.#executeType1(opcode) ||
        this.#executeType2(opcode) ||
        this.#executeType0(opcode))
    ) {
      this.skipCycles += cycleLength;
    } else {
      console.error(`Unrecognized opcode: ${opcode.toString(16)}.`);
    }
  }
}
