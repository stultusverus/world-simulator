import {
  FOOD_CAP,
  CAMPAIGN_STALL_TICKS,
  FAILED_CAMPAIGN_COOLDOWN,
  MATERIALS_CAP,
  NAVAL_WAR_TICKS,
  NO_CONTACT_NAVAL_PEACE_TICKS,
  NO_CONTACT_PEACE_TICKS,
  POST_WAR_RELIEF_FOOD,
  POST_WAR_RELIEF_MATERIALS,
  WAR_COOLDOWN_TICKS,
  WAR_EXHAUSTION_POP_RATIO,
  WOUNDED_HEALTH,
  WOUNDED_RETREAT_CHANCE,
} from '../config';
import { canReachByLandOrSea, differentWalkRegions } from '../world/regions';
import { AgentState, BuildingType, Job, type Building, type Civ, type War } from '../world/types';
import { makeSettlementName } from './names';
import { campaignRoute, campaignTarget, campaignTravelTime } from './campaign';
import { ensureCivCenter, nearestCenter, settlementCenters } from './settlements';
import type { Game } from './game';

const ENGAGE_RANGE = 2.1;
const INTERCEPT_RANGE = 9;
const SIEGE_RANGE = 2.6;
const MOVE_SPEED = 8;
/** Failed route searches are shared per target for one tick so a stalled army
 *  cannot multiply A* searches by the number of soldiers on every tick. */
const failedRoutes = new WeakMap<Game, Map<number, number>>();

export type WarEndReason = 'peace' | 'blessing' | 'collapse' | 'stalemate';

export function startWar(game: Game, aId: number, bId: number): War | null {
  if (aId === bId) return null;
  const a = game.civs[aId];
  const b = game.civs[bId];
  if (!a?.alive || !b?.alive) return null;
  if (a.warId >= 0 || b.warId >= 0) return null;
  const crossing =
    canReachByLandOrSea(
      game.reachability,
      game.world,
      a.centerX,
      a.centerY,
      b.centerX,
      b.centerY,
    ) &&
    differentWalkRegions(game.reachability, game.world, a.centerX, a.centerY, b.centerX, b.centerY);
  const baseDeadline = crossing ? NO_CONTACT_NAVAL_PEACE_TICKS : NO_CONTACT_PEACE_TICKS;
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
    lastProgressTick: game.year,
    contactDeadline: Math.max(baseDeadline, (campaignTravelTime(game, a, b) ?? 0) + 8),
    targetA: -1,
    targetB: -1,
    bestRemainingA: Infinity,
    bestRemainingB: Infinity,
  };
  game.wars.push(war);
  a.warId = war.id;
  b.warId = war.id;
  game.relations[aId * 8 + bId] = -55;
  game.relations[bId * 8 + aId] = -55;
  game.addChronicle(
    'diplomacy',
    `War erupts between ${a.name} and ${b.name}.`,
    a.id,
    war.battleX,
    war.battleY,
  );
  return war;
}

export function endWar(game: Game, war: War, reason: WarEndReason): void {
  const index = game.wars.indexOf(war);
  if (index < 0) return;
  flushBattle(game, war);
  game.wars.splice(index, 1);
  const a = game.civs[war.a];
  const b = game.civs[war.b];
  const pairA = Math.min(war.a, war.b);
  const pairB = Math.max(war.a, war.b);
  let history = game.campaignHistory.find((h) => h.a === pairA && h.b === pairB);
  if (reason === 'stalemate') {
    if (!history) {
      history = { a: pairA, b: pairB, failures: 0, retryAfter: 0 };
      game.campaignHistory.push(history);
    }
    history.failures += 1;
    history.retryAfter =
      game.year + Math.min(600, FAILED_CAMPAIGN_COOLDOWN * 2 ** Math.min(3, history.failures - 1));
  } else if (history && war.lastBattleTick >= war.startTick) {
    history.failures = 0;
    history.retryAfter = 0;
  }
  if (a) {
    a.warId = -1;
    a.cooldownUntil = game.world.tick + WAR_COOLDOWN_TICKS;
  }
  if (b) {
    b.warId = -1;
    b.cooldownUntil = game.world.tick + WAR_COOLDOWN_TICKS;
  }
  if (a && b) {
    const relation = reason === 'collapse' ? -20 : -12;
    game.relations[a.id * 8 + b.id] = relation;
    game.relations[b.id * 8 + a.id] = relation;
    // Peace relief gives both sides a small stock to rebuild with; it is not
    // paid when a faction is wiped out.
    if (reason !== 'collapse') {
      if (a.alive) {
        a.materials = Math.min(MATERIALS_CAP, a.materials + POST_WAR_RELIEF_MATERIALS);
        a.food = Math.min(FOOD_CAP, a.food + POST_WAR_RELIEF_FOOD);
      }
      if (b.alive) {
        b.materials = Math.min(MATERIALS_CAP, b.materials + POST_WAR_RELIEF_MATERIALS);
        b.food = Math.min(FOOD_CAP, b.food + POST_WAR_RELIEF_FOOD);
      }
    }
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
      game.addChronicle(
        'diplomacy',
        `A divine calm ends the war between ${a.name} and ${b.name}.${razedText}`,
        a.id,
        war.battleX,
        war.battleY,
      );
    } else if (reason === 'peace') {
      game.addChronicle(
        'diplomacy',
        `Peace is made between ${a.name} and ${b.name}.${razedText}`,
        a.id,
        war.battleX,
        war.battleY,
      );
    } else if (reason === 'stalemate') {
      game.addChronicle(
        'diplomacy',
        `The war between ${a.name} and ${b.name} ends without a battle.${razedText}`,
        a.id,
        war.battleX,
        war.battleY,
      );
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
    const soldiersA = soldiersOf(game, a.id);
    const soldiersB = soldiersOf(game, b.id);
    const targetA = armyTarget(game, a, b.id, soldiersA);
    const targetB = armyTarget(game, b, a.id, soldiersB);

    if (targetA) {
      for (const id of soldiersA) {
        if (!game.wars.includes(war)) break;
        if (game.agents.alive[id] === 0) continue;
        if (game.agents.state[id] === AgentState.Returning) continue;
        act(game, war, a, b, id, targetA, soldiersB);
      }
    }
    if (game.wars.includes(war) && targetB) {
      for (const id of soldiersB) {
        if (!game.wars.includes(war)) break;
        if (game.agents.alive[id] === 0) continue;
        if (game.agents.state[id] === AgentState.Returning) continue;
        act(game, war, b, a, id, targetB, soldiersA);
      }
    }

    recordProgress(game, war, targetA, soldiersA, true);
    recordProgress(game, war, targetB, soldiersB, false);
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

function armyTarget(game: Game, civ: Civ, enemy: number, soldiers: number[]): Building | null {
  if (soldiers.length === 0) return null;
  for (const id of soldiers) {
    const path = game.soldierPaths.get(id);
    const target = path ? game.buildingById.get(path.targetKey) : undefined;
    if (target?.built && target.civ === enemy && path && path.index < path.path.length)
      return target;
  }
  const lead = soldiers[0];
  return campaignTarget(
    game,
    civ,
    enemy,
    lead === undefined ? civ.centerX : game.agents.x[lead],
    lead === undefined ? civ.centerY : game.agents.y[lead],
  );
}

function recordProgress(
  game: Game,
  war: War,
  target: Building | null,
  soldiers: number[],
  sideA: boolean,
): void {
  if (!target) return;
  const targetKey = sideA ? 'targetA' : 'targetB';
  const bestKey = sideA ? 'bestRemainingA' : 'bestRemainingB';
  if (war[targetKey] !== target.id) {
    war[targetKey] = target.id;
    war[bestKey] = Infinity;
  }
  let remaining = Infinity;
  for (const id of soldiers) {
    if (!game.agents.alive[id]) continue;
    const path = game.soldierPaths.get(id);
    if (path?.targetKey === target.id)
      remaining = Math.min(remaining, path.path.length - path.index);
    if (
      Math.hypot(game.agents.x[id] - target.x - 0.5, game.agents.y[id] - target.y - 0.5) <=
      SIEGE_RANGE
    )
      remaining = 0;
  }
  if (remaining < war[bestKey]) {
    war[bestKey] = remaining;
    war.lastProgressTick = game.year;
  }
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
    if (agents.state[other] === AgentState.Returning) continue;
    const distance = Math.hypot(agents.x[other] - x, agents.y[other] - y);
    if (distance >= bestDistance) continue;
    // Never chase across water; that is the naval planner's job.
    if (
      differentWalkRegions(game.reachability, game.world, x, y, agents.x[other], agents.y[other])
    ) {
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
  if (agents.alive[id] === 0 || agents.state[id] === AgentState.Returning) return;
  if (!game.buildingById.has(target.id)) return;
  const x = agents.x[id];
  const y = agents.y[id];

  let enemyId = -1;
  let enemyDistance = ENGAGE_RANGE;
  for (const other of enemies) {
    if (agents.alive[other] === 0) continue;
    // A soldier wounded this tick is already leaving the field.
    if (agents.state[other] === AgentState.Returning) continue;
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
    // Land routes first; building-targeted strikes can fall back to a crossing.
    const route = campaignRoute(
      game,
      Math.floor(agents.x[id]),
      Math.floor(agents.y[id]),
      Math.floor(tx),
      Math.floor(ty),
      agents.civ[id],
      building,
    );
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
  const agents = game.agents;
  if (agents.alive[id] === 0 || agents.state[id] === AgentState.Returning) return;
  // Not every lethal blow is fatal: some soldiers are carried home wounded.
  // This keeps late-game wars costly without repeatedly emptying whole armies.
  if (game.rng.chance(WOUNDED_RETREAT_CHANCE)) {
    agents.health[id] = WOUNDED_HEALTH;
    agents.state[id] = AgentState.Returning;
    game.soldierPaths.delete(id);
    return;
  }
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
      eliminateCiv(game, defender, 'war', attacker.name);
    }
    return;
  }
  if (remaining.length === 0) {
    eliminateCiv(game, defender, 'war', attacker.name);
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

export function eliminateCiv(
  game: Game,
  civ: Civ,
  cause: 'war' | 'population' | 'unknown' = 'unknown',
  attackerName?: string,
): void {
  if (!civ.alive) return;
  civ.alive = false;
  const detail =
    cause === 'war'
      ? attackerName
        ? ` Their last town centre fell to ${attackerName}.`
        : ' Their last town centre fell in war.'
      : cause === 'population'
        ? ' Their last people died out.'
        : '';
  game.addChronicle(
    'society',
    `The ${civ.name} are no more.${detail}`,
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
  const crossing =
    canReachByLandOrSea(
      game.reachability,
      game.world,
      a.centerX,
      a.centerY,
      b.centerX,
      b.centerY,
    ) &&
    differentWalkRegions(game.reachability, game.world, a.centerX, a.centerY, b.centerX, b.centerY);
  // If the armies never make contact, end the phoney war instead of keeping
  // both sides at war for the full duration.
  const neverFought = war.lastBattleTick < war.startTick;
  if (
    game.year - Math.max(war.lastProgressTick, war.lastBattleTick) >
    CAMPAIGN_STALL_TICKS * (crossing ? 2 : 1)
  ) {
    endWar(game, war, neverFought ? 'stalemate' : 'peace');
    return;
  }
  if (neverFought && duration > war.contactDeadline) {
    endWar(game, war, 'stalemate');
    return;
  }
  // Cross-water campaigns need time for the army to embark, sail and land.
  const extraTravel = Math.max(
    0,
    war.contactDeadline - (crossing ? NO_CONTACT_NAVAL_PEACE_TICKS : NO_CONTACT_PEACE_TICKS),
  );
  if (duration > (crossing ? NAVAL_WAR_TICKS : 60) + extraTravel) {
    endWar(game, war, 'peace');
    return;
  }
  const soldiersA = soldiersOf(game, a.id).length;
  const soldiersB = soldiersOf(game, b.id).length;
  const exhaustedA =
    war.casualtiesA > Math.max(3, a.population * WAR_EXHAUSTION_POP_RATIO) || a.food < 3;
  const exhaustedB =
    war.casualtiesB > Math.max(3, b.population * WAR_EXHAUSTION_POP_RATIO) || b.food < 3;
  if ((exhaustedA && exhaustedB) || ((soldiersA === 0 || soldiersB === 0) && duration > 5)) {
    // A war that never produced a battle is better described as a stalemate.
    endWar(game, war, neverFought ? 'stalemate' : 'peace');
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
