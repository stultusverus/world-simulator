import {
  BASE_MATERIALS_PRODUCTION,
  BUILDING_DEFS,
  BUILDING_UPKEEP_MATERIALS,
  BUILDING_UPKEEP_WEALTH,
  FESTIVAL_FOOD_COST_RATIO,
  FESTIVAL_HAPPINESS,
  FESTIVAL_INTERVAL,
  FESTIVAL_MIN_FOOD_RATIO,
  FESTIVAL_MIN_WEALTH,
  FESTIVAL_WEALTH_COST,
  ERA_KNOWLEDGE_REQ,
  FOOD_PER_PERSON,
  KNOWLEDGE_CAP,
  KNOWLEDGE_HAPPINESS_CAP,
  LABORER_FOOD,
  LABORER_MATERIALS,
  LABORER_WEALTH,
  MATERIALS_CAP,
  MATERIALS_UPKEEP_ERA_FACTOR,
  SOLDIER_UPKEEP_WEALTH,
  UPKEEP_ERA_MIN_BUILDINGS,
  UPKEEP_HAPPINESS_PENALTY,
  WEALTH_CAP,
  WEALTH_OVERFLOW_RATE,
  WEALTH_SOFT_CAP,
  WEALTH_UPKEEP_ERA_FACTOR,
  WEALTH_UPKEEP_PER_PERSON,
  foodStorageLimit,
  OCCUPIED_UPKEEP_MATERIALS,
  CIVIC_UPKEEP_PER_PERSON,
  RENEWAL_RESERVE,
  RENEWAL_SPEND_RATE,
  SCHOLARSHIP_SPEND_RATE,
} from '../config';
import { BuildingType, Job, type Building, type Civ } from '../world/types';
import {
  pickConstructionCenter,
  crowdedConstructionCenter,
  settlementCenters,
  totalBuildingCapacity,
} from './settlements';
import type { Game } from './game';
import { repairBuilding } from './maintenance';

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

function isLandmark(type: BuildingType): boolean {
  return (
    type === BuildingType.Workshop ||
    type === BuildingType.Temple ||
    type === BuildingType.Barracks ||
    type === BuildingType.Market ||
    type === BuildingType.University ||
    type === BuildingType.Monument
  );
}

export function runEconomy(game: Game): void {
  const world = game.world;
  const tick = world.tick;
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
    let happinessFromBuildings = 0;
    let occupiedWorkers = 0;
    let scholars = 0;

    for (const building of built) {
      const def = BUILDING_DEFS[building.type];
      const workerFactor = def.workers > 0 ? Math.min(1, building.workers / def.workers) : 1;
      occupiedWorkers += building.workers;
      if (building.type === BuildingType.University || building.type === BuildingType.Temple)
        scholars += building.workers;
      happinessFromBuildings += def.happiness ?? 0;
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
      } else if (building.type === BuildingType.Market) {
        materialsProduction += (def.produces.materials ?? 0) * workerFactor * eraMultiplier * industrious;
        wealthProduction += (def.produces.wealth ?? 0) * workerFactor * eraMultiplier * mercantile;
      } else if (
        building.type === BuildingType.University ||
        building.type === BuildingType.Monument
      ) {
        knowledgeProduction += (def.produces.knowledge ?? 0) * workerFactor * eraMultiplier;
      }
    }

    let laborers = 0;
    const agents = game.agents;
    for (let id = 0; id < agents.capacity; id += 1) {
      if (agents.alive[id] === 0 || agents.civ[id] !== civ.id) continue;
      if (agents.age[id] >= 14 && agents.job[id] === Job.Laborer) laborers += 1;
    }
    foodProduction += laborers * LABORER_FOOD;
    materialsProduction += BASE_MATERIALS_PRODUCTION + laborers * LABORER_MATERIALS;
    wealthProduction += laborers * LABORER_WEALTH;

    // Late-game stockpiles need somewhere to go: upkeep makes the building
    // count and the army a real cost instead of allowing every resource to pin
    // at its cap forever.
    const eraUpkeepBuildings = Math.max(0, built.length - UPKEEP_ERA_MIN_BUILDINGS);
    const mature =
      civ.era >= 2 && civ.population >= 180 && builtCount(built, BuildingType.Workshop) >= 3;
    const basicUpkeepMaterials =
      built.length * BUILDING_UPKEEP_MATERIALS +
      eraUpkeepBuildings * BUILDING_UPKEEP_MATERIALS * (1 + civ.era * MATERIALS_UPKEEP_ERA_FACTOR);
    const requestedCivicUpkeep = mature
      ? occupiedWorkers * OCCUPIED_UPKEEP_MATERIALS +
        civ.population * civ.era * CIVIC_UPKEEP_PER_PERSON
      : 0;
    // Civic services contract when funds are scarce; they cannot consume the
    // construction reserve or prevent a young/recovering economy from expanding.
    const civicUpkeep = Math.min(
      requestedCivicUpkeep,
      Math.max(0, civ.materials + materialsProduction - basicUpkeepMaterials - RENEWAL_RESERVE),
    );
    const upkeepMaterials = basicUpkeepMaterials + civicUpkeep;
    const upkeepWealth =
      built.length * BUILDING_UPKEEP_WEALTH +
      eraUpkeepBuildings *
        BUILDING_UPKEEP_WEALTH *
        (1 + civ.era * WEALTH_UPKEEP_ERA_FACTOR);
    const materialsAvailable = civ.materials + materialsProduction;
    const wealthAvailable =
      civ.wealth +
      wealthProduction -
      civ.soldiers * SOLDIER_UPKEEP_WEALTH -
      civ.population * WEALTH_UPKEEP_PER_PERSON;
    const underfunded = materialsAvailable < upkeepMaterials;
    civ.materials = Math.max(0, materialsAvailable - upkeepMaterials);
    // Fund continuing capital renewal from surplus, preserving a construction reserve.
    const renewal = mature ? Math.max(0, civ.materials - RENEWAL_RESERVE) * RENEWAL_SPEND_RATE : 0;
    civ.materials -= renewal;
    civ.materials = Math.min(MATERIALS_CAP, civ.materials);
    civ.wealth = Math.min(WEALTH_CAP, Math.max(0, wealthAvailable - upkeepWealth));
    if (civ.wealth > WEALTH_SOFT_CAP) {
      civ.wealth -= (civ.wealth - WEALTH_SOFT_CAP) * WEALTH_OVERFLOW_RATE;
    }

    const foodNeed = civ.population * FOOD_PER_PERSON;
    const availableFood = civ.food + foodProduction;
    const shortage = Math.max(0, foodNeed - availableFood);
    const foodStorage = foodStorageLimit(foodNeed);
    civ.food = Math.min(foodStorage, Math.max(0, availableFood - foodNeed));
    civ.foodShortage = shortage;
    civ.foodProduction = foodProduction;
    civ.foodNeed = foodNeed;
    civ.knowledge = Math.min(KNOWLEDGE_CAP, civ.knowledge + knowledgeProduction);
    // Staffed institutions spend surplus continuously; diminishing benefits leave
    // young factions' era research untouched and never require borrowing resources.
    const scholarship =
      civ.era === 3
        ? Math.max(0, civ.knowledge - ERA_KNOWLEDGE_REQ[3]) *
          SCHOLARSHIP_SPEND_RATE *
          Math.min(1, scholars / 4)
        : 0;
    civ.knowledge -= scholarship;

    let happiness = 50;
    if (foodNeed > 0) {
      happiness += shortage > 0 ? -18 : Math.min(12, (civ.food / Math.max(4, foodNeed)) * 4);
    }
    happiness += civ.faith * 0.15;
    happiness += happinessFromBuildings;
    happiness +=
      (3 * (renewal + civicUpkeep)) / (renewal + civicUpkeep + 10) +
      (4 * scholarship) / (scholarship + 12);
    // Knowledge beyond the final era is not useless: it funds a scholarly
    // court and civic prestige.
    happiness += Math.min(
      KNOWLEDGE_HAPPINESS_CAP,
      Math.max(0, (civ.knowledge - ERA_KNOWLEDGE_REQ[3]) / 150),
    );
    happiness -= civ.warId >= 0 ? 12 : 0;
    happiness -= Math.max(0, civ.population - civ.housing) * 2.5;
    if (civ.wealth <= 0 && civ.soldiers > 0) happiness -= 5;
    if (civ.traits.includes('stoic')) happiness += 8;
    if (civ.traits.includes('mercantile')) happiness += 4;
    if (blessed > 1) happiness += 7;
    if (underfunded) happiness -= UPKEEP_HAPPINESS_PENALTY;

    // Prosperous, well-fed factions celebrate now and then, which gives
    // surplus food and wealth a use. Tick-derived so no save state is needed.
    if (
      tick % FESTIVAL_INTERVAL === 0 &&
      civ.population > 0 &&
      civ.food >= foodNeed * FESTIVAL_MIN_FOOD_RATIO &&
      civ.wealth >= FESTIVAL_MIN_WEALTH
    ) {
      civ.food = Math.max(0, civ.food - foodNeed * FESTIVAL_FOOD_COST_RATIO);
      civ.wealth = Math.max(0, civ.wealth - FESTIVAL_WEALTH_COST);
      happiness += FESTIVAL_HAPPINESS;
      game.addChronicle(
        'society',
        `${civ.name} hold a grand festival.`,
        civ.id,
        civ.centerX,
        civ.centerY,
      );
    }

    civ.happiness = Math.max(5, Math.min(100, happiness));

    const builders = countJob(game, civ.id, Job.Builder);
    progressConstruction(game, civ, builders, 1 + (0.1 * scholarship) / (scholarship + 12));
    planConstruction(game, civ);
  }
}

function progressConstruction(
  game: Game,
  civ: Civ,
  builders: number,
  researchFactor: number,
): void {
  const site = game.buildings.find((building) => building.civ === civ.id && !building.built);
  if (!site) {
    repairBuilding(game, civ, builders * researchFactor);
    return;
  }
  if (builders > 0) {
    site.work += builders * 3.2 * researchFactor;
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
  if (isLandmark(site.type)) {
    const count = game.buildings.filter(
      (building) => building.civ === civ.id && building.built && building.type === site.type,
    ).length;
    if (count === 1) {
      const def = BUILDING_DEFS[site.type];
      game.addChronicle(
        'society',
        `${civ.name} raise their first ${def.name}.`,
        civ.id,
        site.x,
        site.y,
      );
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

  const crowded = crowdedConstructionCenter(game, civ);
  const planned = chooseBuildingType(civ, built);
  const type = crowded && planned !== BuildingType.Farm ? BuildingType.House : planned;
  if (type === null) return;
  const def = BUILDING_DEFS[type];
  if (civ.era < def.era) return;
  if (civ.materials < def.cost) return;
  if (civ.knowledge < (def.knowledgeCost ?? 0)) return;
  if (civ.wealth < (def.wealthCost ?? 0)) return;

  const primary =
    type === BuildingType.House && crowded ? crowded : pickConstructionCenter(game, civ);
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
  civ.knowledge -= def.knowledgeCost ?? 0;
  civ.wealth -= def.wealthCost ?? 0;
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
  const barracksTarget =
    civ.warId >= 0
      ? Math.min(5, 2 + Math.floor(civ.population / 250))
      : Math.min(3, 1 + Math.floor(civ.population / 300));
  if (builtCount(built, BuildingType.Barracks) < barracksTarget && civ.population >= 9) {
    return BuildingType.Barracks;
  }
  // Late-era civic buildings absorb surplus labour and consume stockpiles.
  if (civ.era >= 1 && civ.population >= 40) {
    const marketTarget = Math.min(8, 1 + Math.floor(civ.population / 80));
    if (builtCount(built, BuildingType.Market) < marketTarget) return BuildingType.Market;
  }
  if (civ.era >= 2 && civ.population >= 120) {
    const universityTarget = Math.min(6, 1 + Math.floor(civ.population / 120));
    if (builtCount(built, BuildingType.University) < universityTarget) {
      return BuildingType.University;
    }
  }
  if (civ.era >= 3 && civ.population >= 200) {
    // Repeatable late-game works absorb materials, knowledge and wealth while
    // adding faith, happiness and jobs.
    const monumentTarget = Math.min(6, 1 + Math.floor(civ.population / 200));
    if (builtCount(built, BuildingType.Monument) < monumentTarget) return BuildingType.Monument;
  }
  // No construction need left: stop building rather than filling a city with
  // empty houses. New settlements are founded once the population supports it.
  return null;
}
