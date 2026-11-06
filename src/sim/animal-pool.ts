export enum AnimalKind {
  Deer = 0,
  Wolf = 1,
}

export interface AnimalSpawnOptions {
  x: number;
  y: number;
  kind: AnimalKind;
  age?: number;
  lifespan?: number;
}

/** Lightweight store for wildlife. */
export class AnimalPool {
  readonly capacity: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly kind: Uint8Array;
  readonly age: Uint16Array;
  readonly lifespan: Uint16Array;
  readonly health: Float32Array;
  readonly alive: Uint8Array;
  readonly targetX: Float32Array;
  readonly targetY: Float32Array;
  count = 0;

  private readonly free: Uint32Array;
  private freeCount: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.age = new Uint16Array(capacity);
    this.lifespan = new Uint16Array(capacity);
    this.health = new Float32Array(capacity);
    this.alive = new Uint8Array(capacity);
    this.targetX = new Float32Array(capacity);
    this.targetY = new Float32Array(capacity);
    this.free = new Uint32Array(capacity);
    this.freeCount = capacity;
    for (let i = 0; i < capacity; i += 1) this.free[i] = i;
  }

  spawn(opts: AnimalSpawnOptions): number {
    if (this.freeCount <= 0) return -1;
    const id = this.free[--this.freeCount];
    this.x[id] = opts.x;
    this.y[id] = opts.y;
    this.kind[id] = opts.kind;
    this.age[id] = opts.age ?? 0;
    this.lifespan[id] = opts.lifespan ?? (opts.kind === AnimalKind.Deer ? 60 : 45);
    this.health[id] = 100;
    this.alive[id] = 1;
    this.targetX[id] = opts.x;
    this.targetY[id] = opts.y;
    this.count += 1;
    return id;
  }

  kill(id: number): void {
    if (id < 0 || id >= this.capacity || this.alive[id] === 0) return;
    this.alive[id] = 0;
    this.count -= 1;
    this.free[this.freeCount++] = id;
  }
}
