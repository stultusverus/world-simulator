import { deepStrictEqual } from 'node:assert/strict';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/sim/pathfind', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/sim/pathfind')>();
  return { ...actual, findSeaPath: vi.fn(actual.findSeaPath) };
});

import { MAX_COAST_CANDIDATES, MAX_FACTIONS, NAVAL_WAR_TICKS } from '../src/config';
import { runDiplomacy } from '../src/sim/diplomacy';
import { foundFaction } from '../src/sim/faction';
import { Game } from '../src/sim/game';
import { canReachCivs } from '../src/sim/naval';
import { findSeaPath } from '../src/sim/pathfind';
import { settlementCenters } from '../src/sim/settlements';
import { runWar, startWar } from '../src/sim/war';
import {
  AgentState,
  BuildingType,
  Job,
  Tile,
  isWater,
  type Building,
  type Civ,
  type World,
} from '../src/world/types';

function clearGame(game: Game): void {
  for (const building of [...game.buildings]) game.removeBuilding(building);
  for (let id = 0; id < game.agents.capacity; id += 1) {
    if (game.agents.alive[id]) game.removeAgent(id);
  }
}

function fillRect(world: World, x0: number, y0: number, x1: number, y1: number, tile: Tile): void {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) world.terrain[y * world.size + x] = tile;
  }
}

function foundCapital(game: Game, x: number, y: number): Civ {
  const civ = foundFaction(game, x, y, { initial: true, silent: true });
  expect(civ).not.toBeNull();
  return civ as Civ;
}

/** Leaves only the civ's town centre standing and returns it. */
function keepOnlyCapital(game: Game, civ: Civ): Building {
  const centers = settlementCenters(game, civ.id);
  expect(centers.length).toBeGreaterThan(0);
  const center = centers[0];
  for (const building of [...game.buildings]) {
    if (building.civ === civ.id && building.id !== center.id) game.removeBuilding(building);
  }
  return center;
}

function agentOnWater(game: Game, id: number): boolean {
  const x = Math.floor(game.agents.x[id]);
  const y = Math.floor(game.agents.y[id]);
  return isWater(game.world.terrain[y * game.world.size + x]);
}

interface NavalSetup {
  game: Game;
  attacker: Civ;
  defender: Civ;
  target: Building;
  soldier: number;
}

/** Two factions on separate islands at war; one soldier marches on the enemy. */
function navalSetup(game: Game, attacker: Civ, defender: Civ): NavalSetup {
  const target = keepOnlyCapital(game, defender);
  for (let id = 0; id < game.agents.capacity; id += 1) {
    if (game.agents.alive[id]) game.removeAgent(id);
  }
  const soldier = game.spawnAgent(attacker.id, attacker.centerX + 0.5, attacker.centerY + 0.5, {
    age: 25,
    gender: 0,
  });
  expect(soldier).toBeGreaterThanOrEqual(0);
  game.agents.job[soldier] = Job.Soldier;
  game.agents.state[soldier] = AgentState.Marching;
  expect(startWar(game, attacker.id, defender.id)).not.toBeNull();
  // Keep save snapshots consistent with the stripped-down fixture.
  game.updateStats();
  game.refreshOwnership();
  return { game, attacker, defender, target, soldier };
}

/** Open ocean with two grass islands that share the same sea. */
function openSeaSetup(seed: string): NavalSetup {
  const game = new Game({ size: 256, seedText: seed, startWithFactions: false });
  clearGame(game);
  game.world.terrain.fill(Tile.DeepWater);
  fillRect(game.world, 32, 32, 88, 88, Tile.Grass);
  fillRect(game.world, 132, 32, 188, 88, Tile.Grass);
  game.refreshReachability();
  const attacker = foundCapital(game, 60, 60);
  const defender = foundCapital(game, 160, 60);
  return navalSetup(game, attacker, defender);
}

/** Two islands separated by a single water tile, surrounded by mountains. */
function straitSetup(seed: string): NavalSetup {
  const game = new Game({ size: 256, seedText: seed, startWithFactions: false });
  clearGame(game);
  game.world.terrain.fill(Tile.Mountain);
  fillRect(game.world, 30, 50, 60, 110, Tile.Grass);
  fillRect(game.world, 62, 50, 92, 110, Tile.Grass);
  fillRect(game.world, 61, 40, 61, 120, Tile.DeepWater);
  game.refreshReachability();
  const attacker = foundCapital(game, 45, 80);
  const defender = foundCapital(game, 77, 80);
  return navalSetup(game, attacker, defender);
}

interface GateSetup {
  game: Game;
  a: Civ;
  b: Civ;
}

/**
 * Two grass islands with a one-tile mountain gap between them: the land regions
 * are disconnected and there is no water, so no army can cross either way.
 */
function mountainGapSetup(seed: string): GateSetup {
  const game = new Game({ size: 256, seedText: seed, startWithFactions: false });
  clearGame(game);
  game.world.terrain.fill(Tile.Mountain);
  fillRect(game.world, 20, 60, 90, 140, Tile.Grass);
  fillRect(game.world, 92, 60, 162, 140, Tile.Grass);
  game.refreshReachability();
  const a = foundCapital(game, 50, 100);
  const b = foundCapital(game, 130, 100);
  return { game, a, b };
}

function forceRelation(game: Game, a: Civ, b: Civ, value: number): void {
  game.relations[a.id * MAX_FACTIONS + b.id] = value;
  game.relations[b.id * MAX_FACTIONS + a.id] = value;
}

function makeWarReady(game: Game, civs: readonly Civ[], sites: ReadonlyArray<readonly [number, number]>): void {
  game.world.tick = 20;
  for (let i = 0; i < civs.length; i += 1) {
    const civ = civs[i];
    const site = sites[i];
    civ.population = 20;
    civ.soldiers = 2;
    civ.food = 30;
    civ.cooldownUntil = 0;
    game.addBuilding(civ.id, BuildingType.Barracks, site[0], site[1], true);
  }
}

describe('naval reachability gate', () => {
  it('blocks war declarations across disconnected land regions without a shared sea', () => {
    const { game, a, b } = mountainGapSetup('NAVAL_GATE');
    expect(canReachCivs(game, a, b)).toBe(false);

    // A single one-tile strait makes the two coasts mutually reachable by sea.
    game.world.terrain[100 * game.world.size + 91] = Tile.ShallowWater;
    game.refreshReachability();
    expect(canReachCivs(game, a, b)).toBe(true);

    // Removing the only town centre of a faction keeps the gate permissive.
    keepOnlyCapital(game, b);
    for (const building of [...game.buildings]) {
      if (building.civ === b.id) game.removeBuilding(building);
    }
    expect(canReachCivs(game, a, b)).toBe(true);
  });

  it('does not declare an AI war when no army could reach the enemy', () => {
    const { game, a, b } = mountainGapSetup('NAVAL_DIPLO');
    makeWarReady(game, [a, b], [[40, 80], [120, 80]]);
    for (let i = 0; i < 600 && game.wars.length === 0; i += 1) {
      forceRelation(game, a, b, -100);
      runDiplomacy(game);
    }
    expect(game.wars.length).toBe(0);

    // Opening the strait clears the gate, so the same hostile setup now boils over.
    game.world.terrain[100 * game.world.size + 91] = Tile.ShallowWater;
    game.refreshReachability();
    expect(canReachCivs(game, a, b)).toBe(true);
    for (let i = 0; i < 600 && game.wars.length === 0; i += 1) {
      forceRelation(game, a, b, -100);
      runDiplomacy(game);
    }
    expect(game.wars.length).toBe(1);
  });
});

describe('naval crossings', () => {
  it('ferries soldiers across open sea, lands, and besieges the enemy centre', () => {
    const { game, target, soldier } = openSeaSetup('NAVAL_FERRY');
    let sailed = false;
    for (let tick = 0; tick < 40; tick += 1) {
      runWar(game);
      if (agentOnWater(game, soldier)) sailed = true;
    }
    expect(sailed).toBe(true);
    expect(target.hp).toBeLessThan(target.maxHp);
    const distance = Math.hypot(game.agents.x[soldier] - (target.x + 0.5), game.agents.y[soldier] - (target.y + 0.5));
    expect(distance).toBeLessThanOrEqual(2.6);
    expect([...game.navalPlans.values()].some((plan) => plan !== null)).toBe(true);
  });

  it('crosses a one-tile strait with an empty sea leg', () => {
    const { game, target } = straitSetup('NAVAL_STRAIT');
    for (let tick = 0; tick < 10; tick += 1) runWar(game);
    expect(target.hp).toBeLessThan(target.maxHp);
    const plans = [...game.navalPlans.values()].filter((plan) => plan !== null);
    expect(
      plans.some(
        (plan) =>
          plan !== null &&
          plan.seaPath.length === 0 &&
          plan.departureWater.x === plan.landingWater.x &&
          plan.departureWater.y === plan.landingWater.y,
      ),
    ).toBe(true);
  });

  it('gives cross-water wars the longer naval duration', () => {
    const { game, defender } = openSeaSetup('NAVAL_PEACE');
    const defenderSoldier = game.spawnAgent(defender.id, defender.centerX + 1.5, defender.centerY + 0.5, {
      age: 25,
      gender: 0,
    });
    game.agents.job[defenderSoldier] = Job.Soldier;
    game.agents.state[defenderSoldier] = AgentState.Marching;
    const war = game.wars[0];
    expect(war).toBeDefined();

    // Past the standard 60-tick limit: a crossing campaign is still running.
    game.world.tick = war.startTick + 61;
    runWar(game);
    expect(game.wars.length).toBe(1);

    game.world.tick = war.startTick + NAVAL_WAR_TICKS + 1;
    runWar(game);
    expect(game.wars.length).toBe(0);
  });

  it('ferries veterans home after a cross-water war ends', () => {
    const { game, soldier } = openSeaSetup('NAVAL_VETERANS');
    // March and sail until the soldier has landed on the enemy island.
    for (let tick = 0; tick < 60; tick += 1) {
      if (game.agents.state[soldier] === AgentState.Fighting) break;
      runWar(game);
    }
    expect(game.agents.state[soldier]).toBe(AgentState.Fighting);
    expect(agentOnWater(game, soldier)).toBe(false);

    const war = game.wars[0];
    game.world.tick = war.startTick + NAVAL_WAR_TICKS + 1;
    runWar(game);
    expect(game.wars.length).toBe(0);
    expect(game.agents.state[soldier]).toBe(AgentState.Returning);

    // The veteran sails back across the sea and musters out at his home centre.
    for (let tick = 0; tick < 120 && game.agents.state[soldier] === AgentState.Returning; tick += 1) {
      runWar(game);
    }
    expect(game.agents.state[soldier]).toBe(AgentState.Idle);
    const home = settlementCenters(game, game.agents.civ[soldier])[0];
    expect(Math.hypot(game.agents.x[soldier] - (home.x + 0.5), game.agents.y[soldier] - (home.y + 0.5))).toBeLessThanOrEqual(2);
  });

  it('recomputed routes sail on to the landing when a sea path is lost', () => {
    const { game, soldier, target } = openSeaSetup('NAVAL_MIDSEA');
    for (let tick = 0; tick < 30 && !agentOnWater(game, soldier); tick += 1) runWar(game);
    expect(agentOnWater(game, soldier)).toBe(true);
    // A lost route in open water is rebuilt from the soldier's current sea.
    game.soldierPaths.delete(soldier);
    runWar(game);
    expect(game.soldierPaths.get(soldier)).toBeDefined();
    for (let tick = 0; tick < 60 && target.hp === target.maxHp; tick += 1) runWar(game);
    expect(target.hp).toBeLessThan(target.maxHp);
  });

  it('saves and loads deterministically mid-voyage', () => {
    const { game, soldier } = openSeaSetup('NAVAL_SAVE');
    for (let tick = 0; tick < 30 && !agentOnWater(game, soldier); tick += 1) runWar(game);
    expect(agentOnWater(game, soldier)).toBe(true);

    const clone = Game.fromSave(game.toSave(0));
    for (let tick = 0; tick < 25; tick += 1) {
      runWar(game);
      runWar(clone);
    }
    deepStrictEqual(clone.toSave(0), game.toSave(0));
  });
});

describe('sea pathfinding', () => {
  it('finds long open-water routes within the node budget', () => {
    const game = new Game({ size: 256, seedText: 'NAVAL_SEA', startWithFactions: false });
    game.world.terrain.fill(Tile.DeepWater);
    game.refreshReachability();
    const path = findSeaPath(game.world, 10, 10, 80, 240);
    expect(path).not.toBeNull();
    expect(path?.length).toBeGreaterThan(0);
    let previous = { x: 10, y: 10 };
    for (const point of path ?? []) {
      expect(isWater(game.world.terrain[point.y * game.world.size + point.x])).toBe(true);
      expect(Math.max(Math.abs(point.x - previous.x), Math.abs(point.y - previous.y))).toBe(1);
      previous = point;
    }
    // The explicit node budget is honoured.
    expect(findSeaPath(game.world, 10, 10, 80, 240, 10)).toBeNull();
  });
});

describe('bounded sea search', () => {
  it('searches a bounded number of times per target and shares the failed plan', () => {
    const { game, attacker } = openSeaSetup('NAVAL_BOUNDED');
    const second = game.spawnAgent(attacker.id, attacker.centerX + 1.5, attacker.centerY + 0.5, {
      age: 25,
      gender: 0,
    });
    game.agents.job[second] = Job.Soldier;
    game.agents.state[second] = AgentState.Marching;

    const mocked = vi.mocked(findSeaPath);
    mocked.mockClear();
    mocked.mockReturnValue(null);
    // Declaration now verifies and warms the route cache. Invalidate that
    // successful plan before exercising failure sharing during the campaign.
    game.refreshReachability();
    const maxPerPlan = MAX_COAST_CANDIDATES * MAX_COAST_CANDIDATES;

    runWar(game);
    const firstTickSearches = mocked.mock.calls.length;
    expect(firstTickSearches).toBeGreaterThan(0);
    expect(firstTickSearches).toBeLessThanOrEqual(maxPerPlan);

    // The failed plan is cached and the retry throttle stops the second soldier.
    runWar(game);
    expect(mocked.mock.calls.length).toBe(firstTickSearches);

    game.world.tick += 1;
    runWar(game);
    expect(mocked.mock.calls.length).toBe(firstTickSearches);
  });
});
