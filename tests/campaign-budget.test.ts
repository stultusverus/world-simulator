import { deepStrictEqual } from 'node:assert/strict';
import { expect, test, vi } from 'vitest';
vi.mock('../src/sim/pathfind', async (original) => {
  const actual = await original<typeof import('../src/sim/pathfind')>();
  return { ...actual, findPath: vi.fn(actual.findPath), findSeaPath: vi.fn(actual.findSeaPath) };
});
import { ROUTE_NODES_PER_TICK, ROUTE_SEARCHES_PER_TICK, MAX_COAST_CANDIDATES } from '../src/config';
import { campaignRoute, campaignTravelTime } from '../src/sim/campaign';
import { Game } from '../src/sim/game';
import { findPath, findSeaPath } from '../src/sim/pathfind';
import { runDiplomacy } from '../src/sim/diplomacy';
import { planNavalCrossing } from '../src/sim/naval';
import { routingWork } from '../src/sim/routing-work';
import { regionAt } from '../src/world/regions';
import { BuildingType, Tile } from '../src/world/types';

test('verifies oblique generated TITAN-PROBE campaigns under the travel horizon', () => {
  const game = new Game({ size: 1024, seedText: 'TITAN-PROBE', startWithFactions: true });
  let verified = 0;
  for (let a = 0; a < 3; a++)
    for (let b = a + 1; b < 3; b++) {
      if (
        regionAt(game.world, game.reachability, game.civs[a].centerX, game.civs[a].centerY) !==
        regionAt(game.world, game.reachability, game.civs[b].centerX, game.civs[b].centerY)
      )
        continue;
      let travel: number | null = null;
      for (let attempt = 0; attempt < 20 && travel === null; attempt++) {
        game.world.tick++;
        travel = campaignTravelTime(game, game.civs[a], game.civs[b]);
      }
      expect(travel).not.toBeNull();
      expect(travel).toBeLessThanOrEqual(120);
      verified++;
    }
  expect(verified).toBeGreaterThan(0);
}, 60000);

test('does not cache a deferred route as failure and resumes it the next tick', () => {
  const game = new Game({ size: 256, seedText: 'DEFERRED', startWithFactions: true });
  game.world.terrain.fill(Tile.Grass);
  game.refreshReachability();
  const work = routingWork(game);
  work.remaining = 0;
  expect(campaignRoute(game, 10, 10, 100, 40, 0)).toBeNull();
  expect(work.exhausted).toBe(true);
  game.world.tick++;
  expect(campaignRoute(game, 10, 10, 100, 40, 0)).toHaveLength(90);
});

test('persists candidate cursors and retries across a cold save/load continuation', () => {
  const game = new Game({ size: 256, seedText: 'PROFILE', startWithFactions: true });
  const work = routingWork(game);
  work.remaining = 0;
  campaignTravelTime(game, game.civs[0], game.civs[1]);
  // Fill the finite query allowance so the next candidate is explicitly deferred.
  for (let n = 0; n < 8; n++)
    campaignRoute(
      game,
      game.civs[0].centerX,
      game.civs[0].centerY,
      game.civs[1].centerX,
      game.civs[1].centerY,
      0,
    );
  const clone = Game.fromSave(game.toSave(0));
  for (let n = 0; n < 120; n++) {
    game.tick();
    clone.tick();
  }
  deepStrictEqual(clone.toSave(0), game.toSave(0));
});

test('bounds shared land and sea work across all PROFILE diplomacy and movement in a tick', () => {
  const game = new Game({ size: 1024, seedText: 'PROFILE', startWithFactions: true });
  for (let n = 0; n < 600; n++) {
    game.tick();
    const work = routingWork(game);
    expect(work.expanded).toBeLessThanOrEqual(ROUTE_NODES_PER_TICK);
    expect(work.searches).toBeLessThanOrEqual(ROUTE_SEARCHES_PER_TICK);
  }
}, 120000);

test('rotates eligible pairs when one preflight consumes the entire work allowance', () => {
  const game = new Game({ size: 256, seedText: 'PAIR-FAIRNESS', startWithFactions: true });
  game.world.terrain.fill(Tile.Grass);
  for (const b of [...game.buildings]) game.removeBuilding(b);
  for (const civ of game.civs) {
    civ.population = 8;
    civ.soldiers = 1;
    civ.food = 10;
    civ.cooldownUntil = 0;
    game.addBuilding(civ.id, BuildingType.TownCenter, civ.centerX, civ.centerY, true);
    game.addBuilding(civ.id, BuildingType.Barracks, civ.centerX + 1, civ.centerY, true);
  }
  game.relations.fill(-90);
  game.refreshReachability();
  vi.spyOn(game.rng, 'chance').mockReturnValue(false);
  const blocked: typeof findPath = (_world, _sx, _sy, _tx, _ty, _maxNodes, _uniform, budget) => {
    budget!.expanded += budget!.remaining;
    budget!.remaining = 0;
    budget!.exhausted = true;
    return null;
  };
  const search = vi.mocked(findPath);
  search.mockClear();
  for (let n = 0; n < 3; n++) search.mockImplementationOnce(blocked);
  for (let year = 60; year < 63; year++) {
    game.world.tick = year;
    runDiplomacy(game);
  }
  expect(search).toHaveBeenCalledTimes(3);
  expect(game.campaignVerifications).toHaveLength(3);
  expect(game.campaignVerifications.every((check) => check.nextCandidate > 0)).toBe(true);
});

test('does not multiply failed sea plans across centres and new target buildings', () => {
  const game = new Game({ size: 256, seedText: 'SEA-BUDGET', startWithFactions: true });
  game.world.terrain.fill(Tile.DeepWater);
  for (let y = 30; y < 90; y++)
    for (let x = 20; x < 90; x++) game.world.terrain[y * 256 + x] = Tile.Grass;
  for (let y = 30; y < 90; y++)
    for (let x = 150; x < 230; x++) game.world.terrain[y * 256 + x] = Tile.Grass;
  for (const b of [...game.buildings]) game.removeBuilding(b);
  game.civs[0].centerX = 40;
  game.civs[0].centerY = 60;
  game.civs[1].centerX = 180;
  game.civs[1].centerY = 60;
  for (const [civ, x] of [
    [0, 40],
    [1, 180],
  ])
    for (let n = 0; n < 4; n++)
      game.addBuilding(civ, BuildingType.TownCenter, x, 45 + n * 10, true);
  for (let n = 0; n < 12; n++) game.addBuilding(1, BuildingType.Farm, 190 + n, 60, true);
  game.refreshReachability();
  const sea = vi.mocked(findSeaPath);
  sea.mockClear();
  sea.mockReturnValue(null);
  for (let n = 0; n < 8; n++) campaignTravelTime(game, game.civs[0], game.civs[1]);
  expect(sea.mock.calls.length).toBeLessThanOrEqual(ROUTE_SEARCHES_PER_TICK);
  expect(routingWork(game).searches).toBeLessThanOrEqual(ROUTE_SEARCHES_PER_TICK);
  expect(sea.mock.calls.length).toBeLessThan(MAX_COAST_CANDIDATES ** 2);
  const target = game.buildings.find((b) => b.civ === 1 && b.type === BuildingType.Farm)!;
  game.navalProbeCursors.clear();
  game.world.tick++;
  sea.mockClear();
  planNavalCrossing(game, target, 0);
  const firstBatch = sea.mock.calls.map((call) => call.slice(1, 5).join(':'));
  expect(firstBatch).toHaveLength(ROUTE_SEARCHES_PER_TICK);
  game.updateStats();
  const clone = Game.fromSave(game.toSave(0));
  game.world.tick++;
  clone.world.tick++;
  sea.mockClear();
  planNavalCrossing(game, target, 0);
  const nextBatch = sea.mock.calls.map((call) => call.slice(1, 5).join(':'));
  expect(nextBatch).toHaveLength(ROUTE_SEARCHES_PER_TICK);
  expect(nextBatch.every((pair) => !firstBatch.includes(pair))).toBe(true);
  sea.mockClear();
  planNavalCrossing(clone, clone.buildingById.get(target.id)!, 0);
  expect(sea.mock.calls.map((call) => call.slice(1, 5).join(':'))).toEqual(nextBatch);
  deepStrictEqual(clone.toSave(0), game.toSave(0));
});
