import { Keyboard } from 'sfml.js';

import { Byte } from './types';

export enum Buttons {
  A,
  B,
  Select,
  Start,
  Up,
  Down,
  Left,
  Right,
  TotalButtons,
}

export class Controller {
  #strobe: boolean;
  #keyStates: number;
  #keyBindings: Keyboard.Keys[];

  constructor() {
    this.#keyStates = 0;
    this.#strobe = false;
    for (let i = 0; i < Buttons.TotalButtons; i++) {
      this.#keyBindings.push(Keyboard.Keys.Unknown);
    }
  }

  setKeyBindings(keys: Keyboard.Keys[]): void {
    this.#keyBindings = JSON.parse(JSON.stringify(keys));
  }

  strobe(b: Byte): void {
    this.#strobe = (b & 1) !== 0;
    if (!this.#strobe) {
      this.#keyStates = 0;
      let shift = 0;
      for (let button: Buttons = Buttons.A;
        button < Buttons.TotalButtons;
        button++) {
        this.#keyStates |= ((Keyboard.isKeyPressed(this.#keyBindings[button]) ?
          1 :
          0) << shift);
        ++shift;
      }
    }
  }

  read() {
    let ret: Byte;
    if (this.#strobe) {
      ret = Keyboard.isKeyPressed(this.#keyBindings[Buttons.A]) ? 1 : 0;
    } else {
      ret = (this.#keyStates & 1);
      this.#keyStates >>= 1;
    }

    return ret | 0x40;
  }
}
