import { NO_AGENT, NO_BUILDING } from '../world/types';

export interface AgentPoolSnapshot {
  capacity: number;
  count: number;
  x: Float32Array;
  y: Float32Array;
  civ: Uint8Array;
  job: Uint8Array;
  state: Uint8Array;
  age: Uint16Array;
  lifespan: Uint16Array;
  health: Float32Array;
  hunger: Float32Array;
  happiness: Float32Array;
  faith: Float32Array;
  home: Uint16Array;
  work: Uint16Array;
  partner: Uint32Array;
  mother: Uint32Array;
  father: Uint32Array;
  alive: Uint8Array;
  gender: Uint8Array;
  targetX: Float32Array;
  targetY: Float32Array;
  free: Uint32Array;
  freeCount: number;
}

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

  toSnapshot(): AgentPoolSnapshot {
    return {
      capacity: this.capacity,
      count: this.count,
      x: this.x.slice(),
      y: this.y.slice(),
      civ: this.civ.slice(),
      job: this.job.slice(),
      state: this.state.slice(),
      age: this.age.slice(),
      lifespan: this.lifespan.slice(),
      health: this.health.slice(),
      hunger: this.hunger.slice(),
      happiness: this.happiness.slice(),
      faith: this.faith.slice(),
      home: this.home.slice(),
      work: this.work.slice(),
      partner: this.partner.slice(),
      mother: this.mother.slice(),
      father: this.father.slice(),
      alive: this.alive.slice(),
      gender: this.gender.slice(),
      targetX: this.targetX.slice(),
      targetY: this.targetY.slice(),
      free: this.free.slice(),
      freeCount: this.freeCount,
    };
  }

  static fromSnapshot(snapshot: AgentPoolSnapshot): AgentPool {
    const pool = new AgentPool(snapshot.capacity);
    pool.count = snapshot.count;
    pool.x.set(snapshot.x);
    pool.y.set(snapshot.y);
    pool.civ.set(snapshot.civ);
    pool.job.set(snapshot.job);
    pool.state.set(snapshot.state);
    pool.age.set(snapshot.age);
    pool.lifespan.set(snapshot.lifespan);
    pool.health.set(snapshot.health);
    pool.hunger.set(snapshot.hunger);
    pool.happiness.set(snapshot.happiness);
    pool.faith.set(snapshot.faith);
    pool.home.set(snapshot.home);
    pool.work.set(snapshot.work);
    pool.partner.set(snapshot.partner);
    pool.mother.set(snapshot.mother);
    pool.father.set(snapshot.father);
    pool.alive.set(snapshot.alive);
    pool.gender.set(snapshot.gender);
    pool.targetX.set(snapshot.targetX);
    pool.targetY.set(snapshot.targetY);
    pool.free.set(snapshot.free);
    pool.freeCount = snapshot.freeCount;
    return pool;
  }
}
