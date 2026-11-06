import { MAX_FACTIONS } from '../config';
import { BuildingType, type Civ } from '../world/types';
import { tryFindWalkableNear } from '../world/world';
import { AnimalKind } from './animal-pool';
import { foundFaction } from './faction';
import { endWar } from './war';
import type { Game } from './game';

export type PowerId =
  | 'spawnFaction'
  | 'spawnVillagers'
  | 'spawnDeer'
  | 'spawnWolves'
  | 'heal'
  | 'fertility'
  | 'peace'
  | 'inspire';

export interface PowerResult {
  ok: boolean;
  message: string;
}

function nearbyCivs(game: Game, x: number, y: number, radius: number): Civ[] {
  const out: Civ[] = [];
  for (const civ of game.civs) {
    if (!civ.alive) continue;
    let found = Math.hypot(civ.centerX - x, civ.centerY - y) <= radius + 4;
    if (!found) {
      found = game.buildings.some(
        (building) =>
          building.civ === civ.id && Math.hypot(building.x - x, building.y - y) <= radius,
      );
    }
    if (found) out.push(civ);
  }
  return out;
}

function spawnVillagers(game: Game, x: number, y: number): PowerResult {
  const civ = game.civNear(x, y, 10);
  if (!civ) return { ok: false, message: 'No faction owns this land. Spawn a faction first.' };
  const center = game.buildings.find(
    (building) => building.civ === civ.id && building.built && building.type === BuildingType.TownCenter,
  );
  if (!center) return { ok: false, message: 'That faction has no town center.' };
  let added = 0;
  for (let i = 0; i < 4; i += 1) {
    if (game.agents.count >= game.agentCap) break;
    const spot =
      tryFindWalkableNear(game.world, x + game.rng.int(-2, 2), y + game.rng.int(-2, 2), 4) ?? {
        x,
        y,
      };
    const id = game.spawnAgent(civ.id, spot.x, spot.y, {
      age: game.rng.int(18, 38),
      gender: i % 2,
      home: center.id,
    });
    if (id < 0) break;
    added += 1;
  }
  if (added === 0) return { ok: false, message: 'The population limit is reached.' };
  game.addChronicle('power', `${added} settlers appear among the ${civ.name}.`, civ.id, x, y);
  game.updateStats();
  return { ok: true, message: `${added} settlers join the ${civ.name}.` };
}

function spawnAnimals(game: Game, kind: AnimalKind, x: number, y: number): PowerResult {
  if (game.animals.count >= game.wildlifeCap) {
    return { ok: false, message: 'The wilderness is already full.' };
  }
  let added = 0;
  for (let i = 0; i < 5; i += 1) {
    const spot = tryFindWalkableNear(
      game.world,
      x + game.rng.int(-3, 3),
      y + game.rng.int(-3, 3),
      5,
    );
    if (!spot) continue;
    if (game.spawnAnimal(kind, spot.x, spot.y) >= 0) added += 1;
  }
  if (added === 0) return { ok: false, message: 'No open land for wildlife here.' };
  const label = kind === AnimalKind.Deer ? 'deer' : 'wolves';
  game.addChronicle('nature', `${added} ${label} appear.`, undefined, x, y);
  return { ok: true, message: `${added} ${label} appear.` };
}

function castHeal(game: Game, x: number, y: number, radius: number): PowerResult {
  let healed = 0;
  const agents = game.agents;
  for (let id = 0; id < agents.capacity; id += 1) {
    if (agents.alive[id] === 0) continue;
    if (Math.hypot(agents.x[id] - x, agents.y[id] - y) > radius) continue;
    agents.health[id] = Math.min(100, agents.health[id] + 45);
    agents.hunger[id] = Math.max(0, agents.hunger[id] - 30);
    healed += 1;
  }
  if (healed === 0) return { ok: false, message: 'No people within the blessing.' };
  game.addChronicle('power', `A wave of warmth heals ${healed} people.`, undefined, x, y);
  return { ok: true, message: `Healed ${healed} people.` };
}

function castFertility(game: Game, x: number, y: number, radius: number): PowerResult {
  const civs = nearbyCivs(game, x, y, radius);
  if (civs.length === 0) return { ok: false, message: 'No settlement within the blessing.' };
  for (const civ of civs) civ.blessingUntil = game.world.tick + 12;
  const names = civs.map((civ) => civ.name).join(', ');
  game.addChronicle('power', `Fields and cradles are blessed across ${names}.`, civs[0].id, x, y);
  return { ok: true, message: `Fertility blessing: ${names}.` };
}

function castPeace(game: Game): PowerResult {
  if (game.wars.length === 0) return { ok: false, message: 'No wars to calm.' };
  const wars = [...game.wars];
  for (const war of wars) endWar(game, war, 'blessing');
  for (const civ of game.aliveCivs()) {
    civ.cooldownUntil = Math.max(civ.cooldownUntil, game.world.tick + 15);
  }
  for (const civ of game.aliveCivs()) {
    for (const other of game.aliveCivs()) {
      if (civ.id >= other.id) continue;
      const index = civ.id * MAX_FACTIONS + other.id;
      game.relations[index] = Math.min(100, game.relations[index] + 25);
      game.relations[other.id * MAX_FACTIONS + civ.id] = game.relations[index];
    }
  }
  game.addChronicle('power', 'A divine calm settles over the warring lands.');
  return { ok: true, message: 'All wars have ended.' };
}

function castInspire(game: Game, x: number, y: number, radius: number): PowerResult {
  const civs = nearbyCivs(game, x, y, radius);
  if (civs.length === 0) return { ok: false, message: 'No settlement within the blessing.' };
  for (const civ of civs) {
    civ.knowledge += 35;
    civ.happiness = Math.min(100, civ.happiness + 8);
  }
  const names = civs.map((civ) => civ.name).join(', ');
  game.addChronicle('power', `A spark of insight visits ${names}.`, civs[0].id, x, y);
  return { ok: true, message: `Inspiration: ${names}.` };
}

export function applyPower(
  game: Game,
  power: PowerId,
  x: number,
  y: number,
  radius = 6,
): PowerResult {
  if (x < 0 || y < 0 || x >= game.world.size || y >= game.world.size) {
    return { ok: false, message: 'Outside the world.' };
  }
  switch (power) {
    case 'spawnFaction': {
      if (game.civs.length >= MAX_FACTIONS) {
        return { ok: false, message: 'The world already holds all its peoples.' };
      }
      const civ = foundFaction(game, x, y);
      if (!civ) {
        return { ok: false, message: 'Cannot settle here — choose open land away from other factions.' };
      }
      return { ok: true, message: `The ${civ.name} rise.` };
    }
    case 'spawnVillagers':
      return spawnVillagers(game, x, y);
    case 'spawnDeer':
      return spawnAnimals(game, AnimalKind.Deer, x, y);
    case 'spawnWolves':
      return spawnAnimals(game, AnimalKind.Wolf, x, y);
    case 'heal':
      return castHeal(game, x, y, radius);
    case 'fertility':
      return castFertility(game, x, y, radius);
    case 'peace':
      return castPeace(game);
    case 'inspire':
      return castInspire(game, x, y, radius);
    default:
      return { ok: false, message: 'Unknown power.' };
  }
}
