import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import type { Civ } from '../src/world/types';

function civSnapshot(civ: Civ) {
  return {
    name: civ.name,
    pop: civ.population,
    era: civ.era,
    buildings: civ.buildings,
    soldiers: civ.soldiers,
    housing: civ.housing,
    food: Math.round(civ.food),
    materials: Math.round(civ.materials),
    knowledge: Math.round(civ.knowledge),
    faith: Math.round(civ.faith),
    happiness: Math.round(civ.happiness),
    traits: civ.traits.join('/'),
  };
}

function run(seed: string, ticks: number, size = 256): { game: Game; ms: number } {
  const game = new Game({ size, seedText: seed, startWithFactions: true });
  const start = performance.now();
  for (let i = 0; i < ticks; i += 1) game.tick();
  return { game, ms: performance.now() - start };
}

describe('simulation pacing', () => {
  it('grows factions, buildings and eras', () => {
    const { game, ms } = run('ALPHA', 400);
    console.log(
      '400 ticks',
      JSON.stringify(
        {
          ms: Math.round(ms),
          year: game.year,
          pop: game.stats.population,
          wars: game.stats.wars,
          animals: game.stats.animals,
          buildings: game.stats.buildings,
          civs: game.aliveCivs().map(civSnapshot),
          log: game.chronicle.entries.slice(-10).map((e) => `${e.year} ${e.kind}: ${e.text}`),
        },
        null,
        1,
      ),
    );
    expect(game.stats.population).toBeGreaterThan(0);
    expect(game.aliveCivs().length).toBeGreaterThanOrEqual(1);
    expect(game.animals.count).toBeGreaterThan(0);
  }, 120_000);

  it('tracks war and peace over a long run', () => {
    const { game, ms } = run('ALPHA', 3000);
    const warEntries = game.chronicle.entries.filter((e) => e.kind === 'war' || e.kind === 'diplomacy');
    console.log(
      '3000 ticks',
      JSON.stringify(
        {
          ms: Math.round(ms),
          year: game.year,
          pop: game.stats.population,
          warsNow: game.wars.length,
          animals: game.animals.count,
          civs: game.aliveCivs().map(civSnapshot),
          wars: warEntries.slice(-12).map((e) => `${e.year}: ${e.text}`),
        },
        null,
        1,
      ),
    );
    expect(game.stats.population).toBeGreaterThan(0);
    expect(game.chronicle.entries.some((e) => e.kind === 'war')).toBe(true);
  }, 120_000);

  it('handles the 1024 world at a playable speed', () => {
    const { game, ms } = run('TITAN', 200, 1024);
    const perTick = ms / 200;
    console.log(
      '1024 ticks',
      JSON.stringify({
        ms: Math.round(ms),
        perTickMs: Number(perTick.toFixed(2)),
        population: game.stats.population,
        agentCap: game.agentCap,
        chronicle: game.chronicle.entries.slice(-3).map((e) => e.text),
      }),
    );
    expect(game.stats.population).toBeGreaterThan(0);
    expect(perTick).toBeLessThan(120);
  }, 180_000);
});
