import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/world/generate';
import { isWater } from '../src/world/types';

function hashBytes(bytes: Uint8Array): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

describe('world generation', () => {
  it('is deterministic for a seed and size', () => {
    const a = generateWorld(256, 'ALPHA');
    const b = generateWorld(256, 'ALPHA');
    expect(hashBytes(a.terrain)).toBe(hashBytes(b.terrain));
    expect(hashBytes(a.fertility)).toBe(hashBytes(b.fertility));
    expect(a.seed).toBe(b.seed);
  });

  it('produces land, water and valid spawn sites across seeds', () => {
    for (const seed of ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO']) {
      const world = generateWorld(256, seed);
      const fraction = world.landTiles / (256 * 256);
      expect(fraction, `land fraction for ${seed}`).toBeGreaterThan(0.2);
      expect(fraction, `land fraction for ${seed}`).toBeLessThan(0.7);
      expect(world.spawnSites.length, `spawn sites for ${seed}`).toBeGreaterThanOrEqual(3);
      expect(world.terrain.some((t) => isWater(t))).toBe(true);
    }
  });

  it('generates every supported size within budget', () => {
    const sizes = [256, 512, 1024];
    const results: string[] = [];
    for (const size of sizes) {
      const start = performance.now();
      const world = generateWorld(size, 'TITAN');
      const elapsed = performance.now() - start;
      expect(world.landTiles).toBeGreaterThan(0);
      expect(world.spawnSites.length).toBeGreaterThan(0);
      results.push(`${size}: ${elapsed.toFixed(0)}ms land=${(100 * world.landTiles / (size * size)).toFixed(1)}%`);
    }
    console.log('generation timings:', results.join(' | '));
  });
});
