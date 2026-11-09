import {
  AGENT_CAP,
  BUILDING_DEFS,
  DEFAULT_STARTING_FACTIONS,
  MAX_AGENTS_SUPPORTED,
  MAX_ANIMALS_SUPPORTED,
  MAX_FACTIONS,
  SAVE_VERSION,
  SETTLEMENT_TIERS,
  WILDLIFE_CAP,
  settlementTier,
} from '../config';
import { RNG, mixSeed } from '../core/rng';
import { generateWorld } from '../world/generate';
import { isWalkableAt, randomLandTile, recomputeOwnership } from '../world/world';
import { computeReachability, regionAt, type Reachability } from '../world/regions';
import {
  NO_BUILDING,
  NO_OWNER,
  type Building,
  type ChronicleKind,
  type Civ,
  type SpawnSite,
  type War,
  type World,
  type WorldStats,
} from '../world/types';
import { AgentPool } from './agent-pool';
import { AnimalKind, AnimalPool } from './animal-pool';
import { Chronicle } from './chronicle';
import { makeWorldName } from './names';
import { foundFaction } from './faction';
import { assignJobs, runAgentLives } from './agents';
import { runEconomy } from './economy';
import { runWar, eliminateCiv } from './war';
import { runDiplomacy } from './diplomacy';
import { runProgress } from './progress';
import { runEnvironment } from './environment';
import { runMigration, runSettlements, settlementCenters } from './settlements';
import type { NavalCrossing } from './naval';
import type { GameSave } from './save-types';

export interface GameOptions {
  size: number;
  seedText: string;
  startWithFactions: boolean;
}

export interface PathPoint {
  x: number;
  y: number;
}

export interface SoldierPath {
  path: PathPoint[];
  index: number;
  targetKey: number;
}

export interface SpawnAgentOptions {
  age: number;
  gender: number;
  lifespan?: number;
  home?: number;
  job?: number;
  health?: number;
  mother?: number;
  father?: number;
}

export class Game {
  world: World;
  civs: Civ[] = [];
  buildings: Building[] = [];
  buildingById = new Map<number, Building>();
  buildingAt = new Map<number, Building>();
  agents: AgentPool;
  animals: AnimalPool;
  relations = new Float32Array(MAX_FACTIONS * MAX_FACTIONS);
  wars: War[] = [];
  chronicle = new Chronicle();
  rng: RNG;
  speed = 1;
  paused = false;
  startWithFactions: boolean;
  nextBuildingId = 1;
  nextWarId = 1;
  agentCap: number;
  wildlifeCap: number;
  worldName: string;
  stats: WorldStats = { population: 0, factions: 0, wars: 0, animals: 0, buildings: 0, maxEra: 0 };
  soldierPaths = new Map<number, SoldierPath>();
  reachability: Reachability;
  /** Derived per-target naval plans; never serialized. */
  navalPlans = new Map<string, NavalCrossing | null>();
  terrainDirty: number[] = [];
  ownershipDirty = true;

  constructor(options: GameOptions, save?: GameSave) {
    if (save) {
      this.world = {
        size: save.world.size,
        seedText: save.world.seedText,
        seed: save.world.seed,
        tick: save.world.tick,
        elevation: save.world.elevation.slice(),
        moisture: save.world.moisture.slice(),
        terrain: save.world.terrain.slice(),
        fertility: save.world.fertility.slice(),
        river: save.world.river.slice(),
        owner: save.world.owner.slice(),
        waterDistance: save.world.waterDistance.slice(),
        spawnSites: save.world.spawnSites.map((site) => ({ ...site })),
        landTiles: save.world.landTiles,
        waterTiles: save.world.waterTiles,
        terrainVersion: 1,
        ownerVersion: 1,
      };
      this.reachability = computeReachability(this.world);
      this.startWithFactions = save.startWithFactions;
      this.agentCap = AGENT_CAP[save.size] ?? 1200;
      this.wildlifeCap = WILDLIFE_CAP[save.size] ?? 150;
      this.agents = AgentPool.fromSnapshot(save.agents);
      this.animals = AnimalPool.fromSnapshot(save.animals);
      this.rng = new RNG(0);
      this.rng.setState(save.rngState);
      this.worldName = makeWorldName(save.seedText);
      this.civs = save.civs.map((civ) => ({ ...civ, traits: [...civ.traits] }));
      this.buildings = save.buildings.map((building) => ({ ...building }));
      for (const building of this.buildings) {
        this.buildingById.set(building.id, building);
        this.buildingAt.set(building.y * this.world.size + building.x, building);
      }
      this.wars = save.wars.map((war) => ({ ...war }));
      this.relations.set(save.relations);
      this.chronicle.entries = save.chronicle.map((entry) => ({ ...entry }));
      this.nextBuildingId = save.nextBuildingId;
      this.nextWarId = save.nextWarId;
      this.speed = save.speed;
      for (const [id, path] of save.soldierPaths) {
        this.soldierPaths.set(id, {
          path: path.path.map((point) => ({ ...point })),
          index: path.index,
          targetKey: path.targetKey,
        });
      }
      this.ownershipDirty = false;
      this.updateStats();
      this.refreshOwnership();
      return;
    }
    this.world = generateWorld(options.size, options.seedText);
    this.reachability = computeReachability(this.world);
    this.startWithFactions = options.startWithFactions;
    this.agentCap = AGENT_CAP[options.size] ?? 1200;
    this.wildlifeCap = WILDLIFE_CAP[options.size] ?? 150;
    this.agents = new AgentPool(MAX_AGENTS_SUPPORTED);
    this.animals = new AnimalPool(MAX_ANIMALS_SUPPORTED);
    this.rng = new RNG(mixSeed(this.world.seed, 0xc0ffee));
    this.worldName = makeWorldName(options.seedText);
    this.chronicle.add(this.world.tick, 'nature', `The world of ${this.worldName} takes shape.`);
    this.seedWorld();
    this.updateStats();
    this.refreshOwnership();
  }

  static fromSave(save: GameSave): Game {
    return new Game(
      { size: save.size, seedText: save.seedText, startWithFactions: save.startWithFactions },
      save,
    );
  }

  toSave(savedAt = Date.now()): GameSave {
    // Territory is derived from buildings and population tier. Canonicalise it
    // before serialising so a load recomputes exactly the same map.
    this.refreshOwnership();
    return {
      version: SAVE_VERSION,
      savedAt,
      size: this.world.size,
      seedText: this.world.seedText,
      startWithFactions: this.startWithFactions,
      speed: this.speed,
      rngState: this.rng.getState(),
      nextBuildingId: this.nextBuildingId,
      nextWarId: this.nextWarId,
      world: {
        size: this.world.size,
        seedText: this.world.seedText,
        seed: this.world.seed,
        tick: this.world.tick,
        elevation: this.world.elevation.slice(),
        moisture: this.world.moisture.slice(),
        terrain: this.world.terrain.slice(),
        fertility: this.world.fertility.slice(),
        river: this.world.river.slice(),
        owner: this.world.owner.slice(),
        waterDistance: this.world.waterDistance.slice(),
        spawnSites: this.world.spawnSites.map((site) => ({ ...site })),
        landTiles: this.world.landTiles,
        waterTiles: this.world.waterTiles,
      },
      civs: this.civs.map((civ) => ({ ...civ, traits: [...civ.traits] })),
      buildings: this.buildings.map((building) => ({ ...building })),
      wars: this.wars.map((war) => ({ ...war })),
      relations: this.relations.slice(),
      agents: this.agents.toSnapshot(),
      animals: this.animals.toSnapshot(),
      chronicle: this.chronicle.entries.map((entry) => ({ ...entry })),
      soldierPaths: [...this.soldierPaths.entries()].map(([id, path]) => [
        id,
        {
          path: path.path.map((point) => ({ ...point })),
          index: path.index,
          targetKey: path.targetKey,
        },
      ]),
    };
  }

  get year(): number {
    return this.world.tick;
  }

  aliveCivs(): Civ[] {
    return this.civs.filter((civ) => civ.alive);
  }

  getCiv(id: number): Civ | undefined {
    return this.civs[id];
  }

  addChronicle(kind: ChronicleKind, text: string, civ?: number, x?: number, y?: number): void {
    this.chronicle.add(this.world.tick, kind, text, civ, x, y);
  }

  private seedWorld(): void {
    const count = this.startWithFactions
      ? Math.min(DEFAULT_STARTING_FACTIONS, this.world.spawnSites.length)
      : 0;
    for (let i = 0; i < count; i += 1) {
      const site = this.world.spawnSites[i];
      foundFaction(this, site.x, site.y, { initial: true });
    }
    if (!this.startWithFactions) {
      this.chronicle.add(this.world.tick, 'nature', 'The land lies empty, waiting for its first people.');
    }
    this.seedWildlife();
  }

  private seedWildlife(): void {
    const deerTarget = Math.max(8, Math.floor(this.wildlifeCap * 0.3));
    const wolfTarget = Math.max(2, Math.floor(this.wildlifeCap * 0.08));
    for (let i = 0; i < deerTarget; i += 1) {
      const spot = randomLandTile(this.world, this.rng);
      if (spot) this.spawnAnimal(AnimalKind.Deer, spot.x, spot.y);
    }
    for (let i = 0; i < wolfTarget; i += 1) {
      const spot = randomLandTile(this.world, this.rng);
      if (spot) this.spawnAnimal(AnimalKind.Wolf, spot.x, spot.y);
    }
  }

  spawnAnimal(kind: AnimalKind, x: number, y: number): number {
    if (this.animals.count >= this.wildlifeCap) return -1;
    if (!isWalkableAt(this.world, x, y)) return -1;
    return this.animals.spawn({ x, y, kind });
  }

  spawnAgent(civId: number, x: number, y: number, opts: SpawnAgentOptions): number {
    if (this.agents.count >= this.agentCap) return -1;
    const lifespan = opts.lifespan ?? 90 + this.rng.int(0, 45);
    return this.agents.spawn({
      x,
      y,
      civId,
      age: opts.age,
      gender: opts.gender,
      lifespan,
      home: opts.home ?? NO_BUILDING,
      job: opts.job ?? 0,
      health: opts.health ?? 82,
      mother: opts.mother,
      father: opts.father,
    });
  }

  removeAgent(id: number): void {
    this.agents.kill(id);
    this.soldierPaths.delete(id);
  }

  addBuilding(civId: number, type: Building['type'], x: number, y: number, built: boolean): Building {
    const def = BUILDING_DEFS[type];
    const building: Building = {
      id: this.nextBuildingId++,
      civ: civId,
      type,
      x,
      y,
      hp: built ? def.maxHp : Math.round(def.maxHp * 0.35),
      maxHp: def.maxHp,
      work: built ? def.work : 0,
      workNeeded: def.work,
      built,
      workers: 0,
      flash: 0,
    };
    this.buildings.push(building);
    this.buildingById.set(building.id, building);
    this.buildingAt.set(y * this.world.size + x, building);
    this.ownershipDirty = true;
    return building;
  }

  removeBuilding(building: Building): void {
    const i = this.buildings.indexOf(building);
    if (i >= 0) this.buildings.splice(i, 1);
    this.buildingById.delete(building.id);
    this.buildingAt.delete(building.y * this.world.size + building.x);
    for (let id = 0; id < this.agents.capacity; id += 1) {
      if (this.agents.alive[id] === 0) continue;
      if (this.agents.home[id] === building.id) this.agents.home[id] = NO_BUILDING;
      if (this.agents.work[id] === building.id) this.agents.work[id] = NO_BUILDING;
    }
    this.ownershipDirty = true;
  }

  /** Finds an unoccupied, walkable tile for a new building. */
  findBuildingSpot(
    civ: Civ,
    type: Building['type'],
    minRadius = 2,
    maxRadius?: number,
    center?: SpawnSite,
  ): SpawnSite | null {
    const originX = center?.x ?? civ.centerX;
    const originY = center?.y ?? civ.centerY;
    const maxR = maxRadius ?? SETTLEMENT_TIERS[settlementTier(civ.population)].radius;
    const originRegion = regionAt(this.world, this.reachability, Math.floor(originX), Math.floor(originY));
    const accept = (x: number, y: number): boolean => {
      if (!isWalkableAt(this.world, x, y)) return false;
      const index = y * this.world.size + x;
      if (this.buildingAt.has(index)) return false;
      const owner = this.world.owner[index];
      if (owner !== NO_OWNER && owner !== civ.id) return false;
      if (originRegion !== 0 && regionAt(this.world, this.reachability, x, y) !== originRegion) return false;
      return true;
    };
    const preferFertility = type === 2; // Farm
    let best: SpawnSite | null = null;
    let bestScore = -1;
    const attempts = preferFertility ? 100 : 70;
    for (let i = 0; i < attempts; i += 1) {
      const angle = this.rng.next() * Math.PI * 2;
      const radius = minRadius + this.rng.next() * Math.max(1, maxR - minRadius);
      const x = Math.round(originX + Math.cos(angle) * radius);
      const y = Math.round(originY + Math.sin(angle) * radius);
      if (!accept(x, y)) continue;
      const index = y * this.world.size + x;
      if (preferFertility) {
        const score = this.world.fertility[index];
        if (score > bestScore) {
          bestScore = score;
          best = { x, y };
          if (score >= 205) break;
        }
      } else {
        return { x, y };
      }
    }
    if (preferFertility && best) return best;
    if (!preferFertility) {
      // Fall back to any walkable spot close to the center.
      for (let r = 2; r <= maxR + 2; r += 1) {
        for (let dy = -r; dy <= r; dy += 1) {
          for (let dx = -r; dx <= r; dx += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const x = Math.round(originX + dx);
            const y = Math.round(originY + dy);
            if (!accept(x, y)) continue;
            return { x, y };
          }
        }
      }
    }
    return null;
  }

  /** Recomputes land/water connectivity after a terrain-shape change. */
  refreshReachability(): void {
    this.reachability = computeReachability(this.world);
    this.navalPlans.clear();
  }

  markTerrainChanged(index: number): void {
    this.world.terrainVersion += 1;
    this.terrainDirty.push(index);
  }

  refreshOwnership(): void {
    const radii = new Map<number, number>();
    for (const civ of this.civs) {
      if (!civ.alive) continue;
      radii.set(civ.id, SETTLEMENT_TIERS[settlementTier(civ.population)].radius);
    }
    recomputeOwnership(this.world, this.buildings, (civId) => radii.get(civId) ?? 4);
    this.ownershipDirty = false;
  }

  /** Civ whose territory contains the tile, else the nearest center within range. */
  civNear(x: number, y: number, radius = 12): Civ | null {
    if (x >= 0 && y >= 0 && x < this.world.size && y < this.world.size) {
      const owner = this.world.owner[y * this.world.size + x];
      if (owner !== 255 && this.civs[owner]?.alive) return this.civs[owner];
    }
    let best: Civ | null = null;
    let bestDistance = radius;
    for (const civ of this.civs) {
      if (!civ.alive) continue;
      const centers = settlementCenters(this, civ.id);
      const candidates = centers.length > 0 ? centers : [{ x: civ.centerX, y: civ.centerY } as const];
      for (const center of candidates) {
        const distance = Math.hypot(center.x - x, center.y - y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = civ;
        }
      }
    }
    return best;
  }

  updateStats(): void {
    for (const civ of this.civs) {
      civ.population = 0;
      civ.soldiers = 0;
      civ.buildings = 0;
      civ.housing = 0;
    }
    let population = 0;
    const agents = this.agents;
    for (let id = 0; id < agents.capacity; id += 1) {
      if (agents.alive[id] === 0) continue;
      population += 1;
      const civ = this.civs[agents.civ[id]];
      if (!civ) continue;
      civ.population += 1;
      if (agents.job[id] === 4) civ.soldiers += 1;
    }
    let buildingCount = 0;
    for (const building of this.buildings) {
      const civ = this.civs[building.civ];
      if (!civ) continue;
      if (building.built) {
        buildingCount += 1;
        civ.buildings += 1;
        civ.housing += BUILDING_DEFS[building.type].housing;
      }
    }
    let aliveFactions = 0;
    let maxEra = 0;
    for (const civ of this.civs) {
      if (!civ.alive) continue;
      aliveFactions += 1;
      maxEra = Math.max(maxEra, civ.era);
    }
    this.stats = {
      population,
      factions: aliveFactions,
      wars: this.wars.length,
      animals: this.animals.count,
      buildings: buildingCount,
      maxEra,
    };
  }

  tick(): void {
    this.world.tick += 1;
    assignJobs(this);
    runEconomy(this);
    runAgentLives(this);
    this.eliminateEmptyCivs();
    runWar(this);
    runDiplomacy(this);
    runProgress(this);
    runSettlements(this);
    runMigration(this);
    runEnvironment(this);
    this.updateStats();
    if (this.ownershipDirty || this.world.tick % 4 === 0) this.refreshOwnership();
  }

  /** A people with no living individuals is extinct even if walls remain. */
  private eliminateEmptyCivs(): void {
    for (const civ of this.civs) {
      if (!civ.alive) continue;
      let hasCitizen = false;
      for (let id = 0; id < this.agents.capacity; id += 1) {
        if (this.agents.alive[id] === 1 && this.agents.civ[id] === civ.id) {
          hasCitizen = true;
          break;
        }
      }
      if (!hasCitizen) eliminateCiv(this, civ);
    }
  }
}
