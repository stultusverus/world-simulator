import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import type { GameSave } from '../src/sim/save-types';

function hashTyped(bytes: ArrayLike<number>): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= Number(bytes[i]) & 0xff;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashState(game: Game): string {
  const parts: number[] = [];
  parts.push(game.world.tick, game.rng.getState(), game.agents.count, game.animals.count);
  parts.push(hashTyped(game.world.terrain), hashTyped(game.world.owner), hashTyped(game.world.fertility));
  parts.push(hashTyped(game.relations));
  for (const attr of ['x', 'y', 'civ', 'job', 'state', 'age', 'health', 'hunger', 'partner', 'alive'] as const) {
    parts.push(hashTyped(game.agents[attr]));
  }
  for (const civ of game.civs) {
    parts.push(
      civ.population,
      civ.era,
      civ.knowledge,
      Math.round(civ.food * 100),
      Math.round(civ.materials * 100),
      civ.warId,
      civ.alive ? 1 : 0,
    );
  }
  for (const building of game.buildings) {
    parts.push(building.id, building.civ, building.type, building.x, building.y, Math.round(building.hp));
  }
  for (const war of game.wars) {
    parts.push(war.id, war.a, war.b, war.startTick, war.casualtiesA, war.casualtiesB);
  }
  parts.push(game.chronicle.entries.length);
  return parts.join(',');
}

describe('save round trip', () => {
  it('restores identical state and continues deterministically', () => {
    const game = new Game({ size: 256, seedText: 'SAVETEST', startWithFactions: true });
    for (let i = 0; i < 140; i += 1) game.tick();
    const save: GameSave = game.toSave(123456789);
    const clone = Game.fromSave(save);

    expect(clone.world.seed).toBe(game.world.seed);
    expect(clone.world.tick).toBe(game.world.tick);
    expect(clone.agents.count).toBe(game.agents.count);
    expect(clone.stats.population).toBe(game.stats.population);
    expect(clone.buildings.length).toBe(game.buildings.length);
    expect(hashState(clone)).toBe(hashState(game));

    for (let i = 0; i < 120; i += 1) {
      game.tick();
      clone.tick();
    }
    expect(clone.world.tick).toBe(game.world.tick);
    expect(hashState(clone)).toBe(hashState(game));
    expect(clone.chronicle.entries.map((entry) => entry.text)).toEqual(
      game.chronicle.entries.map((entry) => entry.text),
    );
  }, 120_000);

  it('restores an empty wilderness world', () => {
    const game = new Game({ size: 256, seedText: 'EMPTY', startWithFactions: false });
    for (let i = 0; i < 30; i += 1) game.tick();
    const clone = Game.fromSave(game.toSave());
    expect(clone.aliveCivs().length).toBe(0);
    expect(clone.animals.count).toBe(game.animals.count);
    expect(hashState(clone)).toBe(hashState(game));
  });
});
