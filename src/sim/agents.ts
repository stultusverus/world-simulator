import {
  BIRTH_BASE_CHANCE,
  BUILDING_DEFS,
  MAX_BIRTHS_PER_TICK,
  STARVATION_HEALTH_LOSS,
} from '../config';
import {
  AgentState,
  BuildingType,
  Job,
  NO_AGENT,
  NO_BUILDING,
  type Building,
  type Civ,
} from '../world/types';
import { tryFindWalkableNear } from '../world/world';
import { nearestCenter, settlementCenters } from './settlements';
import type { Game } from './game';

function jitter(id: number, salt: number): number {
  const value = Math.sin((id + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value) - 0.5;
}

function placeAgent(game: Game, id: number, x: number, y: number): void {
  const spot = tryFindWalkableNear(game.world, Math.round(x), Math.round(y), 2);
  if (!spot) return;
  game.agents.x[id] = spot.x + 0.5 + jitter(id, 1) * 0.6;
  game.agents.y[id] = spot.y + 0.5 + jitter(id, 2) * 0.6;
}

function placeNearBuilding(game: Game, id: number, building: Building | undefined, civ: Civ): void {
  if (building) placeAgent(game, id, building.x, building.y);
  else placeAgent(game, id, civ.centerX, civ.centerY);
}

function countCivAgents(game: Game, civId: number): number {
  let count = 0;
  const agents = game.agents;
  for (let id = 0; id < agents.capacity; id += 1) {
    if (agents.alive[id] === 1 && agents.civ[id] === civId) count += 1;
  }
  return count;
}

function countCivJob(game: Game, civId: number, job: Job): number {
  let count = 0;
  const agents = game.agents;
  for (let id = 0; id < agents.capacity; id += 1) {
    if (agents.alive[id] === 1 && agents.civ[id] === civId && agents.job[id] === job) count += 1;
  }
  return count;
}

/** Work buildings and civilian adults belonging to the same settlement. */
interface SettlementGroup {
  /** Nearest built town centre, or null when the faction has no centre yet. */
  center: Building | null;
  farms: Building[];
  workshops: Building[];
  temples: Building[];
  /** Markets, universities and monuments; staffed by artisans (Job.Worker). */
  civic: Building[];
  adults: number[];
}

function emptySettlementGroup(center: Building | null): SettlementGroup {
  return { center, farms: [], workshops: [], temples: [], civic: [], adults: [] };
}

/**
 * Buckets a faction's built buildings and civilian adults by their nearest town
 * centre, so residents of a new settlement prefer to work and idle in their own
 * city; the caller fills any remaining open slots from other settlements.
 */
function groupBySettlement(
  game: Game,
  civ: Civ,
  built: readonly Building[],
  adults: readonly number[],
): SettlementGroup[] {
  const centers = settlementCenters(game, civ.id);
  const groups: SettlementGroup[] = centers.map((center) => emptySettlementGroup(center));
  const byCenterId = new Map<number, SettlementGroup>();
  for (let i = 0; i < centers.length; i += 1) byCenterId.set(centers[i].id, groups[i]);
  let fallback: SettlementGroup | null = null;
  const fallbackGroup = (): SettlementGroup => {
    if (!fallback) {
      fallback = emptySettlementGroup(null);
      groups.push(fallback);
    }
    return fallback;
  };
  const groupAt = (x: number, y: number): SettlementGroup => {
    const center = nearestCenter(game, civ.id, x, y, centers);
    if (!center) return fallbackGroup();
    return byCenterId.get(center.id) ?? fallbackGroup();
  };

  const agents = game.agents;
  for (const building of built) {
    if (building.type === BuildingType.Farm) groupAt(building.x, building.y).farms.push(building);
    else if (building.type === BuildingType.Workshop) groupAt(building.x, building.y).workshops.push(building);
    else if (building.type === BuildingType.Temple) groupAt(building.x, building.y).temples.push(building);
    else if (
      building.type === BuildingType.Market ||
      building.type === BuildingType.University ||
      building.type === BuildingType.Monument
    ) {
      groupAt(building.x, building.y).civic.push(building);
    }
  }
  for (const id of adults) {
    const home = game.buildingById.get(agents.home[id]);
    const group = home ? groupAt(home.x, home.y) : groupAt(agents.x[id], agents.y[id]);
    group.adults.push(id);
  }
  return groups;
}

/** Assigns civilian jobs settlement-first (with cross-settlement fallback for open
 *  slots), keeps soldiers in place, and rebuilds building worker counts. */
export function assignJobs(game: Game): void {
  const agents = game.agents;
  for (const civ of game.civs) {
    if (!civ.alive) continue;
    const built = game.buildings.filter((building) => building.civ === civ.id && building.built);
    const unbuilt =
      game.buildings.find((building) => building.civ === civ.id && !building.built) ?? null;
    for (const building of built) building.workers = 0;

    const barracks = built.filter((building) => building.type === BuildingType.Barracks);
    const centerBuilding = built.find((building) => building.type === BuildingType.TownCenter) ?? null;

    const adults: number[] = [];
    const preserved: number[] = [];
    for (let id = 0; id < agents.capacity; id += 1) {
      if (agents.alive[id] === 0 || agents.civ[id] !== civ.id) continue;
      if (agents.age[id] < 14) {
        agents.job[id] = Job.Idle;
        agents.state[id] = AgentState.Idle;
        continue;
      }
      if (
        agents.job[id] === Job.Soldier &&
        (agents.state[id] === AgentState.Fighting ||
          agents.state[id] === AgentState.Marching ||
          agents.state[id] === AgentState.Returning)
      ) {
        preserved.push(id);
        continue;
      }
      adults.push(id);
    }

    const used = new Set<number>();
    const take = (count: number, predicate: (id: number) => boolean): number[] => {
      const out: number[] = [];
      for (const id of adults) {
        if (out.length >= count) break;
        if (used.has(id) || !predicate(id)) continue;
        used.add(id);
        out.push(id);
      }
      return out;
    };

    // Soldiers stay a global force: recruit from the whole faction and post
    // them to the first barracks regardless of which city they came from.
    const soldiers: number[] = [...preserved];
    const atWar = civ.warId >= 0;
    const slots = barracks.reduce((sum, building) => sum + BUILDING_DEFS[building.type].armySlots, 0);
    const wantSoldiers = Math.min(
      Math.floor((adults.length + preserved.length) * (atWar ? 0.35 : 0.18)),
      slots,
    );
    if (wantSoldiers > soldiers.length) {
      soldiers.push(...take(wantSoldiers - soldiers.length, () => true));
    }

    const civilians = adults.filter((id) => !used.has(id));
    const groups = groupBySettlement(game, civ, built, civilians);
    const centers = settlementCenters(game, civ.id);
    const center = unbuilt ? nearestCenter(game, civ.id, unbuilt.x, unbuilt.y, centers) : null;
    const siteGroup = unbuilt
      ? (groups.find((group) => group.center !== null && group.center.id === center?.id) ??
        groups.find((group) => group.center === null) ??
        null)
      : null;

    const takeFrom = (
      group: SettlementGroup | null,
      count: number,
      predicate: (id: number) => boolean,
    ): number[] => {
      const out: number[] = [];
      if (!group) return out;
      for (const id of group.adults) {
        if (out.length >= count) break;
        if (used.has(id) || !predicate(id)) continue;
        used.add(id);
        out.push(id);
      }
      return out;
    };
    const isBuilder = (id: number): boolean => agents.job[id] === Job.Builder;

    // Reserve one builder before farms consume the civilian pool so a
    // construction site always makes progress. Keep the last adult farming
    // when the faction already has a completed farm.
    let farmCount = 0;
    for (const building of built) if (building.type === BuildingType.Farm) farmCount += 1;
    const recruited = soldiers.length - preserved.length;
    const availableCivilians = adults.length - recruited;
    const wantBuilders = unbuilt ? Math.min(4, Math.max(1, Math.floor(adults.length * 0.3))) : 0;
    const reserveBuilder =
      wantBuilders > 0 && availableCivilians > (farmCount > 0 ? 1 : 0);
    const builders: number[] = [];
    if (reserveBuilder && siteGroup) {
      const reserved = takeFrom(siteGroup, 1, isBuilder);
      if (reserved.length === 0) builders.push(...takeFrom(siteGroup, 1, () => true));
      else builders.push(...reserved);
    }

    const assign = (id: number, job: Job, building: Building | undefined): void => {
      const previousJob = agents.job[id];
      const previousWork = agents.work[id];
      const nextWork = building ? building.id : NO_BUILDING;
      agents.job[id] = job;
      agents.work[id] = nextWork;
      if (job === Job.Soldier) {
        if (agents.state[id] !== AgentState.Fighting && agents.state[id] !== AgentState.Marching) {
          if (previousJob !== job || previousWork !== nextWork) {
            game.soldierPaths.delete(id);
            agents.state[id] = AgentState.Idle;
            placeNearBuilding(game, id, building, civ);
          }
        }
        return;
      }
      if (previousJob !== job || previousWork !== nextWork) {
        agents.state[id] = job === Job.Idle ? AgentState.Idle : AgentState.Working;
        placeNearBuilding(game, id, building, civ);
      }
    };

    for (const group of groups) {
      const wantFarmers = Math.min(
        group.adults.length,
        group.farms.length * BUILDING_DEFS[BuildingType.Farm].workers,
      );
      let farmers = takeFrom(group, wantFarmers, (id) => agents.job[id] === Job.Farmer);
      if (farmers.length < wantFarmers) {
        farmers = farmers.concat(takeFrom(group, wantFarmers - farmers.length, () => true));
      }

      const wantWorkers = Math.min(
        group.adults.length,
        group.workshops.length * BUILDING_DEFS[BuildingType.Workshop].workers,
      );
      let workers = takeFrom(group, wantWorkers, (id) => agents.job[id] === Job.Worker);
      if (workers.length < wantWorkers) {
        workers = workers.concat(takeFrom(group, wantWorkers - workers.length, () => true));
      }

      const wantPriests = Math.min(
        group.adults.length,
        group.temples.length * BUILDING_DEFS[BuildingType.Temple].workers,
      );
      let priests = takeFrom(group, wantPriests, (id) => agents.job[id] === Job.Priest);
      if (priests.length < wantPriests) {
        priests = priests.concat(takeFrom(group, wantPriests - priests.length, () => true));
      }

      // Civic buildings share the artisan pool with workshops.
      const civicSlots = group.civic.reduce(
        (sum, building) => sum + BUILDING_DEFS[building.type].workers,
        0,
      );
      const wantCivic = Math.min(group.adults.length, civicSlots);
      let civic = takeFrom(group, wantCivic, (id) => agents.job[id] === Job.Worker);
      if (civic.length < wantCivic) {
        civic = civic.concat(takeFrom(group, wantCivic - civic.length, () => true));
      }

      for (let i = 0; i < farmers.length; i += 1) {
        const farm = group.farms[i % Math.max(1, group.farms.length)];
        if (!farm) break;
        assign(farmers[i], Job.Farmer, farm);
        farm.workers += 1;
      }
      for (let i = 0; i < workers.length; i += 1) {
        const workshop = group.workshops[i % Math.max(1, group.workshops.length)];
        if (!workshop) break;
        assign(workers[i], Job.Worker, workshop);
        workshop.workers += 1;
      }
      for (let i = 0; i < priests.length; i += 1) {
        const temple = group.temples[i % Math.max(1, group.temples.length)];
        if (!temple) break;
        assign(priests[i], Job.Priest, temple);
        temple.workers += 1;
      }
      let civicIndex = 0;
      for (const building of group.civic) {
        const slots = BUILDING_DEFS[building.type].workers;
        while (building.workers < slots && civicIndex < civic.length) {
          assign(civic[civicIndex], Job.Worker, building);
          building.workers += 1;
          civicIndex += 1;
        }
      }
    }

    // Fill any remaining work slots from idle adults elsewhere in the faction.
    // New settlements can otherwise sit with empty farms while the capital has
    // hundreds of idle people, which starves the whole faction.
    const takeAny = (): number | undefined => {
      for (const group of groups) {
        for (const id of group.adults) {
          if (used.has(id)) continue;
          used.add(id);
          return id;
        }
      }
      return undefined;
    };
    const staffRemaining = (buildings: readonly Building[], job: Job): void => {
      for (const building of buildings) {
        const def = BUILDING_DEFS[building.type];
        while (building.workers < def.workers) {
          const id = takeAny();
          if (id === undefined) return;
          assign(id, job, building);
          building.workers += 1;
        }
      }
    };
    staffRemaining(groups.flatMap((group) => group.farms), Job.Farmer);
    staffRemaining(groups.flatMap((group) => group.workshops), Job.Worker);
    staffRemaining(groups.flatMap((group) => group.temples), Job.Priest);
    staffRemaining(groups.flatMap((group) => group.civic), Job.Worker);

    // Staff the site with its own settlement first, then draw surplus adults
    // from neighbouring settlements.
    const needBuilders = (): number => wantBuilders - builders.length;
    if (needBuilders() > 0) builders.push(...takeFrom(siteGroup, needBuilders(), isBuilder));
    if (needBuilders() > 0) builders.push(...takeFrom(siteGroup, needBuilders(), () => true));
    for (const group of groups) {
      if (needBuilders() <= 0) break;
      if (group === siteGroup) continue;
      builders.push(...takeFrom(group, needBuilders(), isBuilder));
    }
    for (const group of groups) {
      if (needBuilders() <= 0) break;
      if (group === siteGroup) continue;
      builders.push(...takeFrom(group, needBuilders(), () => true));
    }

    for (const id of soldiers) {
      if (preserved.includes(id)) {
        agents.job[id] = Job.Soldier;
        continue;
      }
      assign(id, Job.Soldier, barracks[0] ?? centerBuilding ?? undefined);
    }

    const buildTarget = unbuilt ?? centerBuilding ?? undefined;
    for (const id of builders) assign(id, Job.Builder, buildTarget);

    for (const group of groups) {
      for (const id of group.adults) {
        if (used.has(id)) continue;
        const previousJob = agents.job[id];
        agents.job[id] = Job.Laborer;
        agents.work[id] = NO_BUILDING;
        if (previousJob !== Job.Laborer) {
          agents.state[id] = AgentState.Working;
          const home = game.buildingById.get(agents.home[id]) ?? group.center ?? undefined;
          placeNearBuilding(game, id, home, civ);
        }
      }
    }
  }
}

export interface CivWorkforce {
  children: number;
  idle: number;
  farmers: number;
  builders: number;
  priests: number;
  soldiers: number;
  workers: number;
  labourers: number;
}

/** Current job mix for a faction; children are counted separately from adults. */
export function countCivJobs(game: Game, civId: number): CivWorkforce {
  const counts: CivWorkforce = {
    children: 0,
    idle: 0,
    farmers: 0,
    builders: 0,
    priests: 0,
    soldiers: 0,
    workers: 0,
    labourers: 0,
  };
  const agents = game.agents;
  for (let id = 0; id < agents.capacity; id += 1) {
    if (agents.alive[id] === 0 || agents.civ[id] !== civId) continue;
    if (agents.age[id] < 14) {
      counts.children += 1;
      continue;
    }
    switch (agents.job[id]) {
      case Job.Farmer:
        counts.farmers += 1;
        break;
      case Job.Builder:
        counts.builders += 1;
        break;
      case Job.Priest:
        counts.priests += 1;
        break;
      case Job.Soldier:
        counts.soldiers += 1;
        break;
      case Job.Worker:
        counts.workers += 1;
        break;
      case Job.Laborer:
        counts.labourers += 1;
        break;
      default:
        counts.idle += 1;
        break;
    }
  }
  return counts;
}

/** Ages agents, applies hunger and health, pairs partners, and handles births. */
export function runAgentLives(game: Game): void {
  const agents = game.agents;
  const tick = game.world.tick;
  const famineDeaths = new Map<number, number>();

  for (let id = 0; id < agents.capacity; id += 1) {
    if (agents.alive[id] === 0) continue;
    const civ = game.civs[agents.civ[id]];
    if (!civ) continue;
    agents.age[id] += 1;
    if (agents.age[id] >= agents.lifespan[id]) {
      game.removeAgent(id);
      continue;
    }

    if (civ.foodShortage > 0) {
      const shortageRatio = Math.min(1, civ.foodShortage / Math.max(1, civ.foodNeed));
      agents.hunger[id] = Math.min(100, agents.hunger[id] + 3 + shortageRatio * 12);
    } else {
      agents.hunger[id] = Math.max(0, agents.hunger[id] - 14);
    }

    if (agents.hunger[id] > 70) {
      // Starvation is proportional to the deficit and varies per person, so a
      // modest shortage weakens a city instead of killing everyone in lockstep.
      const shortageRatio = Math.min(1, civ.foodShortage / Math.max(1, civ.foodNeed));
      const resilience = 0.8 + (jitter(id, 7) + 0.5) * 0.4;
      const loss =
        STARVATION_HEALTH_LOSS * shortageRatio * resilience * (civ.traits.includes('stoic') ? 0.5 : 1);
      agents.health[id] -= loss;
      if (agents.health[id] <= 0) {
        game.removeAgent(id);
        famineDeaths.set(civ.id, (famineDeaths.get(civ.id) ?? 0) + 1);
        continue;
      }
    } else if (agents.health[id] < 100) {
      agents.health[id] = Math.min(100, agents.health[id] + 4);
    }

    agents.faith[id] += (civ.faith - agents.faith[id]) * 0.08;
    const happinessTarget = civ.happiness + jitter(id, 3) * 18;
    agents.happiness[id] += (happinessTarget - agents.happiness[id]) * 0.25;
    if (agents.happiness[id] < 0) agents.happiness[id] = 0;
    if (agents.happiness[id] > 100) agents.happiness[id] = 100;
  }

  for (const [civId, deaths] of famineDeaths) {
    const civ = game.civs[civId];
    if (!civ || deaths < 1) continue;
    if (tick - civ.lastFamineTick > 8) {
      civ.lastFamineTick = tick;
      game.addChronicle('society', `Famine grips ${civ.name}.`, civ.id, civ.centerX, civ.centerY);
    }
  }

  for (const civ of game.civs) {
    if (!civ.alive) continue;
    settleWanderers(game, civ);
    pairSingles(game, civ);
    bearChildren(game, civ);
  }
}

function settleWanderers(game: Game, civ: Civ): void {
  if (civ.population >= 6 || civ.population === 0) return;
  if (!game.rng.chance(0.06)) return;
  if (game.agents.count + 2 > game.agentCap) return;
  const center = game.buildings.find(
    (building) => building.civ === civ.id && building.built && building.type === BuildingType.TownCenter,
  );
  if (!center) return;
  let added = 0;
  for (const gender of [0, 1]) {
    const spot = tryFindWalkableNear(game.world, center.x, center.y, 3);
    if (!spot) break;
    const id = game.spawnAgent(civ.id, spot.x, spot.y, {
      age: game.rng.int(19, 32),
      gender,
      home: center.id,
    });
    if (id >= 0) added += 1;
  }
  if (added > 0) {
    game.addChronicle('society', `Wanderers join the ${civ.name}.`, civ.id, center.x, center.y);
  }
}

function pairSingles(game: Game, civ: Civ): void {
  if (game.world.tick % 2 !== 0) return;
  const agents = game.agents;
  const males: number[] = [];
  const females: number[] = [];
  for (let id = 0; id < agents.capacity; id += 1) {
    if (agents.alive[id] === 0 || agents.civ[id] !== civ.id) continue;
    if (agents.age[id] < 17 || agents.age[id] > 52) continue;
    if (agents.partner[id] !== NO_AGENT) continue;
    if (agents.gender[id] === 0) males.push(id);
    else females.push(id);
  }
  const pairs = Math.min(males.length, females.length, 6);
  for (let i = 0; i < pairs; i += 1) {
    if (!game.rng.chance(0.5)) continue;
    const male = males[i];
    const female = females[i];
    if (agents.partner[male] !== NO_AGENT || agents.partner[female] !== NO_AGENT) continue;
    agents.partner[male] = female;
    agents.partner[female] = male;
  }
}

function bearChildren(game: Game, civ: Civ): void {
  const agents = game.agents;
  const population = countCivAgents(game, civ.id);
  const capRoom = game.agentCap - agents.count;
  if (capRoom <= 0 || population >= civ.housing) return;
  if (civ.foodProduction < civ.foodNeed * 1.15 && civ.food < civ.foodNeed * 2) return;

  const fertile = civ.traits.includes('fertile') ? 1.3 : 1;
  const blessed = civ.blessingUntil > game.world.tick ? 1.55 : 1;
  const happinessFactor = 0.45 + civ.happiness / 140;
  const chance = BIRTH_BASE_CHANCE * fertile * blessed * happinessFactor;
  let births = 0;
  let males = 0;
  let females = 0;
  for (let id = 0; id < agents.capacity; id += 1) {
    if (agents.alive[id] === 0 || agents.civ[id] !== civ.id) continue;
    if (agents.gender[id] === 0) males += 1;
    else females += 1;
  }

  for (let id = 0; id < agents.capacity; id += 1) {
    if (births >= MAX_BIRTHS_PER_TICK) break;
    if (agents.alive[id] === 0 || agents.civ[id] !== civ.id) continue;
    if (agents.gender[id] !== 1) continue;
    if (agents.age[id] < 16 || agents.age[id] > 48) continue;
    if (agents.partner[id] === NO_AGENT) continue;
    if (population + births >= civ.housing) break;
    if (!game.rng.chance(chance)) continue;

    const home = game.buildingById.get(agents.home[id]);
    const homeX = home ? home.x : civ.centerX;
    const homeY = home ? home.y : civ.centerY;
    const spot = tryFindWalkableNear(game.world, homeX, homeY, 2) ?? { x: homeX, y: homeY };
    const child = game.spawnAgent(civ.id, spot.x, spot.y, {
      age: 0,
      gender: males > females ? 1 : 0,
      home: agents.home[id],
      mother: id,
      father: agents.partner[id],
    });
    if (child < 0) break;
    births += 1;
  }
}

export function countCivSoldiers(game: Game, civId: number): number {
  return countCivJob(game, civId, Job.Soldier);
}
