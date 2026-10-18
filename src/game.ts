import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setImmediate as yieldToEvents } from 'node:timers/promises';
import ini from 'ini';
import {
  Color,
  Font,
  Image,
  KeyboardKey,
  RenderWindow,
  SoundChannel,
  SoundStream,
  Sprite,
  Style,
  Text,
  Texture,
  Vector2f,
  Vector2u,
} from 'sfml.js';
import type { EventData } from 'sfml.js';
import { Controller } from './controller.js';
import { SharedState, SCREEN_HEIGHT, SCREEN_WIDTH } from './shared-state.js';

/** Validated command-line settings for one player session. */
export interface GameOptions {
  /** Absolute path to an iNES ROM. */
  rom: string;
  /** Requested emulation and display rate. */
  frameRate: number;
  /** Window size relative to the native 256×240 frame. */
  scale: number;
}

/** Per-player button-to-SFML-key configuration loaded once at startup. */
type Bindings = Record<'Player1' | 'Player2', Record<string, string>>;

/** Owns the native window, reusable graphics resources and live audio session. */
export class Game {
  /** Shared frame and input mailbox used by the audio Worker. */
  private readonly state = new SharedState();
  /** Window and GPU resources are created and used on the main thread. */
  private readonly window: RenderWindow;
  private readonly image: Image;
  private readonly texture: Texture;
  private readonly sprite: Sprite;
  private readonly fpsText: Text;
  /** Two keyboard controllers write atomic button masks. */
  private readonly controllers: Controller[];
  /** Stream exists after asynchronous initialization starts. */
  private stream?: SoundStream;
  /** Cached shutdown promise makes cleanup idempotent. */
  private closing?: Promise<void>;
  /** Last frame uploaded and FPS measurement origin. */
  private displayedFrame = 0;
  private fpsFrame = 0;
  private fpsTime = performance.now();

  /** Allocate reusable resources; the native window is created last. */
  private constructor(options: GameOptions, font: Font, bindings: Bindings) {
    this.controllers = ([ 1, 2 ] as const).map(player => new Controller(
      this.state, player, bindings[`Player${player}` as keyof Bindings], KeyboardKey,
    ));
    const size = new Vector2u(SCREEN_WIDTH, SCREEN_HEIGHT);
    this.image = new Image(size, Color.Black);
    this.texture = new Texture(this.image);
    this.sprite = new Sprite(this.texture);
    this.sprite.setScale(new Vector2f(options.scale, options.scale));
    this.fpsText = new Text({
      font, string: 'FPS: -', characterSize: Math.max(1, Math.round(12 * options.scale)),
    });
    this.fpsText.setPosition(new Vector2f(10 * options.scale, 10 * options.scale));
    this.window = new RenderWindow(
      new Vector2u(SCREEN_WIDTH * options.scale, SCREEN_HEIGHT * options.scale),
      'NES Emulator',
      // eslint-disable-next-line no-bitwise
      { style: Style.Titlebar | Style.Close },
    );
    this.window.setKeyRepeatEnabled(false);
    this.window.setFramerateLimit(options.frameRate);
  }

  /** Load assets, create the native window, and prime the audio Worker. */
  static async create(options: GameOptions): Promise<Game> {
    const rom = await readFile(options.rom);
    const config = ini.parse(await readFile(new URL('../keybindings.conf', import.meta.url), 'utf8'));
    const font = new Font();
    if (!await font.openFromFile(fileURLToPath(new URL('../fixedsys.ttf', import.meta.url)))) {
      throw new Error('Unable to load fixedsys.ttf.');
    }
    const game = new Game(options, font, config as Bindings);
    try {
      game.stream = new SoundStream({
        module: new URL('./audio-worker.js', import.meta.url),
        exportName: 'createAudioWorker',
        data: { rom, frameRate: options.frameRate, buffer: game.state.buffer },
        sampleRate: 48000,
        channelCount: 2,
        channelMap: [ SoundChannel.FrontLeft, SoundChannel.FrontRight ],
        blockFrames: 512,
        queueBlocks: 4,
      });
      if (!await game.stream.ready) {
        throw game.stream.getWorkerError() || new Error('Unable to start NES audio.');
      }
      return game;
    } catch (error) {
      await game.close();
      throw error;
    }
  }

  /** Process rc2 event payloads, including key releases when focus is lost. */
  handleEvent(event: EventData): void {
    if (event.kind === 'Closed' ||
        (event.kind === 'KeyPressed' && event.code === KeyboardKey.Escape)) {
      this.window.close();
    } else if (event.kind === 'FocusLost') {
      for (const controller of this.controllers) controller.releaseAll();
    } else if (event.kind === 'KeyPressed') {
      for (const controller of this.controllers) controller.keyDown(event.code);
    } else if (event.kind === 'KeyReleased') {
      for (const controller of this.controllers) controller.keyUp(event.code);
    }
  }

  /** Run the main-thread event loop until the window closes or audio fails. */
  async run(): Promise<void> {
    const stop = () => this.window.close();
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    try {
      this.stream!.play();
      while (this.window.isOpen()) {
        let event;
        while ((event = this.window.pollEvent())) this.handleEvent(event.data);
        if (!this.window.isOpen()) break;
        const error = this.stream!.getWorkerError();
        if (error) throw error;
        this.render();
        await yieldToEvents();
      }
    } finally {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
      await this.close();
    }
  }

  /** Upload a new complete frame and draw with persistent native resources. */
  private render(): void {
    const frame = this.state.readFrame(this.image.pixels, this.displayedFrame);
    if (frame !== this.displayedFrame) {
      this.texture.update(this.image);
      this.displayedFrame = frame;
    }
    const now = performance.now();
    if (now - this.fpsTime >= 500) {
      this.fpsText.setString(`FPS: ${Math.round((frame - this.fpsFrame) * 1000 / (now - this.fpsTime))}`);
      this.fpsTime = now;
      this.fpsFrame = frame;
    }
    this.window.clear(Color.Black);
    this.window.draw(this.sprite);
    this.window.draw(this.fpsText);
    this.window.display();
  }

  /** Close the window and await the audio Worker without forcing process exit. */
  close(): Promise<void> {
    if (!this.closing) {
      for (const controller of this.controllers) controller.releaseAll();
      this.window.close();
      this.closing = this.stream ? this.stream.close() : Promise.resolve();
    }
    return this.closing;
  }
}
