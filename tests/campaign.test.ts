import { deepStrictEqual } from 'node:assert/strict';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/sim/pathfind', async (original) => {
  const actual = await original<typeof import('../src/sim/pathfind')>();
  return { ...actual, findPath: vi.fn(actual.findPath) };
});
import { CAMPAIGN_STALL_TICKS, FAILED_CAMPAIGN_COOLDOWN } from '../src/config';
import { canLaunchCampaign, campaignRoute, campaignTarget } from '../src/sim/campaign';
import { Game } from '../src/sim/game';
import { findPath } from '../src/sim/pathfind';
import { endWar, runWar, startWar } from '../src/sim/war';
import { AgentState, BuildingType, Job, Tile } from '../src/world/types';

function fixture(size = 256) {
  const game = new Game({ size, seedText: 'CAMPAIGN', startWithFactions: true });
  for (const b of [...game.buildings]) game.removeBuilding(b);
  for (let id = 0; id < game.agents.capacity; id++) if (game.agents.alive[id]) game.removeAgent(id);
  game.world.terrain.fill(Tile.Grass);
  const a = game.civs[0],
    b = game.civs[1];
  a.centerX = 10;
  a.centerY = 10;
  b.centerX = 40;
  b.centerY = 10;
  game.addBuilding(a.id, BuildingType.TownCenter, 10, 10, true);
  const target = game.addBuilding(b.id, BuildingType.TownCenter, 40, 10, true);
  game.refreshReachability();
  return { game, a, b, target };
}

describe('campaign feasibility and shared routes', () => {
  it('rejects connected but excessively long detours before declaration', () => {
    const { game, a, b } = fixture(1024);
    // One land component, but a return journey around the wall exceeds the campaign horizon.
    for (let y = 0; y < 1018; y++) game.world.terrain[y * 1024 + 25] = Tile.Mountain;
    game.refreshReachability();
    expect(canLaunchCampaign(game, a, b)).toBe(false);
    game.world.terrain[10 * 1024 + 25] = Tile.Grass;
    game.refreshReachability();
    expect(canLaunchCampaign(game, a, b)).toBe(true);
  }, 30_000);

  it('skips a closer unreachable target and attacks a reachable alternative', () => {
    const { game, a, b, target } = fixture();
    for (let y = 0; y < 256; y++) game.world.terrain[y * 256 + 25] = Tile.Mountain;
    const reachable = game.addBuilding(b.id, BuildingType.Workshop, 18, 30, true);
    game.refreshReachability();
    expect(campaignTarget(game, a, b.id)?.id).toBe(reachable.id);
    expect(campaignTarget(game, a, b.id)?.id).not.toBe(target.id);
  });

  it('allows a verified long march and extends its contact deadline', () => {
    const { game, a, b } = fixture(1024);
    for (const building of [...game.buildings])
      if (building.civ === b.id) game.removeBuilding(building);
    b.centerX = 600;
    game.addBuilding(b.id, BuildingType.TownCenter, 600, 10, true);
    expect(canLaunchCampaign(game, a, b)).toBe(true);
    const war = startWar(game, a.id, b.id)!;
    expect(war.contactDeadline).toBeGreaterThan(60);
  }, 30_000);

  it('shares identical successful searches and invalidates them after terrain changes', () => {
    const { game, a, target } = fixture();
    const search = vi.mocked(findPath);
    search.mockClear();
    expect(campaignRoute(game, 10, 10, target.x, target.y, a.id, target)).not.toBeNull();
    expect(campaignRoute(game, 10, 10, target.x, target.y, a.id, target)).not.toBeNull();
    expect(search).toHaveBeenCalledTimes(1);
    for (let y = 0; y < 256; y++) game.world.terrain[y * 256 + 25] = Tile.Mountain;
    game.refreshReachability();
    expect(campaignRoute(game, 10, 10, target.x, target.y, a.id, target)).toBeNull();
    expect(search).toHaveBeenCalledTimes(2);
  });
});

describe('stalled campaigns and save continuation', () => {
  it('withdraws a blocked army and persists escalating pair-specific cooldowns', () => {
    const { game, a, b } = fixture();
    const soldier = game.spawnAgent(a.id, 10, 10, { age: 25, gender: 0, job: Job.Soldier });
    game.agents.state[soldier] = AgentState.Marching;
    const war = startWar(game, a.id, b.id)!;
    for (let y = 0; y < 256; y++) game.world.terrain[y * 256 + 25] = Tile.Mountain;
    game.refreshReachability();
    game.world.tick = war.startTick + CAMPAIGN_STALL_TICKS + 1;
    runWar(game);
    expect(game.wars).toHaveLength(0);
    expect(game.campaignHistory[0].retryAfter).toBe(game.year + FAILED_CAMPAIGN_COOLDOWN);
    const clone = Game.fromSave(game.toSave(0));
    expect(clone.campaignHistory).toEqual(game.campaignHistory);
    clone.world.terrain[10 * 256 + 25] = Tile.Grass;
    clone.refreshReachability();
    expect(canLaunchCampaign(clone, clone.civs[a.id], clone.civs[b.id])).toBe(false);
    clone.world.tick = clone.campaignHistory[0].retryAfter;
    expect(canLaunchCampaign(clone, clone.civs[a.id], clone.civs[b.id])).toBe(true);
    const second = startWar(game, a.id, b.id)!;
    endWar(game, second, 'stalemate');
    expect(game.campaignHistory[0].retryAfter).toBe(game.year + FAILED_CAMPAIGN_COOLDOWN * 2);
    expect(game.campaignHistory[0].failures).toBe(2);
  });

  it('makes peace after combat when both armies stop advancing', () => {
    const { game, a, b } = fixture();
    for (const civ of [a, b])
      game.spawnAgent(civ.id, civ.centerX, civ.centerY, { age: 25, gender: 0, job: Job.Soldier });
    const war = startWar(game, a.id, b.id)!;
    war.lastBattleTick = game.year;
    for (let y = 0; y < 256; y++) game.world.terrain[y * 256 + 25] = Tile.Mountain;
    game.refreshReachability();
    game.world.tick += CAMPAIGN_STALL_TICKS + 1;
    runWar(game);
    expect(game.wars).toHaveLength(0);
    expect(game.campaignHistory).toHaveLength(0);
  });

  it('continues a moving army and its progress identically after loading', () => {
    const { game, a, b } = fixture();
    game.spawnAgent(a.id, 10, 10, { age: 25, gender: 0, job: Job.Soldier });
    game.spawnAgent(b.id, 40, 10, { age: 25, gender: 1, job: Job.Soldier });
    startWar(game, a.id, b.id);
    runWar(game);
    game.updateStats();
    const clone = Game.fromSave(game.toSave(0));
    for (let tick = 0; tick < 30; tick++) {
      game.world.tick++;
      clone.world.tick++;
      runWar(game);
      runWar(clone);
    }
    deepStrictEqual(clone.toSave(0), game.toSave(0));
  });
});
