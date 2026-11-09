import { REPAIR_HP_PER_BUILDER, REPAIR_MATERIALS_PER_HP } from '../config';
import type { Building, Civ } from '../world/types';
import type { Game } from './game';

/** Repair after peace; active construction keeps first claim on builders. */
export function repairTarget(game: Game, civ: Civ): Building | null {
  if (civ.warId >= 0 || civ.materials < REPAIR_MATERIALS_PER_HP) return null;
  let target: Building | null = null;
  for (const building of game.buildings) {
    if (building.civ !== civ.id || !building.built || building.hp >= building.maxHp) continue;
    if (!target || building.hp / building.maxHp < target.hp / target.maxHp) target = building;
  }
  return target;
}

export function repairBuilding(game: Game, civ: Civ, builders: number): void {
  const target = repairTarget(game, civ);
  if (!target || builders <= 0) return;
  const restored = Math.min(
    target.maxHp - target.hp,
    builders * REPAIR_HP_PER_BUILDER,
    civ.materials / REPAIR_MATERIALS_PER_HP,
  );
  target.hp += restored;
  civ.materials = Math.max(0, civ.materials - restored * REPAIR_MATERIALS_PER_HP);
}
