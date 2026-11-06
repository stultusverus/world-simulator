import { Tile } from '../world/types';
import { isWalkableAt, tryFindWalkableNear } from '../world/world';
import { AnimalKind } from './animal-pool';
import type { Game } from './game';

function spreadForest(game: Game): void {
  const world = game.world;
  const attempts = 12 + Math.floor(world.size / 256) * 4;
  const size = world.size;
  for (let i = 0; i < attempts; i += 1) {
    const x = game.rng.int(0, size - 1);
    const y = game.rng.int(0, size - 1);
    const index = y * size + x;
    const tile = world.terrain[index];
    if (tile === Tile.Grass) {
      if (world.moisture[index] < 105 || world.fertility[index] < 100) continue;
      const hasForestNeighbor =
        (x > 0 && world.terrain[index - 1] === Tile.Forest) ||
        (x < size - 1 && world.terrain[index + 1] === Tile.Forest) ||
        (y > 0 && world.terrain[index - size] === Tile.Forest) ||
        (y < size - 1 && world.terrain[index + size] === Tile.Forest);
      if (hasForestNeighbor && game.rng.chance(0.45)) {
        world.terrain[index] = Tile.Forest;
        game.markTerrainChanged(index);
      }
    } else if (tile === Tile.Forest && game.rng.chance(0.0015)) {
      world.terrain[index] = Tile.Grass;
      game.markTerrainChanged(index);
    }
  }
}

function pickWanderTarget(game: Game, id: number): void {
  const animals = game.animals;
  const x = animals.x[id];
  const y = animals.y[id];
  const offsetX = game.rng.int(-6, 6);
  const offsetY = game.rng.int(-6, 6);
  animals.targetX[id] = Math.max(0, Math.min(game.world.size - 1, Math.round(x + offsetX)));
  animals.targetY[id] = Math.max(0, Math.min(game.world.size - 1, Math.round(y + offsetY)));
}

function stepToward(game: Game, id: number, tx: number, ty: number, speed: number): void {
  const animals = game.animals;
  const dx = tx + 0.5 - animals.x[id];
  const dy = ty + 0.5 - animals.y[id];
  const distance = Math.hypot(dx, dy);
  if (distance < 0.08) return;
  const nx = animals.x[id] + (dx / distance) * speed;
  const ny = animals.y[id] + (dy / distance) * speed;
  if (isWalkableAt(game.world, Math.floor(nx), Math.floor(ny))) {
    animals.x[id] = nx;
    animals.y[id] = ny;
  } else {
    pickWanderTarget(game, id);
  }
}

function spawnNear(game: Game, kind: AnimalKind, x: number, y: number): void {
  const spot = tryFindWalkableNear(game.world, Math.round(x + game.rng.range(-2, 2)), Math.round(y + game.rng.range(-2, 2)), 4);
  if (!spot) return;
  game.spawnAnimal(kind, spot.x, spot.y);
}

function updateAnimals(game: Game): void {
  const animals = game.animals;
  const cap = game.wildlifeCap;
  let deerCount = 0;
  let wolfCount = 0;
  for (let id = 0; id < animals.capacity; id += 1) {
    if (animals.alive[id] === 0) continue;
    if (animals.kind[id] === AnimalKind.Deer) deerCount += 1;
    else wolfCount += 1;
  }
  for (let id = 0; id < animals.capacity; id += 1) {
    if (animals.alive[id] === 0) continue;
    animals.age[id] += 1;
    if (animals.age[id] >= animals.lifespan[id]) {
      animals.kill(id);
      continue;
    }
    const kind = animals.kind[id];
    if (kind === AnimalKind.Deer) {
      const dx = animals.targetX[id] - animals.x[id];
      const dy = animals.targetY[id] - animals.y[id];
      if (Math.hypot(dx, dy) < 1 || game.rng.chance(0.01)) pickWanderTarget(game, id);
      stepToward(game, id, animals.targetX[id], animals.targetY[id], 0.55);
      if (game.rng.chance(0.035) && deerCount < Math.floor(cap * 0.8)) {
        spawnNear(game, AnimalKind.Deer, animals.x[id], animals.y[id]);
        deerCount += 1;
      }
      continue;
    }

    let prey = -1;
    let bestDistance = 20;
    for (let other = 0; other < animals.capacity; other += 1) {
      if (animals.alive[other] === 0 || animals.kind[other] !== AnimalKind.Deer) continue;
      const distance = Math.hypot(animals.x[other] - animals.x[id], animals.y[other] - animals.y[id]);
      if (distance < bestDistance) {
        bestDistance = distance;
        prey = other;
      }
    }
    if (prey >= 0) {
      if (bestDistance <= 1.2 && game.rng.chance(0.22)) {
        animals.kill(prey);
        deerCount -= 1;
        animals.health[id] = 100;
      } else {
        stepToward(game, id, Math.round(animals.x[prey]), Math.round(animals.y[prey]), 0.8);
      }
    } else {
      if (game.rng.chance(0.02)) pickWanderTarget(game, id);
      stepToward(game, id, animals.targetX[id], animals.targetY[id], 0.8);
    }
    if (game.rng.chance(0.01) && wolfCount < Math.floor(cap * 0.25) && deerCount > 12) {
      spawnNear(game, AnimalKind.Wolf, animals.x[id], animals.y[id]);
      wolfCount += 1;
    }
  }
}

export function runEnvironment(game: Game): void {
  spreadForest(game);
  updateAnimals(game);
}
