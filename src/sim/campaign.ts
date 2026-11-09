import { CAMPAIGN_PATH_NODES, CAMPAIGN_MAX_TRAVEL_TICKS } from '../config';
import { BuildingType, type Building, type Civ } from '../world/types';
import { findNavalRouteFrom } from './naval';
import { findPath, type Point } from './pathfind';
import { settlementCenters } from './settlements';
import type { Game } from './game';

interface RouteCache {
  reachability: Game['reachability'];
  paths: Map<string, Point[] | null>;
}
const routes = new WeakMap<Game, RouteCache>();

/** Identical starts/targets share one search. Cache affects cost only, not decisions. */
export function campaignRoute(
  game: Game,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  sourceCivId: number,
  building?: Building,
): Point[] | null {
  let cache = routes.get(game);
  if (!cache || cache.reachability !== game.reachability) {
    cache = { reachability: game.reachability, paths: new Map() };
    routes.set(game, cache);
  }
  const source = game.civs[sourceCivId];
  const key = `${sx}:${sy}:${tx}:${ty}:${sourceCivId}:${building?.id ?? -1}:${source?.centerX}:${source?.centerY}`;
  // Terrain-only results remain valid through forest growth, matching soldiers'
  // uniform travel speed. A reachability refresh invalidates successes and failures.
  if (cache.paths.has(key)) return cache.paths.get(key) ?? null;
  let path = findPath(game.world, sx, sy, tx, ty, CAMPAIGN_PATH_NODES, true);
  if (!path && building) path = findNavalRouteFrom(game, sx, sy, building, sourceCivId);
  if (cache.paths.size >= 2048) cache.paths.clear();
  cache.paths.set(key, path);
  return path;
}

/** Prefer reachable non-housing targets, with a bounded number of route searches. */
export function campaignTarget(
  game: Game,
  civ: Civ,
  enemyId: number,
  sx = civ.centerX,
  sy = civ.centerY,
): Building | null {
  const targets = game.buildings.filter((b) => b.built && b.civ === enemyId);
  const priority = (b: Building): number =>
    b.type === BuildingType.House ? 2 : b.type === BuildingType.TownCenter ? 1 : 0;
  targets.sort(
    (a, b) =>
      priority(a) - priority(b) ||
      Math.hypot(a.x - sx, a.y - sy) - Math.hypot(b.x - sx, b.y - sy) ||
      a.id - b.id,
  );
  for (const target of targets.slice(0, 6)) {
    const path = campaignRoute(
      game,
      Math.floor(sx),
      Math.floor(sy),
      target.x,
      target.y,
      civ.id,
      target,
    );
    if (path !== null) return target;
  }
  return null;
}

/** Route length must leave time to arrive before the no-contact deadline. */
export function canLaunchCampaign(game: Game, a: Civ, b: Civ): boolean {
  const history = game.campaignHistory.find(
    (h) => h.a === Math.min(a.id, b.id) && h.b === Math.max(a.id, b.id),
  );
  if (history && game.year < history.retryAfter) return false;
  return campaignTravelTime(game, a, b) !== null;
}

export function campaignTravelTime(game: Game, a: Civ, b: Civ): number | null {
  for (const [source, enemy] of [
    [a, b],
    [b, a],
  ]) {
    for (const center of settlementCenters(game, source.id)) {
      const target = campaignTarget(game, source, enemy.id, center.x, center.y);
      if (!target) continue;
      const path = campaignRoute(game, center.x, center.y, target.x, target.y, source.id, target);
      const travel = path ? Math.ceil((path.length * Math.SQRT2) / 8) : Infinity;
      if (travel <= CAMPAIGN_MAX_TRAVEL_TICKS) return travel;
    }
  }
  return null;
}
