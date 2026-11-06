import { isWalkableAt } from '../world/world';
import type { World } from '../world/types';

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

  get size(): number {
    return this.keys.length;
  }

  push(key: number, f: number): void {
    this.keys.push(key);
    this.fs.push(f);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.fs[parent] <= this.fs[i]) break;
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
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.fs[0] = lastF;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.keys.length && this.fs[left] < this.fs[smallest]) smallest = left;
        if (right < this.keys.length && this.fs[right] < this.fs[smallest]) smallest = right;
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
