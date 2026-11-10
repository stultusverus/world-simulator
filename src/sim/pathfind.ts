import { SEA_PATH_NODES } from '../config';
import { isWalkableAt } from '../world/world';
import { isWater, type World } from '../world/types';

export interface Point {
  x: number;
  y: number;
}

/** Shared work allowance; exhaustion is deferred work, not an unreachable result. */
export interface SearchBudget {
  remaining: number;
  expanded: number;
  exhausted: boolean;
}

interface HeapNode {
  key: number;
  f: number;
}

class MinHeap {
  private keys: number[] = [];
  private fs: number[] = [];
  /** Optional tie-break value: larger wins when two entries share a cost. */
  private ties: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  private less(a: number, b: number): boolean {
    if (this.fs[a] !== this.fs[b]) return this.fs[a] < this.fs[b];
    return this.ties[a] > this.ties[b];
  }

  push(key: number, f: number, tie = 0): void {
    this.keys.push(key);
    this.fs.push(f);
    this.ties.push(tie);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): HeapNode | null {
    if (this.keys.length === 0) return null;
    const key = this.keys[0];
    const f = this.fs[0];
    const lastKey = this.keys.pop() as number;
    const lastF = this.fs.pop() as number;
    const lastTie = this.ties.pop() as number;
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.fs[0] = lastF;
      this.ties[0] = lastTie;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.keys.length && this.less(left, smallest)) smallest = left;
        if (right < this.keys.length && this.less(right, smallest)) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return { key, f };
  }

  private swap(a: number, b: number): void {
    const tk = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = tk;
    const tf = this.fs[a];
    this.fs[a] = this.fs[b];
    this.fs[b] = tf;
    const tt = this.ties[a];
    this.ties[a] = this.ties[b];
    this.ties[b] = tt;
  }
}

interface SearchBuffers {
  size: number;
  generation: number;
  scores: Float64Array;
  parents: Int32Array;
  seen: Uint32Array;
  closed: Uint32Array;
}
const searchBuffers = new WeakMap<World, SearchBuffers>();
function beginSearch(world: World): SearchBuffers {
  let state = searchBuffers.get(world);
  if (!state || state.size !== world.size) {
    const count = world.size * world.size;
    state = {
      size: world.size,
      generation: 0,
      scores: new Float64Array(count),
      parents: new Int32Array(count),
      seen: new Uint32Array(count),
      closed: new Uint32Array(count),
    };
    searchBuffers.set(world, state);
  }
  state.generation = (state.generation + 1) >>> 0;
  if (state.generation === 0) {
    state.seen.fill(0);
    state.closed.fill(0);
    state.generation = 1;
  }
  return state;
}

const STEP_COST: Record<number, number> = {
  2: 12, // sand
  3: 10, // grass
  4: 13, // forest
  5: 18, // hills
  7: 20, // snow
};

function stepCost(tile: number): number {
  return STEP_COST[tile] ?? 14;
}

// Integer octile costs keep mathematically equal f-scores exactly equal.
const CARDINAL = 1000;
const DIAGONAL = 1414;
function heuristic(dx: number, dy: number): number {
  return (Math.max(dx, dy) - Math.min(dx, dy)) * CARDINAL + Math.min(dx, dy) * DIAGONAL;
}

function expand(budget?: SearchBudget): boolean {
  if (!budget) return true;
  if (budget.remaining <= 0) {
    budget.exhausted = true;
    return false;
  }
  budget.remaining--;
  budget.expanded++;
  return true;
}

/**
 * A* over walkable terrain. Returns tiles from (but excluding) the start to
 * (and including) the goal, or null when unreachable within the node budget.
 */
export function findPath(
  world: World,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  maxNodes = 2600,
  uniformCost = false,
  budget?: SearchBudget,
): Point[] | null {
  const size = world.size;
  if (sx === tx && sy === ty) return [];
  if (!isWalkableAt(world, sx, sy) || !isWalkableAt(world, tx, ty)) return null;

  const start = sy * size + sx;
  const goal = ty * size + tx;
  const open = new MinHeap();
  const state = beginSearch(world);
  const { scores, parents, seen, closed, generation } = state;
  scores[start] = 0;
  parents[start] = -1;
  seen[start] = generation;
  open.push(start, 0);

  let expanded = 0;
  while (open.size > 0) {
    const node = open.pop();
    if (!node) break;
    const current = node.key;
    if (current === goal) {
      const path: Point[] = [];
      let cursor = current;
      while (cursor !== start) {
        path.push({ x: cursor % size, y: (cursor / size) | 0 });
        const prev = parents[cursor];
        if (prev < 0 || seen[prev] !== generation) return null;
        cursor = prev;
      }
      path.reverse();
      return path;
    }
    if (closed[current] === generation) continue;
    if (expanded >= maxNodes || !expand(budget)) return null;
    closed[current] = generation;
    expanded++;

    const cx = current % size;
    const cy = (current / size) | 0;
    const currentG = scores[current];

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        if (!isWalkableAt(world, nx, ny)) continue;
        if (dx !== 0 && dy !== 0) {
          // No corner cutting through impassable tiles.
          if (!isWalkableAt(world, cx + dx, cy) || !isWalkableAt(world, cx, cy + dy)) continue;
        }
        const neighbor = ny * size + nx;
        if (closed[neighbor] === generation) continue;
        const tile = world.terrain[neighbor];
        const diagonal = dx !== 0 && dy !== 0;
        const g = currentG + (uniformCost ? 10 : stepCost(tile)) * (diagonal ? DIAGONAL : CARDINAL);
        if (seen[neighbor] === generation && scores[neighbor] <= g) continue;
        seen[neighbor] = generation;
        scores[neighbor] = g;
        parents[neighbor] = current;
        const ax = Math.abs(nx - tx);
        const ay = Math.abs(ny - ty);
        const h = heuristic(ax, ay) * 10;
        open.push(neighbor, g + h, g);
      }
    }
  }
  return null;
}

/** Water uses uniform terrain costs with the same octile travel distance. */
const SEA_CARDINAL_COST = CARDINAL;
const SEA_DIAGONAL_COST = DIAGONAL;

function isSeaTile(world: World, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= world.size || y >= world.size) return false;
  return isWater(world.terrain[y * world.size + x]);
}

/**
 * A* across open water only. Same deterministic neighbour order and
 * no-corner-cutting rule as `findPath`. The local sea-search ceiling also
 * respects an optional shared work allowance. Returns tiles from (but excluding)
 * the start to (and including) the goal, or null when there is no water route
 * within the budget.
 */
export function findSeaPath(
  world: World,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  maxNodes = SEA_PATH_NODES,
  budget?: SearchBudget,
): Point[] | null {
  const size = world.size;
  if (sx === tx && sy === ty) return [];
  if (!isSeaTile(world, sx, sy) || !isSeaTile(world, tx, ty)) return null;

  const start = sy * size + sx;
  const goal = ty * size + tx;
  const open = new MinHeap();
  const state = beginSearch(world);
  const { scores, parents, seen, closed, generation } = state;
  scores[start] = 0;
  parents[start] = -1;
  seen[start] = generation;
  open.push(start, 0);

  let expanded = 0;
  while (open.size > 0) {
    const node = open.pop();
    if (!node) break;
    const current = node.key;
    if (current === goal) {
      const path: Point[] = [];
      let cursor = current;
      while (cursor !== start) {
        path.push({ x: cursor % size, y: (cursor / size) | 0 });
        const prev = parents[cursor];
        if (prev < 0 || seen[prev] !== generation) return null;
        cursor = prev;
      }
      path.reverse();
      return path;
    }
    if (closed[current] === generation) continue;
    if (expanded >= maxNodes || !expand(budget)) return null;
    closed[current] = generation;
    expanded++;

    const cx = current % size;
    const cy = (current / size) | 0;
    const currentG = scores[current];

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!isSeaTile(world, nx, ny)) continue;
        if (dx !== 0 && dy !== 0) {
          // No corner cutting: both cardinal tiles must also be water.
          if (!isSeaTile(world, cx + dx, cy) || !isSeaTile(world, cx, cy + dy)) continue;
        }
        const neighbor = ny * size + nx;
        if (closed[neighbor] === generation) continue;
        const diagonal = dx !== 0 && dy !== 0;
        const g = currentG + (diagonal ? SEA_DIAGONAL_COST : SEA_CARDINAL_COST);
        if (seen[neighbor] === generation && scores[neighbor] <= g) continue;
        seen[neighbor] = generation;
        scores[neighbor] = g;
        parents[neighbor] = current;
        const ax = Math.abs(nx - tx);
        const ay = Math.abs(ny - ty);
        const h = heuristic(ax, ay);
        // Break equal-cost ties toward the deeper node so open water (many
        // equal octile routes) cannot exhaust the node budget.
        open.push(neighbor, g + h, g);
      }
    }
  }
  return null;
}
