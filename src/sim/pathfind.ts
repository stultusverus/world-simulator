import { SEA_PATH_NODES } from '../config';
import { isWalkableAt } from '../world/world';
import { isWater, type World } from '../world/types';

export interface Point {
  x: number;
  y: number;
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
    this.ties.pop();
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.fs[0] = lastF;
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
): Point[] | null {
  const size = world.size;
  if (sx === tx && sy === ty) return [];
  if (!isWalkableAt(world, sx, sy) || !isWalkableAt(world, tx, ty)) return null;

  const start = sy * size + sx;
  const goal = ty * size + tx;
  const open = new MinHeap();
  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();

  gScore.set(start, 0);
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
        const prev = cameFrom.get(cursor);
        if (prev === undefined) return null;
        cursor = prev;
      }
      path.reverse();
      return path;
    }
    if (closed.has(current)) continue;
    closed.add(current);
    expanded += 1;
    if (expanded > maxNodes) return null;

    const cx = current % size;
    const cy = (current / size) | 0;
    const currentG = gScore.get(current) ?? Infinity;

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
        if (closed.has(neighbor)) continue;
        const tile = world.terrain[neighbor];
        const diagonal = dx !== 0 && dy !== 0;
        const g = currentG + stepCost(tile) * (diagonal ? Math.SQRT2 : 1);
        const known = gScore.get(neighbor);
        if (known !== undefined && known <= g) continue;
        gScore.set(neighbor, g);
        cameFrom.set(neighbor, current);
        const h = (Math.abs(nx - tx) + Math.abs(ny - ty)) * 10;
        open.push(neighbor, g + h);
      }
    }
  }
  return null;
}

/** Uniform water step cost keeps sea routes shortest in tile count. */
const SEA_CARDINAL_COST = 10;
const SEA_DIAGONAL_COST = 10 * Math.SQRT2;

function isSeaTile(world: World, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= world.size || y >= world.size) return false;
  return isWater(world.terrain[y * world.size + x]);
}

/**
 * A* across open water only. Same deterministic neighbour order and
 * no-corner-cutting rule as `findPath`, but the node budget is separate so a
 * long crossing cannot starve land routing. Returns tiles from (but excluding)
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
): Point[] | null {
  const size = world.size;
  if (sx === tx && sy === ty) return [];
  if (!isSeaTile(world, sx, sy) || !isSeaTile(world, tx, ty)) return null;

  const start = sy * size + sx;
  const goal = ty * size + tx;
  const open = new MinHeap();
  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();

  gScore.set(start, 0);
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
        const prev = cameFrom.get(cursor);
        if (prev === undefined) return null;
        cursor = prev;
      }
      path.reverse();
      return path;
    }
    if (closed.has(current)) continue;
    closed.add(current);
    expanded += 1;
    if (expanded > maxNodes) return null;

    const cx = current % size;
    const cy = (current / size) | 0;
    const currentG = gScore.get(current) ?? Infinity;

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
        if (closed.has(neighbor)) continue;
        const diagonal = dx !== 0 && dy !== 0;
        const g = currentG + (diagonal ? SEA_DIAGONAL_COST : SEA_CARDINAL_COST);
        const known = gScore.get(neighbor);
        if (known !== undefined && known <= g) continue;
        gScore.set(neighbor, g);
        cameFrom.set(neighbor, current);
        const ax = Math.abs(nx - tx);
        const ay = Math.abs(ny - ty);
        const h = (Math.max(ax, ay) + (Math.SQRT2 - 1) * Math.min(ax, ay)) * 10;
        // Break equal-cost ties toward the deeper node so open water (many
        // equal octile routes) cannot exhaust the node budget.
        open.push(neighbor, g + h, -g);
      }
    }
  }
  return null;
}
