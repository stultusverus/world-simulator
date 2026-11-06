export enum Tile {
  DeepWater = 0,
  ShallowWater = 1,
  Sand = 2,
  Grass = 3,
  Forest = 4,
  Hills = 5,
  Mountain = 6,
  Snow = 7,
}

export const TILE_NAMES: readonly string[] = [
  'Deep water',
  'Shallow water',
  'Sand',
  'Grassland',
  'Forest',
  'Hills',
  'Mountain',
  'Snow',
];

export function isWater(tile: number): boolean {
  return tile === Tile.DeepWater || tile === Tile.ShallowWater;
}

export function isWalkable(tile: number): boolean {
  return (
    tile === Tile.Sand ||
    tile === Tile.Grass ||
    tile === Tile.Forest ||
    tile === Tile.Hills ||
    tile === Tile.Snow
  );
}

export function isFarmable(tile: number): boolean {
  return tile === Tile.Grass || tile === Tile.Forest;
}

export enum Job {
  Idle = 0,
  Farmer = 1,
  Builder = 2,
  Priest = 3,
  Soldier = 4,
  Worker = 5,
}

export const JOB_NAMES: readonly string[] = ['Forager', 'Farmer', 'Builder', 'Priest', 'Soldier', 'Worker'];

export const IDLE = 0;
export const NO_OWNER = 255;
export const NO_AGENT = 0xffffffff;
export const NO_BUILDING = 0xffff;

export enum AgentState {
  Idle = 0,
  Working = 1,
  Marching = 2,
  Fighting = 3,
  Returning = 4,
}

export enum BuildingType {
  TownCenter = 0,
  House = 1,
  Farm = 2,
  Workshop = 3,
  Temple = 4,
  Barracks = 5,
}

export enum Era {
  Hearth = 0,
  Craft = 1,
  Engine = 2,
  Zenith = 3,
}

export type TraitId =
  | 'militarist'
  | 'fertile'
  | 'industrious'
  | 'zealous'
  | 'scholarly'
  | 'mercantile'
  | 'stoic';

export type ChronicleKind = 'society' | 'war' | 'diplomacy' | 'faith' | 'progress' | 'power' | 'nature';

export interface SpawnSite {
  x: number;
  y: number;
}

export interface World {
  size: number;
  seedText: string;
  seed: number;
  tick: number;
  elevation: Uint8Array;
  moisture: Uint8Array;
  terrain: Uint8Array;
  fertility: Uint8Array;
  river: Uint8Array;
  owner: Uint8Array;
  waterDistance: Uint8Array;
  spawnSites: SpawnSite[];
  landTiles: number;
  waterTiles: number;
  terrainVersion: number;
  ownerVersion: number;
}

export interface Civ {
  id: number;
  name: string;
  color: number;
  traits: TraitId[];
  religion: string;
  religionOf: number;
  piety: number;
  era: Era;
  knowledge: number;
  food: number;
  materials: number;
  wealth: number;
  faith: number;
  centerX: number;
  centerY: number;
  alive: boolean;
  foundedTick: number;
  blessingUntil: number;
  cooldownUntil: number;
  population: number;
  soldiers: number;
  housing: number;
  buildings: number;
  happiness: number;
  casualties: number;
  foodShortage: number;
  foodProduction: number;
  foodNeed: number;
  maxPopulation: number;
  lastFamineTick: number;
  warId: number;
  eraChangedTick: number;
}

export interface Building {
  id: number;
  civ: number;
  type: BuildingType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  work: number;
  workNeeded: number;
  built: boolean;
  workers: number;
  flash: number;
}

export interface War {
  id: number;
  a: number;
  b: number;
  startTick: number;
  casualtiesA: number;
  casualtiesB: number;
  razedA: number;
  razedB: number;
  lastBattleTick: number;
  battleActive: boolean;
  battleDeaths: number;
  battleX: number;
  battleY: number;
}

export interface ChronicleEntry {
  year: number;
  kind: ChronicleKind;
  text: string;
  civ?: number;
  x?: number;
  y?: number;
}

export interface WorldStats {
  population: number;
  factions: number;
  wars: number;
  animals: number;
  buildings: number;
  maxEra: number;
}

export interface SaveMeta {
  slot: string;
  year: number;
  population: number;
  factions: number;
  size: number;
  savedAt: number;
}
