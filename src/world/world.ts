import { NO_OWNER, Tile, isWalkable, isWater, type SpawnSite, type World } from './types';
import type { RNG } from '../core/rng';

export function idx(size: number, x: number, y: number): number {
  return y * size + x;
}

export function inside(world: World, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.size && y < world.size;
}

export function tileAt(world: World, x: number, y: number): Tile {
  if (!inside(world, x, y)) return Tile.DeepWater;
  return world.terrain[y * world.size + x] as Tile;
}

export function isWaterAt(world: World, x: number, y: number): boolean {
  return !inside(world, x, y) || isWater(world.terrain[y * world.size + x]);
}

export function isLandAt(world: World, x: number, y: number): boolean {
  return inside(world, x, y) && !isWater(world.terrain[y * world.size + x]);
}

export function isWalkableAt(world: World, x: number, y: number): boolean {
  if (!inside(world, x, y)) return false;
  return isWalkable(world.terrain[y * world.size + x]);
}

export function isRiverAt(world: World, x: number, y: number): boolean {
  return inside(world, x, y) && world.river[y * world.size + x] === 1;
}

export function ownerAt(world: World, x: number, y: number): number {
  if (!inside(world, x, y)) return NO_OWNER;
  return world.owner[y * world.size + x];
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function manhattan(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x2 - x1) + Math.abs(y2 - y1);
}

export function tryFindWalkableNear(world: World, x: number, y: number, maxRadius = 8): SpawnSite | null {
  if (isWalkableAt(world, x, y)) return { x, y };
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (isWalkableAt(world, nx, ny)) return { x: nx, y: ny };
      }
    }
  }
  return null;
}

export function randomLandTile(world: World, rng: RNG, preferFertile = false): SpawnSite | null {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const x = rng.int(0, world.size - 1);
    const y = rng.int(0, world.size - 1);
    if (!isWalkableAt(world, x, y)) continue;
    if (preferFertile && world.fertility[y * world.size + x] < 100) continue;
    return { x, y };
  }
  return null;
}

export function countLandAround(world: World, cx: number, cy: number, radius: number): number {
  let count = 0;
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (isWalkableAt(world, x, y)) count += 1;
    }
  }
  return count;
}

/** Rebuilds the faction influence/owner map from all standing buildings. */
export function recomputeOwnership(
  world: World,
  buildings: readonly { civ: number; x: number; y: number; built: boolean; type: number }[],
  radiusForCiv: (civ: number) => number,
): void {
  world.owner.fill(NO_OWNER);
  // Town centers are stamped first so they always own their tile.
  const ordered = [...buildings].filter((b) => b.built).sort((a, b) => {
    if (a.type !== b.type) return a.type === 0 ? -1 : 1;
    return a.civ - b.civ;
  });
  for (const building of ordered) {
    const civRadius = radiusForCiv(building.civ);
    // City centres anchor territory; outlying buildings only claim their own
    // tile neighbourhood so many settlements stay cheap to refresh.
    const r = building.type === 0 ? civRadius : 2;
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (dx * dx + dy * dy > r2) continue;
        const x = building.x + dx;
        const y = building.y + dy;
        if (!inside(world, x, y)) continue;
        const i = y * world.size + x;
        if (isWater(world.terrain[i])) continue;
        world.owner[i] = building.civ;
      }
    }
  }
  world.ownerVersion += 1;
}

export function computeLandStats(world: World): { landTiles: number; waterTiles: number } {
  let landTiles = 0;
  const total = world.size * world.size;
  for (let i = 0; i < total; i += 1) {
    if (!isWater(world.terrain[i])) landTiles += 1;
  }
  return { landTiles, waterTiles: total - landTiles };
}

export function findSpawnSites(world: World, wanted: number): SpawnSite[] {
  const size = world.size;
  const sites: SpawnSite[] = [];
  const minGap = Math.max(40, Math.floor(size * 0.28));
  const step = Math.max(2, Math.floor(size / 150));
  const candidates: Array<SpawnSite & { score: number }> = [];

  for (let y = 8; y < size - 8; y += step) {
    for (let x = 8; x < size - 8; x += step) {
      const i = y * size + x;
      const tile = world.terrain[i];
      if (tile !== Tile.Grass && tile !== Tile.Forest) continue;
      if (world.fertility[i] < 90) continue;
      if (countLandAround(world, x, y, 5) < 52) continue;
      const centerBias = -Math.hypot(x - size / 2, y - size / 2) / size;
      candidates.push({ x, y, score: world.fertility[i] / 255 + centerBias * 0.5 });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  for (const candidate of candidates) {
    if (sites.length >= wanted) break;
    let tooClose = false;
    for (const site of sites) {
      if (Math.hypot(site.x - candidate.x, site.y - candidate.y) < minGap) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) sites.push({ x: candidate.x, y: candidate.y });
  }

  // If the world is too fragmented for spaced sites, relax the gap.
  if (sites.length < wanted) {
    for (const candidate of candidates) {
      if (sites.length >= wanted) break;
      if (sites.some((s) => Math.hypot(s.x - candidate.x, s.y - candidate.y) < minGap * 0.5)) continue;
      sites.push({ x: candidate.x, y: candidate.y });
    }
  }
  return sites;
}
