import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { runAgentLives } from '../src/sim/agents';
import { settlementCenters } from '../src/sim/settlements';

function countCivAgents(game: Game, civId: number): number {
  let count = 0;
  for (let id = 0; id < game.agents.capacity; id += 1) {
    if (game.agents.alive[id] === 1 && game.agents.civ[id] === civId) count += 1;
  }
  return count;
}

describe('fair population cap', () => {
  it('does not starve a later-founded faction at the global cap', () => {
    const game = new Game({ size: 256, seedText: 'BRAVO', startWithFactions: true });
    while (game.year < 2000) game.tick();
    expect(game.aliveCivs().length).toBe(3);
    for (const civ of game.aliveCivs()) {
      expect(civ.population).toBeGreaterThan(50);
    }
  }, 120_000);

  it('sends emergency wanderers when a faction has no fertile adults', () => {
    const game = new Game({ size: 256, seedText: 'RESCUE', startWithFactions: true });
    const civ = game.civs[0];
    const center = settlementCenters(game, civ.id)[0];
    expect(center).toBeDefined();
    for (let id = 0; id < game.agents.capacity; id += 1) {
      if (game.agents.alive[id] === 1 && game.agents.civ[id] === civ.id) game.removeAgent(id);
    }
    const elder = game.spawnAgent(civ.id, center.x, center.y, {
      age: 70,
      gender: 0,
      home: center.id,
      lifespan: 500,
    });
    expect(elder).toBeGreaterThanOrEqual(0);
    game.agents.job[elder] = 1;
    game.updateStats();
    expect(countCivAgents(game, civ.id)).toBe(1);
    const original = game.rng.chance.bind(game.rng);
    (game.rng as unknown as { chance: (p: number) => boolean }).chance = () => true;
    try {
      runAgentLives(game);
    } finally {
      (game.rng as unknown as { chance: (p: number) => boolean }).chance = original;
    }
    expect(countCivAgents(game, civ.id)).toBeGreaterThanOrEqual(3);
  });
});

describe('post-war fertility', () => {
  it('allows limited births while a faction is slightly overcrowded', () => {
    const game = new Game({ size: 256, seedText: 'SOFT-BIRTHS', startWithFactions: true });
    const civ = game.civs[0];
    civ.housing = 5;
    civ.food = 100;
    civ.foodProduction = 100;
    civ.foodNeed = 10;
    civ.happiness = 80;
    const before = countCivAgents(game, civ.id);
    expect(before).toBeGreaterThan(5);
    const original = game.rng.chance.bind(game.rng);
    (game.rng as unknown as { chance: (p: number) => boolean }).chance = () => true;
    try {
      runAgentLives(game);
    } finally {
      (game.rng as unknown as { chance: (p: number) => boolean }).chance = original;
    }
    expect(countCivAgents(game, civ.id)).toBeGreaterThan(before);
  });
});
