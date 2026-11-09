import { NAVAL_WAR_TICKS } from '../config';
import { differentWalkRegions } from '../world/regions';
import { AgentState, BuildingType, Job, type Building, type Civ, type War } from '../world/types';
import { makeSettlementName } from './names';
import { findNavalRoute } from './naval';
import { findPath } from './pathfind';
import { ensureCivCenter, nearestCenter, settlementCenters } from './settlements';
import type { Game } from './game';

const ENGAGE_RANGE = 2.1;
const INTERCEPT_RANGE = 9;
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

function nearestEnemyWithin(
  game: Game,
  enemies: readonly number[],
  x: number,
  y: number,
  range: number,
): number {
  const agents = game.agents;
  let best = -1;
  let bestDistance = range;
  for (const other of enemies) {
    if (agents.alive[other] === 0) continue;
    const distance = Math.hypot(agents.x[other] - x, agents.y[other] - y);
    if (distance >= bestDistance) continue;
    // Never chase across water; that is the naval planner's job.
    if (differentWalkRegions(game.reachability, game.world, x, y, agents.x[other], agents.y[other])) {
      continue;
    }
    best = other;
    bestDistance = distance;
  }
  return best;
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

  // March toward a nearby enemy army instead of ignoring it and razing a
  // distant building. This makes wars produce actual battles.
  const intercept = nearestEnemyWithin(game, enemies, x, y, INTERCEPT_RANGE);
  if (intercept >= 0) {
    agents.state[id] = AgentState.Marching;
    moveTowardPoint(game, id, agents.x[intercept], agents.y[intercept], MOVE_SPEED, -1 - intercept);
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
  moveToward(game, id, target, MOVE_SPEED);
}

function moveToward(game: Game, id: number, target: Building, speed: number): void {
  moveTowardPoint(game, id, target.x + 0.5, target.y + 0.5, speed, target.id, target);
}

function moveTowardPoint(
  game: Game,
  id: number,
  tx: number,
  ty: number,
  speed: number,
  targetKey: number,
  building?: Building,
): void {
  const agents = game.agents;
  let path = game.soldierPaths.get(id);
  if (!path || path.targetKey !== targetKey || path.index >= path.path.length) {
    const failures = failedRoutes.get(game);
    if (failures && game.world.tick < (failures.get(targetKey) ?? 0)) return;
    // Land routes first; soldier-on-building targets can fall back to a crossing.
    let route = findPath(
      game.world,
      Math.floor(agents.x[id]),
      Math.floor(agents.y[id]),
      Math.floor(tx),
      Math.floor(ty),
      SOLDIER_PATH_NODES,
    );
    if ((!route || route.length === 0) && building) {
      route = findNavalRoute(game, id, building, targetKey);
    }
    if (!route || route.length === 0) {
      // Retry on a later tick, not once per soldier per tick.
      const retryMap = failures ?? new Map<number, number>();
      retryMap.set(targetKey, game.world.tick + 1);
      failedRoutes.set(game, retryMap);
      game.soldierPaths.delete(id);
      return;
    }
    path = { path: route, index: 0, targetKey };
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
  const wasCenter = building.type === BuildingType.TownCenter;
  if (wasCenter) game.navalPlans.clear();
  const remaining = game.buildings.filter((b) => b.civ === defender.id);
  const remainingCenters = settlementCenters(game, defender.id);
  if (wasCenter) {
    if (remainingCenters.length > 0 && remaining.length > 0) {
      // The faction survives through its other settlements: move the anchor and
      // name the town that was lost.
      ensureCivCenter(game, defender);
      const lost = makeSettlementName(game.world.seedText, defender.id, building.id);
      game.addChronicle(
        'war',
        `${attacker.name} raze ${lost}, the Town Center of ${defender.name}.`,
        attacker.id,
        building.x,
        building.y,
      );
    } else {
      game.addChronicle(
        'war',
        `${attacker.name} raze the Town Center of ${defender.name}.`,
        attacker.id,
        building.x,
        building.y,
      );
      eliminateCiv(game, defender);
    }
    return;
  }
  if (remaining.length === 0) {
    eliminateCiv(game, defender);
    return;
  }
  if ((attackerIsA ? war.razedA : war.razedB) === 1) {
    game.addChronicle(
      'war',
      `${attacker.name} begin razing the settlements of ${defender.name}.`,
      attacker.id,
      building.x,
      building.y,
    );
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
  const crossing = differentWalkRegions(game.reachability, game.world, a.centerX, a.centerY, b.centerX, b.centerY);
  // Cross-water campaigns need time for the army to embark, sail and land.
  if (duration > (crossing ? NAVAL_WAR_TICKS : 60)) {
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
    const center = nearestCenter(game, civ.id, agents.x[id], agents.y[id]);
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
    moveToward(game, id, center, MOVE_SPEED);
  }
}
