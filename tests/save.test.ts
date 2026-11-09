import { deepStrictEqual, notDeepStrictEqual } from 'node:assert/strict';
import { describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../src/config';
import { assignJobs, countCivJobs } from '../src/sim/agents';
import { Game } from '../src/sim/game';
import { settlementCenters } from '../src/sim/settlements';
import type { GameSave } from '../src/sim/save-types';
import { BuildingType, Job } from '../src/world/types';

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

  it('restores new late-game buildings and laborers deterministically', () => {
    const game = new Game({ size: 256, seedText: 'LATE-SAVE', startWithFactions: true });
    const civ = game.civs[0];
    const center = settlementCenters(game, civ.id)[0];
    expect(center).toBeDefined();
    for (const type of [BuildingType.Market, BuildingType.University, BuildingType.Monument]) {
      const spot = game.findBuildingSpot(civ, type, 2);
      expect(spot).not.toBeNull();
      game.addBuilding(civ.id, type, spot!.x, spot!.y, true);
    }
    for (let i = 0; i < 20; i += 1) {
      const id = game.spawnAgent(civ.id, center.x, center.y, {
        age: 25,
        gender: i % 2,
        home: center.id,
      });
      expect(id).toBeGreaterThanOrEqual(0);
    }
    assignJobs(game);
    game.updateStats();
    expect(countCivJobs(game, civ.id).labourers).toBeGreaterThan(0);
    const hasLaborer = (job: Uint8Array): boolean => Array.from(job).includes(Job.Laborer);
    const save = game.toSave(0);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.buildings.some((building) => building.type === BuildingType.Market)).toBe(true);
    expect(hasLaborer(save.agents.job)).toBe(true);
    const clone = Game.fromSave(save);
    deepStrictEqual(clone.toSave(0), save);

    for (let i = 0; i < 80; i += 1) {
      game.tick();
      clone.tick();
    }
    deepStrictEqual(clone.toSave(0), game.toSave(0));
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
