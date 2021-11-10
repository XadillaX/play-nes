import { Color } from 'sfml.js';

import { Address, Byte } from './types';
import { colors } from './palette_colors';
import { PictureBus } from './picture_bus';
import { VirtualScreen } from './virtual_screen';

type BlankCallback = () => void;

enum State {
  PreRender,
  Render,
  PostRender,
  VerticalBlank,
}

enum CharacterPage {
  Low,
  High,
}

const scanlineCycleLength = 341;
const scanlineEndCycle = 340;
const visibleScanlines = 240;
const scanlineVisibleDots = 256;
const frameEndScanline = 261;
const attributeOffset = 0x3C0;

export class PPU {
  #bus: PictureBus;
  #screen: VirtualScreen;
  #vblankCallback: BlankCallback;

  #spriteMemory: Byte[] = [];
  #scanlineSprites: Byte[] = [];

  #pipelineState: State = State.PreRender;
  #cycle: number = 0;
  #scanline: number = 0;
  #evenFrame: boolean = false;

  #vblank: boolean = false;
  #sprZeroHit: boolean = false;

  #dataAddress: Address = 0;
  #tempAddress: Address = 0;
  #fineXScroll: Byte = 0;
  #firstWrite: boolean = false;
  #dataBuffer: Byte = 0;

  #spriteDataAddress: Byte = 0;

  #longSprites: boolean = false;
  #generateInterrupt: boolean = false;

  #greyscaleMode: boolean = false;
  #showSprites: boolean = false;
  #showBackground: boolean = false;
  #hideEdgeSprites: boolean = false;
  #hideEdgeBackground: boolean = false;

  #bgPage: CharacterPage = CharacterPage.Low;
  #sprPage: CharacterPage = CharacterPage.Low;

  #dataAddrIncrement: Address = 0;

  #pictureBuffer: Color[][] = [];

  #readOAM(addr: Byte): Byte {
    return this.#spriteMemory[addr & 0xff];
  }

  #writeOAM(addr: Byte, value: Byte): void { addr; value; } // TODO
  #read(addr: Address): Byte { return addr; } // TODO

  constructor(bus: PictureBus, screen: VirtualScreen) {
    this.#bus = bus;
    this.#screen = screen;

    for (let i = 0; i < 64 * 4; i++) {
      this.#spriteMemory.push(0);
    }

    for (let i = 0; i < scanlineVisibleDots; i++) {
      const arr: Color[] = [];
      for (let j = 0; j < visibleScanlines; j++) {
        arr.push(new Color(255, 0, 255, 255));
      }
      this.#pictureBuffer.push(arr);
    }
  }

  reset(): void {
    this.#longSprites = this.#generateInterrupt = this.#greyscaleMode = this.#vblank = false;
    this.#showBackground = this.#showSprites = this.#evenFrame = this.#firstWrite = true;
    this.#bgPage = this.#sprPage = CharacterPage.Low;
    this.#dataAddress = this.#cycle = this.#scanline = this.#spriteDataAddress = this.#fineXScroll = this.#tempAddress = 0;
    this.#dataAddrIncrement = 1;
    this.#pipelineState = State.PreRender;
    this.#scanlineSprites = [];
  }

  setInterruptCallback(callback: BlankCallback): void {
    this.#vblankCallback = callback;
  }

  step(): void {
    switch (this.#pipelineState) {
      case State.PreRender: {
        if (this.#cycle === 1) {
          this.#vblank = this.#sprZeroHit = false;
        } else if (this.#cycle === scanlineVisibleDots + 2 && this.#showBackground && this.#showSprites) {
          // Set bits related to horizontal position
          this.#dataAddress &= ~0x41f; // Unset horizontal bits
          this.#dataAddress |= this.#tempAddress & 0x41f; // Copy
        } else if (this.#cycle > 280 && this.#cycle < 304 && this.#showBackground && this.#showSprites) {
          // Set vertical bits
          this.#dataAddress &= ~0x7be0; // Unset bits related to horizontal
          this.#dataAddress |= this.#tempAddress & 0x7be0; // Copy
        }

        if (this.#cycle >= scanlineEndCycle - ((!this.#evenFrame && this.#showBackground && this.#showSprites) ? 1 : 0)) {
          this.#pipelineState = State.Render;
          this.#cycle = this.#scanline = 0;
        }

        break;
      }

      case State.Render: {
        if (this.#cycle > 0 && this.#cycle <= scanlineVisibleDots) {
          let bgColor: Byte = 0;
          let sprColor: Byte = 0;
          let bgOpaque = false;
          let sprOpaque = false;
          let spriteForeground = false;

          const x = this.#cycle - 1;
          const y = this.#scanline;

          if (this.#showBackground) {
            const xFine = (this.#fineXScroll + x) % 8;
            if (!this.#hideEdgeBackground && x >= 8) {
              // fetch tile
              let addr = 0x2000 | (this.#dataAddress & 0x0fff); // mask off fine y
              const tile = this.#read(addr);

              // fetch pattern
              // Each pattern occupies 16 bytes, so multiply by 16
              addr = (tile * 16) + ((this.#dataAddress >> 12) & 0x7); // Add fine y
              addr |= this.#bgPage << 12; // set whether the pattern is in the high or low page
              // Get the corresponding bit determined by (8 - x_fine) from the right
              bgColor = (this.#read(addr) >> (7 ^ xFine)) & 1; // bit 0 of palette entry
              bgColor |= ((this.#read(addr + 8) >> (7 ^ xFine)) & 1) << 1; // bit 1

              bgOpaque = !!bgColor; // flag used to calculate final pixel with the sprite pixel

              // fetch attribute and calculate higher two bits of palette
              addr = 0x23C0 | (this.#dataAddress & 0x0C00) | ((this.#dataAddress >> 4) & 0x38) | ((this.#dataAddress >> 2) & 0x07);
              const attribute: Byte = this.#read(addr);
              const shift: number = ((this.#dataAddress >> 4) & 4) | (this.#dataAddress & 2);
              // Extract and set the upper two bits for the color
              bgColor |= ((attribute >> shift) & 0x3) << 2;
            }

            if (xFine === 7) {
              if ((this.#dataAddress & 0x001F) === 31) { // if coarse X == 31
                this.#dataAddress &= ~0x001F; // coarse X = 0
                this.#dataAddress ^= 0x0400; // switch horizontal nametable
              } else {
                this.#dataAddress += 1; // increment coarse X
              }
            }
          }

          if (this.#showSprites && (!this.#hideEdgeSprites || x >= 8)) {
            for (const i of this.#scanlineSprites) {
              const sprX: Byte = this.#spriteMemory[i * 4 + 3];
              if (x - sprX < 0 || x - sprX >= 8) {
                continue;
              }

              const sprY: Byte = this.#spriteMemory[i * 4 + 0] + 1;
              const tile: Byte = this.#spriteMemory[i * 4 + 1];
              const attribute: Byte = this.#spriteMemory[i * 4 + 2];

              const length: number = (this.#longSprites) ? 16 : 8;

              let xShift: number = (x - sprX) % 8;
              let yOffset: number = (y - sprY) % length;

              if ((attribute & 0x40) === 0) { // If NOT flipping horizontally
                xShift ^= 7;
              }

              if ((attribute & 0x80) !== 0) { // IF flipping vertically
                yOffset ^= (length - 1);
              }

              let addr: Address = 0;

              if (!this.#longSprites) {
                addr = tile * 16 + yOffset;
                if (this.#sprPage === CharacterPage.High) addr += 0x1000;
              } else { // 8x16 sprites
                // bit-3 is one if it is the bottom tile of the sprite, multiply by two to get the next pattern
                yOffset = (yOffset & 7) | ((yOffset & 8) << 1);
                addr = (tile >> 1) * 32 + yOffset;
                addr |= (tile & 1) << 12; // Bank 0x1000 if bit-0 is high
              }

              sprColor |= (this.#read(addr) >> (xShift)) & 1; // bit 0 of palette entry
              sprColor |= ((this.#read(addr + 8) >> (xShift)) & 1) << 1; // bit 1

              if (!(sprOpaque = !!sprColor)) {
                sprColor = 0;
                continue;
              }

              sprColor |= 0x10; // Select sprite palette
              sprColor |= (attribute & 0x3) << 2; // bits 2-3

              spriteForeground = !(attribute & 0x20);

              // Sprite-0 hit detection
              if (!this.#sprZeroHit && this.#showBackground && i === 0 && sprOpaque && bgOpaque) {
                this.#sprZeroHit = true;
              }

              break; // Exit the loop now since we've found the highest priority sprite
            }
          }

          let paletteAddr: Byte = bgColor;

          if ((!bgOpaque && sprOpaque) ||
            (bgOpaque && sprOpaque && spriteForeground)) {
            paletteAddr = sprColor;
          } else if (!bgOpaque && !sprOpaque) {
            paletteAddr = 0;
          }

          this.#pictureBuffer[x][y] = new Color(colors[this.#bus.readPalette(paletteAddr)]);
        } else if (this.#cycle === scanlineVisibleDots + 1 && this.#showBackground) {
          // Shamelessly copied from nesdev wiki
          if ((this.#dataAddress & 0x7000) !== 0x7000) { // if fine Y < 7
            this.#dataAddress += 0x1000; // increment fine Y
          } else {
            this.#dataAddress &= ~0x7000; // fine Y = 0
            let y: number = (this.#dataAddress & 0x03E0) >> 5; // let y = coarse Y
            if (y === 29) {
              y = 0; // coarse Y = 0
              this.#dataAddress ^= 0x0800; // switch vertical nametable
            } else if (y === 31) {
              y = 0; // coarse Y = 0, nametable not switched
            } else {
              y += 1; // increment coarse Y
            }
            this.#dataAddress = (this.#dataAddress & ~0x03E0) | (y << 5); // put coarse Y back into m_dataAddress
          }
        } else if (this.#cycle === scanlineVisibleDots + 2 && this.#showBackground && this.#showSprites) {
          // Copy bits related to horizontal position
          this.#dataAddress &= ~0x41f;
          this.#dataAddress |= this.#tempAddress & 0x41f;
        }

        if (this.#cycle >= scanlineEndCycle) {
          // Find and index sprites that are on the next Scanline
          // This isn't where/when this indexing, actually copying in 2C02 is done
          // but (I think) it shouldn't hurt any games if this is done here
          this.#scanlineSprites = [];

          let range = 8;
          if (this.#longSprites) range = 16;

          let j = 0;
          for (let i = this.#spriteDataAddress / 4; i < 64; ++i) {
            const diff = (this.#scanline - this.#spriteMemory[i * 4]);
            if (diff >= 0 && diff < range) {
              this.#scanlineSprites.push(i);
              ++j;
              if (j >= 8) {
                break;
              }
            }
          }

          ++this.#scanline;
          this.#cycle = 0;
        }

        if (this.#scanline >= visibleScanlines) {
          this.#pipelineState = State.PostRender;
        }

        break;
      }

      case State.PostRender: {
        if (this.#cycle >= scanlineEndCycle) {
          ++this.#scanline;
          this.#cycle = 0;
          this.#pipelineState = State.VerticalBlank;

          for (let x = 0; x < this.#pictureBuffer.length; ++x) {
            for (let y = 0; y < this.#pictureBuffer.length; ++y) {
              this.#screen.setPixel(x, y, this.#pictureBuffer[x][y]);
            }
          }
        }

        break;
      }

      case State.VerticalBlank: {
        if (this.#cycle === 1 && this.#scanline === visibleScanlines + 1) {
          this.#vblank = true;
          if (this.#generateInterrupt) this.#vblankCallback();
        }

        if (this.#cycle >= scanlineEndCycle) {
          ++this.#scanline;
          this.#cycle = 0;
        }

        if (this.#scanline >= frameEndScanline) {
          this.#pipelineState = State.PreRender;
          this.#scanline = 0;
          this.#evenFrame = !this.#evenFrame;
        }

        break;
      }

      default: {
        console.error('Well, this shouldn\'t happened.');
        break;
      }
    }

    this.#cycle++;
  }
}
