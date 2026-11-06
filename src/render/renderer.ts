import { CHUNK_TILES, COLORS, TILE_SIZE } from '../config';
import { AgentState, BuildingType, Job, NO_BUILDING, type World } from '../world/types';
import type { Game } from '../sim/game';
import { Camera } from './camera';
import { RIVER_COLOR, SpriteAtlas, TERRAIN_COLORS, createSpriteAtlas } from './sprites';

const CHUNK_PX = CHUNK_TILES * TILE_SIZE;
const MAX_CHUNKS = 64;

interface ChunkEntry {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export interface PowerEffect {
  x: number;
  y: number;
  radius: number;
  color: string;
  kind: 'ring' | 'burst';
  startMs: number;
  durationMs: number;
}

export interface RenderOverlay {
  cursor: { x: number; y: number; radius: number; color: string } | null;
  hover: { x: number; y: number } | null;
  selectedAgent: number | null;
  selectedBuilding: number | null;
  effects: PowerEffect[];
}

function parseHex(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly camera: Camera;
  readonly atlas: SpriteAtlas;
  private ctx: CanvasRenderingContext2D;
  private chunks = new Map<number, ChunkEntry>();
  private width = 1;
  private height = 1;
  private dpr = 1;
  private overview: HTMLCanvasElement | null = null;
  private overviewVersion = -1;
  private overviewBuiltAt = 0;
  private ownerCanvas: HTMLCanvasElement | null = null;
  private ownerVersion = -1;
  private ownerBuiltAt = 0;
  private game: Game | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.atlas = createSpriteAtlas();
    this.camera = new Camera(256);
    this.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.dpr = dpr;
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.camera.updateView(this.width, this.height);
  }

  setGame(game: Game): void {
    this.game = game;
    this.chunks.clear();
    this.overview = null;
    this.overviewVersion = -1;
    this.ownerCanvas = null;
    this.ownerVersion = -1;
    this.camera.worldSize = game.world.size;
    this.camera.updateView(this.width, this.height);
    this.camera.fit();
  }

  render(game: Game, overlay: RenderOverlay, timeMs: number): void {
    this.game = game;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0a1722';
    ctx.fillRect(0, 0, this.width, this.height);

    this.drainTerrainChanges(game);
    if (this.camera.zoom >= 6) this.drawChunks(game);
    else this.drawOverview(game, timeMs);

    this.drawOwnership(game, timeMs);
    this.drawBlessings(game, timeMs);

    if (this.camera.zoom >= 5) {
      this.drawBuildings(game);
      this.drawAnimals(game, timeMs);
      this.drawAgents(game, timeMs);
    }
    if (this.camera.zoom >= 11) this.drawLabels(game);
    this.drawDayNight(timeMs);
    this.drawOverlay(game, overlay, timeMs);
  }

  private drainTerrainChanges(game: Game): void {
    if (game.terrainDirty.length === 0) return;
    const chunksX = Math.ceil(game.world.size / CHUNK_TILES);
    for (const index of game.terrainDirty) {
      const x = index % game.world.size;
      const y = Math.floor(index / game.world.size);
      const key = Math.floor(y / CHUNK_TILES) * chunksX + Math.floor(x / CHUNK_TILES);
      this.chunks.delete(key);
    }
    game.terrainDirty.length = 0;
  }

  private buildChunk(game: Game, cx: number, cy: number): ChunkEntry {
    const canvas = document.createElement('canvas');
    canvas.width = CHUNK_PX;
    canvas.height = CHUNK_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('chunk context unavailable');
    ctx.imageSmoothingEnabled = false;
    const world = game.world;
    const size = world.size;
    for (let ty = 0; ty < CHUNK_TILES; ty += 1) {
      const y = cy * CHUNK_TILES + ty;
      if (y >= size) break;
      for (let tx = 0; tx < CHUNK_TILES; tx += 1) {
        const x = cx * CHUNK_TILES + tx;
        if (x >= size) break;
        const index = y * size + x;
        const terrain = world.terrain[index];
        const hash = (Math.imul(index + 1, 2654435761) >>> 0) & 3;
        const sprite = terrain * 4 + hash;
        const sx = (sprite % 8) * 16;
        const sy = Math.floor(sprite / 8) * 16;
        ctx.drawImage(this.atlas.tiles, sx, sy, 16, 16, tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        if (world.river[index] === 1) {
          const variant = (index & 3) % 4;
          ctx.drawImage(this.atlas.rivers, variant * 16, 0, 16, 16, tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
    return { canvas, ctx };
  }

  private drawChunks(game: Game): void {
    const world = game.world;
    const chunksX = Math.ceil(world.size / CHUNK_TILES);
    const bounds = this.camera.visibleBounds();
    const cx0 = Math.max(0, Math.floor(bounds.left / CHUNK_TILES));
    const cy0 = Math.max(0, Math.floor(bounds.top / CHUNK_TILES));
    const cx1 = Math.min(chunksX - 1, Math.floor(bounds.right / CHUNK_TILES));
    const cy1 = Math.min(chunksX - 1, Math.floor(bounds.bottom / CHUNK_TILES));
    const zoom = this.camera.zoom;
    const destSize = CHUNK_TILES * zoom;

    for (let cy = cy0; cy <= cy1; cy += 1) {
      for (let cx = cx0; cx <= cx1; cx += 1) {
        const key = cy * chunksX + cx;
        let entry = this.chunks.get(key);
        if (!entry) {
          entry = this.buildChunk(game, cx, cy);
          this.chunks.set(key, entry);
          if (this.chunks.size > MAX_CHUNKS) {
            const oldest = this.chunks.keys().next().value;
            if (oldest !== undefined) this.chunks.delete(oldest);
          }
        }
        const screen = this.camera.worldToScreen(cx * CHUNK_TILES, cy * CHUNK_TILES);
        this.ctx.drawImage(entry.canvas, screen.x, screen.y, destSize, destSize);
      }
    }
  }

  private drawOverview(game: Game, timeMs: number): void {
    const world = game.world;
    if (
      !this.overview ||
      (this.overviewVersion !== world.terrainVersion && timeMs - this.overviewBuiltAt > 800)
    ) {
      this.buildOverview(world);
      this.overviewVersion = world.terrainVersion;
      this.overviewBuiltAt = timeMs;
    }
    if (!this.overview) return;
    const screen = this.camera.worldToScreen(0, 0);
    const size = world.size * this.camera.zoom;
    this.ctx.drawImage(this.overview, screen.x, screen.y, size, size);
  }

  private buildOverview(world: World): void {
    if (!this.overview) this.overview = document.createElement('canvas');
    const canvas = this.overview;
    canvas.width = world.size;
    canvas.height = world.size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(world.size, world.size);
    const data = image.data;
    const terrainRgb = TERRAIN_COLORS.map((color) => parseHex(color));
    const riverRgb = parseHex(RIVER_COLOR);
    for (let i = 0; i < world.size * world.size; i += 1) {
      const terrain = world.terrain[i];
      const base = terrainRgb[terrain] ?? [20, 30, 40];
      const height = world.elevation[i] / 255;
      const brightness = 0.9 + height * 0.16;
      const isRiver = world.river[i] === 1;
      const r = isRiver ? riverRgb[0] : Math.min(255, base[0] * brightness);
      const g = isRiver ? riverRgb[1] : Math.min(255, base[1] * brightness);
      const b = isRiver ? riverRgb[2] : Math.min(255, base[2] * brightness);
      const offset = i * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }

  private drawOwnership(game: Game, timeMs: number): void {
    const world = game.world;
    if (
      !this.ownerCanvas ||
      (this.ownerVersion !== world.ownerVersion && timeMs - this.ownerBuiltAt > 500)
    ) {
      this.buildOwnership(game);
      this.ownerVersion = world.ownerVersion;
      this.ownerBuiltAt = timeMs;
    }
    if (!this.ownerCanvas) return;
    const screen = this.camera.worldToScreen(0, 0);
    const size = world.size * this.camera.zoom;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.ownerCanvas, screen.x, screen.y, size, size);
  }

  private buildOwnership(game: Game): void {
    const world = game.world;
    if (!this.ownerCanvas) this.ownerCanvas = document.createElement('canvas');
    const canvas = this.ownerCanvas;
    canvas.width = world.size;
    canvas.height = world.size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(world.size, world.size);
    const data = image.data;
    const colors = game.civs.map((civ) => parseHex(COLORS[civ.color] ?? COLORS[0]));
    const size = world.size;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = y * size + x;
        const owner = world.owner[i];
        if (owner === 255) continue;
        const color = colors[owner] ?? [255, 255, 255];
        const left = x > 0 ? world.owner[i - 1] : 255;
        const right = x < size - 1 ? world.owner[i + 1] : 255;
        const up = y > 0 ? world.owner[i - size] : 255;
        const down = y < size - 1 ? world.owner[i + size] : 255;
        const border = left !== owner || right !== owner || up !== owner || down !== owner;
        const offset = i * 4;
        data[offset] = color[0];
        data[offset + 1] = color[1];
        data[offset + 2] = color[2];
        data[offset + 3] = border ? 205 : 54;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  private drawBlessings(game: Game, timeMs: number): void {
    const ctx = this.ctx;
    for (const civ of game.civs) {
      if (!civ.alive || civ.blessingUntil <= game.world.tick) continue;
      const screen = this.camera.worldToScreen(civ.centerX, civ.centerY);
      const radius = (5 + Math.sin(timeMs / 450) * 0.6) * this.camera.zoom;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(150, 220, 130, 0.07)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(180, 240, 150, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawBuildings(game: Game): void {
    const ctx = this.ctx;
    const zoom = this.camera.zoom;
    const bounds = this.camera.visibleBounds();
    for (const building of game.buildings) {
      if (
        building.x < bounds.left - 4 ||
        building.x > bounds.right + 4 ||
        building.y < bounds.top - 4 ||
        building.y > bounds.bottom + 4
      ) {
        continue;
      }
      const civ = game.civs[building.civ];
      if (!civ) continue;
      const screen = this.camera.worldToScreen(building.x + 0.5, building.y + 0.5);
      const tiles = building.type === BuildingType.TownCenter ? 3 : 2;
      const size = zoom * tiles;
      const left = screen.x - size / 2;
      const top = screen.y - size * 0.8;
      const progress = building.built ? 1 : Math.min(1, building.work / building.workNeeded);
      ctx.globalAlpha = building.built ? 1 : 0.3 + progress * 0.55;
      ctx.drawImage(
        this.atlas.buildings,
        civ.color * 48,
        building.type * 48,
        48,
        48,
        left,
        top,
        size,
        size,
      );
      ctx.globalAlpha = 1;

      if (!building.built) {
        const barWidth = size * 0.7;
        const barX = screen.x - barWidth / 2;
        const barY = screen.y + zoom * 0.45;
        ctx.fillStyle = 'rgba(10, 16, 22, 0.75)';
        ctx.fillRect(barX - 1, barY - 1, barWidth + 2, 4);
        ctx.fillStyle = '#edc948';
        ctx.fillRect(barX, barY, barWidth * progress, 2);
      }

      if (building.hp < building.maxHp && building.built) {
        const ratio = Math.max(0, building.hp / building.maxHp);
        const barWidth = size * 0.6;
        const barX = screen.x - barWidth / 2;
        const barY = screen.y + zoom * 0.5;
        ctx.fillStyle = 'rgba(10, 16, 22, 0.7)';
        ctx.fillRect(barX - 1, barY - 1, barWidth + 2, 3);
        ctx.fillStyle = ratio > 0.5 ? '#7ac06a' : ratio > 0.25 ? '#edc948' : '#e15759';
        ctx.fillRect(barX, barY, barWidth * ratio, 1.5);
      }
    }
  }

  private drawAgents(game: Game, timeMs: number): void {
    const ctx = this.ctx;
    const zoom = this.camera.zoom;
    const bounds = this.camera.visibleBounds();
    if (zoom < 8) return;
    const agents = game.agents;
    for (let id = 0; id < agents.capacity; id += 1) {
      if (agents.alive[id] === 0) continue;
      const x = agents.x[id];
      const y = agents.y[id];
      if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) continue;
      const civ = game.civs[agents.civ[id]];
      if (!civ) continue;
      const screen = this.camera.worldToScreen(x, y);
      const child = agents.age[id] < 14;
      const scale = child ? 0.62 : 1;
      const width = zoom * 0.95 * scale;
      const height = zoom * 1.2 * scale;
      const moving =
        agents.state[id] === AgentState.Marching ||
        agents.state[id] === AgentState.Fighting ||
        agents.state[id] === AgentState.Returning;
      const bob = Math.sin(timeMs / (moving ? 120 : 620) + id * 1.7) * (moving ? 1.4 : 0.7);
      ctx.drawImage(
        this.atlas.units,
        civ.color * 16,
        agents.job[id] * 20,
        16,
        20,
        screen.x - width / 2,
        screen.y - height + bob,
        width,
        height,
      );
      if (agents.state[id] === AgentState.Fighting && Math.sin(timeMs / 90 + id) > 0.2) {
        ctx.fillStyle = '#ffd36e';
        ctx.fillRect(screen.x + zoom * 0.4, screen.y - zoom * 0.8, 2, 2);
      }
    }
  }

  private drawAnimals(game: Game, timeMs: number): void {
    const ctx = this.ctx;
    const zoom = this.camera.zoom;
    if (zoom < 6) return;
    const bounds = this.camera.visibleBounds();
    const animals = game.animals;
    for (let id = 0; id < animals.capacity; id += 1) {
      if (animals.alive[id] === 0) continue;
      const x = animals.x[id];
      const y = animals.y[id];
      if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) continue;
      const screen = this.camera.worldToScreen(x, y);
      const frame = Math.floor(timeMs / 420 + id) % 2;
      const kind = animals.kind[id];
      const width = zoom * 0.85;
      const height = zoom * 0.85;
      const bob = Math.sin(timeMs / 320 + id) * 0.6;
      ctx.drawImage(
        this.atlas.animals,
        (kind * 2 + frame) * 16,
        0,
        16,
        16,
        screen.x - width / 2,
        screen.y - height + bob,
        width,
        height,
      );
    }
  }

  private drawLabels(game: Game): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    for (const civ of game.civs) {
      if (!civ.alive) continue;
      const screen = this.camera.worldToScreen(civ.centerX + 0.5, civ.centerY + 0.5);
      if (screen.x < -100 || screen.y < -60 || screen.x > this.width + 100 || screen.y > this.height + 100) {
        continue;
      }
      const label = `${civ.name} · ${civ.population}`;
      const width = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(8, 14, 20, 0.66)';
      ctx.fillRect(screen.x - width / 2 - 4, screen.y - this.camera.zoom * 2.9, width + 8, 16);
      ctx.strokeStyle = COLORS[civ.color];
      ctx.lineWidth = 1;
      ctx.strokeRect(screen.x - width / 2 - 4, screen.y - this.camera.zoom * 2.9, width + 8, 16);
      ctx.fillStyle = '#eef2f4';
      ctx.fillText(label, screen.x, screen.y - this.camera.zoom * 2.9 + 12);
    }
  }

  private drawOverlay(game: Game, overlay: RenderOverlay, timeMs: number): void {
    const ctx = this.ctx;
    const zoom = this.camera.zoom;

    if (overlay.hover) {
      const screen = this.camera.worldToScreen(Math.floor(overlay.hover.x), Math.floor(overlay.hover.y));
      ctx.strokeStyle = 'rgba(238, 242, 244, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(screen.x, screen.y, zoom, zoom);
    }

    if (overlay.cursor) {
      const screen = this.camera.worldToScreen(overlay.cursor.x, overlay.cursor.y);
      const radius = overlay.cursor.radius * zoom;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = overlay.cursor.color;
      ctx.globalAlpha = 0.08;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = overlay.cursor.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (overlay.selectedBuilding !== null) {
      const building = game.buildingById.get(overlay.selectedBuilding);
      if (building) {
        const screen = this.camera.worldToScreen(building.x + 0.5, building.y + 0.5);
        ctx.strokeStyle = '#edc948';
        ctx.lineWidth = 2;
        ctx.strokeRect(screen.x - zoom * 0.7, screen.y - zoom * 0.7, zoom * 1.4, zoom * 1.4);
      }
    }

    if (overlay.selectedAgent !== null && game.agents.alive[overlay.selectedAgent]) {
      const id = overlay.selectedAgent;
      const screen = this.camera.worldToScreen(game.agents.x[id], game.agents.y[id]);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, zoom * 0.45, 0, Math.PI * 2);
      ctx.strokeStyle = '#edc948';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    for (const effect of overlay.effects) {
      const age = (timeMs - effect.startMs) / effect.durationMs;
      if (age < 0 || age > 1) continue;
      const screen = this.camera.worldToScreen(effect.x, effect.y);
      const radius = effect.radius * zoom * (effect.kind === 'burst' ? 0.6 + age * 0.8 : 1);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = effect.color;
      ctx.globalAlpha = 1 - age;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawDayNight(timeMs: number): void {
    const ctx = this.ctx;
    const phase = (timeMs % 120000) / 120000;
    const darkness = Math.max(0, -Math.sin(phase * Math.PI * 2)) * 0.36;
    if (darkness <= 0.002) return;
    ctx.fillStyle = `rgba(10, 18, 42, ${darkness.toFixed(3)})`;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  get viewWidth(): number {
    return this.width;
  }

  get viewHeight(): number {
    return this.height;
  }

  /** Screen position of an agent or building tile for DOM tooltips. */
  agentLabel(id: number): string {
    if (!this.game) return '';
    const game = this.game;
    const agent = game.agents;
    if (!agent.isAlive(id)) return '';
    const civ = game.civs[agent.civ[id]];
    const job = agent.job[id] as Job;
    const jobName = ['Forager', 'Farmer', 'Builder', 'Priest', 'Soldier', 'Worker'][job] ?? 'Citizen';
    const home = agent.home[id];
    return `${civ?.name ?? 'Unknown'} · ${jobName}${home === NO_BUILDING ? '' : ''}`;
  }
}
