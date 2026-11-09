import { describe, expect, it } from 'vitest';
import { WOUNDED_HEALTH } from '../src/config';
import { Game } from '../src/sim/game';
import { makeSettlementName } from '../src/sim/names';
import { settlementCenters } from '../src/sim/settlements';
import { runWar, startWar } from '../src/sim/war';
import { AgentState, BuildingType, Job, Tile } from '../src/world/types';

function movementFixture(returning = false) {
  const game = new Game({ size: 256, seedText: 'ALPHA', startWithFactions: true });
  for (const building of [...game.buildings]) game.removeBuilding(building);
  for (let id = 0; id < game.agents.capacity; id += 1) {
    if (game.agents.alive[id]) game.removeAgent(id);
  }
  game.world.terrain.fill(Tile.Grass);
  game.refreshReachability();
  const target = game.addBuilding(returning ? 0 : 1, BuildingType.TownCenter, 30, 10, true);
  const id = game.spawnAgent(0, 10.5, 10.5, { age: 25, gender: 0 });
  game.agents.job[id] = Job.Soldier;
  game.agents.state[id] = returning ? AgentState.Returning : AgentState.Marching;
  if (!returning) expect(startWar(game, 0, 1)).not.toBeNull();
  return { game, id, target };
}

describe('soldier movement', () => {
  it.each([false, true])('uses containing endpoint tiles (returning: %s)', (returning) => {
    const { game, id, target } = movementFixture(returning);
    // Rounding either centre selects an impassable tile.
    game.world.terrain[11 * game.world.size + 11] = Tile.DeepWater;
    game.world.terrain[11 * game.world.size + 31] = Tile.DeepWater;
    runWar(game);
    expect(game.agents.x[id]).toBeGreaterThan(10.5);
    expect(game.soldierPaths.get(id)?.path.at(-1)).toEqual({ x: target.x, y: target.y });
    for (let tick = 0; tick < 4; tick += 1) runWar(game);
    expect(Math.hypot(game.agents.x[id] - 30.5, game.agents.y[id] - 10.5)).toBeLessThanOrEqual(2.6);
    if (returning) expect(game.agents.state[id]).toBe(AgentState.Idle);
    else expect(target.hp).toBeLessThan(target.maxHp);
  });

  it('retries the same target after an unsuccessful route becomes reachable', () => {
    const { game, id, target } = movementFixture();
    // Mountains are impassable and not water, so no land or naval route exists.
    for (let y = 0; y < game.world.size; y += 1) {
      game.world.terrain[y * game.world.size + 20] = Tile.Mountain;
    }
    game.refreshReachability();
    runWar(game);
    expect(game.agents.x[id]).toBe(10.5);
    expect(game.agents.y[id]).toBe(10.5);
    game.world.terrain[10 * game.world.size + 20] = Tile.Grass;
    game.refreshReachability();
    game.world.tick += 1;
    runWar(game);
    expect(game.agents.x[id]).toBeGreaterThan(10.5);
    expect(game.soldierPaths.get(id)?.targetKey).toBe(target.id);
  });

  it('retries empty routes restored from older saves', () => {
    const { game, id, target } = movementFixture();
    game.soldierPaths.set(id, { path: [], index: 0, targetKey: target.id });
    const restored = Game.fromSave(game.toSave());
    runWar(restored);
    expect(restored.agents.x[id]).toBeGreaterThan(10.5);
  });
});

describe('wounded retreat', () => {
  it('turns a lethal hit into a retreat that cannot strike back in the same tick', () => {
    const game = new Game({ size: 256, seedText: 'WOUND', startWithFactions: true });
    for (const building of [...game.buildings]) game.removeBuilding(building);
    for (let id = 0; id < game.agents.capacity; id += 1) {
      if (game.agents.alive[id]) game.removeAgent(id);
    }
    game.world.terrain.fill(Tile.Grass);
    game.refreshReachability();
    const a = game.civs[0];
    const b = game.civs[1];
    a.centerX = 5;
    a.centerY = 5;
    b.centerX = 10;
    b.centerY = 5;
    game.addBuilding(a.id, BuildingType.TownCenter, 5, 5, true);
    game.addBuilding(b.id, BuildingType.TownCenter, 10, 5, true);
    const attacker = game.spawnAgent(a.id, 8.5, 8.5, { age: 25, gender: 0 });
    const defender = game.spawnAgent(b.id, 9.5, 8.5, { age: 25, gender: 1 });
    game.agents.job[attacker] = Job.Soldier;
    game.agents.state[attacker] = AgentState.Fighting;
    game.agents.health[attacker] = 100;
    game.agents.job[defender] = Job.Soldier;
    game.agents.state[defender] = AgentState.Fighting;
    game.agents.health[defender] = 1;
    expect(startWar(game, a.id, b.id)).not.toBeNull();
    // Force the retreat branch; the aggressive roll is deterministic here.
    (game.rng as unknown as { chance: (p: number) => boolean }).chance = () => true;

    runWar(game);

    expect(game.agents.alive[defender]).toBe(1);
    expect(game.agents.health[defender]).toBe(WOUNDED_HEALTH);
    expect(game.agents.state[defender]).toBe(AgentState.Returning);
    expect(b.casualties).toBe(0);
    // The retreating soldier must not have attacked back after being wounded.
    expect(game.agents.health[attacker]).toBe(100);
  });
});

describe('settlement razing', () => {
  function razeFixture() {
    const game = new Game({ size: 256, seedText: 'RAZE', startWithFactions: true });
    for (const building of [...game.buildings]) game.removeBuilding(building);
    for (let id = 0; id < game.agents.capacity; id += 1) {
      if (game.agents.alive[id]) game.removeAgent(id);
    }
    game.world.terrain.fill(Tile.Grass);
    game.refreshReachability();
    const attacker = game.civs[0];
    const defender = game.civs[1];
    attacker.centerX = 10;
    attacker.centerY = 10;
    defender.centerX = 20;
    defender.centerY = 10;
    game.addBuilding(0, BuildingType.TownCenter, 10, 10, true);
    const first = game.addBuilding(1, BuildingType.TownCenter, 20, 10, true);
    game.addBuilding(1, BuildingType.TownCenter, 26, 10, true);
    expect(startWar(game, 0, 1)).not.toBeNull();
    const id = game.spawnAgent(0, 19.5, 10.5, { age: 25, gender: 0 });
    game.agents.job[id] = Job.Soldier;
    game.agents.state[id] = AgentState.Marching;
    return { game, defender, first };
  }

  it('keeps a faction alive when it still holds another town centre', () => {
    const { game, defender, first } = razeFixture();
    first.hp = 1;
    runWar(game);
    expect(game.buildingById.has(first.id)).toBe(false);
    expect(defender.alive).toBe(true);
    expect(defender.centerX).toBe(26);
    expect(defender.centerY).toBe(10);
    const lost = makeSettlementName(game.world.seedText, defender.id, first.id);
    const entry = game.chronicle.entries.find((e) => e.kind === 'war' && e.text.includes(lost));
    expect(entry?.text).toContain('raze');
  });

  it('eliminates a faction when its last town centre is razed', () => {
    const { game, defender, first } = razeFixture();
    first.hp = 1;
    runWar(game);
    expect(defender.alive).toBe(true);
    const last = settlementCenters(game, defender.id)[0];
    last.hp = 1;
    for (let i = 0; i < 30 && defender.alive; i += 1) runWar(game);
    expect(defender.alive).toBe(false);
    expect(game.buildings.some((building) => building.civ === defender.id)).toBe(false);
    const entry = game.chronicle.entries.find((candidate) =>
      candidate.text.startsWith(`The ${defender.name} are no more.`),
    );
    expect(entry?.text).toContain('last town centre fell');
  });
});
