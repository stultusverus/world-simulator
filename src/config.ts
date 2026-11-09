import { BuildingType, Era, type TraitId } from './world/types';

export const GAME_TITLE = 'Worldsmith';

/** Pixel size of one tile at zoom 1. */
export const TILE_SIZE = 16;
/** Terrain chunk edge length in tiles. */
export const CHUNK_TILES = 32;

export const WORLD_SIZES = [256, 512, 1024] as const;
export type WorldSize = (typeof WORLD_SIZES)[number];
export const DEFAULT_WORLD_SIZE: WorldSize = 256;

export const MAX_FACTIONS = 8;
export const DEFAULT_STARTING_FACTIONS = 3;
export const MAX_AGENTS_SUPPORTED = 4096;
export const MAX_ANIMALS_SUPPORTED = 640;

export const AGENT_CAP: Record<number, number> = {
  256: 1200,
  512: 2500,
  1024: 4000,
};

export const WILDLIFE_CAP: Record<number, number> = {
  256: 150,
  512: 300,
  1024: 500,
};

/** Base ticks per second at 1x. One tick is one game year. */
export const BASE_TICKS_PER_SECOND = 2;
export const SPEEDS = [1, 2, 5] as const;
export const MAX_CATCHUP_TICKS = 6;

/** Year at which the world begins. */
export const START_YEAR = 1;

export const SAVE_VERSION = 5;
export const AUTOSAVE_INTERVAL_MS = 30_000;
export const SAVE_CHRONICLE_LIMIT = 300;
export const CHRONICLE_LIMIT = 600;

export const FOOD_PER_PERSON = 0.6;
export const STARVATION_HEALTH_LOSS = 10;
export const BIRTH_BASE_CHANCE = 0.22;
/** Upper bound on births per faction per tick; keeps large cities growing. */
export const MAX_BIRTHS_PER_TICK = 8;
export const SOLDIER_UPKEEP_WEALTH = 0.25;

export const SEA_LEVEL = 0.44;

export const COLORS = [
  '#4e79a7',
  '#f28e2b',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc948',
  '#b07aa1',
  '#ff9da7',
] as const;

export const SETTLEMENT_TIERS = [
  { name: 'Camp', minPop: 0, radius: 4, maxBuildings: 8 },
  { name: 'Village', minPop: 10, radius: 6, maxBuildings: 18 },
  { name: 'Town', minPop: 30, radius: 8, maxBuildings: 32 },
  { name: 'City', minPop: 80, radius: 11, maxBuildings: 46 },
  { name: 'Metropolis', minPop: 180, radius: 14, maxBuildings: 110 },
] as const;

export function settlementTier(population: number): number {
  let tier = 0;
  for (let i = 0; i < SETTLEMENT_TIERS.length; i += 1) {
    if (population >= SETTLEMENT_TIERS[i].minPop) tier = i;
  }
  return tier;
}

/** Maximum number of AI-founded settlements a single faction may hold. */
export const MAX_SETTLEMENTS_PER_CIV = 4;
/** Material cost of founding a new settlement. */
export const NEW_SETTLEMENT_COST = 120;
/** Population required per existing settlement before another may be founded. */
export const NEW_SETTLEMENT_MIN_POP = 300;
/** Distance range in tiles between an existing centre and a new settlement. */
export const NEW_SETTLEMENT_MIN_GAP = 16;
export const NEW_SETTLEMENT_MAX_GAP = 26;
/** A* node budget for a cross-water route search. */
export const SEA_PATH_NODES = 10_000;
/** Number of coastal candidates considered when planning a crossing. */
export const MAX_COAST_CANDIDATES = 6;
/** War duration in ticks when the two capitals are on different land regions. */
export const NAVAL_WAR_TICKS = 105;

export const ERA_NAMES = ['Hearth', 'Craft', 'Engine', 'Zenith'] as const;

/** Cumulative knowledge (and population) required to enter each era. */
export const ERA_KNOWLEDGE_REQ = [0, 55, 190, 480] as const;
export const ERA_POP_REQ = [0, 8, 22, 48] as const;

export interface BuildingProduction {
  food?: number;
  materials?: number;
  wealth?: number;
  knowledge?: number;
}

export interface BuildingDef {
  type: BuildingType;
  name: string;
  short: string;
  description: string;
  /** Material cost. */
  cost: number;
  /** Work units required to finish the building. */
  work: number;
  maxHp: number;
  workers: number;
  housing: number;
  era: Era;
  armySlots: number;
  faith: number;
  produces: BuildingProduction;
}

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  [BuildingType.TownCenter]: {
    type: BuildingType.TownCenter,
    name: 'Town Center',
    short: 'Center',
    description: 'The heart of a faction. If it falls, the faction falls with it.',
    cost: 0,
    work: 0,
    maxHp: 2400,
    workers: 0,
    housing: 6,
    era: Era.Hearth,
    armySlots: 0,
    faith: 4,
    produces: { knowledge: 0.2 },
  },
  [BuildingType.House]: {
    type: BuildingType.House,
    name: 'House',
    short: 'House',
    description: 'Housing for three people. Growth stalls without room to live.',
    cost: 8,
    work: 10,
    maxHp: 80,
    workers: 0,
    housing: 6,
    era: Era.Hearth,
    armySlots: 0,
    faith: 0,
    produces: {},
  },
  [BuildingType.Farm]: {
    type: BuildingType.Farm,
    name: 'Farm',
    short: 'Farm',
    description: 'Feeds the faction. Yield depends on soil fertility and era.',
    cost: 10,
    work: 12,
    maxHp: 60,
    workers: 2,
    housing: 0,
    era: Era.Hearth,
    armySlots: 0,
    faith: 0,
    produces: { food: 6.2 },
  },
  [BuildingType.Workshop]: {
    type: BuildingType.Workshop,
    name: 'Workshop',
    short: 'Shop',
    description: 'Turns wood and stone into building materials and wealth.',
    cost: 14,
    work: 18,
    maxHp: 80,
    workers: 2,
    housing: 0,
    era: Era.Craft,
    armySlots: 0,
    faith: 0,
    produces: { materials: 1.35, wealth: 0.7 },
  },
  [BuildingType.Temple]: {
    type: BuildingType.Temple,
    name: 'Temple',
    short: 'Temple',
    description: 'Deepens faith and gathers knowledge. The seat of a faction religion.',
    cost: 16,
    work: 20,
    maxHp: 100,
    workers: 1,
    housing: 0,
    era: Era.Craft,
    armySlots: 0,
    faith: 16,
    produces: { knowledge: 1.3 },
  },
  [BuildingType.Barracks]: {
    type: BuildingType.Barracks,
    name: 'Barracks',
    short: 'Barracks',
    description: 'Trains soldiers and anchors the army. Wars need soldiers.',
    cost: 14,
    work: 16,
    maxHp: 120,
    workers: 0,
    housing: 0,
    era: Era.Hearth,
    armySlots: 6,
    faith: 0,
    produces: {},
  },
};

export interface TraitDef {
  id: TraitId;
  name: string;
  description: string;
}

export const TRAITS: TraitDef[] = [
  { id: 'militarist', name: 'Militarist', description: 'Stronger soldiers and a shorter path to war.' },
  { id: 'fertile', name: 'Fertile', description: 'Families grow faster.' },
  { id: 'industrious', name: 'Industrious', description: 'Farms and workshops produce more.' },
  { id: 'zealous', name: 'Zealous', description: 'Faith burns bright and spreads further.' },
  { id: 'scholarly', name: 'Scholarly', description: 'Knowledge and new eras come sooner.' },
  { id: 'mercantile', name: 'Mercantile', description: 'Wealth accumulates, and tempers run cooler.' },
  { id: 'stoic', name: 'Stoic', description: 'Endures famine and hardship.' },
];

export const GEN_SALT = {
  elevation: 0x1a2b3c4d,
  moisture: 0x5e6f7a8b,
  ridge: 0x9c0d1e2f,
  rivers: 0x34567890,
  names: 0x7700aa11,
  animals: 0x0badf00d,
};

export function ticksForSpeed(speed: number): number {
  return BASE_TICKS_PER_SECOND * speed;
}
