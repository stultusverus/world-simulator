import {
  BUILDING_DEFS,
  MAX_SETTLEMENTS_PER_CIV,
  NEW_SETTLEMENT_COST,
  NEW_SETTLEMENT_MAX_GAP,
  NEW_SETTLEMENT_MIN_GAP,
  NEW_SETTLEMENT_MIN_POP,
  SETTLEMENT_TIERS,
  settlementTier,
} from '../config';
import { regionAt } from '../world/regions';
import {
  AgentState,
  BuildingType,
  Job,
  NO_AGENT,
  NO_BUILDING,
  NO_OWNER,
  type Building,
  type Civ,
  type SpawnSite,
} from '../world/types';
import { countLandAround, tryFindWalkableNear } from '../world/world';
import { makeSettlementName } from './names';
import type { Game } from './game';

export function settlementCenters(game: Game, civId: number): Building[] {
  return game.buildings
    .filter((building) => building.civ === civId && building.type === BuildingType.TownCenter && building.built)
    .sort((a, b) => a.id - b.id);
}

export function settlementCap(civ: Civ): number {
  return SETTLEMENT_TIERS[settlementTier(civ.population)].maxBuildings;
}

export function totalBuildingCapacity(game: Game, civ: Civ): number {
  return settlementCenters(game, civ.id).length * settlementCap(civ);
}

export function nearestCenter(
  game: Game,
  civId: number,
  x: number,
  y: number,
  centers: readonly Building[] = settlementCenters(game, civId),
): Building | null {
  let best: Building | null = null;
  let bestDistance = Infinity;
  for (const center of centers) {
    const distance = Math.hypot(center.x - x, center.y - y);
    if (distance < bestDistance || (distance === bestDistance && best !== null && center.id < best.id)) {
      best = center;
      bestDistance = distance;
    }
  }
  return best;
}

export function countSettlementBuildings(game: Game, civId: number, center: Building): number {
  const centers = settlementCenters(game, civId);
  let count = 0;
  for (const building of game.buildings) {
    if (building.civ !== civId) continue;
    const nearest = nearestCenter(game, civId, building.x, building.y, centers);
    if (nearest?.id === center.id) count += 1;
  }
  return count;
}

export interface SettlementStats {
  center: Building;
  residents: number;
  housing: number;
  buildings: number;
  idleAdults: number;
}

/** Per-settlement population, housing and idle labour (all derived). */
export function settlementStats(
  game: Game,
  civId: number,
  center: Building,
  centers: readonly Building[] = settlementCenters(game, civId),
): SettlementStats {
  let housing = 0;
  let buildings = 0;
  for (const building of game.buildings) {
    if (building.civ !== civId || !building.built) continue;
    if (nearestCenter(game, civId, building.x, building.y, centers)?.id !== center.id) continue;
    buildings += 1;
    housing += BUILDING_DEFS[building.type].housing;
  }
  const agents = game.agents;
  let residents = 0;
  let idleAdults = 0;
  for (let id = 0; id < agents.capacity; id += 1) {
    if (agents.alive[id] !== 1 || agents.civ[id] !== civId) continue;
    const home = game.buildingById.get(agents.home[id]);
    const x = home ? home.x : agents.x[id];
    const y = home ? home.y : agents.y[id];
    if (nearestCenter(game, civId, x, y, centers)?.id !== center.id) continue;
    residents += 1;
    if (agents.age[id] >= 16 && agents.job[id] === Job.Idle) idleAdults += 1;
  }
  return { center, residents, housing, buildings, idleAdults };
}

/**
 * Moves a few idle adults (and couples when possible) from crowded settlements
 * into settlements with vacant housing. Without this, new cities are built but
 * never populated and their farms cannot be staffed.
 */
export function runMigration(game: Game): void {
  if (game.world.tick % 8 !== 0) return;
  const agents = game.agents;
  for (const civ of game.civs) {
    if (!civ.alive) continue;
    const centers = settlementCenters(game, civ.id);
    if (centers.length < 2) continue;
    const stats = centers.map((center) => settlementStats(game, civ.id, center, centers));
    const destinations = stats
      .filter((entry) => entry.housing - entry.residents >= 4)
      .sort((a, b) => b.housing - b.residents - (a.housing - a.residents) || a.center.id - b.center.id);
    if (destinations.length === 0) continue;
    const sources = stats
      .filter((entry) => entry.idleAdults >= 2)
      .sort((a, b) => b.idleAdults - a.idleAdults || a.center.id - b.center.id);
    if (sources.length === 0) continue;

    const candidates: Array<{ id: number; centerId: number }> = [];
    for (let id = 0; id < agents.capacity; id += 1) {
      if (agents.alive[id] !== 1 || agents.civ[id] !== civ.id) continue;
      if (agents.age[id] < 16 || agents.job[id] !== Job.Idle) continue;
      const home = game.buildingById.get(agents.home[id]);
      const x = home ? home.x : agents.x[id];
      const y = home ? home.y : agents.y[id];
      const center = nearestCenter(game, civ.id, x, y, centers);
      if (center) candidates.push({ id, centerId: center.id });
    }

    const houseFor = (center: Building): Building | null => {
      let best: Building | null = null;
      let bestDistance = Infinity;
      for (const building of game.buildings) {
        if (building.civ !== civ.id || !building.built || building.type !== BuildingType.House) continue;
        if (nearestCenter(game, civ.id, building.x, building.y, centers)?.id !== center.id) continue;
        const distance = Math.hypot(building.x - center.x, building.y - center.y);
        if (distance < bestDistance) {
          best = building;
          bestDistance = distance;
        }
      }
      return best;
    };

    let moved = 0;
    const movedIds = new Set<number>();
    const move = (id: number, destination: Building): void => {
      const house = houseFor(destination) ?? destination;
      agents.home[id] = house.id;
      agents.job[id] = Job.Idle;
      agents.work[id] = NO_BUILDING;
      agents.state[id] = AgentState.Idle;
      const spot = tryFindWalkableNear(game.world, house.x, house.y, 2) ?? { x: house.x, y: house.y };
      agents.x[id] = spot.x + 0.5;
      agents.y[id] = spot.y + 0.5;
      movedIds.add(id);
      moved += 1;
    };

    for (const destination of destinations) {
      if (moved >= 2) break;
      for (const source of sources) {
        if (moved >= 2 || source.center.id === destination.center.id) continue;
        for (const candidate of candidates) {
          if (moved >= 2) break;
          if (candidate.centerId !== source.center.id || movedIds.has(candidate.id)) continue;
          move(candidate.id, destination.center);
          const partner = agents.partner[candidate.id];
          if (
            moved < 2 &&
            partner !== NO_AGENT &&
            agents.alive[partner] === 1 &&
            agents.civ[partner] === civ.id &&
            !movedIds.has(partner) &&
            agents.age[partner] >= 16 &&
            agents.job[partner] === Job.Idle
          ) {
            const home = game.buildingById.get(agents.home[partner]);
            const x = home ? home.x : agents.x[partner];
            const y = home ? home.y : agents.y[partner];
            if (nearestCenter(game, civ.id, x, y, centers)?.id === source.center.id) {
              move(partner, destination.center);
            }
          }
        }
      }
    }
  }
}

/** Centre with the most room, so construction spreads across settlements. */
export function pickConstructionCenter(game: Game, civ: Civ): Building | null {
  const centers = settlementCenters(game, civ.id);
  if (centers.length === 0) return null;
  const cap = settlementCap(civ);
  let best: Building | null = null;
  let bestCount = Infinity;
  for (const center of centers) {
    const count = countSettlementBuildings(game, civ.id, center);
    if (count >= cap) continue;
    if (count < bestCount) {
      best = center;
      bestCount = count;
    }
  }
  return best;
}

export function settlementName(game: Game, civId: number, center: Building): string {
  return makeSettlementName(game.world.seedText, civId, center.id);
}

function hasBuildingNear(game: Game, x: number, y: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const index = (y + dy) * game.world.size + (x + dx);
      if (game.buildingAt.has(index)) return true;
    }
  }
  return false;
}

/**
 * Deterministic search for a new settlement site around an existing centre.
 * Requires land connected to the parent city and clear of other factions.
 */
export function findNewSettlementSite(game: Game, civ: Civ): SpawnSite | null {
  const ownCenters = settlementCenters(game, civ.id);
  if (ownCenters.length === 0) return null;
  const foreignCenters: Building[] = [];
  for (const other of game.civs) {
    if (other.id === civ.id || !other.alive) continue;
    foreignCenters.push(...settlementCenters(game, other.id));
  }

  const size = game.world.size;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const base = ownCenters[game.rng.int(0, ownCenters.length - 1)];
    const angle = game.rng.next() * Math.PI * 2;
    const radius = NEW_SETTLEMENT_MIN_GAP + game.rng.next() * (NEW_SETTLEMENT_MAX_GAP - NEW_SETTLEMENT_MIN_GAP);
    const x = Math.round(base.x + Math.cos(angle) * radius);
    const y = Math.round(base.y + Math.sin(angle) * radius);
    if (x < 8 || y < 8 || x >= size - 8 || y >= size - 8) continue;
    if (countLandAround(game.world, x, y, 4) < 36) continue;

    const region = regionAt(game.world, game.reachability, x, y);
    const baseRegion = regionAt(game.world, game.reachability, base.x, base.y);
    if (region === 0 || region !== baseRegion) continue;

    const index = y * size + x;
    const owner = game.world.owner[index];
    if (owner !== NO_OWNER && owner !== civ.id) continue;
    if (hasBuildingNear(game, x, y, 2)) continue;

    let valid = true;
    for (const center of ownCenters) {
      if (Math.hypot(center.x - x, center.y - y) < NEW_SETTLEMENT_MIN_GAP) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    for (const center of foreignCenters) {
      if (Math.hypot(center.x - x, center.y - y) < 24) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    return { x, y };
  }
  return null;
}

function moveSettlersTo(game: Game, civ: Civ, site: SpawnSite, center: Building, houses: Building[]): void {
  const agents = game.agents;
  const homes = houses.length > 0 ? houses : [center];
  const moved = new Set<number>();
  const isEligible = (id: number): boolean => {
    if (agents.alive[id] === 0 || agents.civ[id] !== civ.id) return false;
    if (agents.job[id] === Job.Soldier) return false;
    if (agents.age[id] < 18 || agents.age[id] > 50) return false;
    return !moved.has(id);
  };
  const move = (id: number): void => {
    const home = homes[moved.size % homes.length];
    agents.home[id] = home.id;
    agents.job[id] = Job.Idle;
    agents.work[id] = NO_BUILDING;
    agents.state[id] = AgentState.Idle;
    const spot = tryFindWalkableNear(game.world, home.x, home.y, 2) ?? site;
    agents.x[id] = spot.x + 0.5;
    agents.y[id] = spot.y + 0.5;
    moved.add(id);
  };

  for (let id = 0; id < agents.capacity && moved.size < 8; id += 1) {
    if (!isEligible(id)) continue;
    move(id);
    const partner = agents.partner[id];
    if (moved.size < 8 && partner !== NO_AGENT && isEligible(partner)) move(partner);
  }
}

/**
 * Founds a new settlement for a faction: one town centre, two houses, two
 * farms, and up to eight relocated adults. Returns the new centre.
 */
export function foundNewSettlement(game: Game, civ: Civ, site: SpawnSite): Building | null {
  if (!civ.alive || civ.materials < NEW_SETTLEMENT_COST) return null;
  if (settlementCenters(game, civ.id).length >= MAX_SETTLEMENTS_PER_CIV) return null;

  civ.materials -= NEW_SETTLEMENT_COST;
  const center = game.addBuilding(civ.id, BuildingType.TownCenter, site.x, site.y, true);
  const houses: Building[] = [];
  for (let i = 0; i < 2; i += 1) {
    const spot = game.findBuildingSpot(civ, BuildingType.House, 2, 5, site);
    if (spot) houses.push(game.addBuilding(civ.id, BuildingType.House, spot.x, spot.y, true));
  }
  for (let i = 0; i < 2; i += 1) {
    const spot = game.findBuildingSpot(civ, BuildingType.Farm, 3, 7, site);
    if (spot) game.addBuilding(civ.id, BuildingType.Farm, spot.x, spot.y, true);
  }

  moveSettlersTo(game, civ, site, center, houses);
  const name = settlementName(game, civ.id, center);
  game.addChronicle('society', `${civ.name} found ${name}.`, civ.id, site.x, site.y);
  game.ownershipDirty = true;
  game.updateStats();
  return center;
}

/**
 * Factions whose cities are full or crowded may expand into a new settlement.
 * Checked on a slow, deterministic cadence to stay cheap.
 */
export function runSettlements(game: Game): void {
  if (game.world.tick % 4 !== 0) return;
  for (const civ of game.civs) {
    if (!civ.alive) continue;
    if (game.buildings.some((building) => building.civ === civ.id && !building.built)) continue;
    const centers = settlementCenters(game, civ.id);
    if (centers.length === 0 || centers.length >= MAX_SETTLEMENTS_PER_CIV) continue;
    // Each existing city must be genuinely large before the faction expands,
    // so the first settlement becomes a real Metropolis rather than a hamlet.
    if (civ.population < NEW_SETTLEMENT_MIN_POP * centers.length) continue;
    if (civ.materials < NEW_SETTLEMENT_COST) continue;
    const capacity = centers.length * settlementCap(civ);
    const buildingCount = game.buildings.filter((building) => building.civ === civ.id).length;
    // Expand only when the existing cities are actually full: either housing is
    // tight or every building slot has been used (also covers overbuilt saves).
    const crowded = civ.housing - civ.population <= 4;
    if (!crowded && buildingCount < capacity) continue;
    const site = findNewSettlementSite(game, civ);
    if (site) foundNewSettlement(game, civ, site);
  }
}

/** Moves the civ's anchor to the lowest-id surviving town centre. */
export function ensureCivCenter(game: Game, civ: Civ): void {
  const centers = settlementCenters(game, civ.id);
  if (centers.length === 0) return;
  civ.centerX = centers[0].x;
  civ.centerY = centers[0].y;
}
