import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { startWar } from '../src/sim/war';

function removeCivAgents(game: Game, civId: number): number {
  let removed = 0;
  for (let id = 0; id < game.agents.capacity; id += 1) {
    if (game.agents.alive[id] === 1 && game.agents.civ[id] === civId) {
      game.removeAgent(id);
      removed += 1;
    }
  }
  return removed;
}

describe('population extinction', () => {
  it('eliminates a faction when its last citizen dies and ends its wars', () => {
    const game = new Game({ size: 256, seedText: 'EXTINCT', startWithFactions: true });
    const civ = game.civs[0];
    const other = game.civs[1];
    expect(removeCivAgents(game, civ.id)).toBeGreaterThan(0);
    expect(civ.alive).toBe(true);
    expect(startWar(game, civ.id, other.id)).not.toBeNull();
    const buildingsBefore = game.buildings.filter((building) => building.civ === civ.id).length;
    expect(buildingsBefore).toBeGreaterThan(0);

    game.tick();

    expect(civ.alive).toBe(false);
    expect(game.buildings.some((building) => building.civ === civ.id)).toBe(false);
    expect(game.wars).toHaveLength(0);
    expect(game.aliveCivs().some((candidate) => candidate.id === civ.id)).toBe(false);
    const extinctionEntry = game.chronicle.entries.find((entry) =>
      entry.text.startsWith(`The ${civ.name} are no more.`),
    );
    expect(extinctionEntry).toBeDefined();
    expect(extinctionEntry?.text).toContain('last people died out');
  });

  it('does not eliminate a faction that still has one citizen', () => {
    const game = new Game({ size: 256, seedText: 'ONELEFT', startWithFactions: true });
    const civ = game.civs[0];
    const survivor = (() => {
      for (let id = 0; id < game.agents.capacity; id += 1) {
        if (game.agents.alive[id] === 1 && game.agents.civ[id] === civ.id) return id;
      }
      return -1;
    })();
    expect(survivor).toBeGreaterThanOrEqual(0);
    for (let id = 0; id < game.agents.capacity; id += 1) {
      if (id === survivor) continue;
      if (game.agents.alive[id] === 1 && game.agents.civ[id] === civ.id) game.removeAgent(id);
    }
    game.tick();
    expect(civ.alive).toBe(true);
  });
});
