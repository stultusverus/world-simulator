import { describe, expect, it } from 'vitest';
import { findPath, findSeaPath, type SearchBudget } from '../src/sim/pathfind';
import { Tile, type World } from '../src/world/types';

function openWorld(tile: Tile): World {
  const empty = new Uint8Array(0);
  return {
    size: 1024,
    terrain: new Uint8Array(1024 * 1024).fill(tile),
    seed: 0,
    seedText: 'OPEN',
    tick: 1,
    elevation: empty,
    moisture: empty,
    fertility: empty,
    river: empty,
    owner: empty,
    waterDistance: empty,
    spawnSites: [],
    landTiles: 0,
    waterTiles: 0,
    terrainVersion: 1,
    ownerVersion: 1,
  };
}

describe('oblique A* routes', () => {
  it.each([
    [310, 110, 300],
    [910, 310, 900],
  ])('finds uniform land route to %i,%i within a narrow budget', (x, y, length) => {
    const world = openWorld(Tile.Grass);
    const budget: SearchBudget = { remaining: 12000, expanded: 0, exhausted: false };
    const path = findPath(world, 10, 10, x, y, 12000, true, budget);
    expect(path).toHaveLength(length);
    expect(budget.expanded).toBeLessThanOrEqual(length * 4);
    let prior = { x: 10, y: 10 };
    for (const point of path!) {
      expect(Math.max(Math.abs(point.x - prior.x), Math.abs(point.y - prior.y))).toBe(1);
      prior = point;
    }
    expect(prior).toEqual({ x, y });
  });
  it('keeps weighted grass routing effective within the former soldier budget', () => {
    expect(findPath(openWorld(Tile.Grass), 10, 10, 910, 310, 1800)).toHaveLength(900);
  });
  it('uses the same correct deeper-node tie break for sea routes in either direction', () => {
    const world = openWorld(Tile.DeepWater);
    expect(findSeaPath(world, 10, 10, 910, 310, 1800)).toHaveLength(900);
    expect(findSeaPath(world, 910, 310, 10, 10, 1800)).toHaveLength(900);
    expect(findSeaPath(world, 10, 10, 910, 310, 100)).toBeNull();
  });
  it('marks shared-work exhaustion without classifying a route as unreachable', () => {
    const budget: SearchBudget = { remaining: 100, expanded: 0, exhausted: false };
    expect(findPath(openWorld(Tile.Grass), 10, 10, 910, 310, 12000, true, budget)).toBeNull();
    expect(budget.exhausted).toBe(true);
    expect(budget.expanded).toBe(100);
  });
});
