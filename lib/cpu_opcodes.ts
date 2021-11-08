export const instructionModeMask = 0x3;

export const operationMask = 0xe0;
export const operationShift = 5;

export const addrModeMask = 0x1c;
export const addrModeShift = 2;

export const branchInstructionMask = 0x1f;
export const branchInstructionMaskResult = 0x10;
export const branchConditionMask = 0x20;
export const branchOnFlagShift = 6;

export const nmiVector = 0xfffa;
export const resetVector = 0xfffc;
export const iRQVector = 0xfffe;

export enum AddrMode1 {
  IndexedIndirectX,
  ZeroPage,
  Immediate,
  Absolute,
  IndirectY,
  IndexedX,
  AbsoluteY,
  AbsoluteX,
}

export enum AddrMode2 {
  Immediate_,
  ZeroPage_,
  Accumulator,
  Absolute_,
  Indexed = 5,
  AbsoluteIndexed = 7,
}

export enum BranchOnFlag {
  Negative,
  Overflow,
  Carry,
  Zero,
}

export enum Operation0 {
  BIT = 1,
  STY = 4,
  LDY,
  CPY,
  CPX,
}

export enum Operation1 {
  ORA,
  AND,
  EOR,
  ADC,
  STA,
  LDA,
  CMP,
  SBC,
}

export enum Operation2 {
  ASL,
  ROL,
  LSR,
  ROR,
  STX,
  LDX,
  DEC,
  INC,
}

export enum OperationImplied {
  NOP = 0xea,
  BRK = 0x00,
  JSR = 0x20,
  RTI = 0x40,
  RTS = 0x60,

  JMP = 0x4C,
  JMPI = 0x6C, // JMP Indirect

  PHP = 0x08,
  PLP = 0x28,
  PHA = 0x48,
  PLA = 0x68,

  DEY = 0x88,
  DEX = 0xca,
  TAY = 0xa8,
  INY = 0xc8,
  INX = 0xe8,

  CLC = 0x18,
  SEC = 0x38,
  CLI = 0x58,
  SEI = 0x78,
  TYA = 0x98,
  CLV = 0xb8,
  CLD = 0xd8,
  SED = 0xf8,

  TXA = 0x8a,
  TXS = 0x9a,
  TAX = 0xaa,
  TSX = 0xba,
}

// 0 implies unused opcode
export const operationCycles: number[] = [
  7, 6, 0, 0, 0, 3, 5, 0, 3, 2, 2, 0, 0, 4, 6, 0,
  2, 5, 0, 0, 0, 4, 6, 0, 2, 4, 0, 0, 0, 4, 7, 0,
  6, 6, 0, 0, 3, 3, 5, 0, 4, 2, 2, 0, 4, 4, 6, 0,
  2, 5, 0, 0, 0, 4, 6, 0, 2, 4, 0, 0, 0, 4, 7, 0,
  6, 6, 0, 0, 0, 3, 5, 0, 3, 2, 2, 0, 3, 4, 6, 0,
  2, 5, 0, 0, 0, 4, 6, 0, 2, 4, 0, 0, 0, 4, 7, 0,
  6, 6, 0, 0, 0, 3, 5, 0, 4, 2, 2, 0, 5, 4, 6, 0,
  2, 5, 0, 0, 0, 4, 6, 0, 2, 4, 0, 0, 0, 4, 7, 0,
  0, 6, 0, 0, 3, 3, 3, 0, 2, 0, 2, 0, 4, 4, 4, 0,
  2, 6, 0, 0, 4, 4, 4, 0, 2, 5, 2, 0, 0, 5, 0, 0,
  2, 6, 2, 0, 3, 3, 3, 0, 2, 2, 2, 0, 4, 4, 4, 0,
  2, 5, 0, 0, 4, 4, 4, 0, 2, 4, 2, 0, 4, 4, 4, 0,
  2, 6, 0, 0, 3, 3, 5, 0, 2, 2, 2, 0, 4, 4, 6, 0,
  2, 5, 0, 0, 0, 4, 6, 0, 2, 4, 0, 0, 0, 4, 7, 0,
  2, 6, 0, 0, 3, 3, 5, 0, 2, 2, 2, 2, 4, 4, 6, 0,
  2, 5, 0, 0, 0, 4, 6, 0, 2, 4, 0, 0, 0, 4, 7, 0,
];
