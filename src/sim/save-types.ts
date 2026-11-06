import type { AgentPoolSnapshot } from './agent-pool';
import type { AnimalPoolSnapshot } from './animal-pool';
import type { Building, ChronicleEntry, Civ, SpawnSite, War } from '../world/types';

export interface SoldierPathSave {
  path: Array<{ x: number; y: number }>;
  index: number;
  targetKey: number;
}

export interface WorldSave {
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
}

export interface GameSave {
  version: number;
  savedAt: number;
  size: number;
  seedText: string;
  startWithFactions: boolean;
  speed: number;
  rngState: number;
  nextBuildingId: number;
  nextWarId: number;
  world: WorldSave;
  civs: Civ[];
  buildings: Building[];
  wars: War[];
  relations: Float32Array;
  agents: AgentPoolSnapshot;
  animals: AnimalPoolSnapshot;
  chronicle: ChronicleEntry[];
  soldierPaths: Array<[number, SoldierPathSave]>;
}

export interface SaveMeta {
  slot: string;
  year: number;
  population: number;
  factions: number;
  size: number;
  savedAt: number;
}
