import { describe, expect, it } from 'vitest';
import { BUILDING_DEFS } from '../src/config';
import { assignJobs } from '../src/sim/agents';
import { runEconomy } from '../src/sim/economy';
import { Game } from '../src/sim/game';
import { AgentState, BuildingType, Job } from '../src/world/types';

function workshopFixture() {
  const game = new Game({ size: 256, seedText: 'ALPHA', startWithFactions: true });
  const civ = game.civs[0];
  const spot = game.findBuildingSpot(civ, BuildingType.Workshop, 2);
  expect(spot).not.toBeNull();
  const workshop = game.addBuilding(civ.id, BuildingType.Workshop, spot!.x, spot!.y, true);
  assignJobs(game);
  // The four adult founders staff the two farms; children cannot fill workshop slots.
  expect(workshop.workers).toBe(0);
  const spawn = (job = Job.Idle) => {
    const id = game.spawnAgent(civ.id, civ.centerX, civ.centerY, { age: 25, gender: 0, job });
    expect(id).toBeGreaterThanOrEqual(0);
    return id;
  };
  return { game, civ, workshop, spawn };
}

describe('workshop staffing', () => {
  it('recruits adults from other jobs and keeps farm staffing intact', () => {
    const { game, civ, workshop, spawn } = workshopFixture();
    const recruits = [spawn(Job.Idle), spawn(Job.Builder)];
    assignJobs(game);
    expect(workshop.workers).toBe(BUILDING_DEFS[BuildingType.Workshop].workers);
    for (const id of recruits) {
      expect(game.agents.job[id]).toBe(Job.Worker);
      expect(game.agents.work[id]).toBe(workshop.id);
      expect(game.agents.state[id]).toBe(AgentState.Working);
    }
    for (const farm of game.buildings.filter(b => b.civ === civ.id && b.type === BuildingType.Farm)) {
      expect(farm.workers).toBe(BUILDING_DEFS[BuildingType.Farm].workers);
    }
    assignJobs(game);
    expect(workshop.workers).toBe(recruits.length);
  });

  it('retains existing workers ahead of surplus recruits', () => {
    const { game, workshop, spawn } = workshopFixture();
    const retained = spawn(Job.Worker);
    game.agents.work[retained] = workshop.id;
    game.agents.state[retained] = AgentState.Working;
    // New agents receive lower IDs and are visited before the existing worker.
    const candidates = [spawn(), spawn()];
    assignJobs(game);
    expect(game.agents.job[retained]).toBe(Job.Worker);
    expect(game.agents.work[retained]).toBe(workshop.id);
    expect(workshop.workers).toBe(BUILDING_DEFS[BuildingType.Workshop].workers);
    expect(candidates.filter(id => game.agents.job[id] === Job.Worker)).toHaveLength(1);
  });

  it.each([0, 1, 2])('produces proportionally with %i recruited workers', count => {
    const { game, civ, workshop, spawn } = workshopFixture();
    for (let i = 0; i < count; i += 1) spawn();
    game.updateStats();
    assignJobs(game);
    expect(workshop.workers).toBe(count);
    // Isolate workshop output from traits, era bonuses, and construction spending.
    civ.traits = [];
    civ.era = 0;
    civ.materials = 0;
    civ.wealth = 0;
    const def = BUILDING_DEFS[BuildingType.Workshop];
    runEconomy(game);
    expect(civ.materials).toBeCloseTo(0.65 + civ.population * 0.02 + def.produces.materials! * count / def.workers);
    expect(civ.wealth).toBeCloseTo(civ.population * 0.012 + def.produces.wealth! * count / def.workers);
  });
});
