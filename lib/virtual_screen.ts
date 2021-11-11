import {
  Color,
  RenderWindow,
  Vector2F,
  Vector2U,
  Vertex,
  VertexArray,
} from 'sfml.js';

export class VirtualScreen {
  screenSize: Vector2U;
  pixelSize: number;
  vertices: VertexArray;

  constructor() {
    this.screenSize = new Vector2U(0, 0);
    this.pixelSize = 0;
    this.vertices = new VertexArray();
  }

  create(
    width: number,
    height: number,
    pixelSize: number,
    color: Color | number,
  ): void {
    this.vertices.resize(width * height * 6);
    this.screenSize.x = width;
    this.screenSize.y = height;
    this.vertices.setPrimitiveType(VertexArray.PrimitiveType.Triangles);
    this.pixelSize = pixelSize;

    if (typeof color === 'number') color = new Color(color);

    const tempVertex = new Vertex();
    tempVertex.color = color;
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const index = (x * this.screenSize.y + y) * 6;
        const coord2d = new Vector2F(x * this.pixelSize, y * this.pixelSize);

        // Triangle-1
        // top-left
        tempVertex.position = coord2d;
        this.vertices.setVertex(index, tempVertex);

        // top-right
        tempVertex.position = Vector2F.add(
          coord2d,
          new Vector2F(this.pixelSize, 0));
        this.vertices.setVertex(index + 1, tempVertex);

        // bottom-right
        tempVertex.position = Vector2F.add(
          coord2d,
          new Vector2F(this.pixelSize, this.pixelSize));
        this.vertices.setVertex(index + 2, tempVertex);

        // Triangle-2
        // bottom-right
        tempVertex.position = Vector2F.add(
          coord2d,
          new Vector2F(this.pixelSize, this.pixelSize));
        this.vertices.setVertex(index + 3, tempVertex);

        // bottom-left
        tempVertex.position = Vector2F.add(
          coord2d,
          new Vector2F(0, this.pixelSize));
        this.vertices.setVertex(index + 4, tempVertex);

        // top-left
        tempVertex.position = coord2d;
        this.vertices.setVertex(index + 5, tempVertex);
      }
    }
  }

  setPixel(x: number, y: number, color: Color | number) {
    const index = (x * this.screenSize.y + y) * 6;
    if (index >= this.vertices.getVertexCount()) {
      return;
    }

    if (typeof color === 'number') color = new Color(color);
    this.vertices.setColor(index, color);
    this.vertices.setColor(index + 1, color);
    this.vertices.setColor(index + 2, color);
    this.vertices.setColor(index + 3, color);
    this.vertices.setColor(index + 4, color);
    this.vertices.setColor(index + 5, color);
  }

  draw(target: RenderWindow): void {
    target.draw(this.vertices);
  }
}
