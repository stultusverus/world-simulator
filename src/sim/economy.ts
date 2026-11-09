import {
  BUILDING_DEFS,
  FOOD_PER_PERSON,
  SOLDIER_UPKEEP_WEALTH,
} from '../config';
import { BuildingType, Job, type Building, type Civ } from '../world/types';
import {
  pickConstructionCenter,
  settlementCenters,
  totalBuildingCapacity,
} from './settlements';
import type { Game } from './game';

function countJob(game: Game, civId: number, job: Job): number {
  let count = 0;
  const agents = game.agents;
  for (let id = 0; id < agents.capacity; id += 1) {
    if (agents.alive[id] === 1 && agents.civ[id] === civId && agents.job[id] === job) count += 1;
  }
  return count;
}

function builtCount(built: readonly Building[], type: BuildingType): number {
  let count = 0;
  for (const building of built) if (building.type === type) count += 1;
  return count;
}

export function runEconomy(game: Game): void {
  const world = game.world;
  for (const civ of game.civs) {
    if (!civ.alive) continue;
    const built = game.buildings.filter((building) => building.civ === civ.id && building.built);
    const blessedUntil = civ.blessingUntil;
    const blessed = blessedUntil > world.tick ? 1.35 : 1;
    const eraMultiplier = 1 + civ.era * 0.15;
    const industrious = civ.traits.includes('industrious') ? 1.18 : 1;
    const mercantile = civ.traits.includes('mercantile') ? 1.3 : 1;
    const happinessFactor = 0.7 + civ.happiness / 200;

    let foodProduction = 0;
    let materialsProduction = 0;
    let wealthProduction = 0;
    let knowledgeProduction = 0;

    for (const building of built) {
      const def = BUILDING_DEFS[building.type];
      const workerFactor = def.workers > 0 ? Math.min(1, building.workers / def.workers) : 1;
      if (building.type === BuildingType.Farm) {
        const fertility = world.fertility[building.y * world.size + building.x] / 255;
        foodProduction +=
          (def.produces.food ?? 0) *
          workerFactor *
          (0.55 + fertility * 0.95) *
          eraMultiplier *
          industrious *
          blessed *
          happinessFactor;
      } else if (building.type === BuildingType.Workshop) {
        materialsProduction += (def.produces.materials ?? 0) * workerFactor * eraMultiplier * industrious;
        wealthProduction += (def.produces.wealth ?? 0) * workerFactor * eraMultiplier * mercantile;
        knowledgeProduction += 0.12 * workerFactor;
      } else if (building.type === BuildingType.Temple) {
        knowledgeProduction += (def.produces.knowledge ?? 0) * eraMultiplier;
      } else if (building.type === BuildingType.TownCenter) {
        knowledgeProduction += (def.produces.knowledge ?? 0) * eraMultiplier;
      }
    }

    let idleAgents = 0;
    const agents = game.agents;
    for (let id = 0; id < agents.capacity; id += 1) {
      if (agents.alive[id] === 0 || agents.civ[id] !== civ.id) continue;
      if (agents.age[id] >= 14 && agents.job[id] === Job.Idle) idleAgents += 1;
    }
    foodProduction += idleAgents * 0.2;
    materialsProduction += 0.65 + civ.population * 0.02;
    wealthProduction += civ.population * 0.012;

    const foodNeed = civ.population * FOOD_PER_PERSON;
    const availableFood = civ.food + foodProduction;
    const shortage = Math.max(0, foodNeed - availableFood);
    civ.food = Math.min(999, Math.max(0, availableFood - foodNeed));
    civ.foodShortage = shortage;
    civ.foodProduction = foodProduction;
    civ.foodNeed = foodNeed;
    civ.materials = Math.min(999, civ.materials + materialsProduction);
    civ.wealth = Math.min(
      9999,
      Math.max(0, civ.wealth + wealthProduction - civ.soldiers * SOLDIER_UPKEEP_WEALTH),
    );
    civ.knowledge = Math.min(2000, civ.knowledge + knowledgeProduction);

    let happiness = 50;
    if (foodNeed > 0) {
      happiness += shortage > 0 ? -18 : Math.min(12, (civ.food / Math.max(4, foodNeed)) * 4);
    }
    happiness += civ.faith * 0.15;
    happiness -= civ.warId >= 0 ? 12 : 0;
    happiness -= Math.max(0, civ.population - civ.housing) * 2.5;
    if (civ.wealth <= 0 && civ.soldiers > 0) happiness -= 5;
    if (civ.traits.includes('stoic')) happiness += 8;
    if (civ.traits.includes('mercantile')) happiness += 4;
    if (blessed > 1) happiness += 7;
    civ.happiness = Math.max(5, Math.min(100, happiness));

    const builders = countJob(game, civ.id, Job.Builder);
    progressConstruction(game, civ, builders);
    planConstruction(game, civ);
  }
}

function progressConstruction(game: Game, civ: Civ, builders: number): void {
  const site = game.buildings.find((building) => building.civ === civ.id && !building.built);
  if (!site) return;
  if (builders > 0) {
    site.work += builders * 3.2;
  }
  site.hp = Math.min(
    site.maxHp,
    Math.round(site.maxHp * (0.35 + 0.65 * Math.min(1, site.work / site.workNeeded))),
  );
  if (site.work < site.workNeeded) return;

  site.built = true;
  site.hp = site.maxHp;
  site.workers = 0;
  game.ownershipDirty = true;
  const def = BUILDING_DEFS[site.type];
  if (
    site.type === BuildingType.Workshop ||
    site.type === BuildingType.Temple ||
    site.type === BuildingType.Barracks
  ) {
    const count = game.buildings.filter(
      (building) => building.civ === civ.id && building.built && building.type === site.type,
    ).length;
    if (count === 1) {
      game.addChronicle('society', `${civ.name} raise their first ${def.name}.`, civ.id, site.x, site.y);
    }
  }
}

/**
 * Picks a new building to construct around one of the faction's town centres.
 * The combined capacity of every settlement caps total buildings, and each
 * settlement's tier caps its own building count.
 */
function planConstruction(game: Game, civ: Civ): void {
  const buildings = game.buildings.filter((building) => building.civ === civ.id);
  if (buildings.some((building) => !building.built)) return;
  const built = buildings.filter((building) => building.built);
  if (buildings.length >= totalBuildingCapacity(game, civ)) return;

  const type = chooseBuildingType(civ, built);
  if (type === null) return;
  const def = BUILDING_DEFS[type];
  if (civ.era < def.era) return;
  if (civ.materials < def.cost) return;

  const primary = pickConstructionCenter(game, civ);
  if (!primary) return;
  const centers = settlementCenters(game, civ.id);
  let spot = game.findBuildingSpot(civ, type, 2, undefined, { x: primary.x, y: primary.y });
  if (!spot) {
    for (const center of centers) {
      if (center.id === primary.id) continue;
      spot = game.findBuildingSpot(civ, type, 2, undefined, { x: center.x, y: center.y });
      if (spot) break;
    }
  }
  if (!spot) return;

  civ.materials -= def.cost;
  game.addBuilding(civ.id, type, spot.x, spot.y, false);
}

/** Exposed for tests: which building the faction should try to construct next. */
export function chooseBuildingType(civ: Civ, built: readonly Building[]): BuildingType | null {
  const foodRatio = civ.foodProduction / Math.max(1, civ.foodNeed);
  const farmTarget = Math.max(9, Math.ceil(civ.population / 18));
  if (foodRatio < 1.15 && builtCount(built, BuildingType.Farm) < farmTarget) {
    return BuildingType.Farm;
  }
  if (builtCount(built, BuildingType.Barracks) === 0 && civ.population >= 10) {
    return BuildingType.Barracks;
  }
  if (civ.housing - civ.population <= 2) return BuildingType.House;
  if (
    civ.era >= 1 &&
    builtCount(built, BuildingType.Workshop) <
      Math.min(9, 1 + Math.floor(civ.population / 60))
  ) {
    return BuildingType.Workshop;
  }
  if (
    civ.era >= 1 &&
    builtCount(built, BuildingType.Temple) <
      Math.min(5, 1 + Math.floor(civ.population / 100))
  ) {
    return BuildingType.Temple;
  }
  const barracksTarget = civ.warId >= 0 ? Math.min(3, 2 + Math.floor(civ.population / 500)) : 1;
  if (builtCount(built, BuildingType.Barracks) < barracksTarget && civ.population >= 9) {
    return BuildingType.Barracks;
  }
  // No construction need left: stop building rather than filling a city with
  // empty houses. New settlements are founded once the city is genuinely full.
  return null;
}
