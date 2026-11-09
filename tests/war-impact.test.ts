import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { runWar, startWar } from '../src/sim/war';
import { AgentState, BuildingType, Job, Tile } from '../src/world/types';

describe('war impact', () => {
  it('nearby armies intercept and fight instead of ignoring each other', () => {
    const game = new Game({ size: 256, seedText: 'BATTLE', startWithFactions: true });
    for (const building of [...game.buildings]) game.removeBuilding(building);
    for (let id = 0; id < game.agents.capacity; id += 1) {
      if (game.agents.alive[id]) game.removeAgent(id);
    }
    game.world.terrain.fill(Tile.Grass);
    game.refreshReachability();

    const a = game.civs[0];
    const b = game.civs[1];
    // a's target is east, b's target is west: without interception the two
    // armies would march away from each other.
    game.addBuilding(a.id, BuildingType.TownCenter, 5, 20, true);
    game.addBuilding(b.id, BuildingType.TownCenter, 40, 20, true);
    const spawnSoldiers = (civId: number, startX: number): void => {
      for (let i = 0; i < 4; i += 1) {
        const id = game.spawnAgent(civId, startX + i, 10.5, { age: 25, gender: i % 2 });
        expect(id).toBeGreaterThanOrEqual(0);
        game.agents.job[id] = Job.Soldier;
        game.agents.state[id] = AgentState.Marching;
      }
    };
    spawnSoldiers(a.id, 22);
    spawnSoldiers(b.id, 18);

    expect(startWar(game, a.id, b.id)).not.toBeNull();
    for (let tick = 0; tick < 40; tick += 1) {
      game.world.tick += 1;
      runWar(game);
    }
    expect(a.casualties + b.casualties).toBeGreaterThan(0);
  });
});
