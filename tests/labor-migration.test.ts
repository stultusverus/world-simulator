import { describe, expect, it } from 'vitest';
import { BUILDING_DEFS } from '../src/config';
import { assignJobs } from '../src/sim/agents';
import { Game } from '../src/sim/game';
import {
  foundNewSettlement,
  findNewSettlementSite,
  nearestCenter,
  runMigration,
  settlementCenters,
  settlementStats,
} from '../src/sim/settlements';
import { AgentState, BuildingType, Job, NO_BUILDING, type Building, type Civ } from '../src/world/types';

function farmsIn(game: Game, civ: Civ, center: Building): Building[] {
  return game.buildings.filter(
    (building) =>
      building.civ === civ.id &&
      building.built &&
      building.type === BuildingType.Farm &&
      nearestCenter(game, civ.id, building.x, building.y)?.id === center.id,
  );
}

function setupEmptySatellite(seed: string) {
  const game = new Game({ size: 256, seedText: seed, startWithFactions: true });
  const civ = game.civs[0];
  civ.materials = 500;
  const site = findNewSettlementSite(game, civ);
  expect(site).not.toBeNull();
  const satellite = foundNewSettlement(game, civ, site!);
  expect(satellite).not.toBeNull();
  const centers = settlementCenters(game, civ.id);
  const capital = centers.find((center) => center.id !== satellite!.id);
  expect(capital).toBeDefined();

  // Empty the satellite: move its relocated settlers back to the capital.
  for (let id = 0; id < game.agents.capacity; id += 1) {
    if (game.agents.alive[id] !== 1 || game.agents.civ[id] !== civ.id) continue;
    const home = game.buildingById.get(game.agents.home[id]);
    const point = home ?? { x: game.agents.x[id], y: game.agents.y[id] };
    if (nearestCenter(game, civ.id, point.x, point.y)?.id !== satellite!.id) continue;
    game.agents.home[id] = capital!.id;
    game.agents.x[id] = capital!.x + 0.5;
    game.agents.y[id] = capital!.y + 0.5;
    game.agents.job[id] = Job.Idle;
    game.agents.work[id] = NO_BUILDING;
    game.agents.state[id] = AgentState.Idle;
  }
  // Ensure the capital has a clear surplus of idle adults.
  for (let i = 0; i < 12; i += 1) {
    const id = game.spawnAgent(civ.id, capital!.x, capital!.y, {
      age: 22,
      gender: i % 2,
      home: capital!.id,
      job: Job.Idle,
    });
    expect(id).toBeGreaterThanOrEqual(0);
  }
  expect(settlementStats(game, civ.id, satellite!).residents).toBe(0);
  return { game, civ, capital: capital!, satellite: satellite! };
}

describe('settlement labour', () => {
  it('staffs empty satellite farms with idle adults from the capital', () => {
    const { game, civ, satellite } = setupEmptySatellite('LABOR-JOBS');
    const farms = farmsIn(game, civ, satellite);
    expect(farms.length).toBeGreaterThan(0);
    expect(farms.every((farm) => farm.workers === 0)).toBe(true);

    assignJobs(game);

    const workers = BUILDING_DEFS[BuildingType.Farm].workers;
    expect(farms.every((farm) => farm.workers === workers)).toBe(true);
    expect(farms.every((farm) => farm.workers > 0)).toBe(true);
  });

  it('migrates idle adults into a settlement with vacant housing', () => {
    const { game, civ, satellite } = setupEmptySatellite('LABOR-MIGRATE');
    expect(settlementStats(game, civ.id, satellite).residents).toBe(0);
    game.world.tick = 8;
    runMigration(game);

    const stats = settlementStats(game, civ.id, satellite);
    expect(stats.residents).toBeGreaterThanOrEqual(2);
    expect(stats.housing).toBeGreaterThanOrEqual(stats.residents);

    assignJobs(game);
    const workers = BUILDING_DEFS[BuildingType.Farm].workers;
    expect(farmsIn(game, civ, satellite).every((farm) => farm.workers === workers)).toBe(true);
  });
});
