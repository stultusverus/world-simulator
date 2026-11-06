import { GEN_SALT, SEA_LEVEL, WORLD_SIZES } from '../config';
import { clamp, fbm2D, ridged2D } from '../core/noise';
import { RNG, hashString, mixSeed } from '../core/rng';
import { NO_OWNER, Tile, isWalkable, type SpawnSite, type World } from './types';
import { computeLandStats, findSpawnSites } from './world';

const TILE_COUNT_BY_SIZE: Record<number, number> = {
  256: 256 * 256,
  512: 512 * 512,
  1024: 1024 * 1024,
};

function distToWater(elevation: Uint8Array, size: number, sea: number): Uint8Array {
  const total = size * size;
  const dist = new Uint8Array(total).fill(255);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < total; i += 1) {
    if (elevation[i] < sea) {
      dist[i] = 0;
      queue[tail++] = i;
    }
  }

  const cap = 40;
  while (head < tail) {
    const i = queue[head++];
    const d = dist[i];
    if (d >= cap) continue;
    const x = i % size;
    const y = (i / size) | 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const ni = ny * size + nx;
        if (dist[ni] > d + 1) {
          dist[ni] = d + 1;
          queue[tail++] = ni;
        }
      }
    }
  }
  return dist;
}

/** Picks the sea level that puts roughly the target share of the map underwater. */
function computeSeaLevel(elevation: Uint8Array, targetLandFraction = 0.48): number {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < elevation.length; i += 1) histogram[elevation[i]] += 1;
  const waterTarget = (1 - targetLandFraction) * elevation.length;
  let cumulative = 0;
  for (let v = 0; v < 256; v += 1) {
    cumulative += histogram[v];
    if (cumulative >= waterTarget) return v;
  }
  return Math.round(SEA_LEVEL * 255);
}

function carveRivers(
  elevation: Uint8Array,
  terrain: Uint8Array,
  river: Uint8Array,
  size: number,
  seed: number,
  sea: number,
): void {
  const rng = new RNG(mixSeed(seed, GEN_SALT.rivers));
  const wanted = 6 + Math.floor(size / 256) * 3 + Math.floor(size / 512) * 2;
  const marked: number[] = [];
  const sources: number[] = [];
  for (let i = 0; i < elevation.length; i += 1) {
    if (elevation[i] >= sea + 28 && isWalkable(terrain[i])) sources.push(i);
  }
  if (sources.length === 0) return;

  for (let r = 0; r < wanted; r += 1) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const si = sources[rng.int(0, sources.length - 1)];
      const sx = si % size;
      const sy = (si / size) | 0;
      if (river[si] === 1) continue;
      if (sx < 2 || sy < 2 || sx >= size - 2 || sy >= size - 2) continue;

      const path: number[] = [];
      const visited = new Set<number>();
      let x = sx;
      let y = sy;
      let steps = 0;

      while (steps < 500) {
        const i = y * size + x;
        if (river[i] === 1 || visited.has(i) || !isWalkable(terrain[i])) break;
        visited.add(i);
        path.push(i);
        if (elevation[i] < sea) break;

        let best = -1;
        let bestElevation = elevation[i];
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 1 || ny < 1 || nx >= size - 1 || ny >= size - 1) continue;
            const ni = ny * size + nx;
            if (river[ni] === 1 || visited.has(ni)) continue;
            if (!isWalkable(terrain[ni])) continue;
            if (elevation[ni] < bestElevation) {
              bestElevation = elevation[ni];
              best = ni;
            }
          }
        }

        if (best < 0) {
          // Local minimum: look a little further for a lower outlet, then cut to it.
          let escape = -1;
          let escapeElevation = elevation[i];
          const radius = 7;
          for (let dy = -radius; dy <= radius; dy += 1) {
            for (let dx = -radius; dx <= radius; dx += 1) {
              if (dx * dx + dy * dy > radius * radius) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 1 || ny < 1 || nx >= size - 1 || ny >= size - 1) continue;
              const ni = ny * size + nx;
              if (river[ni] === 1 || visited.has(ni) || !isWalkable(terrain[ni])) continue;
              if (elevation[ni] < escapeElevation) {
                escapeElevation = elevation[ni];
                escape = ni;
              }
            }
          }
          if (escape < 0) break;
          const ex = escape % size;
          const ey = (escape / size) | 0;
          let cx = x;
          let cy = y;
          while (cx !== ex || cy !== ey) {
            cx += Math.sign(ex - cx);
            cy += Math.sign(ey - cy);
            const ci = cy * size + cx;
            if (!visited.has(ci) && isWalkable(terrain[ci])) {
              visited.add(ci);
              path.push(ci);
            }
          }
          x = ex;
          y = ey;
          steps += 1;
          continue;
        }

        x = best % size;
        y = (best / size) | 0;
        steps += 1;
      }

      if (path.length >= 10) {
        for (const i of path) {
          const t = terrain[i] as Tile;
          if (t === Tile.Sand || t === Tile.Mountain || t === Tile.Snow) continue;
          if (river[i] === 1) continue;
          river[i] = 1;
          marked.push(i);
        }
        break;
      }
    }
  }

  // Keep rivers from swallowing mountain peaks.
  for (const i of marked) {
    if (elevation[i] > sea + 170) river[i] = 0;
  }
}

export function generateWorld(size: number, seedText: string): World {
  if (!WORLD_SIZES.includes(size as (typeof WORLD_SIZES)[number])) {
    throw new Error(`Unsupported world size: ${size}`);
  }
  const seed = hashString(seedText);
  const total = TILE_COUNT_BY_SIZE[size] ?? size * size;
  const elevation = new Uint8Array(total);
  const moisture = new Uint8Array(total);
  const terrain = new Uint8Array(total);
  const fertility = new Uint8Array(total);
  const river = new Uint8Array(total);
  const owner = new Uint8Array(total).fill(NO_OWNER);

  const elevSeed = mixSeed(seed, GEN_SALT.elevation);
  const ridgeSeed = mixSeed(seed, GEN_SALT.ridge);
  const moistSeed = mixSeed(seed, GEN_SALT.moisture);
  const scale = size / 256;
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const nd = Math.hypot((x - cx) / Math.max(1, cx), (y - cy) / Math.max(1, cy)) / Math.SQRT2;
      const island = Math.pow(clamp(1 - nd * 1.12, 0, 1), 1.25);
      const base = fbm2D(x / (46 * scale), y / (46 * scale), elevSeed, 6);
      const ridge = ridged2D(x / (88 * scale), y / (88 * scale), ridgeSeed, 5);
      const detail = fbm2D(x / (11 * scale), y / (11 * scale), elevSeed ^ 0x9e3779b9, 3) - 0.5;
      const e = clamp(0.5 * base + 0.17 * ridge + 0.3 * island + 0.05 * detail + 0.02, 0, 1);
      elevation[i] = Math.round(e * 255);
    }
  }

  const sea = computeSeaLevel(elevation);
  const waterDist = distToWater(elevation, size, sea);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const e = elevation[i];
      const dist = waterDist[i];
      const m = clamp(
        fbm2D(x / (26 * scale), y / (26 * scale), moistSeed, 5) * 0.58 +
          clamp(1 - dist / 22, 0, 1) * 0.32 +
          0.1,
        0,
        1,
      );
      moisture[i] = Math.round(m * 255);

      let tile: Tile;
      if (e < sea - 30) tile = Tile.DeepWater;
      else if (e < sea) tile = Tile.ShallowWater;
      else if (e < sea + 8) tile = Tile.Sand;
      else if (e < sea + 42) tile = m > 0.52 ? Tile.Forest : Tile.Grass;
      else if (e < sea + 68) tile = Tile.Hills;
      else if (e < sea + 90) tile = Tile.Mountain;
      else tile = Tile.Snow;
      terrain[i] = tile;

      let fert = m * 0.72 + 0.08;
      if (tile === Tile.Grass) fert += 0.18;
      else if (tile === Tile.Forest) fert += 0.1;
      else if (tile === Tile.Hills) fert -= 0.06;
      else if (tile === Tile.Sand) fert -= 0.12;
      else if (tile === Tile.Mountain || tile === Tile.Snow) fert -= 0.3;
      if (e > sea + 50) fert -= 0.1;
      fertility[i] = Math.round(clamp(fert, 0, 1) * 255);
    }
  }

  carveRivers(elevation, terrain, river, size, seed, sea);

  for (let i = 0; i < total; i += 1) {
    if (river[i] === 1 && fertility[i] < 235) fertility[i] = Math.min(255, fertility[i] + 20);
  }

  const world: World = {
    size,
    seedText,
    seed,
    tick: 1,
    elevation,
    moisture,
    terrain,
    fertility,
    river,
    owner,
    waterDistance: waterDist,
    spawnSites: [],
    landTiles: 0,
    waterTiles: 0,
    terrainVersion: 1,
    ownerVersion: 1,
  };

  const stats = computeLandStats(world);
  world.landTiles = stats.landTiles;
  world.waterTiles = stats.waterTiles;
  world.spawnSites = findSpawnSites(world, 8);
  return world;
}

export function terrainSummary(world: World): Record<string, number> {
  const counts: Record<string, number> = {};
  for (let i = 0; i < world.terrain.length; i += 1) {
    const key = String(world.terrain[i]);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function landFraction(world: World): number {
  return world.landTiles / (world.size * world.size);
}

export function spawnSitesFor(world: World, count: number): SpawnSite[] {
  return world.spawnSites.slice(0, count);
}
