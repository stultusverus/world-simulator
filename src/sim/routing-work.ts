import { ROUTE_NODES_PER_TICK, ROUTE_SEARCHES_PER_TICK, SEA_PATH_NODES } from '../config';
import { findPath, findSeaPath, type SearchBudget, type Point } from './pathfind';
import type { Game } from './game';

export interface RoutingWork extends SearchBudget {
  searches: number;
  landSearches: number;
  seaSearches: number;
}
interface TickWork {
  year: number;
  reach: Game['reachability'];
  work: RoutingWork;
}
const ticks = new WeakMap<Game, TickWork>();

/** Tick-local caches make cold-load and warm-game work scheduling identical. */
export function routingWork(game: Game): RoutingWork {
  let tick = ticks.get(game);
  if (!tick || tick.year !== game.year || tick.reach !== game.reachability) {
    tick = {
      year: game.year,
      reach: game.reachability,
      work: {
        remaining: ROUTE_NODES_PER_TICK,
        expanded: 0,
        exhausted: false,
        searches: 0,
        landSearches: 0,
        seaSearches: 0,
      },
    };
    ticks.set(game, tick);
    game.navalPlans.clear();
  }
  return tick.work;
}

function claim(work: RoutingWork): boolean {
  if (work.exhausted || work.remaining <= 0 || work.searches >= ROUTE_SEARCHES_PER_TICK) {
    work.exhausted = true;
    return false;
  }
  work.searches++;
  return true;
}

export function landRoute(
  game: Game,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  maxNodes: number,
): Point[] | null {
  const work = routingWork(game);
  if (!claim(work)) return null;
  work.landSearches++;
  return findPath(game.world, sx, sy, tx, ty, maxNodes, true, work);
}

export function seaRoute(
  game: Game,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): Point[] | null {
  const work = routingWork(game);
  if (!claim(work)) return null;
  work.seaSearches++;
  return findSeaPath(game.world, sx, sy, tx, ty, SEA_PATH_NODES, work);
}
