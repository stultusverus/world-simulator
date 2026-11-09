import { BUILDING_DEFS, COLORS, MAX_FACTIONS, TRAITS } from '../config';
import { BuildingType, type Civ, type TraitId } from '../world/types';
import { tryFindWalkableNear } from '../world/world';
import type { Game } from './game';
import { makeFactionName, makeReligionName } from './names';
import { settlementCenters } from './settlements';

export interface FoundFactionOptions {
  initial?: boolean;
  silent?: boolean;
}

function pickTraits(game: Game): TraitId[] {
  const pool = TRAITS.map((trait) => trait.id);
  const first = Math.floor(game.rng.next() * pool.length);
  const traitA = pool.splice(first, 1)[0];
  const second = Math.floor(game.rng.next() * pool.length);
  const traitB = pool.splice(second, 1)[0];
  return [traitA, traitB];
}

/** Creates a new faction with a town center, a house and six founders. */
export function foundFaction(game: Game, xIn: number, yIn: number, options: FoundFactionOptions = {}): Civ | null {
  if (game.civs.length >= MAX_FACTIONS) return null;
  const site = tryFindWalkableNear(game.world, Math.round(xIn), Math.round(yIn), 6);
  if (!site) return null;

  if (!options.initial) {
    // Space new factions away from every existing settlement, not just the
    // other faction's oldest centre.
    for (const other of game.aliveCivs()) {
      const centers = settlementCenters(game, other.id);
      const candidates =
        centers.length > 0 ? centers : [{ x: other.centerX, y: other.centerY }];
      for (const center of candidates) {
        if (Math.hypot(center.x - site.x, center.y - site.y) < 26) return null;
      }
    }
  }

  const id = game.civs.length;
  const usedNames = new Set(game.civs.map((civ) => civ.name));
  const usedColors = new Set(game.aliveCivs().map((civ) => civ.color));
  let color = 0;
  for (let i = 0; i < COLORS.length; i += 1) {
    if (!usedColors.has(i)) {
      color = i;
      break;
    }
  }

  const civ: Civ = {
    id,
    name: makeFactionName(game.world.seedText, id, usedNames),
    color,
    traits: pickTraits(game),
    religion: makeReligionName(game.world.seedText, id),
    religionOf: id,
    piety: game.rng.int(0, 26),
    era: 0,
    knowledge: 0,
    food: 40,
    materials: 18,
    wealth: 4,
    faith: 8,
    centerX: site.x,
    centerY: site.y,
    alive: true,
    foundedTick: game.world.tick,
    blessingUntil: 0,
    cooldownUntil: 0,
    population: 0,
    soldiers: 0,
    housing: 0,
    buildings: 0,
    happiness: 55,
    casualties: 0,
    foodShortage: 0,
    foodProduction: 0,
    foodNeed: 0,
    maxPopulation: 0,
    lastFamineTick: -100,
    warId: -1,
    eraChangedTick: game.world.tick,
  };
  game.civs.push(civ);

  for (let other = 0; other < id; other += 1) {
    if (!game.civs[other].alive) continue;
    const relation = game.rng.range(-22, 14);
    game.relations[other * MAX_FACTIONS + id] = relation;
    game.relations[id * MAX_FACTIONS + other] = relation;
  }

  const center = game.addBuilding(id, BuildingType.TownCenter, site.x, site.y, true);
  const houseSpot = game.findBuildingSpot(civ, BuildingType.House, 2, 4);
  if (houseSpot) game.addBuilding(id, BuildingType.House, houseSpot.x, houseSpot.y, true);
  const farmSpot = game.findBuildingSpot(civ, BuildingType.Farm, 3, 6);
  if (farmSpot) game.addBuilding(id, BuildingType.Farm, farmSpot.x, farmSpot.y, true);
  const farmSpot2 = game.findBuildingSpot(civ, BuildingType.Farm, 3, 6);
  if (farmSpot2) game.addBuilding(id, BuildingType.Farm, farmSpot2.x, farmSpot2.y, true);
  game.ownershipDirty = true;

  const spawnNear = (dx: number, dy: number): { x: number; y: number } => {
    const spot = tryFindWalkableNear(game.world, site.x + dx, site.y + dy, 3);
    return spot ?? { x: site.x, y: site.y };
  };

  const adultMales: number[] = [];
  const adultFemales: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const gender = i < 2 ? 0 : 1;
    const spot = spawnNear(game.rng.int(-2, 2), game.rng.int(-2, 2));
    const agentId = game.spawnAgent(id, spot.x, spot.y, {
      age: game.rng.int(19, 36),
      gender,
      home: center.id,
    });
    if (agentId < 0) continue;
    if (gender === 0) adultMales.push(agentId);
    else adultFemales.push(agentId);
  }

  for (let i = 0; i < 2; i += 1) {
    const gender = i;
    const spot = spawnNear(game.rng.int(-2, 2), game.rng.int(-2, 2));
    const mother = adultFemales[0] ?? undefined;
    const father = adultMales[0] ?? undefined;
    const childId = game.spawnAgent(id, spot.x, spot.y, {
      age: game.rng.int(3, 10),
      gender,
      home: center.id,
      mother,
      father,
    });
    if (childId < 0) continue;
    if (mother !== undefined) game.agents.home[childId] = game.agents.home[mother];
  }

  for (let i = 0; i < Math.min(adultMales.length, adultFemales.length); i += 1) {
    const male = adultMales[i];
    const female = adultFemales[i];
    game.agents.partner[male] = female;
    game.agents.partner[female] = male;
  }

  if (!options.silent) {
    const centerName = BUILDING_DEFS[BuildingType.TownCenter].name;
    game.addChronicle('society', `The ${civ.name} settle around their ${centerName}.`, id, site.x, site.y);
  }
  game.updateStats();
  return civ;
}
