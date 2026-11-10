import { MAX_COAST_CANDIDATES, SEA_PATH_NODES } from '../config';
import {
  canReachByLandOrSea,
  coastalWaterRegions,
  differentWalkRegions,
  isLandRegion,
  regionAt,
} from '../world/regions';
import { isWater, type Building, type Civ } from '../world/types';
import type { Point } from './pathfind';
import { landRoute, seaRoute, routingWork } from './routing-work';
import { settlementCenters } from './settlements';
import type { Game } from './game';

/**
 * A planned crossing: walk to the departure coast, sail the stored water path,
 * then walk from the landing coast to the target. All coordinates are tile
 * centres when used by movement.
 */
export interface NavalCrossing {
  departure: Point;
  departureWater: Point;
  seaPath: Point[];
  landingWater: Point;
  landing: Point;
  landingPath: Point[];
}

/** A walkable coastal tile and the nearest water tile it touches per shared sea. */
interface CoastCandidate {
  tile: number;
  x: number;
  y: number;
  /** Water region id -> smallest adjacent water tile index in that region. */
  waterByRegion: Map<number, number>;
  distance: number;
}

/** A landing on the target's coast, reached from a known sea. */
interface Landing {
  landingWater: Point;
  landing: Point;
  landingPath: Point[];
}

const COAST_NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * The civ whose army is attacking `target`: the soldier's civ when given, else
 * the opposite side of the war the target's owner is fighting. Returns null
 * when no attacker can be inferred.
 */
function attackerCiv(game: Game, target: Building, sourceCivId?: number): Civ | null {
  if (sourceCivId !== undefined && sourceCivId >= 0) return game.civs[sourceCivId] ?? null;
  const defender = game.civs[target.civ];
  if (!defender || defender.warId < 0) return null;
  const war = game.wars.find((candidate) => candidate.id === defender.warId);
  if (!war) return null;
  const attackerId = war.a === defender.id ? war.b : war.a;
  return game.civs[attackerId] ?? null;
}

const coasts = new WeakMap<
  Game,
  { reach: Game['reachability']; candidates: Map<string, CoastCandidate[]> }
>();

/**
 * Up to MAX_COAST_CANDIDATES walkable coast tiles of `walkRegion`, nearest
 * first, whose adjacent water belongs to one of the `shared` sea regions.
 */
function coastCandidates(
  game: Game,
  walkRegion: number,
  cx: number,
  cy: number,
  shared: ReadonlySet<number>,
): CoastCandidate[] {
  const world = game.world;
  const reach = game.reachability;
  const size = world.size;
  const tiles = reach.coastTilesByWalkRegion.get(walkRegion);
  if (!tiles) return [];
  let cache = coasts.get(game);
  if (!cache || cache.reach !== reach) {
    cache = { reach, candidates: new Map() };
    coasts.set(game, cache);
  }
  const key = `${walkRegion}:${cx}:${cy}:${[...shared].sort((a, b) => a - b).join(',')}`;
  const known = cache.candidates.get(key);
  if (known) return known;
  const candidates: CoastCandidate[] = [];
  for (const tile of tiles) {
    const x = tile % size;
    const y = (tile / size) | 0;
    const distance = (x - cx) ** 2 + (y - cy) ** 2;
    const worst = candidates.at(-1);
    if (
      candidates.length >= MAX_COAST_CANDIDATES &&
      worst &&
      (distance > worst.distance || (distance === worst.distance && tile > worst.tile))
    )
      continue;
    let waterByRegion: Map<number, number> | null = null;
    for (const [dx, dy] of COAST_NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const waterTile = ny * size + nx;
      // Guard against stale reachability after a terrain-shape change.
      if (!isWater(world.terrain[waterTile])) continue;
      const waterRegion = regionAt(world, reach, nx, ny);
      if (!shared.has(waterRegion)) continue;
      if (!waterByRegion) waterByRegion = new Map<number, number>();
      const known = waterByRegion.get(waterRegion);
      if (known === undefined || waterTile < known) waterByRegion.set(waterRegion, waterTile);
    }
    if (!waterByRegion) continue;
    candidates.push({ tile, x, y, waterByRegion, distance });
    candidates.sort((a, b) => a.distance - b.distance || a.tile - b.tile);
    if (candidates.length > MAX_COAST_CANDIDATES) candidates.pop();
  }
  if (cache.candidates.size >= 2048) cache.candidates.clear();
  cache.candidates.set(key, candidates);
  return candidates;
}

/**
 * Pure crossing computation from one land region to the target's land region:
 * nearest coastal departures, nearest coastal landings, then a sea search for
 * each candidate pair. Bounded by MAX_COAST_CANDIDATES^2 water searches.
 */
function buildCrossing(
  game: Game,
  target: Building,
  sourceRegion: number,
  sourceX: number,
  sourceY: number,
): NavalCrossing | null {
  const work = routingWork(game);
  const world = game.world;
  const reach = game.reachability;
  const size = world.size;
  const targetRegion = regionAt(world, reach, target.x, target.y);
  if (sourceRegion === 0 || targetRegion === 0) return null;
  if (!isLandRegion(reach, sourceRegion) || !isLandRegion(reach, targetRegion)) return null;
  if (sourceRegion === targetRegion) return null;

  const targetWater = new Set(coastalWaterRegions(reach, targetRegion));
  const shared = coastalWaterRegions(reach, sourceRegion).filter((id) => targetWater.has(id));
  if (shared.length === 0) return null;
  const sharedSet = new Set(shared);

  const sourceCoasts = coastCandidates(game, sourceRegion, sourceX, sourceY, sharedSet);
  const landingCoasts = coastCandidates(game, targetRegion, target.x, target.y, sharedSet);
  if (sourceCoasts.length === 0 || landingCoasts.length === 0) return null;

  const choices: Array<{
    departure: CoastCandidate;
    landing: CoastCandidate;
    departureWater: Point;
    landingWater: Point;
  }> = [];
  const maxSearches = MAX_COAST_CANDIDATES * MAX_COAST_CANDIDATES;
  for (const departure of sourceCoasts) {
    for (const landing of landingCoasts) {
      for (const waterRegion of shared) {
        const departureWaterTile = departure.waterByRegion.get(waterRegion);
        const landingWaterTile = landing.waterByRegion.get(waterRegion);
        if (departureWaterTile === undefined || landingWaterTile === undefined) continue;
        if (choices.length >= maxSearches) break;
        choices.push({
          departure,
          landing,
          departureWater: { x: departureWaterTile % size, y: (departureWaterTile / size) | 0 },
          landingWater: { x: landingWaterTile % size, y: (landingWaterTile / size) | 0 },
        });
      }
    }
  }
  const key = `${target.id}:${sourceRegion}:${sourceX}:${sourceY}`;
  const first = game.navalProbeCursors.get(key) ?? 0;
  for (let offset = 0; offset < choices.length; offset++) {
    if (work.exhausted) return null;
    const index = (first + offset) % choices.length;
    const { departure, landing, departureWater, landingWater } = choices[index];
    const searchesBefore = work.searches;
    const seaPath = seaRoute(
      game,
      departureWater.x,
      departureWater.y,
      landingWater.x,
      landingWater.y,
    );
    if (work.searches === searchesBefore) return null;
    // Advance only after an actual query. Persisting the cursor lets deferred
    // retries explore later coast pairs, including after a cold load.
    if (game.navalProbeCursors.size >= 2048 && !game.navalProbeCursors.has(key))
      game.navalProbeCursors.clear();
    game.navalProbeCursors.set(key, (index + 1) % choices.length);
    if (!seaPath) continue;
    const landingPath = landRoute(game, landing.x, landing.y, target.x, target.y, SEA_PATH_NODES);
    if (!landingPath) continue;
    return {
      departure: { x: departure.x, y: departure.y },
      departureWater,
      seaPath,
      landingWater,
      landing: { x: landing.x, y: landing.y },
      landingPath,
    };
  }
  return null;
}

/** Nearest landing on the target's coast reachable from `waterRegion`. */
function planLandingFromWater(game: Game, waterRegion: number, target: Building): Landing | null {
  const world = game.world;
  const reach = game.reachability;
  const size = world.size;
  const targetRegion = regionAt(world, reach, target.x, target.y);
  if (targetRegion === 0 || !isLandRegion(reach, targetRegion)) return null;
  const coasts = coastCandidates(game, targetRegion, target.x, target.y, new Set([waterRegion]));
  for (const candidate of coasts) {
    const waterTile = candidate.waterByRegion.get(waterRegion);
    if (waterTile === undefined) continue;
    const landingPath = landRoute(
      game,
      candidate.x,
      candidate.y,
      target.x,
      target.y,
      SEA_PATH_NODES,
    );
    if (!landingPath) continue;
    return {
      landingWater: { x: waterTile % size, y: (waterTile / size) | 0 },
      landing: { x: candidate.x, y: candidate.y },
      landingPath,
    };
  }
  return null;
}

/**
 * Builds (or returns the cached) crossing plan for a soldier target. The plan
 * is derived from terrain only and cached on the game (never saved); it is
 * keyed by target id and the walk region the attack departs from.
 */
export function planNavalCrossing(
  game: Game,
  target: Building,
  sourceCivId?: number,
): NavalCrossing | null {
  const work = routingWork(game);
  if (!game.buildingById.has(target.id)) return null;
  const sourceCiv = attackerCiv(game, target, sourceCivId);
  if (!sourceCiv?.alive) return null;
  const sourceRegion = regionAt(
    game.world,
    game.reachability,
    sourceCiv.centerX,
    sourceCiv.centerY,
  );
  const key = `${target.id}:${sourceRegion}:${sourceCiv.centerX}:${sourceCiv.centerY}`;
  if (game.navalPlans.has(key)) return game.navalPlans.get(key) ?? null;
  const plan = buildCrossing(game, target, sourceRegion, sourceCiv.centerX, sourceCiv.centerY);
  if (!work.exhausted) game.navalPlans.set(key, plan);
  return plan;
}

/** Cached crossing from the given land region, used when the capital plan misses. */
function planFromRegion(
  game: Game,
  target: Building,
  sourceRegion: number,
  sourceX: number,
  sourceY: number,
): NavalCrossing | null {
  const work = routingWork(game);
  const key = `${target.id}:${sourceRegion}:${sourceX}:${sourceY}`;
  if (game.navalPlans.has(key)) return game.navalPlans.get(key) ?? null;
  const plan = buildCrossing(game, target, sourceRegion, sourceX, sourceY);
  if (!work.exhausted) game.navalPlans.set(key, plan);
  return plan;
}

function landLegRoute(game: Game, sx: number, sy: number, plan: NavalCrossing): Point[] | null {
  const landPath = landRoute(game, sx, sy, plan.departure.x, plan.departure.y, SEA_PATH_NODES);
  if (!landPath) return null;
  return [...landPath, plan.departureWater, ...plan.seaPath, plan.landing, ...plan.landingPath];
}

function seaLegRoute(game: Game, sx: number, sy: number, landing: Landing): Point[] | null {
  const seaPath = seaRoute(game, sx, sy, landing.landingWater.x, landing.landingWater.y);
  if (!seaPath) return null;
  return [...seaPath, landing.landing, ...landing.landingPath];
}

/**
 * Full route for one soldier: land leg + sea leg + landing leg. Returns null
 * when the soldier is already on the target's landmass or no crossing exists.
 * The first point of the returned route is adjacent to the soldier's tile.
 *
 * Soldiers cut off from their capital (for example after a peace treaty leaves
 * them on the enemy shore) fall back to a crossing planned from their own land
 * region or the sea they are drifting in.
 */
export function findNavalRoute(
  game: Game,
  soldierId: number,
  target: Building,
  _targetKey: number,
): Point[] | null {
  const agents = game.agents;
  if (agents.alive[soldierId] === 0) return null;
  return findNavalRouteFrom(
    game,
    Math.floor(agents.x[soldierId]),
    Math.floor(agents.y[soldierId]),
    target,
    agents.civ[soldierId],
  );
}

/** Same route used to verify a campaign before soldiers are committed. */
export function findNavalRouteFrom(
  game: Game,
  sx: number,
  sy: number,
  target: Building,
  sourceCivId: number,
): Point[] | null {
  if (!game.buildingById.has(target.id)) return null;
  const world = game.world;
  const reach = game.reachability;
  if (sx < 0 || sy < 0 || sx >= world.size || sy >= world.size) return null;
  const soldierRegion = regionAt(world, reach, sx, sy);
  const onWater = isWater(world.terrain[sy * world.size + sx]);
  if (!onWater && !differentWalkRegions(reach, world, sx, sy, target.x, target.y)) return null;

  const plan = planNavalCrossing(game, target, sourceCivId);
  if (onWater) {
    if (
      plan &&
      regionAt(world, reach, plan.landingWater.x, plan.landingWater.y) === soldierRegion
    ) {
      return seaLegRoute(game, sx, sy, plan);
    }
    const landing = planLandingFromWater(game, soldierRegion, target);
    if (!landing) return null;
    return seaLegRoute(game, sx, sy, landing);
  }

  if (soldierRegion === 0) return null;
  if (plan && regionAt(world, reach, plan.departure.x, plan.departure.y) === soldierRegion) {
    return landLegRoute(game, sx, sy, plan);
  }
  const sourceCiv = game.civs[sourceCivId];
  if (
    !plan &&
    sourceCiv &&
    regionAt(world, reach, sourceCiv.centerX, sourceCiv.centerY) === soldierRegion
  )
    return null;
  const fallback = planFromRegion(game, target, soldierRegion, sx, sy);
  if (!fallback) return null;
  return landLegRoute(game, sx, sy, fallback);
}

/** False when two factions share no land or coastal-water connection. */
export function canReachCivs(game: Game, a: Civ, b: Civ): boolean {
  const centersA = settlementCenters(game, a.id);
  const centersB = settlementCenters(game, b.id);
  // Unknown territory: keep diplomacy flowing rather than freezing a faction.
  if (centersA.length === 0 || centersB.length === 0) return true;
  for (const aCenter of centersA) {
    for (const bCenter of centersB) {
      if (
        canReachByLandOrSea(
          game.reachability,
          game.world,
          aCenter.x,
          aCenter.y,
          bCenter.x,
          bCenter.y,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}
