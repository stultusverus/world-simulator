import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/sim/pathfind', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/sim/pathfind')>();
  return { ...actual, findPath: vi.fn(actual.findPath) };
});

import { findPath } from '../src/sim/pathfind';
import { Game } from '../src/sim/game';
import { runWar, startWar } from '../src/sim/war';
import { AgentState, BuildingType, Job, Tile } from '../src/world/types';

function twoSoldierFixture() {
  const game = new Game({ size: 256, seedText: 'ALPHA', startWithFactions: true });
  for (const building of [...game.buildings]) game.removeBuilding(building);
  for (let id = 0; id < game.agents.capacity; id += 1) {
    if (game.agents.alive[id]) game.removeAgent(id);
  }
  game.world.terrain.fill(Tile.Grass);
  const target = game.addBuilding(1, BuildingType.TownCenter, 30, 10, true);
  const soldiers = [10.5, 11.5].map((x) => {
    const id = game.spawnAgent(0, x, 10.5, { age: 25, gender: 0 });
    game.agents.job[id] = Job.Soldier;
    game.agents.state[id] = AgentState.Marching;
    return id;
  });
  expect(startWar(game, 0, 1)).not.toBeNull();
  // A full-height barrier makes the target unreachable.
  for (let y = 0; y < game.world.size; y += 1) {
    game.world.terrain[y * game.world.size + 20] = Tile.ShallowWater;
  }
  return { game, target, soldiers };
}

describe('soldier route retry throttling', () => {
  it('performs one failed route search per target per tick, then retries next tick', () => {
    const { game, soldiers } = twoSoldierFixture();
    const mocked = vi.mocked(findPath);
    mocked.mockClear();

    runWar(game);
    expect(mocked).toHaveBeenCalledTimes(1);
    for (const id of soldiers) {
      expect(game.agents.x[id]).toBe(id === soldiers[0] ? 10.5 : 11.5);
    }

    game.world.tick += 1;
    runWar(game);
    expect(mocked).toHaveBeenCalledTimes(2);
  });
});
