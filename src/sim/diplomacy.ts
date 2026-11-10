import { MAX_FACTIONS } from '../config';
import type { Civ } from '../world/types';
import { canReachCivs } from './naval';
import type { Game } from './game';
import { startWar } from './war';
import { canLaunchCampaign } from './campaign';

function hasBarracks(game: Game, civ: Civ): boolean {
  return game.buildings.some(
    (building) => building.civ === civ.id && building.built && building.type === 5,
  );
}

function clampRelation(value: number): number {
  return Math.max(-100, Math.min(100, value));
}

export function runDiplomacy(game: Game): void {
  const alive = game.aliveCivs();
  const tick = game.world.tick;
  const candidates: Array<{ a: Civ; b: Civ; aggression: number }> = [];
  for (let i = 0; i < alive.length; i += 1) {
    for (let j = i + 1; j < alive.length; j += 1) {
      const a = alive[i];
      const b = alive[j];
      if (a.warId >= 0 || b.warId >= 0) continue;
      const index = a.id * MAX_FACTIONS + b.id;
      const previous = game.relations[index];
      let relation = previous;

      relation += (0 - relation) * 0.004;
      if (a.religionOf === b.religionOf) relation += 0.05;
      if (a.traits.includes('mercantile') || b.traits.includes('mercantile')) relation += 0.02;

      if (game.rng.chance(0.012)) {
        const drop = game.rng.range(8, 22);
        relation -= drop;
        if (previous > -25 && relation <= -25) {
          game.addChronicle(
            'diplomacy',
            `Tensions flare between ${a.name} and ${b.name}.`,
            a.id,
            Math.round((a.centerX + b.centerX) / 2),
            Math.round((a.centerY + b.centerY) / 2),
          );
        }
      }

      relation = clampRelation(relation);
      game.relations[index] = relation;
      game.relations[b.id * MAX_FACTIONS + a.id] = relation;

      if (
        tick > 14 &&
        a.cooldownUntil <= tick &&
        b.cooldownUntil <= tick &&
        a.population >= 8 &&
        b.population >= 8 &&
        a.soldiers >= 1 &&
        b.soldiers >= 1 &&
        a.food > 4 &&
        b.food > 4 &&
        hasBarracks(game, a) &&
        hasBarracks(game, b) &&
        canReachCivs(game, a, b)
      ) {
        const militarist = a.traits.includes('militarist') || b.traits.includes('militarist');
        const threshold = militarist ? -26 : -32;
        if (relation < threshold) {
          const aggression =
            (a.traits.includes('militarist') ? 1.8 : 1) *
            (b.traits.includes('militarist') ? 1.8 : 1) *
            (a.traits.includes('mercantile') || b.traits.includes('mercantile') ? 0.7 : 1);
          candidates.push({ a, b, aggression });
        }
      }
    }
  }
  // Rotate the first eligible pair so one expensive deferred preflight cannot
  // monopolise the aggregate routing allowance every year.
  for (let offset = 0; offset < candidates.length; offset++) {
    const { a, b, aggression } = candidates[(tick + offset) % candidates.length];
    if (a.warId >= 0 || b.warId >= 0 || !canLaunchCampaign(game, a, b)) continue;
    if (game.rng.chance(0.03 * aggression)) startWar(game, a.id, b.id);
  }
}
