import {
  ERA_KNOWLEDGE_REQ,
  ERA_NAMES,
  ERA_POP_REQ,
  KNOWLEDGE_CAP,
  MAX_FACTIONS,
  PATRONAGE_FAITH,
  PATRONAGE_HAPPINESS,
  PATRONAGE_INTERVAL,
  PATRONAGE_KNOWLEDGE_COST,
  PATRONAGE_MIN_KNOWLEDGE,
  PATRONAGE_MIN_WEALTH,
  PATRONAGE_WEALTH_COST,
} from '../config';
import { BuildingType, Job, type Civ } from '../world/types';
import type { Game } from './game';

function countPriests(game: Game, civId: number): number {
  let count = 0;
  const agents = game.agents;
  for (let id = 0; id < agents.capacity; id += 1) {
    if (
      agents.alive[id] === 1 &&
      agents.civ[id] === civId &&
      agents.job[id] === Job.Priest
    ) {
      count += 1;
    }
  }
  return count;
}

function countTemples(game: Game, civId: number): number {
  return game.buildings.filter(
    (building) => building.civ === civId && building.built && building.type === BuildingType.Temple,
  ).length;
}

function countMonuments(game: Game, civId: number): number {
  return game.buildings.filter(
    (building) =>
      building.civ === civId && building.built && building.type === BuildingType.Monument,
  ).length;
}

export function runProgress(game: Game): void {
  const tick = game.world.tick;

  for (const civ of game.civs) {
    if (!civ.alive) continue;
    const priests = countPriests(game, civ.id);
    const temples = countTemples(game, civ.id);
    const monuments = countMonuments(game, civ.id);
    civ.knowledge = Math.min(
      KNOWLEDGE_CAP,
      civ.knowledge + priests * 0.9 + civ.population * 0.018,
    );

    const nextEra = civ.era + 1;
    if (
      nextEra <= 3 &&
      civ.knowledge >= ERA_KNOWLEDGE_REQ[nextEra] &&
      civ.population >= ERA_POP_REQ[nextEra]
    ) {
      civ.era = nextEra;
      civ.eraChangedTick = tick;
      civ.happiness = Math.min(100, civ.happiness + 6);
      civ.faith = Math.min(100, civ.faith + 4);
      game.addChronicle(
        'progress',
        `${civ.name} enter the ${ERA_NAMES[nextEra]} era.`,
        civ.id,
        civ.centerX,
        civ.centerY,
      );
    }

    const zealous = civ.traits.includes('zealous') ? 10 : 0;
    civ.faith = Math.max(
      0,
      Math.min(
        100,
        6 + civ.piety + temples * 14 + monuments * 12 + priests * 2.5 + civ.era * 4 + zealous,
      ),
    );

    // Late-era scholarship and art are a real sink for capped knowledge and
    // excess wealth, and give the faction a visible cultural life.
    if (
      civ.era >= 3 &&
      civ.knowledge >= PATRONAGE_MIN_KNOWLEDGE &&
      civ.wealth >= PATRONAGE_MIN_WEALTH &&
      tick % PATRONAGE_INTERVAL === 0
    ) {
      civ.knowledge -= PATRONAGE_KNOWLEDGE_COST;
      civ.wealth = Math.max(0, civ.wealth - PATRONAGE_WEALTH_COST);
      civ.happiness = Math.min(100, civ.happiness + PATRONAGE_HAPPINESS);
      civ.faith = Math.min(100, civ.faith + PATRONAGE_FAITH);
      game.addChronicle(
        'progress',
        `${civ.name} patronise scholars and artists.`,
        civ.id,
        civ.centerX,
        civ.centerY,
      );
    }

    for (const milestone of [25, 50, 100, 180, 300, 500]) {
      if (civ.population >= milestone && civ.maxPopulation < milestone) {
        civ.maxPopulation = milestone;
        game.addChronicle(
          'society',
          `${civ.name} grow to ${milestone} people.`,
          civ.id,
          civ.centerX,
          civ.centerY,
        );
      }
    }
    civ.maxPopulation = Math.max(civ.maxPopulation, civ.population);
  }

  const alive = game.aliveCivs();
  for (let i = 0; i < alive.length; i += 1) {
    for (let j = 0; j < alive.length; j += 1) {
      if (i === j) continue;
      const a = alive[i];
      const b = alive[j];
      if (a.religionOf === b.religionOf) continue;
      if (b.faith + 15 > a.faith) continue;
      const relation = game.relations[a.id * MAX_FACTIONS + b.id];
      if (relation < -50 || tick < 25) continue;
      const zealous = a.traits.includes('zealous') ? 1.8 : 1;
      const resistant = b.traits.includes('zealous') ? 0.5 : 1;
      const chance = 0.005 * ((a.faith - b.faith) / 100) * zealous * resistant;
      if (!game.rng.chance(chance)) continue;
      b.religion = a.religion;
      b.religionOf = a.religionOf;
      b.faith = Math.min(100, b.faith + 12);
      game.relations[a.id * MAX_FACTIONS + b.id] = Math.min(100, relation + 6);
      game.relations[b.id * MAX_FACTIONS + a.id] = Math.min(100, relation + 6);
      game.addChronicle(
        'faith',
        `${b.name} adopt ${a.religion}, the faith of ${a.name}.`,
        b.id,
        b.centerX,
        b.centerY,
      );
    }
  }
}

export function eraLabel(civ: Civ): string {
  return ERA_NAMES[civ.era] ?? ERA_NAMES[0];
}
