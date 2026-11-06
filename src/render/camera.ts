export class Camera {
  worldSize: number;
  x: number;
  y: number;
  zoom: number;
  viewWidth = 1;
  viewHeight = 1;
  minZoom = 1;
  maxZoom = 96;

  constructor(worldSize: number) {
    this.worldSize = worldSize;
    this.x = worldSize / 2;
    this.y = worldSize / 2;
    this.zoom = 16;
  }

  updateView(width: number, height: number): void {
    this.viewWidth = Math.max(1, width);
    this.viewHeight = Math.max(1, height);
    this.minZoom = Math.min(
      this.viewWidth / this.worldSize,
      this.viewHeight / this.worldSize,
    ) * 0.85;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));
    this.clamp();
  }

  fit(): void {
    this.zoom = Math.min(
      this.viewWidth / this.worldSize,
      this.viewHeight / this.worldSize,
    ) * 0.9;
    this.x = this.worldSize / 2;
    this.y = this.worldSize / 2;
    this.clamp();
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: this.x + (screenX - this.viewWidth / 2) / this.zoom,
      y: this.y + (screenY - this.viewHeight / 2) / this.zoom,
    };
  }

  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: (worldX - this.x) * this.zoom + this.viewWidth / 2,
      y: (worldY - this.y) * this.zoom + this.viewHeight / 2,
    };
  }

  panScreen(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clamp();
  }

  zoomAt(screenX: number, screenY: number, factor: number): void {
    const before = this.screenToWorld(screenX, screenY);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    const after = this.screenToWorld(screenX, screenY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  centerOn(worldX: number, worldY: number): void {
    this.x = worldX;
    this.y = worldY;
    this.clamp();
  }

  visibleBounds(): { left: number; top: number; right: number; bottom: number } {
    const halfW = this.viewWidth / 2 / this.zoom;
    const halfH = this.viewHeight / 2 / this.zoom;
    return {
      left: this.x - halfW,
      top: this.y - halfH,
      right: this.x + halfW,
      bottom: this.y + halfH,
    };
  }

  clamp(): void {
    const halfW = this.viewWidth / 2 / this.zoom;
    const halfH = this.viewHeight / 2 / this.zoom;
    const size = this.worldSize;
    if (halfW >= size / 2) this.x = size / 2;
    else this.x = Math.max(halfW, Math.min(size - halfW, this.x));
    if (halfH >= size / 2) this.y = size / 2;
    else this.y = Math.max(halfH, Math.min(size - halfH, this.y));
  }
}
