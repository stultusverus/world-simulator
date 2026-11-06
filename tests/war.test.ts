import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { runWar, startWar } from '../src/sim/war';
import { AgentState, BuildingType, Job, Tile } from '../src/world/types';

function movementFixture(returning = false) {
  const game = new Game({ size: 256, seedText: 'ALPHA', startWithFactions: true });
  for (const building of [...game.buildings]) game.removeBuilding(building);
  for (let id = 0; id < game.agents.capacity; id += 1) {
    if (game.agents.alive[id]) game.removeAgent(id);
  }
  game.world.terrain.fill(Tile.Grass);
  const target = game.addBuilding(returning ? 0 : 1, BuildingType.TownCenter, 30, 10, true);
  const id = game.spawnAgent(0, 10.5, 10.5, { age: 25, gender: 0 });
  game.agents.job[id] = Job.Soldier;
  game.agents.state[id] = returning ? AgentState.Returning : AgentState.Marching;
  if (!returning) expect(startWar(game, 0, 1)).not.toBeNull();
  return { game, id, target };
}

describe('soldier movement', () => {
  it.each([false, true])('uses containing endpoint tiles (returning: %s)', (returning) => {
    const { game, id, target } = movementFixture(returning);
    // Rounding either centre selects an impassable tile.
    game.world.terrain[11 * game.world.size + 11] = Tile.DeepWater;
    game.world.terrain[11 * game.world.size + 31] = Tile.DeepWater;
    runWar(game);
    expect(game.agents.x[id]).toBeGreaterThan(10.5);
    expect(game.soldierPaths.get(id)?.path.at(-1)).toEqual({ x: target.x, y: target.y });
    for (let tick = 0; tick < 4; tick += 1) runWar(game);
    expect(Math.hypot(game.agents.x[id] - 30.5, game.agents.y[id] - 10.5)).toBeLessThanOrEqual(2.6);
    if (returning) expect(game.agents.state[id]).toBe(AgentState.Idle);
    else expect(target.hp).toBeLessThan(target.maxHp);
  });

  it('retries the same target after an unsuccessful route becomes reachable', () => {
    const { game, id, target } = movementFixture();
    // A full-height barrier makes the target unreachable.
    for (let y = 0; y < game.world.size; y += 1) {
      game.world.terrain[y * game.world.size + 20] = Tile.DeepWater;
    }
    runWar(game);
    expect(game.agents.x[id]).toBe(10.5);
    expect(game.agents.y[id]).toBe(10.5);
    game.world.terrain[10 * game.world.size + 20] = Tile.Grass;
    game.world.tick += 1;
    runWar(game);
    expect(game.agents.x[id]).toBeGreaterThan(10.5);
    expect(game.soldierPaths.get(id)?.targetKey).toBe(target.id);
  });

  it('retries empty routes restored from older saves', () => {
    const { game, id, target } = movementFixture();
    game.soldierPaths.set(id, { path: [], index: 0, targetKey: target.id });
    const restored = Game.fromSave(game.toSave());
    runWar(restored);
    expect(restored.agents.x[id]).toBeGreaterThan(10.5);
  });
});
