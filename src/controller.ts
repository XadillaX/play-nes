import { Controller as Buttons, type ButtonKey, type ControllerId } from 'jsnes';

/** Destination for keyboard input, implemented by JSNES and the shared mailbox. */
export interface ButtonSink {
  /** Press a NES button. */
  buttonDown(player: ControllerId, button: ButtonKey): void;
  /** Release a NES button. */
  buttonUp(player: ControllerId, button: ButtonKey): void;
}

/** Maps numeric SFML key codes to one NES controller. */
export class Controller {
  /** Precompiled key-to-buttons lookup, allowing shared key bindings. */
  private readonly mapping = new Map<number, ButtonKey[]>();

  /**
   * @param sink Destination for button state changes.
   * @param player Player number, 1 or 2.
   * @param bindings Button names mapped to SFML key names.
   * @param keys SFML's numeric Key enum.
   */
  constructor(
    private readonly sink: ButtonSink,
    private readonly player: ControllerId,
    bindings: Readonly<Record<string, string>>,
    keys: Readonly<Record<string, number | string>>,
  ) {
    for (const [ name, key ] of Object.entries(bindings)) {
      const button = Buttons[`BUTTON_${name.toUpperCase()}` as keyof typeof Buttons];
      const code = keys[key];
      if (typeof button !== 'number' || button < 0 || button > 7 ||
          typeof code !== 'number' || !Number.isInteger(code) || code < 0) {
        throw new Error(`Invalid Player${player} binding: ${name} = ${key}`);
      }
      const buttons = this.mapping.get(code) || [];
      buttons.push(button);
      this.mapping.set(code, buttons);
    }
  }

  /** Press all NES buttons assigned to this SFML key code. */
  keyDown(code: number): void {
    const buttons = this.mapping.get(code);
    if (buttons) {
      for (const button of buttons) this.sink.buttonDown(this.player, button);
    }
  }

  /** Release all NES buttons assigned to this SFML key code. */
  keyUp(code: number): void {
    const buttons = this.mapping.get(code);
    if (buttons) {
      for (const button of buttons) this.sink.buttonUp(this.player, button);
    }
  }

  /** Release every button when focus is lost or the player closes. */
  releaseAll(): void {
    for (let button = 0; button < 8; button++) this.sink.buttonUp(this.player, button as ButtonKey);
  }
}
