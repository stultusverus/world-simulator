import { describe, expect, it } from 'vitest';
import { runAgentLives } from '../src/sim/agents';
import { Game } from '../src/sim/game';
import { BuildingType } from '../src/world/types';

function famineFixture(seed: string, shortageRatio: number, citizens = 24) {
  const game = new Game({ size: 256, seedText: seed, startWithFactions: true });
  const civ = game.civs[0];
  for (let id = 0; id < game.agents.capacity; id += 1) {
    if (game.agents.alive[id] === 1 && game.agents.civ[id] === civ.id) game.removeAgent(id);
  }
  const center = game.buildings.find(
    (building) => building.civ === civ.id && building.type === BuildingType.TownCenter,
  );
  expect(center).toBeDefined();
  for (let i = 0; i < citizens; i += 1) {
    const id = game.spawnAgent(civ.id, center!.x, center!.y, {
      age: 20 + (i % 20),
      gender: i % 2,
      home: center!.id,
      lifespan: 500,
      health: 100,
    });
    expect(id).toBeGreaterThanOrEqual(0);
    game.agents.hunger[id] = 0;
  }
  civ.housing = 1000;
  civ.traits = [];
  civ.food = 0;
  civ.foodProduction = 0;
  civ.foodNeed = 100;
  civ.foodShortage = shortageRatio * 100;
  return { game, civ };
}

function livingCitizens(game: Game, civId: number): number {
  let count = 0;
  for (let id = 0; id < game.agents.capacity; id += 1) {
    if (game.agents.alive[id] === 1 && game.agents.civ[id] === civId) count += 1;
  }
  return count;
}

describe('famine progression', () => {
  it('does not wipe a population over a modest food deficit', () => {
    const { game, civ } = famineFixture('FAMINE-MILD', 0.15);
    expect(livingCitizens(game, civ.id)).toBe(24);
    for (let tick = 0; tick < 40; tick += 1) runAgentLives(game);
    // Old binary famine killed everyone in roughly 20 ticks; a 15% deficit
    // should weaken people but not annihilate the city.
    expect(livingCitizens(game, civ.id)).toBe(24);
  });

  it('staggers deaths under a total food deficit instead of one mass die-off', () => {
    const { game, civ } = famineFixture('FAMINE-SEVERE', 1);
    const deathTicks: number[] = [];
    let previous = livingCitizens(game, civ.id);
    for (let tick = 0; tick < 80; tick += 1) {
      runAgentLives(game);
      const living = livingCitizens(game, civ.id);
      for (let i = living; i < previous; i += 1) deathTicks.push(tick);
      previous = living;
      if (living === 0) break;
    }
    expect(deathTicks.length).toBeGreaterThan(0);
    expect(new Set(deathTicks).size).toBeGreaterThan(1);
    expect(Math.max(...deathTicks) - Math.min(...deathTicks)).toBeGreaterThan(0);
  });
});
