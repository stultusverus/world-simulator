import { RNG, hashString } from '../core/rng';
import { BuildingType, Job, Tile } from '../world/types';
import { COLORS } from '../config';

export const TERRAIN_COLORS: readonly string[] = [
  '#10313f',
  '#236272',
  '#d6bd85',
  '#4f7a3a',
  '#2f5a2c',
  '#7a7956',
  '#6f6a63',
  '#e2e9ec',
];

export const RIVER_COLOR = '#3d7fa0';

const SKIN = ['#e8c39e', '#cf9f74', '#9a6a45'];
const HAIR = ['#3a2a20', '#5b3f2c', '#231c16', '#7a5b3a'];

function rgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function shade(hex: string, amount: number): string {
  const [r, g, b] = rgb(hex);
  const factor = 1 + amount / 100;
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawTile(ctx: CanvasRenderingContext2D, type: Tile, variant: number): void {
  const rng = new RNG(hashString(`tile:${type}:${variant}`));
  const base = TERRAIN_COLORS[type];
  px(ctx, 0, 0, 16, 16, base);

  if (type === Tile.DeepWater) {
    for (let i = 0; i < 3; i += 1) {
      const y = 3 + rng.int(0, 10);
      const x = rng.int(0, 10);
      px(ctx, x, y, rng.int(3, 6), 1, shade(base, 14));
    }
    px(ctx, 0, 15, 16, 1, shade(base, -12));
  } else if (type === Tile.ShallowWater) {
    for (let i = 0; i < 4; i += 1) {
      const y = rng.int(1, 13);
      px(ctx, rng.int(0, 12), y, rng.int(2, 5), 1, shade(base, 18));
    }
    px(ctx, rng.int(2, 10), rng.int(2, 12), 2, 1, '#6aa7c0');
  } else if (type === Tile.Sand) {
    for (let i = 0; i < 7; i += 1) {
      px(ctx, rng.int(0, 14), rng.int(0, 14), 1, 1, rng.chance(0.5) ? shade(base, 10) : shade(base, -8));
    }
    if (rng.chance(0.35)) px(ctx, rng.int(0, 12), rng.int(0, 12), 2, 1, '#ead4a3');
  } else if (type === Tile.Grass) {
    px(ctx, 0, 0, 16, 16, shade(base, (variant - 1) * 3));
    for (let i = 0; i < 7; i += 1) {
      const x = rng.int(0, 14);
      const y = rng.int(2, 14);
      px(ctx, x, y, 1, 2, shade(base, 16));
    }
    for (let i = 0; i < 4; i += 1) {
      px(ctx, rng.int(0, 15), rng.int(0, 15), 1, 1, shade(base, -14));
    }
    if (variant === 2) px(ctx, rng.int(2, 10), rng.int(4, 10), 3, 2, shade(base, -8));
    if (rng.chance(0.14)) px(ctx, rng.int(1, 13), rng.int(1, 13), 1, 1, '#edc948');
    if (rng.chance(0.08)) px(ctx, rng.int(1, 12), rng.int(1, 12), 2, 1, '#8a6a45');
  } else if (type === Tile.Forest) {
    px(ctx, 0, 0, 16, 16, shade(base, 4));
    for (let i = 0; i < 5; i += 1) {
      px(ctx, rng.int(0, 15), rng.int(0, 15), 1, 1, rng.chance(0.5) ? '#5d8a44' : '#24491f');
    }
    const trees = [
      { x: 0, y: 2 },
      { x: 8, y: 0 },
      { x: 9, y: 8 },
      { x: 1, y: 9 },
    ];
    for (let i = 0; i < 2; i += 1) {
      const tree = trees[(variant + i * 2) % trees.length];
      const ox = tree.x;
      const oy = tree.y;
      px(ctx, ox + 3, oy + 7, 2, 5, '#5a3f27');
      px(ctx, ox, oy + 2, 8, 7, '#24491f');
      px(ctx, ox + 1, oy + 1, 6, 6, '#3a6b33');
      px(ctx, ox + 2, oy + 1, 4, 3, '#4f7a3a');
      px(ctx, ox + 3, oy + 2, 2, 1, '#649a52');
    }
    if (variant === 3) px(ctx, 12, 12, 2, 2, '#7a7956');
  } else if (type === Tile.Hills) {
    for (let i = 0; i < 3; i += 1) {
      const x = rng.int(0, 8);
      const y = rng.int(4, 11);
      px(ctx, x, y, 7, 4, shade(base, 8));
      px(ctx, x + 1, y - 1, 5, 2, shade(base, 16));
      px(ctx, x, y + 4, 7, 1, shade(base, -18));
    }
  } else if (type === Tile.Mountain) {
    for (let i = 0; i < 4; i += 1) {
      const x = rng.int(0, 15);
      px(ctx, x, rng.int(2, 14), 1, 2, shade(base, -15));
    }
    const peakX = 3 + variant * 2;
    for (let row = 0; row < 12; row += 1) {
      const width = 12 - row;
      px(ctx, peakX + Math.floor((12 - width) / 2), 14 - row, width, 1, row < 3 ? '#dfe7ea' : shade(base, 18));
    }
    // Secondary foothill.
    px(ctx, 11, 12, 4, 3, shade(base, -6));
    px(ctx, 12, 11, 2, 1, shade(base, 22));
  } else if (type === Tile.Snow) {
    for (let i = 0; i < 8; i += 1) {
      px(ctx, rng.int(0, 15), rng.int(0, 15), 1, 1, shade(base, -10));
    }
    if (rng.chance(0.4)) {
      px(ctx, rng.int(1, 12), rng.int(8, 13), 3, 2, '#c3ced4');
      px(ctx, rng.int(1, 12), rng.int(2, 8), 3, 2, '#c3ced4');
    }
  }
}

function drawRiver(ctx: CanvasRenderingContext2D, variant: number): void {
  const horizontal = variant % 2 === 0;
  const water = RIVER_COLOR;
  const deep = shade(water, -22);
  const highlight = '#7ab4c9';
  if (horizontal) {
    px(ctx, 0, 4, 16, 8, deep);
    px(ctx, 0, 5, 16, 6, water);
    px(ctx, 0, 6, 16, 1, highlight);
    for (let x = 0; x < 16; x += 1) {
      if ((x + variant) % 6 === 0) px(ctx, x, 5, 2, 1, '#a9d0da');
    }
  } else {
    px(ctx, 4, 0, 8, 16, deep);
    px(ctx, 5, 0, 6, 16, water);
    px(ctx, 6, 0, 1, 16, highlight);
    for (let y = 0; y < 16; y += 1) {
      if ((y + variant) % 6 === 0) px(ctx, 5, y, 1, 2, '#a9d0da');
    }
  }
}

function drawUnit(ctx: CanvasRenderingContext2D, ox: number, oy: number, color: string, job: Job, seed: number): void {
  const rng = new RNG(hashString(`unit:${color}:${job}:${seed}`));
  const skin = SKIN[seed % SKIN.length];
  const hair = HAIR[seed % HAIR.length];
  const body = color;
  const bodyDark = shade(color, -28);

  px(ctx, ox + 3, oy + 18, 10, 2, 'rgba(0,0,0,0.25)');
  // Legs.
  px(ctx, ox + 5, oy + 14, 2, 4, '#3a2f26');
  px(ctx, ox + 9, oy + 14, 2, 4, '#3a2f26');
  // Body.
  px(ctx, ox + 4, oy + 8, 8, 7, bodyDark);
  px(ctx, ox + 5, oy + 8, 6, 6, body);
  px(ctx, ox + 5, oy + 13, 6, 1, bodyDark);
  // Head.
  px(ctx, ox + 5, oy + 3, 6, 5, skin);
  px(ctx, ox + 5, oy + 2, 6, 2, hair);
  px(ctx, ox + 6, oy + 4, 1, 1, '#2b211a');
  px(ctx, ox + 9, oy + 4, 1, 1, '#2b211a');

  if (job === Job.Farmer) {
    px(ctx, ox + 3, oy + 2, 10, 2, '#d9b45f');
    px(ctx, ox + 5, oy, 6, 2, '#c99a45');
  } else if (job === Job.Builder) {
    px(ctx, ox + 10, oy + 9, 2, 5, '#7a5636');
    px(ctx, ox + 11, oy + 7, 3, 2, '#9a9386');
    px(ctx, ox + 4, oy + 8, 8, 3, '#8a6a45');
  } else if (job === Job.Worker) {
    px(ctx, ox + 4, oy + 9, 8, 4, '#7a5636');
    px(ctx, ox + 7, oy + 9, 2, 2, '#c9b28a');
  } else if (job === Job.Priest) {
    px(ctx, ox + 3, oy + 8, 10, 8, '#e6edf3');
    px(ctx, ox + 7, oy + 9, 2, 4, '#c9a24a');
    px(ctx, ox + 13, oy + 4, 1, 13, '#9a6a45');
    px(ctx, ox + 12, oy + 3, 3, 2, '#edc948');
  } else if (job === Job.Soldier) {
    px(ctx, ox + 2, oy + 8, 4, 6, shade(body, -10));
    px(ctx, ox + 3, oy + 9, 2, 2, '#e6edf3');
    px(ctx, ox + 12, oy + 2, 1, 16, '#c9c2b2');
    px(ctx, ox + 11, oy + 1, 3, 2, '#9a9386');
    px(ctx, ox + 4, oy + 2, 6, 1, '#5a5a5a');
  }
  // Tiny equipment speckle for life.
  if (rng.chance(0.4)) px(ctx, ox + 10, oy + 11, 1, 1, shade(body, 30));
}

function drawAnimal(ctx: CanvasRenderingContext2D, ox: number, oy: number, kind: number, frame: number): void {
  const leg = frame === 0 ? 0 : 1;
  if (kind === 0) {
    px(ctx, ox + 2, oy + 13, 10, 2, 'rgba(0,0,0,0.2)');
    px(ctx, ox + 2, oy + 7, 8, 5, '#a97a4d');
    px(ctx, ox + 9, oy + 4, 4, 4, '#b98a5a');
    px(ctx, ox + 12, oy + 5, 1, 1, '#2b211a');
    px(ctx, ox + 10, oy + 2, 1, 2, '#7a5b3a');
    px(ctx, ox + 12, oy + 2, 1, 2, '#7a5b3a');
    px(ctx, ox + 3, oy + 11, 2, 4 + leg, '#7a5b3a');
    px(ctx, ox + 7, oy + 11, 2, 4 + (1 - leg), '#7a5b3a');
    px(ctx, ox + 1, oy + 7, 2, 2, '#b98a5a');
  } else {
    px(ctx, ox + 2, oy + 13, 10, 2, 'rgba(0,0,0,0.22)');
    px(ctx, ox + 3, oy + 7, 8, 5, '#6c6f74');
    px(ctx, ox + 10, oy + 5, 4, 4, '#7c7f84');
    px(ctx, ox + 11, oy + 4, 1, 2, '#6c6f74');
    px(ctx, ox + 13, oy + 4, 1, 2, '#6c6f74');
    px(ctx, ox + 12, oy + 6, 1, 1, '#2b211a');
    px(ctx, ox + 4, oy + 11, 2, 4 + leg, '#55585c');
    px(ctx, ox + 8, oy + 11, 2, 4 + (1 - leg), '#55585c');
    px(ctx, ox + 1, oy + 8, 2, 2, '#55585c');
  }
}

function drawBuildings(ctx: CanvasRenderingContext2D, ox: number, oy: number, type: BuildingType, color: string): void {
  const wood = '#7a5636';
  const woodDark = '#5a3f27';
  const stone = '#9a9386';
  const stoneDark = '#6f6a63';
  const roof = color;
  const roofDark = shade(color, -30);
  const gold = '#edc948';

  if (type === BuildingType.TownCenter) {
    px(ctx, ox + 6, oy + 40, 36, 3, 'rgba(0,0,0,0.22)');
    px(ctx, ox + 7, oy + 22, 34, 20, stoneDark);
    px(ctx, ox + 9, oy + 21, 30, 16, stone);
    px(ctx, ox + 13, oy + 10, 22, 33, stoneDark);
    px(ctx, ox + 15, oy + 9, 18, 30, stone);
    px(ctx, ox + 12, oy + 3, 24, 8, roofDark);
    px(ctx, ox + 13, oy + 2, 22, 7, roof);
    px(ctx, ox + 23, oy - 5, 2, 9, stoneDark);
    px(ctx, ox + 25, oy - 4, 7, 4, roof);
    px(ctx, ox + 22, oy + 30, 5, 14, '#3a2b21');
    px(ctx, ox + 22, oy + 30, 4, 1, gold);
    for (const wx of [17, 25, 33]) {
      px(ctx, ox + wx, oy + 16, 3, 3, gold);
      px(ctx, ox + wx, oy + 16, 3, 1, '#fff2bd');
      px(ctx, ox + wx, oy + 26, 3, 3, gold);
      px(ctx, ox + wx, oy + 26, 3, 1, '#fff2bd');
    }
    px(ctx, ox + 9, oy + 40, 7, 4, stoneDark);
    px(ctx, ox + 32, oy + 40, 7, 4, stoneDark);
  } else if (type === BuildingType.House) {
    px(ctx, ox + 11, oy + 40, 26, 2, 'rgba(0,0,0,0.22)');
    px(ctx, ox + 12, oy + 24, 24, 17, woodDark);
    px(ctx, ox + 13, oy + 24, 22, 15, wood);
    for (let i = 0; i < 4; i += 1) px(ctx, ox + 14, oy + 26 + i * 3, 20, 1, shade(wood, 10));
    px(ctx, ox + 10, oy + 24, 28, 2, roofDark);
    px(ctx, ox + 14, oy + 15, 20, 9, roof);
    px(ctx, ox + 16, oy + 12, 16, 5, shade(roof, 12));
    px(ctx, ox + 21, oy + 31, 6, 10, '#3a2b21');
    px(ctx, ox + 22, oy + 34, 1, 1, gold);
    px(ctx, ox + 28, oy + 28, 4, 4, '#5d8a9a');
  } else if (type === BuildingType.Farm) {
    px(ctx, ox + 6, oy + 24, 36, 18, '#8a6a45');
    px(ctx, ox + 7, oy + 25, 34, 16, '#9a7a50');
    for (let row = 0; row < 4; row += 1) {
      px(ctx, ox + 8, oy + 26 + row * 4, 32, 2, row % 2 === 0 ? '#b9a45b' : '#a08f4f');
    }
    px(ctx, ox + 6, oy + 22, 36, 2, woodDark);
    px(ctx, ox + 6, oy + 22, 2, 18, woodDark);
    px(ctx, ox + 40, oy + 22, 2, 18, woodDark);
    px(ctx, ox + 30, oy + 12, 10, 12, woodDark);
    px(ctx, ox + 31, oy + 11, 9, 10, '#8a6a45');
    px(ctx, ox + 29, oy + 10, 12, 2, roof);
    px(ctx, ox + 25, oy + 30, 4, 4, gold);
  } else if (type === BuildingType.Workshop) {
    px(ctx, ox + 9, oy + 40, 30, 2, 'rgba(0,0,0,0.22)');
    px(ctx, ox + 10, oy + 24, 26, 17, woodDark);
    px(ctx, ox + 11, oy + 23, 24, 15, wood);
    px(ctx, ox + 9, oy + 22, 28, 2, roofDark);
    px(ctx, ox + 12, oy + 14, 16, 8, roof);
    px(ctx, ox + 28, oy + 8, 4, 12, stoneDark);
    for (let i = 0; i < 3; i += 1) {
      px(ctx, ox + 27 + (i % 2), oy + 3 - i * 2, 5, 2, `rgba(200,200,200,${0.25 + i * 0.12})`);
    }
    px(ctx, ox + 18, oy + 31, 5, 9, '#3a2b21');
    px(ctx, ox + 31, oy + 32, 7, 5, '#5a5a5a');
    px(ctx, ox + 33, oy + 30, 3, 3, '#7c7f84');
    px(ctx, ox + 13, oy + 28, 4, 4, gold);
  } else if (type === BuildingType.Temple) {
    px(ctx, ox + 7, oy + 40, 34, 3, 'rgba(0,0,0,0.22)');
    px(ctx, ox + 8, oy + 34, 32, 9, stoneDark);
    px(ctx, ox + 10, oy + 33, 28, 5, stone);
    for (const cx of [12, 20, 30, 36]) {
      px(ctx, ox + cx, oy + 20, 3, 14, stoneDark);
      px(ctx, ox + cx + 1, oy + 20, 2, 13, '#cfc8bb');
    }
    px(ctx, ox + 9, oy + 18, 30, 3, stoneDark);
    px(ctx, ox + 13, oy + 6, 22, 12, roof);
    px(ctx, ox + 15, oy + 4, 18, 7, shade(roof, 12));
    px(ctx, ox + 23, oy - 4, 2, 9, stoneDark);
    px(ctx, ox + 25, oy - 4, 6, 4, gold);
    px(ctx, ox + 22, oy + 24, 4, 10, '#3a2b21');
    px(ctx, ox + 16, oy + 28, 3, 4, gold);
    px(ctx, ox + 30, oy + 28, 3, 4, gold);
  } else if (type === BuildingType.Barracks) {
    px(ctx, ox + 6, oy + 40, 36, 3, 'rgba(0,0,0,0.22)');
    px(ctx, ox + 7, oy + 24, 34, 17, '#4a3a2a');
    px(ctx, ox + 8, oy + 23, 32, 15, '#5f4a35');
    px(ctx, ox + 6, oy + 22, 36, 2, roofDark);
    px(ctx, ox + 10, oy + 14, 10, 9, roof);
    px(ctx, ox + 28, oy + 10, 14, 14, '#5f4a35');
    px(ctx, ox + 30, oy + 8, 10, 3, roof);
    px(ctx, ox + 20, oy + 29, 6, 12, '#2f241b');
    px(ctx, ox + 33, oy + 18, 5, 6, '#e6edf3');
    px(ctx, ox + 34, oy + 19, 3, 3, color);
    px(ctx, ox + 12, oy + 28, 5, 5, '#2f241b');
    px(ctx, ox + 14, oy + 30, 1, 1, gold);
    px(ctx, ox + 30, oy + 34, 8, 2, '#3a2f26');
  }
}

export class SpriteAtlas {
  readonly tiles: HTMLCanvasElement;
  readonly rivers: HTMLCanvasElement;
  readonly units: HTMLCanvasElement;
  readonly animals: HTMLCanvasElement;
  readonly buildings: HTMLCanvasElement;

  constructor() {
    this.tiles = makeCanvas(8 * 16, 4 * 16);
    const tileCtx = this.tiles.getContext('2d');
    if (tileCtx) {
      tileCtx.imageSmoothingEnabled = false;
      for (let type = 0; type < 8; type += 1) {
        for (let variant = 0; variant < 4; variant += 1) {
          const index = type * 4 + variant;
          const cx = (index % 8) * 16;
          const cy = Math.floor(index / 8) * 16;
          tileCtx.save();
          tileCtx.translate(cx, cy);
          drawTile(tileCtx, type as Tile, variant);
          tileCtx.restore();
        }
      }
    }

    this.rivers = makeCanvas(4 * 16, 16);
    const riverCtx = this.rivers.getContext('2d');
    if (riverCtx) {
      for (let variant = 0; variant < 4; variant += 1) {
        riverCtx.save();
        riverCtx.translate(variant * 16, 0);
        drawRiver(riverCtx, variant);
        riverCtx.restore();
      }
    }

    this.units = makeCanvas(8 * 16, 6 * 20);
    const unitCtx = this.units.getContext('2d');
    if (unitCtx) {
      for (let color = 0; color < 8; color += 1) {
        for (let job = 0; job < 6; job += 1) {
          unitCtx.save();
          unitCtx.translate(color * 16, job * 20);
          drawUnit(unitCtx, 0, 0, COLORS[color], job as Job, color + job * 3);
          unitCtx.restore();
        }
      }
    }

    this.animals = makeCanvas(4 * 16, 16);
    const animalCtx = this.animals.getContext('2d');
    if (animalCtx) {
      for (let frame = 0; frame < 2; frame += 1) {
        animalCtx.save();
        animalCtx.translate(frame * 16, 0);
        drawAnimal(animalCtx, 0, 0, 0, frame);
        animalCtx.restore();
      }
      for (let frame = 0; frame < 2; frame += 1) {
        animalCtx.save();
        animalCtx.translate((frame + 2) * 16, 0);
        drawAnimal(animalCtx, 0, 0, 1, frame);
        animalCtx.restore();
      }
    }

    this.buildings = makeCanvas(8 * 48, 6 * 48);
    const buildingCtx = this.buildings.getContext('2d');
    if (buildingCtx) {
      for (let type = 0; type < 6; type += 1) {
        for (let color = 0; color < 8; color += 1) {
          buildingCtx.save();
          buildingCtx.translate(color * 48, type * 48);
          drawBuildings(buildingCtx, 0, 0, type as BuildingType, COLORS[color]);
          buildingCtx.restore();
        }
      }
    }
  }
}

export function createSpriteAtlas(): SpriteAtlas {
  return new SpriteAtlas();
}
