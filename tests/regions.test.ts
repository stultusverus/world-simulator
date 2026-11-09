import { describe, expect, it } from 'vitest';
import {
  canReachByLandOrSea,
  computeReachability,
  differentWalkRegions,
  isLandRegion,
  regionAt,
  regionKindOf,
} from '../src/world/regions';
import { NO_OWNER, Tile, type World } from '../src/world/types';

function testWorld(rows: string[]): World {
  const size = rows.length;
  const terrain = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const char = rows[y][x] ?? '.';
      terrain[y * size + x] =
        char === '~' ? Tile.ShallowWater : char === 'M' ? Tile.Mountain : Tile.Grass;
    }
  }
  return {
    size,
    seedText: 'REGIONS',
    seed: 1,
    tick: 1,
    elevation: new Uint8Array(size * size),
    moisture: new Uint8Array(size * size),
    terrain,
    fertility: new Uint8Array(size * size),
    river: new Uint8Array(size * size),
    owner: new Uint8Array(size * size).fill(NO_OWNER),
    waterDistance: new Uint8Array(size * size),
    spawnSites: [],
    landTiles: 0,
    waterTiles: 0,
    terrainVersion: 1,
    ownerVersion: 1,
  };
}

const waterSplit = testWorld([
  '..~~..',
  '..~~..',
  '..~~..',
  '..~~..',
  '..~~..',
  '..~~..',
]);

const mountainSplit = testWorld([
  '..MM..',
  '..MM..',
  '..MM..',
  '..MM..',
  '..MM..',
  '..MM..',
]);

const diagonalTouch = testWorld([
  '.~..',
  '~...',
  '....',
  '....',
]);

describe('reachability regions', () => {
  it('labels land and water components and detects a shared sea coast', () => {
    const reach = computeReachability(waterSplit);
    const left = regionAt(waterSplit, reach, 0, 0);
    const right = regionAt(waterSplit, reach, 5, 0);
    const water = regionAt(waterSplit, reach, 3, 0);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
    expect(water).toBeGreaterThan(0);
    expect(left).not.toBe(right);
    expect(isLandRegion(reach, left)).toBe(true);
    expect(regionKindOf(reach, water)).not.toBe(regionKindOf(reach, left));
    expect(canReachByLandOrSea(reach, waterSplit, 0, 0, 5, 0)).toBe(true);
    expect(differentWalkRegions(reach, waterSplit, 0, 0, 5, 0)).toBe(true);
    expect(canReachByLandOrSea(reach, waterSplit, 0, 0, 0, 5)).toBe(true);
  });

  it('treats mountains as impassable and non-coastal', () => {
    const reach = computeReachability(mountainSplit);
    const left = regionAt(mountainSplit, reach, 0, 0);
    const right = regionAt(mountainSplit, reach, 5, 0);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
    expect(regionAt(mountainSplit, reach, 3, 0)).toBe(0);
    expect(canReachByLandOrSea(reach, mountainSplit, 0, 0, 5, 0)).toBe(false);
  });

  it('does not connect land that only touches diagonally', () => {
    const reach = computeReachability(diagonalTouch);
    const a = regionAt(diagonalTouch, reach, 0, 0);
    const b = regionAt(diagonalTouch, reach, 1, 1);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });

  it('treats out-of-bounds or impassable endpoints as reachable for safety', () => {
    const reach = computeReachability(mountainSplit);
    expect(canReachByLandOrSea(reach, mountainSplit, -1, -1, 5, 5)).toBe(true);
    expect(regionAt(mountainSplit, reach, -1, 0)).toBe(0);
  });
});
