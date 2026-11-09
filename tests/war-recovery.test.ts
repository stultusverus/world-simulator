import { describe, expect, it } from 'vitest';
import { POST_WAR_RELIEF_FOOD, POST_WAR_RELIEF_MATERIALS, WAR_COOLDOWN_TICKS } from '../src/config';
import { Game } from '../src/sim/game';
import { endWar, runWar, startWar } from '../src/sim/war';
import { AgentState, BuildingType, Job, Tile } from '../src/world/types';

function emptyGrassGame(seed: string): Game {
  const game = new Game({ size: 256, seedText: seed, startWithFactions: true });
  for (const building of [...game.buildings]) game.removeBuilding(building);
  for (let id = 0; id < game.agents.capacity; id += 1) {
    if (game.agents.alive[id]) game.removeAgent(id);
  }
  game.world.terrain.fill(Tile.Grass);
  game.refreshReachability();
  return game;
}

describe('war recovery', () => {
  it('ends a war without contact as a stalemate', () => {
    const game = emptyGrassGame('STALEMATE');
    const a = game.civs[0];
    const b = game.civs[1];
    a.centerX = 5;
    a.centerY = 5;
    b.centerX = 40;
    b.centerY = 40;
    game.addBuilding(a.id, BuildingType.TownCenter, 5, 5, true);
    game.addBuilding(b.id, BuildingType.TownCenter, 40, 40, true);
    expect(startWar(game, a.id, b.id)).not.toBeNull();
    for (let tick = 0; tick < 45; tick += 1) {
      game.world.tick += 1;
      runWar(game);
    }
    expect(game.wars).toHaveLength(0);
    expect(game.chronicle.entries.some((entry) => entry.text.includes('without a battle'))).toBe(true);
  });

  it('targets military and economy buildings before houses', () => {
    const game = emptyGrassGame('SPARE-HOUSES');
    const a = game.civs[0];
    const b = game.civs[1];
    a.centerX = 5;
    a.centerY = 10;
    b.centerX = 20;
    b.centerY = 10;
    game.addBuilding(a.id, BuildingType.TownCenter, 5, 10, true);
    game.addBuilding(b.id, BuildingType.TownCenter, 20, 10, true);
    const house = game.addBuilding(b.id, BuildingType.House, 12, 10, true);
    const workshop = game.addBuilding(b.id, BuildingType.Workshop, 17, 10, true);
    const soldier = game.spawnAgent(a.id, 10.5, 10.5, { age: 25, gender: 0 });
    game.agents.job[soldier] = Job.Soldier;
    game.agents.state[soldier] = AgentState.Marching;
    expect(startWar(game, a.id, b.id)).not.toBeNull();
    for (let tick = 0; tick < 20; tick += 1) {
      game.world.tick += 1;
      runWar(game);
    }
    expect(house.hp).toBe(house.maxHp);
    expect(workshop.hp).toBeLessThan(workshop.maxHp);
  });

  it('pays relief and a longer cooldown after peace', () => {
    const game = emptyGrassGame('RELIEF');
    const a = game.civs[0];
    const b = game.civs[1];
    a.centerX = 5;
    a.centerY = 5;
    b.centerX = 20;
    b.centerY = 5;
    game.addBuilding(a.id, BuildingType.TownCenter, 5, 5, true);
    game.addBuilding(b.id, BuildingType.TownCenter, 20, 5, true);
    a.materials = 0;
    b.materials = 0;
    a.food = 0;
    b.food = 0;
    const war = startWar(game, a.id, b.id);
    expect(war).not.toBeNull();
    game.world.tick = 10;
    endWar(game, war!, 'peace');
    expect(a.materials).toBeGreaterThanOrEqual(POST_WAR_RELIEF_MATERIALS);
    expect(b.materials).toBeGreaterThanOrEqual(POST_WAR_RELIEF_MATERIALS);
    expect(a.food).toBeGreaterThanOrEqual(POST_WAR_RELIEF_FOOD);
    expect(b.food).toBeGreaterThanOrEqual(POST_WAR_RELIEF_FOOD);
    expect(a.cooldownUntil).toBe(10 + WAR_COOLDOWN_TICKS);
    expect(b.cooldownUntil).toBe(10 + WAR_COOLDOWN_TICKS);
  });
});
