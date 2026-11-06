import {
  BIRTH_BASE_CHANCE,
  BUILDING_DEFS,
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

/** Assigns civilian jobs, keeps soldiers in place and rebuilds building worker counts. */
export function assignJobs(game: Game): void {
  const agents = game.agents;
  for (const civ of game.civs) {
    if (!civ.alive) continue;
    const built = game.buildings.filter((building) => building.civ === civ.id && building.built);
    const unbuilt =
      game.buildings.find((building) => building.civ === civ.id && !building.built) ?? null;
    for (const building of built) building.workers = 0;

    const farms = built.filter((building) => building.type === BuildingType.Farm);
    const workshops = built.filter((building) => building.type === BuildingType.Workshop);
    const temples = built.filter((building) => building.type === BuildingType.Temple);
    const barracks = built.filter((building) => building.type === BuildingType.Barracks);
    const center = built.find((building) => building.type === BuildingType.TownCenter);

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

    const wantFarmers = Math.min(
      adults.length,
      farms.length * BUILDING_DEFS[BuildingType.Farm].workers,
    );
    let farmers = take(wantFarmers, (id) => agents.job[id] === Job.Farmer);
    if (farmers.length < wantFarmers) {
      farmers = farmers.concat(take(wantFarmers - farmers.length, () => true));
    }

    const wantWorkers = Math.min(
      adults.length,
      workshops.length * BUILDING_DEFS[BuildingType.Workshop].workers,
    );
    const workers = take(wantWorkers, (id) => agents.job[id] === Job.Worker);

    const wantPriests = Math.min(
      adults.length,
      temples.length * BUILDING_DEFS[BuildingType.Temple].workers,
    );
    let priests = take(wantPriests, (id) => agents.job[id] === Job.Priest);
    if (priests.length < wantPriests) {
      priests = priests.concat(take(wantPriests - priests.length, () => true));
    }

    const wantBuilders = unbuilt ? Math.min(4, Math.max(1, Math.floor(adults.length * 0.3))) : 0;
    let builders = take(wantBuilders, (id) => agents.job[id] === Job.Builder);
    if (builders.length < wantBuilders) {
      builders = builders.concat(take(wantBuilders - builders.length, () => true));
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

    for (const id of soldiers) {
      if (preserved.includes(id)) {
        agents.job[id] = Job.Soldier;
        continue;
      }
      assign(id, Job.Soldier, barracks[0] ?? center);
    }

    for (let i = 0; i < farmers.length; i += 1) {
      const farm = farms[i % Math.max(1, farms.length)];
      if (!farm) break;
      assign(farmers[i], Job.Farmer, farm);
      farm.workers += 1;
    }

    for (let i = 0; i < workers.length; i += 1) {
      const workshop = workshops[i % Math.max(1, workshops.length)];
      if (!workshop) break;
      assign(workers[i], Job.Worker, workshop);
      workshop.workers += 1;
    }

    for (let i = 0; i < priests.length; i += 1) {
      const temple = temples[i % Math.max(1, temples.length)];
      if (!temple) break;
      assign(priests[i], Job.Priest, temple);
      temple.workers += 1;
    }

    for (const id of builders) {
      assign(id, Job.Builder, unbuilt ?? center);
    }

    for (const id of adults) {
      if (used.has(id)) continue;
      const previousJob = agents.job[id];
      agents.job[id] = Job.Idle;
      agents.work[id] = NO_BUILDING;
      if (previousJob !== Job.Idle) {
        agents.state[id] = AgentState.Idle;
        placeNearBuilding(game, id, center, civ);
      }
    }
  }
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
      agents.hunger[id] = Math.min(100, agents.hunger[id] + 10);
    } else {
      agents.hunger[id] = Math.max(0, agents.hunger[id] - 14);
    }

    if (agents.hunger[id] > 70) {
      const loss = STARVATION_HEALTH_LOSS * (civ.traits.includes('stoic') ? 0.5 : 1);
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
  const pairs = Math.min(males.length, females.length, 3);
  for (let i = 0; i < pairs; i += 1) {
    if (!game.rng.chance(0.35)) continue;
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
    if (births >= 4) break;
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
