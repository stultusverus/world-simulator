import {
  BUILDING_DEFS,
  MAX_MIGRANTS_PER_RUN,
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
    .filter(
      (building) =>
        building.civ === civId && building.type === BuildingType.TownCenter && building.built,
    )
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
  labourers: number;
  idleAdults: number;
}

/** Per-settlement population, housing, labour and idle counts (all derived). */
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
  let labourers = 0;
  let idleAdults = 0;
  for (let id = 0; id < agents.capacity; id += 1) {
    if (agents.alive[id] !== 1 || agents.civ[id] !== civId) continue;
    const home = game.buildingById.get(agents.home[id]);
    const x = home ? home.x : agents.x[id];
    const y = home ? home.y : agents.y[id];
    if (nearestCenter(game, civId, x, y, centers)?.id !== center.id) continue;
    residents += 1;
    if (agents.age[id] < 14) continue;
    if (agents.job[id] === Job.Laborer) labourers += 1;
    else if (agents.job[id] === Job.Idle) idleAdults += 1;
  }
  return { center, residents, housing, buildings, labourers, idleAdults };
}

/** Move households toward vacant housing, prioritising overcrowded settlements. */
export function runMigration(game: Game): void {
  if (game.world.tick % 8 !== 0) return;
  const agents = game.agents;
  for (const civ of game.civs) {
    if (!civ.alive) continue;
    const centers = settlementCenters(game, civ.id);
    if (centers.length < 2) continue;
    const stats = centers.map((center) => settlementStats(game, civ.id, center, centers));
    const sourceOf = new Map<number, number>();
    const children = new Map<number, number[]>();
    const residents: number[] = [];
    for (let id = 0; id < agents.capacity; id += 1) {
      if (!agents.alive[id] || agents.civ[id] !== civ.id) continue;
      const home = game.buildingById.get(agents.home[id]);
      const center = nearestCenter(
        game,
        civ.id,
        home?.x ?? agents.x[id],
        home?.y ?? agents.y[id],
        centers,
      );
      if (!center) continue;
      sourceOf.set(id, center.id);
      residents.push(id);
      if (agents.age[id] >= 16) continue;
      for (const parent of [agents.mother[id], agents.father[id]]) {
        if (parent === NO_AGENT) continue;
        const list = children.get(parent) ?? [];
        list.push(id);
        children.set(parent, list);
      }
    }
    const movedIds = new Set<number>();
    const household = (id: number, sourceId: number): number[] | null => {
      const members = new Set<number>([id]);
      const queue = [id];
      for (let index = 0; index < queue.length; index += 1) {
        const member = queue[index];
        if (agents.job[member] === Job.Soldier || movedIds.has(member)) return null;
        const links = [...(children.get(member) ?? [])];
        const partner = agents.partner[member];
        if (partner !== NO_AGENT && agents.alive[partner] && sourceOf.get(partner) === sourceId)
          links.push(partner);
        // Dependent siblings stay with both of their resident parents.
        if (agents.age[member] < 16) links.push(agents.mother[member], agents.father[member]);
        for (const linked of links) {
          if (sourceOf.get(linked) !== sourceId || members.has(linked)) continue;
          members.add(linked);
          queue.push(linked);
        }
      }
      return [...members];

    };
    let moved = 0;
    let changed = true;
    while (changed && moved < MAX_MIGRANTS_PER_RUN) {
      changed = false;
      const destinations = [...stats].sort(
        (a, b) =>
          a.residents / Math.max(1, a.housing) - b.residents / Math.max(1, b.housing) ||
          a.center.id - b.center.id,
      );
      for (const destination of destinations) {
        if (destination.housing <= destination.residents) continue;
        const sources = [...stats].sort(
          (a, b) =>
            b.residents - b.housing - (a.residents - a.housing) || a.center.id - b.center.id,
        );
        let selected: { source: SettlementStats; members: number[] } | null = null;
        for (const source of sources) {
          if (source.center.id === destination.center.id) continue;
          if (
            regionAt(game.world, game.reachability, source.center.x, source.center.y) !==
            regionAt(game.world, game.reachability, destination.center.x, destination.center.y)
          )
            continue;
          if (
            source.residents / Math.max(1, source.housing) <=
            destination.residents / Math.max(1, destination.housing) + 0.15
          )
            continue;
          for (const id of residents) {
            if (sourceOf.get(id) !== source.center.id || agents.age[id] < 16 || movedIds.has(id))
              continue;
            if (
              source.residents <= source.housing &&
              agents.job[id] !== Job.Laborer &&
              agents.job[id] !== Job.Idle
            )
              continue;
            const members = household(id, source.center.id);
            if (
              !members ||
              members.length > MAX_MIGRANTS_PER_RUN - moved ||
              members.length > destination.housing - destination.residents
            )
              continue;
            // Do not reverse the occupancy imbalance with an oversized family.
            if (
              (source.residents - members.length) / Math.max(1, source.housing) <
              (destination.residents + members.length) / Math.max(1, destination.housing)
            )
              continue;
            selected = { source, members };
            break;
          }
          if (selected) break;
        }
        if (!selected) continue;
        const houses = game.buildings.filter(
          (b) =>
            b.civ === civ.id &&
            b.built &&
            b.type === BuildingType.House &&
            nearestCenter(game, civ.id, b.x, b.y, centers)?.id === destination.center.id,
        );
        for (const id of selected.members) {
          const home = houses.length ? houses[moved % houses.length] : destination.center;
          agents.home[id] = home.id;
          agents.job[id] = agents.age[id] < 14 ? Job.Idle : Job.Laborer;
          agents.work[id] = NO_BUILDING;
          agents.state[id] = agents.age[id] < 14 ? AgentState.Idle : AgentState.Working;
          const spot = tryFindWalkableNear(game.world, home.x, home.y, 2) ?? home;
          agents.x[id] = spot.x + 0.5;
          agents.y[id] = spot.y + 0.5;
          sourceOf.set(id, destination.center.id);
          movedIds.add(id);
          moved += 1;
        }
        selected.source.residents -= selected.members.length;
        destination.residents += selected.members.length;
        changed = true;
      }
    }
  }
}

/** A locally crowded settlement with room to add housing. */
export function crowdedConstructionCenter(game: Game, civ: Civ): Building | null {
  const centers = settlementCenters(game, civ.id);
  const cap = settlementCap(civ);
  const crowded = centers
    .map((center) => settlementStats(game, civ.id, center, centers))
    .filter(
      (s) => s.residents > s.housing && countSettlementBuildings(game, civ.id, s.center) < cap,
    )
    .sort(
      (a, b) => b.residents - b.housing - (a.residents - a.housing) || a.center.id - b.center.id,
    );
  return crowded[0]?.center ?? null;
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

function moveSettlersTo(
  game: Game,
  civ: Civ,
  site: SpawnSite,
  center: Building,
  houses: Building[],
): void {
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
    agents.job[id] = Job.Laborer;
    agents.work[id] = NO_BUILDING;
    agents.state[id] = AgentState.Working;
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
 * Factions whose cities are large enough may expand into a new settlement.
 * Expansion is population-gated (250 people per existing centre), so a faction
 * can reach its fourth city without first filling every building slot.
 * Checked on a slow, deterministic cadence to stay cheap.
 */
export function runSettlements(game: Game): void {
  if (game.world.tick % 4 !== 0) return;
  for (const civ of game.civs) {
    if (!civ.alive) continue;
    if (game.buildings.some((building) => building.civ === civ.id && !building.built)) continue;
    const centers = settlementCenters(game, civ.id);
    if (centers.length === 0 || centers.length >= MAX_SETTLEMENTS_PER_CIV) continue;
    if (civ.population < NEW_SETTLEMENT_MIN_POP * centers.length) continue;
    if (civ.materials < NEW_SETTLEMENT_COST) continue;
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
