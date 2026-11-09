import { deepStrictEqual } from 'node:assert/strict';
import { describe, expect, it } from 'vitest';
import {
  MAX_SETTLEMENTS_PER_CIV,
  NEW_SETTLEMENT_COST,
  NEW_SETTLEMENT_MIN_GAP,
  NEW_SETTLEMENT_MIN_POP,
  SETTLEMENT_TIERS,
  settlementTier,
} from '../src/config';
import { assignJobs } from '../src/sim/agents';
import { Game } from '../src/sim/game';
import {
  ensureCivCenter,
  findNewSettlementSite,
  foundNewSettlement,
  nearestCenter,
  runSettlements,
  settlementCap,
  settlementCenters,
  totalBuildingCapacity,
} from '../src/sim/settlements';
import { runWar, startWar } from '../src/sim/war';
import { regionAt } from '../src/world/regions';
import {
  AgentState,
  BuildingType,
  Job,
  NO_BUILDING,
  Tile,
  type Building,
  type Civ,
} from '../src/world/types';

function freshGame(seed = 'ALPHA'): Game {
  return new Game({ size: 256, seedText: seed, startWithFactions: true });
}

function foundSecondSettlement(game: Game, civ: Civ): { site: { x: number; y: number }; center: Building } {
  civ.materials = Math.max(civ.materials, NEW_SETTLEMENT_COST);
  const site = findNewSettlementSite(game, civ);
  expect(site).not.toBeNull();
  const center = foundNewSettlement(game, civ, site!);
  expect(center).not.toBeNull();
  return { site: site!, center: center! };
}

function spawnAdult(
  game: Game,
  civ: Civ,
  x: number,
  y: number,
  home: number,
  job = Job.Idle,
): number {
  const id = game.spawnAgent(civ.id, x, y, { age: 25, gender: 0, home, job });
  expect(id).toBeGreaterThanOrEqual(0);
  return id;
}

function buildingsInSettlement(game: Game, civ: Civ, center: Building, type: BuildingType): Building[] {
  return game.buildings.filter(
    (building) =>
      building.civ === civ.id &&
      building.type === type &&
      nearestCenter(game, civ.id, building.x, building.y)?.id === center.id,
  );
}

function adultIds(game: Game, civ: Civ): number[] {
  const out: number[] = [];
  for (let id = 0; id < game.agents.capacity; id += 1) {
    if (game.agents.alive[id] === 1 && game.agents.civ[id] === civ.id && game.agents.age[id] >= 14) {
      out.push(id);
    }
  }
  return out;
}

/** Adds built houses close to the centre so the settlement can hold residents. */
function addBareCentre(game: Game, civ: Civ): Building {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const spot = game.findBuildingSpot(civ, BuildingType.TownCenter, 2, 8);
    if (!spot) break;
    return game.addBuilding(civ.id, BuildingType.TownCenter, spot.x, spot.y, true);
  }
  throw new Error('could not place a bare town centre');
}

function fillBuildingsTo(game: Game, civ: Civ, target: number, population: number): void {
  civ.population = population;
  while (game.buildings.filter((building) => building.civ === civ.id).length < target) {
    const type = BuildingType.House;
    const spot = game.findBuildingSpot(civ, type, 2);
    expect(spot).not.toBeNull();
    game.addBuilding(civ.id, type, spot!.x, spot!.y, true);
  }
}

describe('settlement founding', () => {
  it('requires materials, a living faction and less than four settlements', () => {
    const game = freshGame();
    const civ = game.civs[0];
    const capital = settlementCenters(game, civ.id)[0];
    expect(capital).toBeDefined();

    civ.materials = NEW_SETTLEMENT_COST - 1;
    expect(foundNewSettlement(game, civ, { x: capital.x + 14, y: capital.y })).toBeNull();
    expect(civ.materials).toBe(NEW_SETTLEMENT_COST - 1);

    civ.materials = NEW_SETTLEMENT_COST;
    civ.alive = false;
    expect(foundNewSettlement(game, civ, { x: capital.x + 14, y: capital.y })).toBeNull();
    civ.alive = true;

    const { site } = foundSecondSettlement(game, civ);
    expect(site).toBeDefined();
    expect(settlementCenters(game, civ.id)).toHaveLength(2);
    expect(civ.materials).toBe(0);

    addBareCentre(game, civ);
    addBareCentre(game, civ);
    expect(settlementCenters(game, civ.id)).toHaveLength(MAX_SETTLEMENTS_PER_CIV);
    civ.materials = NEW_SETTLEMENT_COST * 3;
    expect(foundNewSettlement(game, civ, { x: 1, y: 1 })).toBeNull();
    expect(civ.materials).toBe(NEW_SETTLEMENT_COST * 3);
  });

  it('founds a second town centre on the same walk region within the gap range', () => {
    const game = freshGame();
    const civ = game.civs[0];
    const home = settlementCenters(game, civ.id)[0];
    const homeRegion = regionAt(game.world, game.reachability, home.x, home.y);
    const countBefore = game.buildings.filter((building) => building.civ === civ.id).length;
    const { site, center } = foundSecondSettlement(game, civ);

    expect(regionAt(game.world, game.reachability, site.x, site.y)).toBe(homeRegion);
    expect(center.type).toBe(BuildingType.TownCenter);
    expect(center.built).toBe(true);
    expect(settlementCenters(game, civ.id)).toHaveLength(2);
    for (const existing of settlementCenters(game, civ.id)) {
      if (existing.id === center.id) continue;
      expect(Math.hypot(existing.x - site.x, existing.y - site.y)).toBeGreaterThanOrEqual(
        NEW_SETTLEMENT_MIN_GAP - 0.5,
      );
    }
    const added = game.buildings.filter((building) => building.civ === civ.id).length - countBefore;
    // Town centre, two houses and two farms (some may fail to find a spot).
    expect(added).toBeGreaterThanOrEqual(3);
    expect(buildingsInSettlement(game, civ, center, BuildingType.Farm).length).toBeGreaterThanOrEqual(1);
    expect(buildingsInSettlement(game, civ, center, BuildingType.House).length).toBeGreaterThanOrEqual(1);
  });

  it('runSettlements expands only when population, materials and capacity allow', () => {
    const game = freshGame();
    const civ = game.civs[0];
    game.world.tick = 4;
    civ.materials = NEW_SETTLEMENT_COST * 4;

    // Population below NEW_SETTLEMENT_MIN_POP blocks expansion even at capacity.
    const townSize = 46; // City tier capacity at population 100.
    fillBuildingsTo(game, civ, townSize, 100);
    civ.materials = NEW_SETTLEMENT_COST * 4;
    runSettlements(game);
    expect(settlementCenters(game, civ.id)).toHaveLength(1);

    // Too poor to pay for a new settlement.
    civ.population = NEW_SETTLEMENT_MIN_POP;
    civ.materials = NEW_SETTLEMENT_COST - 1;
    runSettlements(game);
    expect(settlementCenters(game, civ.id)).toHaveLength(1);

    // Enough people and materials: fill the Metropolis capacity and found.
    fillBuildingsTo(game, civ, settlementCap(civ), civ.population);
    civ.materials = NEW_SETTLEMENT_COST * 4;
    const buildingsAtCap = game.buildings.filter((building) => building.civ === civ.id).length;
    expect(buildingsAtCap).toBeGreaterThanOrEqual(totalBuildingCapacity(game, civ));
    runSettlements(game);
    expect(settlementCenters(game, civ.id).length).toBeGreaterThanOrEqual(2);
    expect(civ.materials).toBeLessThan(NEW_SETTLEMENT_COST * 4);
  });
});

describe('local settlement jobs', () => {
  it('keeps new-city residents working locally and commutes into open slots', () => {
    const game = freshGame();
    const civ = game.civs[0];
    const capital = settlementCenters(game, civ.id)[0];
    const { center: newCenter } = foundSecondSettlement(game, civ);
    const newHouses = buildingsInSettlement(game, civ, newCenter, BuildingType.House);
    const newFarms = buildingsInSettlement(game, civ, newCenter, BuildingType.Farm);
    const capitalFarms = buildingsInSettlement(game, civ, capital, BuildingType.Farm);
    expect(newFarms.length).toBeGreaterThanOrEqual(1);
    expect(capitalFarms.length).toBeGreaterThanOrEqual(2);

    // The settlers moved by foundNewSettlement already live in the new city.
    const settlers = adultIds(game, civ).filter((id) => {
      const home = game.buildingById.get(game.agents.home[id]);
      return home !== undefined && nearestCenter(game, civ.id, home.x, home.y)?.id === newCenter.id;
    });
    expect(settlers.length).toBeGreaterThanOrEqual(2);
    // Settle the transplanted residents into local jobs first.
    assignJobs(game);
    for (const id of settlers) {
      expect(game.agents.job[id]).toBe(Job.Farmer);
      const work = game.buildingById.get(game.agents.work[id]);
      expect(work).toBeDefined();
      expect(nearestCenter(game, civ.id, work!.x, work!.y)?.id).toBe(newCenter.id);
    }

    // Extra new-city residents dumped at the capital must relocate locally when
    // local slots exist; otherwise they may commute to an open slot elsewhere.
    const extras: number[] = [];
    const house = newHouses[0];
    for (let i = 0; i < 2; i += 1) {
      extras.push(spawnAdult(game, civ, capital.x, capital.y, house.id, Job.Builder));
    }
    // Capital residents staff the capital's own farms.
    const capitalAdults: number[] = [];
    for (let i = 0; i < 2; i += 1) {
      capitalAdults.push(spawnAdult(game, civ, capital.x, capital.y, capital.id));
    }

    assignJobs(game);

    for (const id of settlers) {
      const toNew = Math.hypot(game.agents.x[id] - newCenter.x, game.agents.y[id] - newCenter.y);
      const toCapital = Math.hypot(game.agents.x[id] - capital.x, game.agents.y[id] - capital.y);
      expect(toNew).toBeLessThan(toCapital);
    }
    for (const id of settlers) {
      expect(game.agents.job[id]).toBe(Job.Farmer);
    }
    // The extra residents are used where slots are open; they are not left
    // idle when a farm elsewhere in the faction has vacancies.
    for (const id of extras) {
      expect(game.agents.job[id]).not.toBe(Job.Idle);
      expect(game.agents.work[id]).not.toBe(NO_BUILDING);
    }
    for (const id of capitalAdults) {
      expect(game.agents.job[id]).toBe(Job.Farmer);
      const work = game.buildingById.get(game.agents.work[id]);
      expect(work).toBeDefined();
      expect(nearestCenter(game, civ.id, work!.x, work!.y)?.id).toBe(capital.id);
    }

    // Worker totals stay correct across both settlements.
    const newFarmWorkers = newFarms.reduce((sum, farm) => sum + farm.workers, 0);
    const capitalFarmWorkers = capitalFarms.reduce((sum, farm) => sum + farm.workers, 0);
    const farmers = adultIds(game, civ).filter((id) => game.agents.job[id] === Job.Farmer);
    expect(newFarmWorkers).toBeGreaterThan(0);
    expect(capitalFarmWorkers).toBeGreaterThan(0);
    expect(newFarmWorkers + capitalFarmWorkers).toBe(farmers.length);
    for (const farm of newFarms) expect(farm.workers).toBeLessThanOrEqual(2);
    for (const farm of capitalFarms) expect(farm.workers).toBeLessThanOrEqual(2);
  });

  it('keeps soldiers a global force posted to a barracks', () => {
    const game = freshGame();
    const civ = game.civs[0];
    const capital = settlementCenters(game, civ.id)[0];
    const { center: newCenter } = foundSecondSettlement(game, civ);
    civ.materials = 100;
    const barracksSpot = game.findBuildingSpot(civ, BuildingType.Barracks, 2);
    expect(barracksSpot).not.toBeNull();
    game.addBuilding(civ.id, BuildingType.Barracks, barracksSpot!.x, barracksSpot!.y, true);
    const newHouse = buildingsInSettlement(game, civ, newCenter, BuildingType.House)[0];
    expect(newHouse).toBeDefined();
    for (let i = 0; i < 6; i += 1) {
      spawnAdult(game, civ, capital.x, capital.y, newHouse.id, Job.Idle);
    }
    assignJobs(game);
    const soldiers = adultIds(game, civ).filter((id) => game.agents.job[id] === Job.Soldier);
    expect(soldiers.length).toBeGreaterThan(0);
    for (const id of soldiers) {
      const work = game.buildingById.get(game.agents.work[id]);
      expect(work?.type).toBe(BuildingType.Barracks);
    }
  });
});

describe('settlement capital loss', () => {
  function warFixture(): {
    game: Game;
    attacker: Civ;
    defender: Civ;
    capital: Building;
    second: Building;
    soldier: number;
  } {
    const game = freshGame();
    for (const building of [...game.buildings]) game.removeBuilding(building);
    for (let id = 0; id < game.agents.capacity; id += 1) {
      if (game.agents.alive[id] === 1) game.removeAgent(id);
    }
    game.world.terrain.fill(Tile.Grass);
    const attacker = game.civs[0];
    const defender = game.civs[1];
    attacker.centerX = 10;
    attacker.centerY = 10;
    const capital = game.addBuilding(defender.id, BuildingType.TownCenter, 20, 10, true);
    const second = game.addBuilding(defender.id, BuildingType.TownCenter, 40, 10, true);
    defender.centerX = capital.x;
    defender.centerY = capital.y;
    const soldier = game.spawnAgent(attacker.id, 18.5, 10.5, { age: 25, gender: 0 });
    expect(soldier).toBeGreaterThanOrEqual(0);
    game.agents.job[soldier] = Job.Soldier;
    game.agents.state[soldier] = AgentState.Idle;
    expect(startWar(game, attacker.id, defender.id)).not.toBeNull();
    return { game, attacker, defender, capital, second, soldier };
  }

  it('recentres the faction on its surviving town centre', () => {
    const game = freshGame();
    const civ = game.civs[0];
    const { center: second } = foundSecondSettlement(game, civ);
    const capital = settlementCenters(game, civ.id)[0];
    expect(capital.id).not.toBe(second.id);

    game.removeBuilding(capital);
    expect(civ.alive).toBe(true);
    ensureCivCenter(game, civ);
    expect(civ.alive).toBe(true);
    expect(civ.centerX).toBe(second.x);
    expect(civ.centerY).toBe(second.y);
    expect(settlementCenters(game, civ.id)).toHaveLength(1);

    // With no town centres left the anchor is simply left untouched.
    const anchorX = civ.centerX;
    const anchorY = civ.centerY;
    game.removeBuilding(second);
    ensureCivCenter(game, civ);
    expect(civ.centerX).toBe(anchorX);
    expect(civ.centerY).toBe(anchorY);
  });

  it('survives the loss of one town centre in war and falls with the last', () => {
    const { game, defender, capital, second, soldier } = warFixture();

    capital.hp = 1;
    runWar(game);
    expect(defender.alive).toBe(true);
    expect(settlementCenters(game, defender.id)).toHaveLength(1);
    expect(defender.centerX).toBe(second.x);
    expect(defender.centerY).toBe(second.y);

    second.hp = 1;
    game.agents.x[soldier] = 38.5;
    game.agents.y[soldier] = 10.5;
    runWar(game);
    expect(defender.alive).toBe(false);
    expect(settlementCenters(game, defender.id)).toHaveLength(0);
    expect(game.wars).toHaveLength(0);
  });
});

describe('save round trip with settlements', () => {
  it('restores and continues a faction with multiple cities', () => {
    const game = freshGame();
    const civ = game.civs[0];
    foundSecondSettlement(game, civ);
    assignJobs(game);
    // Keep derived stats and territory consistent before snapshotting.
    game.updateStats();
    game.refreshOwnership();
    const save = game.toSave(0);
    const clone = Game.fromSave(save);
    deepStrictEqual(clone.toSave(0), save);
    expect(settlementCenters(clone, civ.id)).toHaveLength(settlementCenters(game, civ.id).length);

    for (let i = 0; i < 20; i += 1) {
      game.tick();
      clone.tick();
    }
    deepStrictEqual(clone.toSave(0), game.toSave(0));
    expect(settlementCenters(clone, civ.id).length).toBe(settlementCenters(game, civ.id).length);
  }, 120_000);

  it('restores after losing a capital', () => {
    const game = freshGame();
    const civ = game.civs[0];
    foundSecondSettlement(game, civ);
    const capital = settlementCenters(game, civ.id)[0];
    game.removeBuilding(capital);
    ensureCivCenter(game, civ);
    assignJobs(game);
    game.updateStats();
    game.refreshOwnership();
    const save = game.toSave(0);
    const clone = Game.fromSave(save);
    deepStrictEqual(clone.toSave(0), save);
    expect(clone.civs[civ.id].alive).toBe(true);
    expect(clone.civs[civ.id].centerX).toBe(civ.centerX);
    expect(settlementCenters(clone, civ.id)).toHaveLength(1);

    for (let i = 0; i < 20; i += 1) {
      game.tick();
      clone.tick();
    }
    deepStrictEqual(clone.toSave(0), game.toSave(0));
  }, 120_000);
});

describe('settlement capacity', () => {
  it('combines every town centre into the total building capacity', () => {
    const game = freshGame();
    const civ = game.civs[0];
    expect(totalBuildingCapacity(game, civ)).toBe(settlementCap(civ));
    expect(settlementTier(civ.population)).toBe(0);
    foundSecondSettlement(game, civ);
    expect(totalBuildingCapacity(game, civ)).toBe(settlementCap(civ) * 2);
    expect(totalBuildingCapacity(game, civ)).toBeGreaterThan(SETTLEMENT_TIERS[0].maxBuildings);
  });
});
