import { Event, Keyboard, RenderWindow, VideoMode } from 'sfml.js';
import sleep from 'mz-modules/sleep';

import { Byte } from './types';
import { Cartridge } from './cartridge';
import { Controller } from './controller';
import { CPU, InterruptType } from './cpu';
import { MainBus, IORegisters } from './main_bus';
import { Mapper } from './mapper';
import { PictureBus } from './picture_bus';
import { PPU, scanlineVisibleDots, visibleScanlines } from './ppu';
import { VirtualScreen } from './virtual_screen';

const NESVideoWidth = scanlineVisibleDots;
const NESVideoHeight = visibleScanlines;

export class Emulator {
  #bus: MainBus;
  #pictureBus: PictureBus;
  #cpu: CPU;
  #ppu: PPU;
  #cartridge: Cartridge;
  #mapper: Mapper;
  #controller1: Controller;
  #controller2: Controller;
  #window: RenderWindow;
  #emulatorScreen: VirtualScreen;
  #screenScale: number;

  #cycleTimer: [ number, number ];
  #elapsedTime: [ number, number ];
  #cpuCycleDuration: number;

  #DMA(page: Byte): void {
    page &= 0xff;
    this.#cpu.skipDMACycles();
    const pagePtr = this.#bus.getPagePtr(page);
    if (!pagePtr) return;
    this.#ppu.doDMA(pagePtr);
  }

  constructor() {
    this.#bus = new MainBus();
    this.#pictureBus = new PictureBus();
    this.#emulatorScreen = new VirtualScreen();
    this.#controller1 = new Controller();
    this.#controller2 = new Controller();
    this.#cartridge = new Cartridge();

    this.#cpu = new CPU(this.#bus);
    this.#ppu = new PPU(this.#pictureBus, this.#emulatorScreen);

    this.#screenScale = 2;

    this.#cycleTimer = process.hrtime();
    this.#cpuCycleDuration = 559;

    this.#bus.setReadCallback(IORegisters.PPUSTATUS, () => this.#ppu.getStatus());
    this.#bus.setReadCallback(IORegisters.PPUDATA, () => this.#ppu.getData());
    this.#bus.setReadCallback(IORegisters.JOY1, () => this.#controller1.read());
    this.#bus.setReadCallback(IORegisters.JOY2, () => this.#controller2.read());
    this.#bus.setReadCallback(IORegisters.OAMDATA, () => this.#ppu.getOAMData());

    this.#bus.setWriteCallback(IORegisters.PPUCTRL, (b: Byte) => this.#ppu.control(b));
    this.#bus.setWriteCallback(IORegisters.PPUMASK, (b: Byte) => this.#ppu.setMask(b));
    this.#bus.setWriteCallback(IORegisters.OAMADDR, (b: Byte) => this.#ppu.setOAMAddress(b));
    this.#bus.setWriteCallback(IORegisters.PPUADDR, (b: Byte) => this.#ppu.setDataAddress(b));
    this.#bus.setWriteCallback(IORegisters.PPUSCROL, (b: Byte) => this.#ppu.setScroll(b));
    this.#bus.setWriteCallback(IORegisters.PPUDATA, (b: Byte) => this.#ppu.setData(b));
    this.#bus.setWriteCallback(IORegisters.OAMDMA, (b: Byte) => this.#DMA(b));
    this.#bus.setWriteCallback(IORegisters.JOY1, (b: Byte) => { this.#controller1.strobe(b); this.#controller2.strobe(b); });
    this.#bus.setWriteCallback(IORegisters.OAMDATA, (b: Byte) => this.#ppu.setOAMData(b));

    this.#ppu.setInterruptCallback(() => this.#cpu.interrupt(InterruptType.NMI));
  }

  async run(romPath: string): Promise<void> {
    try {
      await this.#cartridge.loadFromFile(romPath);
    } catch (e) {
      console.error(e);
      return;
    }

    this.#mapper = Mapper.createMapper(
      this.#cartridge.getMapper(),
      this.#cartridge,
      () => this.#pictureBus.updateMirroring());

    this.#bus.setMapper(this.#mapper);
    this.#pictureBus.setMapper(this.#mapper);

    this.#cpu.reset();
    this.#ppu.reset();

    this.#window = new RenderWindow(
      new VideoMode(
        NESVideoWidth * this.#screenScale,
        NESVideoHeight * this.#screenScale),
      'SimpleNES',
      RenderWindow.Style.Titlebar | RenderWindow.Style.Close);
    this.#window.setVerticalSyncEnabled(true);
    this.#emulatorScreen.create(
      NESVideoWidth,
      NESVideoHeight,
      this.#screenScale,
      0xffffffff);

    this.#cycleTimer = process.hrtime();
    this.#elapsedTime = [ 0, 0 ];

    let event: Event;
    let focus = false;
    let pause = false;
    while (this.#window.isOpen()) {
      while ((event = this.#window.pollEvent())) {
        if (event.type === 'Closed' || (event.type === 'KeyPressed' && event.key.codeStr === 'Escape')) {
          this.#window.close();
          return;
        } else if (event.type === 'GainedFocus') {
          focus = true;
          this.#cycleTimer = process.hrtime();
        } else if (event.type === 'LostFocus') {
          focus = false;
        } else if (event.type === 'KeyPressed' && event.key.codeStr === 'F2') {
          pause = !pause;
          if (!pause) {
            this.#cycleTimer = process.hrtime();
          }
        } else if (pause && event.type === 'KeyReleased' && event.key.codeStr === 'F3') {
          for (let i = 0; i < 29781; i++) {
            this.#ppu.step();
            this.#ppu.step();
            this.#ppu.step();
            this.#cpu.step();
          }
        }
      }

      if (focus && !pause) {
        const now = process.hrtime();
        this.#elapsedTime = [ now[0] - this.#cycleTimer[0], now[1] - this.#cycleTimer[1] ];
        if (this.#elapsedTime[1] < 0 && this.#elapsedTime[0] > 0) {
          this.#elapsedTime[0]--;
          this.#elapsedTime[1] += 1e9;
        }
        this.#cycleTimer = process.hrtime();

        while (this.#elapsedTime[0] || this.#elapsedTime[1] > this.#cpuCycleDuration) {
          this.#ppu.step();
          this.#ppu.step();
          this.#ppu.step();
          this.#cpu.step();

          this.#elapsedTime[1] -= this.#cpuCycleDuration;
          if (this.#elapsedTime[1] < 0 && this.#elapsedTime[1] > 0) {
            this.#elapsedTime[0]--;
            this.#elapsedTime[1] += 1e9;
          }
        }

        this.#emulatorScreen.draw(this.#window);
        this.#window.display();
      } else {
        await sleep(1000 / 60);
      }

      await sleep(0);
    }
  }

  setVideoHeight(height: number): void {
    this.#screenScale = height / NESVideoHeight;
  }

  setVideoWidth(width: number): void {
    this.#screenScale = width / NESVideoWidth;
  }

  setVideoScale(scale: number): void {
    this.#screenScale = scale;
  }

  setKeys(p1: Keyboard.Keys[], p2: Keyboard.Keys[]) {
    this.#controller1.setKeyBindings(p1);
    this.#controller2.setKeyBindings(p2);
  }
}
