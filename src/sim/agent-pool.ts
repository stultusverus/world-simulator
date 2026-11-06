import { NO_AGENT, NO_BUILDING } from '../world/types';

export interface AgentSpawnOptions {
  x: number;
  y: number;
  civId: number;
  age: number;
  gender: number;
  lifespan: number;
  home?: number;
  job?: number;
  state?: number;
  health?: number;
  hunger?: number;
  happiness?: number;
  faith?: number;
  mother?: number;
  father?: number;
  partner?: number;
  work?: number;
}

/**
 * Structure-of-arrays agent store. Agents are addressable by slot index; dead
 * slots are recycled, and stale family/partner references are cleared on death.
 */
export class AgentPool {
  readonly capacity: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly civ: Uint8Array;
  readonly job: Uint8Array;
  readonly state: Uint8Array;
  readonly age: Uint16Array;
  readonly lifespan: Uint16Array;
  readonly health: Float32Array;
  readonly hunger: Float32Array;
  readonly happiness: Float32Array;
  readonly faith: Float32Array;
  readonly home: Uint16Array;
  readonly work: Uint16Array;
  readonly partner: Uint32Array;
  readonly mother: Uint32Array;
  readonly father: Uint32Array;
  readonly alive: Uint8Array;
  readonly gender: Uint8Array;
  readonly targetX: Float32Array;
  readonly targetY: Float32Array;
  count = 0;

  private readonly free: Uint32Array;
  private freeCount: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.civ = new Uint8Array(capacity);
    this.job = new Uint8Array(capacity);
    this.state = new Uint8Array(capacity);
    this.age = new Uint16Array(capacity);
    this.lifespan = new Uint16Array(capacity);
    this.health = new Float32Array(capacity);
    this.hunger = new Float32Array(capacity);
    this.happiness = new Float32Array(capacity);
    this.faith = new Float32Array(capacity);
    this.home = new Uint16Array(capacity);
    this.work = new Uint16Array(capacity);
    this.partner = new Uint32Array(capacity);
    this.mother = new Uint32Array(capacity);
    this.father = new Uint32Array(capacity);
    this.alive = new Uint8Array(capacity);
    this.gender = new Uint8Array(capacity);
    this.targetX = new Float32Array(capacity);
    this.targetY = new Float32Array(capacity);
    this.free = new Uint32Array(capacity);
    this.freeCount = capacity;
    for (let i = 0; i < capacity; i += 1) this.free[i] = i;
    this.partner.fill(NO_AGENT);
    this.mother.fill(NO_AGENT);
    this.father.fill(NO_AGENT);
    this.home.fill(NO_BUILDING);
    this.work.fill(NO_BUILDING);
  }

  spawn(opts: AgentSpawnOptions): number {
    if (this.freeCount <= 0) return -1;
    const id = this.free[--this.freeCount];
    this.x[id] = opts.x;
    this.y[id] = opts.y;
    this.civ[id] = opts.civId;
    this.job[id] = opts.job ?? 0;
    this.state[id] = opts.state ?? 0;
    this.age[id] = opts.age;
    this.lifespan[id] = opts.lifespan;
    this.health[id] = opts.health ?? 80;
    this.hunger[id] = opts.hunger ?? 0;
    this.happiness[id] = opts.happiness ?? 55;
    this.faith[id] = opts.faith ?? 8;
    this.home[id] = opts.home ?? NO_BUILDING;
    this.work[id] = opts.work ?? NO_BUILDING;
    this.partner[id] = opts.partner ?? NO_AGENT;
    this.mother[id] = opts.mother ?? NO_AGENT;
    this.father[id] = opts.father ?? NO_AGENT;
    this.alive[id] = 1;
    this.gender[id] = opts.gender;
    this.targetX[id] = opts.x;
    this.targetY[id] = opts.y;
    this.count += 1;
    return id;
  }

  kill(id: number): void {
    if (id < 0 || id >= this.capacity || this.alive[id] === 0) return;
    this.alive[id] = 0;
    this.count -= 1;
    for (let i = 0; i < this.capacity; i += 1) {
      if (this.alive[i] === 0) continue;
      if (this.partner[i] === id) this.partner[i] = NO_AGENT;
      if (this.mother[i] === id) this.mother[i] = NO_AGENT;
      if (this.father[i] === id) this.father[i] = NO_AGENT;
    }
    this.partner[id] = NO_AGENT;
    this.mother[id] = NO_AGENT;
    this.father[id] = NO_AGENT;
    this.home[id] = NO_BUILDING;
    this.work[id] = NO_BUILDING;
    this.free[this.freeCount++] = id;
  }

  isAlive(id: number): boolean {
    return id >= 0 && id < this.capacity && this.alive[id] === 1;
  }
}
