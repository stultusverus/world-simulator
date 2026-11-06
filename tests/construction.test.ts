import { describe, expect, it } from 'vitest';
import { BUILDING_DEFS } from '../src/config';
import { assignJobs } from '../src/sim/agents';
import { runEconomy } from '../src/sim/economy';
import { Game } from '../src/sim/game';
import { AgentState, BuildingType, Job } from '../src/world/types';

function constructionFixture() {
  const game = new Game({ size: 256, seedText: 'ALPHA', startWithFactions: true });
  const civ = game.civs[0];
  const spot = game.findBuildingSpot(civ, BuildingType.Workshop, 2);
  expect(spot).not.toBeNull();
  const site = game.addBuilding(civ.id, BuildingType.Workshop, spot!.x, spot!.y, false);
  const adults = Array.from({ length: game.agents.capacity }, (_, id) => id)
    .filter(id => game.agents.alive[id] === 1 && game.agents.civ[id] === civ.id && game.agents.age[id] >= 14);
  const farms = game.buildings.filter(b => b.civ === civ.id && b.type === BuildingType.Farm && b.built);
  // Prevent new construction spending after this site completes.
  civ.materials = 0;
  return { game, civ, site, adults, farms };
}

describe('construction labour', () => {
  it('completes construction with four adults and two farms, then reallocates the builder', () => {
    const { game, civ, site, adults, farms } = constructionFixture();
    expect(adults).toHaveLength(4);
    expect(farms).toHaveLength(2);
    civ.traits = [];
    civ.food = 0;
    const ticks = Math.ceil(site.workNeeded / 3.2);
    let builder = -1;
    for (let tick = 0; tick < ticks; tick += 1) {
      assignJobs(game);
      const builders = adults.filter(id => game.agents.job[id] === Job.Builder);
      expect(builders).toHaveLength(1);
      if (builder >= 0) expect(builders[0]).toBe(builder);
      builder = builders[0];
      expect(game.agents.work[builder]).toBe(site.id);
      expect(game.agents.state[builder]).toBe(AgentState.Working);
      expect(adults.filter(id => game.agents.job[id] === Job.Farmer)).toHaveLength(3);
      for (const farm of farms) {
        expect(farm.workers).toBe(adults.filter(id => game.agents.work[id] === farm.id).length);
        expect(farm.workers).toBeLessThanOrEqual(BUILDING_DEFS[BuildingType.Farm].workers);
      }
      runEconomy(game);
      expect(site.work).toBeCloseTo((tick + 1) * 3.2);
      expect(civ.foodProduction).toBeGreaterThanOrEqual(civ.foodNeed);
      expect(civ.foodShortage).toBe(0);
    }
    expect(site.built).toBe(true);
    assignJobs(game);
    expect(adults.every(id => game.agents.job[id] === Job.Farmer)).toBe(true);
    expect(farms.every(farm => farm.workers === 2)).toBe(true);
  });

  it('keeps the sole available adult farming and leaves marching soldiers assigned', () => {
    const { game, site, adults, farms } = constructionFixture();
    for (const id of adults.slice(1)) {
      game.agents.job[id] = Job.Soldier;
      game.agents.state[id] = AgentState.Marching;
    }
    assignJobs(game);
    expect(game.agents.job[adults[0]]).toBe(Job.Farmer);
    expect(farms.reduce((sum, farm) => sum + farm.workers, 0)).toBe(1);
    for (const id of adults.slice(1)) {
      expect(game.agents.job[id]).toBe(Job.Soldier);
      expect(game.agents.state[id]).toBe(AgentState.Marching);
    }
    runEconomy(game);
    expect(site.work).toBe(0);
  });

  it('allocates additional builders from surplus adults after productive jobs', () => {
    const { game, civ, adults, farms } = constructionFixture();
    for (let i = 0; i < 6; i += 1) {
      adults.push(game.spawnAgent(civ.id, civ.centerX, civ.centerY, { age: 25, gender: 0 }));
    }
    assignJobs(game);
    expect(adults.filter(id => game.agents.job[id] === Job.Builder)).toHaveLength(3);
    expect(farms.every(farm => farm.workers === 2)).toBe(true);
  });
});
