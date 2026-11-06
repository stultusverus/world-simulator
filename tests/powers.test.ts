import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { applyPower } from '../src/sim/powers';
import { startWar } from '../src/sim/war';
import { findPath } from '../src/sim/pathfind';
import { NO_OWNER, Tile, type World } from '../src/world/types';

function testWorld(rows: string[]): World {
  const size = rows.length;
  const terrain = new Uint8Array(size * size);
  let landTiles = 0;
  let waterTiles = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const char = rows[y][x] ?? '.';
      let tile = Tile.Grass;
      if (char === '~') tile = Tile.ShallowWater;
      if (char === 'M') tile = Tile.Mountain;
      terrain[y * size + x] = tile;
      if (tile === Tile.ShallowWater) waterTiles += 1;
      else landTiles += 1;
    }
  }
  return {
    size,
    seedText: 'TEST',
    seed: 1,
    tick: 1,
    elevation: new Uint8Array(size * size),
    moisture: new Uint8Array(size * size),
    terrain,
    fertility: new Uint8Array(size * size).fill(120),
    river: new Uint8Array(size * size),
    owner: new Uint8Array(size * size).fill(NO_OWNER),
    waterDistance: new Uint8Array(size * size),
    spawnSites: [],
    landTiles,
    waterTiles,
    terrainVersion: 1,
    ownerVersion: 1,
  };
}

describe('pathfinding', () => {
  it('finds a path across open ground', () => {
    const world = testWorld(Array.from({ length: 12 }, () => '.'.repeat(12)));
    const path = findPath(world, 1, 1, 10, 10);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(0);
    let previous = { x: 1, y: 1 };
    for (const step of path!) {
      expect(Math.abs(step.x - previous.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(step.y - previous.y)).toBeLessThanOrEqual(1);
      expect(world.terrain[step.y * 12 + step.x]).not.toBe(Tile.ShallowWater);
      previous = step;
    }
  });

  it('routes around an impassable wall', () => {
    const world = testWorld([
      '............',
      '............',
      '............',
      '............',
      '............',
      '~~~~~~......',
      '......~~~...',
      '............',
      '............',
      '............',
      '............',
      '............',
    ]);
    const path = findPath(world, 1, 3, 5, 8);
    expect(path).not.toBeNull();
    for (const step of path!) {
      expect(world.terrain[step.y * 12 + step.x]).not.toBe(Tile.ShallowWater);
    }
  });

  it('returns null when the goal is sealed off', () => {
    const world = testWorld([
      '............',
      '......~~~...',
      '......~.~...',
      '......~~~...',
      '............',
      '............',
      '............',
      '............',
    ]);
    expect(findPath(world, 1, 1, 7, 2)).toBeNull();
    expect(findPath(world, 0, 0, 1, 1)?.[0]).toBeDefined();
  });
});

describe('powers', () => {
  it('spawns factions, settlers and wildlife', () => {
    const game = new Game({ size: 256, seedText: 'POWER1', startWithFactions: true });
    const site = game.world.spawnSites[3];
    expect(site).toBeDefined();
    const before = game.aliveCivs().length;
    const faction = applyPower(game, 'spawnFaction', site.x, site.y);
    expect(faction.ok).toBe(true);
    expect(game.aliveCivs().length).toBe(before + 1);

    const newCiv = game.aliveCivs()[game.aliveCivs().length - 1];
    const populationBefore = game.agents.count;
    const settlers = applyPower(game, 'spawnVillagers', newCiv.centerX, newCiv.centerY);
    expect(settlers.ok).toBe(true);
    expect(game.agents.count).toBe(populationBefore + 4);

    const animalsBefore = game.animals.count;
    expect(applyPower(game, 'spawnDeer', newCiv.centerX + 4, newCiv.centerY + 4).ok).toBe(true);
    expect(game.animals.count).toBeGreaterThan(animalsBefore);
  });

  it('heals, blesses, inspires and calms wars', () => {
    const game = new Game({ size: 256, seedText: 'POWER2', startWithFactions: true });
    for (let i = 0; i < 30; i += 1) game.tick();
    const civ = game.aliveCivs()[0];
    const other = game.aliveCivs()[1];

    let target = -1;
    for (let id = 0; id < game.agents.capacity; id += 1) {
      if (game.agents.alive[id] === 1 && game.agents.civ[id] === civ.id) {
        target = id;
        break;
      }
    }
    expect(target).toBeGreaterThanOrEqual(0);
    game.agents.health[target] = 10;
    const healed = applyPower(game, 'heal', game.agents.x[target], game.agents.y[target], 6);
    expect(healed.ok).toBe(true);
    expect(game.agents.health[target]).toBeGreaterThan(10);

    const fertility = applyPower(game, 'fertility', civ.centerX, civ.centerY, 8);
    expect(fertility.ok).toBe(true);
    expect(civ.blessingUntil).toBeGreaterThan(game.world.tick);

    const knowledgeBefore = civ.knowledge;
    const inspired = applyPower(game, 'inspire', civ.centerX, civ.centerY, 8);
    expect(inspired.ok).toBe(true);
    expect(civ.knowledge).toBeGreaterThan(knowledgeBefore);

    const war = startWar(game, civ.id, other.id);
    expect(war).not.toBeNull();
    expect(game.wars.length).toBe(1);
    const peace = applyPower(game, 'peace', civ.centerX, civ.centerY);
    expect(peace.ok).toBe(true);
    expect(game.wars.length).toBe(0);
  });

  it('starts an empty wilderness and can be seeded by the player', () => {
    const game = new Game({ size: 256, seedText: 'EMPTY2', startWithFactions: false });
    expect(game.aliveCivs().length).toBe(0);
    expect(game.animals.count).toBeGreaterThan(0);
    const site = game.world.spawnSites[0];
    const result = applyPower(game, 'spawnFaction', site.x, site.y);
    expect(result.ok).toBe(true);
    expect(game.aliveCivs().length).toBe(1);
  });
});

describe('long-run invariants', () => {
  it('keeps the world finite, sane and within caps', () => {
    const game = new Game({ size: 256, seedText: 'INVARIANTS', startWithFactions: true });
    for (let tick = 0; tick < 900; tick += 1) {
      game.tick();
      if (tick % 50 !== 0) continue;
      expect(game.agents.count).toBeLessThanOrEqual(game.agentCap);
      expect(game.animals.count).toBeLessThanOrEqual(game.wildlifeCap);
      for (let id = 0; id < game.agents.capacity; id += 1) {
        if (game.agents.alive[id] === 0) continue;
        expect(Number.isFinite(game.agents.x[id])).toBe(true);
        expect(Number.isFinite(game.agents.y[id])).toBe(true);
        expect(Number.isFinite(game.agents.health[id])).toBe(true);
        expect(game.agents.x[id]).toBeGreaterThanOrEqual(0);
        expect(game.agents.y[id]).toBeGreaterThanOrEqual(0);
        expect(game.agents.x[id]).toBeLessThanOrEqual(game.world.size);
        expect(game.agents.y[id]).toBeLessThanOrEqual(game.world.size);
      }
      for (const civ of game.civs) {
        expect(civ.population).toBeGreaterThanOrEqual(0);
        expect(civ.knowledge).toBeGreaterThanOrEqual(0);
      }
      for (const building of game.buildings) {
        expect(building.x).toBeGreaterThanOrEqual(0);
        expect(building.y).toBeGreaterThanOrEqual(0);
        expect(building.x).toBeLessThan(game.world.size);
        expect(building.y).toBeLessThan(game.world.size);
      }
      for (const war of game.wars) {
        expect(game.civs[war.a].alive).toBe(true);
        expect(game.civs[war.b].alive).toBe(true);
      }
      for (const relation of game.relations) {
        expect(relation).toBeGreaterThanOrEqual(-100);
        expect(relation).toBeLessThanOrEqual(100);
      }
      expect(game.chronicle.entries.length).toBeLessThanOrEqual(600);
    }
    expect(game.stats.population).toBeGreaterThan(0);
  }, 120_000);

  it('runs the 512 world without errors', () => {
    const game = new Game({ size: 512, seedText: 'MEDIUM', startWithFactions: true });
    for (let i = 0; i < 200; i += 1) game.tick();
    expect(game.stats.population).toBeGreaterThan(0);
    expect(game.aliveCivs().length).toBeGreaterThan(0);
    expect(game.animals.count).toBeGreaterThan(0);
    expect(game.world.size).toBe(512);
  }, 120_000);
});
