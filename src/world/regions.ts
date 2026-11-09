import { isWalkable, isWater, type World } from './types';

const KIND_INVALID = 0;
const KIND_LAND = 1;
const KIND_WATER = 2;

/**
 * Connectivity data derived from the terrain once per world (and recomputed
 * after terrain-shape changes). Region ids are unique across land and water.
 */
export interface Reachability {
  region: Int32Array;
  /** Indexed by region id; KIND_LAND or KIND_WATER. */
  regionKind: Uint8Array;
  /** Walkable tiles that touch water, by walk region (indexes into `region`). */
  coastTilesByWalkRegion: Map<number, number[]>;
  /** Water regions adjacent to each walk region, sorted and unique. */
  coastalWaterByWalkRegion: Map<number, number[]>;
}

function tileKind(tile: number): number {
  if (isWalkable(tile)) return KIND_LAND;
  if (isWater(tile)) return KIND_WATER;
  return KIND_INVALID;
}

/**
 * Labels every walkable and water tile with a 4-connected component id.
 * Mountains and other non-walkable, non-water tiles stay at 0. Four-way
 * connectivity matches the pathfinder's no-corner-cutting movement rule.
 */
export function computeReachability(world: World): Reachability {
  const size = world.size;
  const total = size * size;
  const region = new Int32Array(total);
  const regionKind = new Uint8Array(total + 1);
  const queue = new Int32Array(total);
  let nextId = 1;

  for (let start = 0; start < total; start += 1) {
    if (region[start] !== 0) continue;
    const kind = tileKind(world.terrain[start]);
    if (kind === KIND_INVALID) continue;
    const id = nextId;
    nextId += 1;
    regionKind[id] = kind;
    region[start] = id;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    while (head < tail) {
      const index = queue[head++];
      const x = index % size;
      const y = (index / size) | 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if ((dx === 0) === (dy === 0)) continue; // only the four cardinal neighbours
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const neighbour = ny * size + nx;
          if (region[neighbour] !== 0) continue;
          if (tileKind(world.terrain[neighbour]) !== kind) continue;
          region[neighbour] = id;
          queue[tail++] = neighbour;
        }
      }
    }
  }

  const coastTilesByWalkRegion = new Map<number, number[]>();
  const waterSets = new Map<number, Set<number>>();
  for (let index = 0; index < total; index += 1) {
    const id = region[index];
    if (id === 0 || regionKind[id] !== KIND_LAND) continue;
    const x = index % size;
    const y = (index / size) | 0;
    let coastal = false;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if ((dx === 0) === (dy === 0)) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const waterId = region[ny * size + nx];
        if (waterId === 0 || regionKind[waterId] !== KIND_WATER) continue;
        coastal = true;
        let set = waterSets.get(id);
        if (!set) {
          set = new Set<number>();
          waterSets.set(id, set);
        }
        set.add(waterId);
      }
    }
    if (!coastal) continue;
    let tiles = coastTilesByWalkRegion.get(id);
    if (!tiles) {
      tiles = [];
      coastTilesByWalkRegion.set(id, tiles);
    }
    tiles.push(index);
  }

  const coastalWaterByWalkRegion = new Map<number, number[]>();
  for (const [id, set] of waterSets) {
    coastalWaterByWalkRegion.set(id, [...set].sort((a, b) => a - b));
  }

  return { region, regionKind, coastTilesByWalkRegion, coastalWaterByWalkRegion };
}

export function regionAt(world: World, reach: Reachability, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= world.size || y >= world.size) return 0;
  return reach.region[y * world.size + x];
}

export function regionKindOf(reach: Reachability, id: number): number {
  return id > 0 ? reach.regionKind[id] : KIND_INVALID;
}

export function isLandRegion(reach: Reachability, id: number): boolean {
  return regionKindOf(reach, id) === KIND_LAND;
}

export function coastalWaterRegions(reach: Reachability, walkRegion: number): readonly number[] {
  return reach.coastalWaterByWalkRegion.get(walkRegion) ?? [];
}

/** True when any water region touches both walk regions. */
function sharesCoast(reach: Reachability, a: number, b: number): boolean {
  const aWater = reach.coastalWaterByWalkRegion.get(a);
  const bWater = reach.coastalWaterByWalkRegion.get(b);
  if (!aWater || !bWater) return false;
  for (const id of aWater) {
    if (bWater.includes(id)) return true;
  }
  return false;
}

/**
 * Conservative reachability test for two land points: same walkable region,
 * or two coastal land regions that touch a common water body. Unknown or
 * impassable coordinates are treated as reachable so a malformed save cannot
 * permanently freeze a faction's diplomacy.
 */
export function canReachByLandOrSea(
  reach: Reachability,
  world: World,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const a = regionAt(world, reach, Math.floor(ax), Math.floor(ay));
  const b = regionAt(world, reach, Math.floor(bx), Math.floor(by));
  if (a === 0 || b === 0) return true;
  if (a === b) return true;
  if (!isLandRegion(reach, a) || !isLandRegion(reach, b)) return false;
  return sharesCoast(reach, a, b);
}

/** True when the two points are on different walkable regions (naval needed). */
export function differentWalkRegions(
  reach: Reachability,
  world: World,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const a = regionAt(world, reach, Math.floor(ax), Math.floor(ay));
  const b = regionAt(world, reach, Math.floor(bx), Math.floor(by));
  if (a === 0 || b === 0) return false;
  return a !== b && isLandRegion(reach, a) && isLandRegion(reach, b);
}
