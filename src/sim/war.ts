import { AgentState, BuildingType, Job, type Building, type Civ, type War } from '../world/types';
import { findPath } from './pathfind';
import type { Game } from './game';

const ENGAGE_RANGE = 2.1;
const SIEGE_RANGE = 2.6;
const MOVE_SPEED = 8;
/** A* node budget for a single soldier route request. */
const SOLDIER_PATH_NODES = 1800;
/** Failed route searches are shared per target for one tick so a stalled army
 *  cannot multiply A* searches by the number of soldiers on every tick. */
const failedRoutes = new WeakMap<Game, Map<number, number>>();

export type WarEndReason = 'peace' | 'blessing' | 'collapse';

export function startWar(game: Game, aId: number, bId: number): War | null {
  if (aId === bId) return null;
  const a = game.civs[aId];
  const b = game.civs[bId];
  if (!a?.alive || !b?.alive) return null;
  if (a.warId >= 0 || b.warId >= 0) return null;
  const war: War = {
    id: game.nextWarId++,
    a: aId,
    b: bId,
    startTick: game.world.tick,
    casualtiesA: 0,
    casualtiesB: 0,
    razedA: 0,
    razedB: 0,
    lastBattleTick: -100,
    battleActive: false,
    battleDeaths: 0,
    battleX: Math.round((a.centerX + b.centerX) / 2),
    battleY: Math.round((a.centerY + b.centerY) / 2),
  };
  game.wars.push(war);
  a.warId = war.id;
  b.warId = war.id;
  game.relations[aId * 8 + bId] = -55;
  game.relations[bId * 8 + aId] = -55;
  game.addChronicle('diplomacy', `War erupts between ${a.name} and ${b.name}.`, a.id, war.battleX, war.battleY);
  return war;
}

export function endWar(game: Game, war: War, reason: WarEndReason): void {
  const index = game.wars.indexOf(war);
  if (index < 0) return;
  flushBattle(game, war);
  game.wars.splice(index, 1);
  const a = game.civs[war.a];
  const b = game.civs[war.b];
  if (a) {
    a.warId = -1;
    a.cooldownUntil = game.world.tick + 12;
  }
  if (b) {
    b.warId = -1;
    b.cooldownUntil = game.world.tick + 12;
  }
  if (a && b) {
    const relation = reason === 'collapse' ? -20 : -12;
    game.relations[a.id * 8 + b.id] = relation;
    game.relations[b.id * 8 + a.id] = relation;
  }

  for (let id = 0; id < game.agents.capacity; id += 1) {
    if (game.agents.alive[id] === 0) continue;
    if (game.agents.job[id] !== Job.Soldier) continue;
    if (game.agents.civ[id] !== war.a && game.agents.civ[id] !== war.b) continue;
    game.agents.state[id] = AgentState.Returning;
    game.soldierPaths.delete(id);
  }

  if (a && b) {
    const razed = war.razedA + war.razedB;
    const razedText = razed > 0 ? ` ${razed} buildings lie in ruin.` : '';
    if (reason === 'blessing') {
      game.addChronicle('diplomacy', `A divine calm ends the war between ${a.name} and ${b.name}.${razedText}`, a.id, war.battleX, war.battleY);
    } else if (reason === 'peace') {
      game.addChronicle('diplomacy', `Peace is made between ${a.name} and ${b.name}.${razedText}`, a.id, war.battleX, war.battleY);
    }
  }
}

export function runWar(game: Game): void {
  const snapshot = [...game.wars];
  for (const war of snapshot) {
    const a = game.civs[war.a];
    const b = game.civs[war.b];
    if (!a?.alive || !b?.alive) {
      endWar(game, war, 'collapse');
      continue;
    }
    const targetA = nearestEnemyBuilding(game, a, b.id);
    const targetB = nearestEnemyBuilding(game, b, a.id);
    const soldiersA = soldiersOf(game, a.id);
    const soldiersB = soldiersOf(game, b.id);

    if (targetA) {
      for (const id of soldiersA) {
        if (!game.wars.includes(war)) break;
        if (game.agents.alive[id] === 0) continue;
        act(game, war, a, b, id, targetA, soldiersB);
      }
    }
    if (game.wars.includes(war) && targetB) {
      for (const id of soldiersB) {
        if (!game.wars.includes(war)) break;
        if (game.agents.alive[id] === 0) continue;
        act(game, war, b, a, id, targetB, soldiersA);
      }
    }

    if (game.wars.includes(war) && game.world.tick - war.lastBattleTick >= 2) {
      flushBattle(game, war);
    }
    if (game.wars.includes(war)) checkPeace(game, war);
  }

  returnSoldiers(game);
}

function soldiersOf(game: Game, civId: number): number[] {
  const out: number[] = [];
  const agents = game.agents;
  for (let id = 0; id < agents.capacity; id += 1) {
    if (agents.alive[id] === 0 || agents.civ[id] !== civId) continue;
    if (agents.job[id] !== Job.Soldier || agents.state[id] === AgentState.Returning) continue;
    out.push(id);
  }
  return out;
}

function nearestEnemyBuilding(game: Game, civ: Civ, enemyCivId: number): Building | null {
  let best: Building | null = null;
  let bestDistance = Infinity;
  for (const building of game.buildings) {
    if (!building.built || building.civ !== enemyCivId) continue;
    const distance = Math.hypot(building.x - civ.centerX, building.y - civ.centerY);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = building;
    }
  }
  return best;
}

function soldierPower(civ: Civ): number {
  const era = 1 + civ.era * 0.18;
  const trait = civ.traits.includes('militarist') ? 1.2 : 1;
  const morale = 0.75 + civ.happiness / 300;
  return era * trait * morale;
}

function act(
  game: Game,
  war: War,
  attacker: Civ,
  defender: Civ,
  id: number,
  target: Building,
  enemies: readonly number[],
): void {
  const agents = game.agents;
  if (!game.buildingById.has(target.id)) return;
  const x = agents.x[id];
  const y = agents.y[id];

  let enemyId = -1;
  let enemyDistance = ENGAGE_RANGE;
  for (const other of enemies) {
    if (agents.alive[other] === 0) continue;
    const distance = Math.hypot(agents.x[other] - x, agents.y[other] - y);
    if (distance < enemyDistance) {
      enemyDistance = distance;
      enemyId = other;
    }
  }

  if (enemyId >= 0) {
    agents.state[id] = AgentState.Fighting;
    const damage = 7.5 * soldierPower(attacker) * game.rng.range(0.7, 1.3);
    agents.health[enemyId] -= damage;
    recordBattle(game, war, x, y);
    if (agents.health[enemyId] <= 0) {
      killSoldier(game, war, defender, enemyId);
    }
    return;
  }

  const targetX = target.x + 0.5;
  const targetY = target.y + 0.5;
  const distanceToBuilding = Math.hypot(targetX - x, targetY - y);
  if (distanceToBuilding <= SIEGE_RANGE) {
    agents.state[id] = AgentState.Fighting;
    target.hp -= 3.5 * soldierPower(attacker) * game.rng.range(0.8, 1.2);
    target.flash = 1;
    recordBattle(game, war, x, y);
    if (target.hp <= 0) {
      destroyBuilding(game, war, attacker, defender, target);
    }
    return;
  }

  agents.state[id] = AgentState.Marching;
  moveToward(game, id, targetX, targetY, MOVE_SPEED, target.id);
}

function moveToward(game: Game, id: number, tx: number, ty: number, speed: number, targetKey: number): void {
  const agents = game.agents;
  let path = game.soldierPaths.get(id);
  if (!path || path.targetKey !== targetKey || path.index >= path.path.length) {
    const failures = failedRoutes.get(game);
    if (failures && game.world.tick < (failures.get(targetKey) ?? 0)) return;
    const found = findPath(
      game.world,
      Math.floor(agents.x[id]),
      Math.floor(agents.y[id]),
      Math.floor(tx),
      Math.floor(ty),
      SOLDIER_PATH_NODES,
    );
    if (!found || found.length === 0) {
      // Retry on a later tick, not once per soldier per tick.
      const retryMap = failures ?? new Map<number, number>();
      retryMap.set(targetKey, game.world.tick + 1);
      failedRoutes.set(game, retryMap);
      game.soldierPaths.delete(id);
      return;
    }
    path = { path: found, index: 0, targetKey };
    game.soldierPaths.set(id, path);
  }

  let remaining = speed;
  while (remaining > 0 && path.index < path.path.length) {
    const point = path.path[path.index];
    if (!point) break;
    const dx = point.x + 0.5 - agents.x[id];
    const dy = point.y + 0.5 - agents.y[id];
    const distance = Math.hypot(dx, dy);
    if (distance <= remaining) {
      agents.x[id] = point.x + 0.5;
      agents.y[id] = point.y + 0.5;
      path.index += 1;
      remaining -= distance;
    } else {
      agents.x[id] += (dx / distance) * remaining;
      agents.y[id] += (dy / distance) * remaining;
      remaining = 0;
    }
  }
  agents.targetX[id] = tx;
  agents.targetY[id] = ty;
}

function recordBattle(game: Game, war: War, x: number, y: number): void {
  if (!war.battleActive) {
    war.battleActive = true;
    war.battleDeaths = 0;
    war.battleX = Math.round(x);
    war.battleY = Math.round(y);
  }
  war.lastBattleTick = game.world.tick;
}

function addBattleDeath(war: War): void {
  war.battleActive = true;
  war.battleDeaths += 1;
}

function flushBattle(game: Game, war: War): void {
  if (!war.battleActive) return;
  if (war.battleDeaths > 0) {
    const a = game.civs[war.a];
    const b = game.civs[war.b];
    if (a && b) {
      game.addChronicle(
        'war',
        `A battle between ${a.name} and ${b.name} leaves ${war.battleDeaths} dead.`,
        a.id,
        war.battleX,
        war.battleY,
      );
    }
  }
  war.battleActive = false;
  war.battleDeaths = 0;
}

function killSoldier(game: Game, war: War, civ: Civ, id: number): void {
  civ.casualties += 1;
  if (war.a === civ.id) war.casualtiesA += 1;
  else war.casualtiesB += 1;
  addBattleDeath(war);
  game.removeAgent(id);
}

function destroyBuilding(
  game: Game,
  war: War,
  attacker: Civ,
  defender: Civ,
  building: Building,
): void {
  game.removeBuilding(building);
  attacker.food += 8;
  const attackerIsA = war.a === attacker.id;
  if (attackerIsA) war.razedA += 1;
  else war.razedB += 1;
  if (building.type === BuildingType.TownCenter) {
    game.addChronicle(
      'war',
      `${attacker.name} raze the Town Center of ${defender.name}.`,
      attacker.id,
      building.x,
      building.y,
    );
  } else if ((attackerIsA ? war.razedA : war.razedB) === 1) {
    game.addChronicle(
      'war',
      `${attacker.name} begin razing the settlements of ${defender.name}.`,
      attacker.id,
      building.x,
      building.y,
    );
  }
  const remaining = game.buildings.filter((b) => b.civ === defender.id);
  if (building.type === BuildingType.TownCenter || remaining.length === 0) {
    eliminateCiv(game, defender);
  }
}

export function eliminateCiv(game: Game, civ: Civ): void {
  if (!civ.alive) return;
  civ.alive = false;
  game.addChronicle(
    'society',
    `The ${civ.name} are no more.`,
    civ.id,
    civ.centerX,
    civ.centerY,
  );
  for (const war of [...game.wars]) {
    if (war.a === civ.id || war.b === civ.id) endWar(game, war, 'collapse');
  }
  for (let id = 0; id < game.agents.capacity; id += 1) {
    if (game.agents.alive[id] === 1 && game.agents.civ[id] === civ.id) game.removeAgent(id);
  }
  for (const building of [...game.buildings]) {
    if (building.civ === civ.id) game.removeBuilding(building);
  }
  game.ownershipDirty = true;
  game.updateStats();
}

function checkPeace(game: Game, war: War): void {
  const a = game.civs[war.a];
  const b = game.civs[war.b];
  if (!a || !b) {
    endWar(game, war, 'collapse');
    return;
  }
  const duration = game.world.tick - war.startTick;
  if (duration > 60) {
    endWar(game, war, 'peace');
    return;
  }
  const soldiersA = soldiersOf(game, a.id).length;
  const soldiersB = soldiersOf(game, b.id).length;
  const exhaustedA = war.casualtiesA > Math.max(4, a.population * 0.2) || a.food < 3;
  const exhaustedB = war.casualtiesB > Math.max(4, b.population * 0.2) || b.food < 3;
  if ((exhaustedA && exhaustedB) || ((soldiersA === 0 || soldiersB === 0) && duration > 5)) {
    endWar(game, war, 'peace');
  }
}

function returnSoldiers(game: Game): void {
  const agents = game.agents;
  for (let id = 0; id < agents.capacity; id += 1) {
    if (agents.alive[id] === 0 || agents.state[id] !== AgentState.Returning) continue;
    const civ = game.civs[agents.civ[id]];
    if (!civ?.alive) continue;
    const center = game.buildings.find(
      (building) => building.civ === civ.id && building.built && building.type === BuildingType.TownCenter,
    );
    if (!center) {
      agents.state[id] = AgentState.Idle;
      game.soldierPaths.delete(id);
      continue;
    }
    const distance = Math.hypot(center.x + 0.5 - agents.x[id], center.y + 0.5 - agents.y[id]);
    if (distance <= 2) {
      agents.state[id] = AgentState.Idle;
      game.soldierPaths.delete(id);
      continue;
    }
    moveToward(game, id, center.x + 0.5, center.y + 0.5, MOVE_SPEED, center.id);
  }
}
