import { Color, RenderWindow, Vector2U } from 'sfml.js';

export class VirtualScreen {
  screenSize: Vector2U;
  pixelSize: number;

  // TODO: VertexArray

  create(
    width: number,
    height: number,
    pixelSize: number,
    color: Color | number
  ): void {
    // Empty
  }

  setPixel(x: number, y: number, color: Color | number) {
    // Empty
  }

  draw(target: RenderWindow): void {
    // Empty
  }
}
