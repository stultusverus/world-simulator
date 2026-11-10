import {
  CAMPAIGN_PATH_NODES,
  CAMPAIGN_MAX_TRAVEL_TICKS,
  CAMPAIGN_PROBES_PER_CHECK,
  CAMPAIGN_CHECK_RETRY_TICKS,
} from '../config';
import { regionAt, isLandRegion } from '../world/regions';
import { BuildingType, type Building, type Civ } from '../world/types';
import { findNavalRouteFrom } from './naval';
import type { Point } from './pathfind';
import { routingWork, landRoute } from './routing-work';
import { settlementCenters } from './settlements';
import type { Game } from './game';

interface RouteCache {
  reachability: Game['reachability'];
  year: number;
  paths: Map<string, Point[] | null>;
}
const routes = new WeakMap<Game, RouteCache>();

/** Identical starts/targets share one search within a simulation year. */
export function campaignRoute(
  game: Game,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  sourceCivId: number,
  building?: Building,
): Point[] | null {
  const work = routingWork(game);
  let cache = routes.get(game);
  if (!cache || cache.reachability !== game.reachability || cache.year !== game.year) {
    cache = { reachability: game.reachability, year: game.year, paths: new Map() };
    routes.set(game, cache);
  }
  const source = game.civs[sourceCivId];
  const key = `${sx}:${sy}:${tx}:${ty}:${sourceCivId}:${building?.id ?? -1}:${source?.centerX}:${source?.centerY}`;
  // Terrain-only results remain valid through forest growth, matching soldiers'
  // uniform travel speed. A reachability refresh invalidates successes and failures.
  if (cache.paths.has(key)) return cache.paths.get(key) ?? null;
  const sourceRegion = regionAt(game.world, game.reachability, sx, sy);
  const targetRegion = regionAt(game.world, game.reachability, tx, ty);
  let path: Point[] | null = null;
  if (
    sourceRegion &&
    sourceRegion === targetRegion &&
    isLandRegion(game.reachability, sourceRegion)
  )
    path = landRoute(game, sx, sy, tx, ty, CAMPAIGN_PATH_NODES);
  else if (building) path = findNavalRouteFrom(game, sx, sy, building, sourceCivId);
  if (!work.exhausted) {
    if (cache.paths.size >= 2048) cache.paths.clear();
    cache.paths.set(key, path);
  }

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
  const targets = targetCandidates(game, enemyId, sx, sy);
  for (const target of targets) {
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
    if (routingWork(game).exhausted) break;
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

function targetCandidates(game: Game, enemyId: number, sx: number, sy: number): Building[] {
  const priority = (b: Building): number =>
    b.type === BuildingType.House ? 2 : b.type === BuildingType.TownCenter ? 1 : 0;
  return game.buildings
    .filter((b) => b.built && b.civ === enemyId)
    .sort(
      (a, b) =>
        priority(a) - priority(b) ||
        Math.hypot(a.x - sx, a.y - sy) - Math.hypot(b.x - sx, b.y - sy) ||
        a.id - b.id,
    )
    .slice(0, 6);
}

export function campaignTravelTime(game: Game, a: Civ, b: Civ): number | null {
  const pairA = Math.min(a.id, b.id),
    pairB = Math.max(a.id, b.id);
  let check = game.campaignVerifications.find((c) => c.a === pairA && c.b === pairB);
  if (!check) {
    check = {
      a: pairA,
      b: pairB,
      sourceCenter: -1,
      target: -1,
      travel: -1,
      nextCandidate: 0,
      retryAfter: 0,
    };
    game.campaignVerifications.push(check);
  }
  if (check.travel >= 0) {
    const source = game.buildingById.get(check.sourceCenter),
      target = game.buildingById.get(check.target);
    if (
      source?.built &&
      source.type === BuildingType.TownCenter &&
      target?.built &&
      [a.id, b.id].includes(source.civ) &&
      [a.id, b.id].includes(target.civ) &&
      source.civ !== target.civ
    )
      return check.travel;
    check.travel = -1;
    check.sourceCenter = -1;
    check.target = -1;
    check.retryAfter = 0;
  }
  if (game.year < check.retryAfter) return null;
  const work = routingWork(game);
  if (work.exhausted) return null;
  const candidates: Array<{ source: Civ; center: Building; target: Building }> = [];
  for (const [source, enemy] of [
    [a, b],
    [b, a],
  ])
    for (const center of settlementCenters(game, source.id))
      for (const target of targetCandidates(game, enemy.id, center.x, center.y))
        candidates.push({ source, center, target });
  if (!candidates.length) return null;
  for (let probe = 0; probe < Math.min(CAMPAIGN_PROBES_PER_CHECK, candidates.length); probe++) {
    const candidate = candidates[check.nextCandidate % candidates.length];
    check.nextCandidate = (check.nextCandidate + 1) % candidates.length;
    const { source, center, target } = candidate;
    const path = campaignRoute(game, center.x, center.y, target.x, target.y, source.id, target);
    const travel = path ? Math.ceil((path.length * Math.SQRT2) / 8) : Infinity;
    if (travel <= CAMPAIGN_MAX_TRAVEL_TICKS) {
      check.sourceCenter = center.id;
      check.target = target.id;
      check.travel = travel;
      check.retryAfter = 0;
      return travel;
    }
    if (work.exhausted) break;
  }
  check.retryAfter = game.year + (work.exhausted ? 1 : CAMPAIGN_CHECK_RETRY_TICKS);
  return null;
}
