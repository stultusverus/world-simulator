import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';

function battleCount(game: Game): number {
  return game.chronicle.entries.filter(
    (entry) => entry.kind === 'war' && entry.text.includes('battle'),
  ).length;
}

describe('256 world war cost', () => {
  it('stays costly without draining the whole world over a millennium', () => {
    const game = new Game({ size: 256, seedText: 'ALPHA', startWithFactions: true });
    for (let tick = 0; tick < 1000; tick += 1) game.tick();
    const casualties = game.civs.reduce((sum, civ) => sum + civ.casualties, 0);
    const metrics = {
      casualties,
      battles: battleCount(game),
      alive: game.aliveCivs().map((civ) => ({
        name: civ.name,
        pop: civ.population,
        soldiers: civ.soldiers,
        casualties: civ.casualties,
      })),
    };
    console.log('war cost run', JSON.stringify(metrics, null, 1));

    expect(casualties).toBeGreaterThanOrEqual(50);
    expect(casualties).toBeLessThanOrEqual(350);
    expect(metrics.battles).toBeGreaterThanOrEqual(2);
    expect(game.aliveCivs().length).toBeGreaterThanOrEqual(1);
    expect(game.aliveCivs().every((civ) => civ.population > 0)).toBe(true);
  }, 120_000);
});
