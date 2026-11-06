import { deepStrictEqual, notDeepStrictEqual } from 'node:assert/strict';
import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import type { GameSave } from '../src/sim/save-types';

describe('save round trip', () => {
  it.each(['x', 'health'] as const)('detects small differences in agent %s', (attribute) => {
    const game = new Game({ size: 256, seedText: 'PRECISION', startWithFactions: true });
    const save = game.toSave(0);
    const clone = Game.fromSave(save);
    deepStrictEqual(clone.toSave(0), save);

    clone.agents[attribute][0] += 0.0001;
    expect(Math.trunc(clone.agents[attribute][0])).toBe(Math.trunc(game.agents[attribute][0]));
    notDeepStrictEqual(clone.toSave(0), save);
  });

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
    deepStrictEqual(clone.toSave(0), game.toSave(0));

    for (let i = 0; i < 120; i += 1) {
      game.tick();
      clone.tick();
    }
    expect(clone.world.tick).toBe(game.world.tick);
    deepStrictEqual(clone.toSave(0), game.toSave(0));
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
    deepStrictEqual(clone.toSave(0), game.toSave(0));
  });
});
