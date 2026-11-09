import { describe, expect, it } from 'vitest';
import {
  BUILDING_DEFS,
  FESTIVAL_INTERVAL,
  WEALTH_UPKEEP_PER_PERSON,
  LABORER_MATERIALS,
} from '../src/config';
import { assignJobs, countCivJobs } from '../src/sim/agents';
import { runEconomy } from '../src/sim/economy';
import { Game } from '../src/sim/game';
import { settlementCenters, settlementStats } from '../src/sim/settlements';
import { BuildingType, Job } from '../src/world/types';

function freshGame(seed = 'LATE'): Game {
  return new Game({ size: 256, seedText: seed, startWithFactions: true });
}

function spawnAdults(game: Game, civId: number, count: number, home: number): void {
  const civ = game.civs[civId];
  for (let i = 0; i < count; i += 1) {
    const id = game.spawnAgent(civId, civ.centerX, civ.centerY, {
      age: 25,
      gender: i % 2,
      home,
    });
    expect(id).toBeGreaterThanOrEqual(0);
  }
}

describe('laborers', () => {
  it('turns surplus adults into laborers and leaves children idle', () => {
    const game = freshGame();
    const civ = game.civs[0];
    const center = settlementCenters(game, civ.id)[0];
    expect(center).toBeDefined();
    spawnAdults(game, civ.id, 20, center.id);
    assignJobs(game);

    let adults = 0;
    let laborers = 0;
    let children = 0;
    for (let id = 0; id < game.agents.capacity; id += 1) {
      if (game.agents.alive[id] === 0 || game.agents.civ[id] !== civ.id) continue;
      if (game.agents.age[id] < 14) {
        children += 1;
        expect(game.agents.job[id]).toBe(Job.Idle);
        continue;
      }
      adults += 1;
      expect(game.agents.job[id]).not.toBe(Job.Idle);
      if (game.agents.job[id] === Job.Laborer) laborers += 1;
    }
    expect(children).toBeGreaterThan(0);
    expect(laborers).toBeGreaterThan(0);
    expect(countCivJobs(game, civ.id).labourers).toBe(laborers);
    expect(countCivJobs(game, civ.id).children).toBe(children);

    const stats = settlementStats(game, civ.id, center);
    expect(stats.labourers).toBeGreaterThan(0);
    expect(stats.idleAdults).toBe(0);
    expect(stats.residents).toBe(adults + children);
  });

  it('feeds laborer output and household upkeep into the economy', () => {
    const game = freshGame('LABOUR-ECON');
    const civ = game.civs[0];
    const center = settlementCenters(game, civ.id)[0];
    spawnAdults(game, civ.id, 20, center.id);
    assignJobs(game);
    const laborers = countCivJobs(game, civ.id).labourers;
    expect(laborers).toBeGreaterThan(0);

    civ.materials = 0;
    civ.wealth = 0;
    runEconomy(game);

    const built = game.buildings.filter(
      (building) => building.civ === civ.id && building.built,
    ).length;
    // Materials come from the base gathering rate and labor, minus building upkeep.
    expect(civ.materials).toBeGreaterThanOrEqual(laborers * LABORER_MATERIALS - built * 0.02);
    expect(civ.wealth).toBeGreaterThanOrEqual(0);
    // Household upkeep must be a real drain, not a rounding detail.
    expect(laborers * 0.01 + WEALTH_UPKEEP_PER_PERSON * civ.population).toBeGreaterThan(0.1);
  });
});

describe('civic buildings', () => {
  it('staffs markets, universities and monuments with artisans', () => {
    const game = freshGame('CIVIC');
    const civ = game.civs[0];
    const center = settlementCenters(game, civ.id)[0];
    const types = [BuildingType.Market, BuildingType.University, BuildingType.Monument];
    const buildings = types.map((type) => {
      const spot = game.findBuildingSpot(civ, type, 2);
      expect(spot).not.toBeNull();
      return game.addBuilding(civ.id, type, spot!.x, spot!.y, true);
    });
    spawnAdults(game, civ.id, 30, center.id);
    assignJobs(game);

    for (const building of buildings) {
      const def = BUILDING_DEFS[building.type];
      expect(def.workers).toBeGreaterThan(0);
      expect(building.workers).toBe(def.workers);
    }
    const workforce = countCivJobs(game, civ.id);
    expect(workforce.workers).toBeGreaterThanOrEqual(
      buildings.reduce((sum, building) => sum + BUILDING_DEFS[building.type].workers, 0),
    );
  });
});

describe('late-game economy', () => {
  it('holds a festival only on its cadence and only when prosperous', () => {
    const game = freshGame('FESTIVAL');
    const civ = game.civs[0];
    civ.population = 100;
    civ.food = 500;
    civ.wealth = 500;
    game.world.tick = FESTIVAL_INTERVAL;
    runEconomy(game);
    expect(
      game.chronicle.entries.filter((entry) => entry.text.includes('grand festival')),
    ).toHaveLength(1);

    game.world.tick = FESTIVAL_INTERVAL + 1;
    runEconomy(game);
    expect(
      game.chronicle.entries.filter((entry) => entry.text.includes('grand festival')),
    ).toHaveLength(1);

    game.world.tick = FESTIVAL_INTERVAL * 2;
    civ.food = 0;
    civ.wealth = 500;
    runEconomy(game);
    expect(
      game.chronicle.entries.filter((entry) => entry.text.includes('grand festival')),
    ).toHaveLength(1);
  });
});
