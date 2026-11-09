import { describe, expect, it } from 'vitest';
import { SETTLEMENT_TIERS, settlementTier } from '../src/config';
import { chooseBuildingType } from '../src/sim/economy';
import { Game } from '../src/sim/game';
import { BuildingType, type Building, type Civ } from '../src/world/types';
import { settlementCap } from '../src/sim/settlements';

function fakeBuilding(type: BuildingType): Building {
  return {
    id: 0,
    civ: 0,
    type,
    x: 0,
    y: 0,
    hp: 1,
    maxHp: 1,
    work: 0,
    workNeeded: 0,
    built: true,
    workers: 0,
    flash: 0,
  };
}

function builtFrom(counts: Partial<Record<BuildingType, number>>): Building[] {
  const out: Building[] = [];
  for (const [key, count] of Object.entries(counts)) {
    const type = Number(key) as BuildingType;
    for (let i = 0; i < (count ?? 0); i += 1) out.push(fakeBuilding(type));
  }
  return out;
}

function scaledCiv(overrides: Partial<Civ>): Civ {
  const game = new Game({ size: 256, seedText: 'ALPHA', startWithFactions: true });
  return { ...game.civs[0], ...overrides };
}

describe('metropolis tier', () => {
  it('defines the Metropolis tier and maps population to it', () => {
    const metropolis = SETTLEMENT_TIERS[SETTLEMENT_TIERS.length - 1];
    expect(metropolis.name).toBe('Metropolis');
    expect(metropolis.minPop).toBe(180);
    expect(metropolis.radius).toBe(14);
    expect(metropolis.maxBuildings).toBe(110);
    expect(settlementTier(179)).toBe(3);
    expect(settlementTier(180)).toBe(4);
    expect(settlementTier(0)).toBe(0);
    // Building capacity rises monotonically with tier.
    for (let i = 1; i < SETTLEMENT_TIERS.length; i += 1) {
      expect(SETTLEMENT_TIERS[i].maxBuildings).toBeGreaterThan(SETTLEMENT_TIERS[i - 1].maxBuildings);
      expect(SETTLEMENT_TIERS[i].radius).toBeGreaterThanOrEqual(SETTLEMENT_TIERS[i - 1].radius);
    }
    expect(settlementCap(scaledCiv({ population: 180 }))).toBe(110);
    expect(settlementCap(scaledCiv({ population: 100 }))).toBe(46);
  });
});

describe('building type scaling', () => {
  it('scales the farm target with population', () => {
    const low = scaledCiv({
      population: 10,
      foodNeed: 6,
      foodProduction: 1,
      housing: 100,
    });
    expect(chooseBuildingType(low, builtFrom({ [BuildingType.Barracks]: 1, [BuildingType.Farm]: 8 }))).toBe(
      BuildingType.Farm,
    );
    // 9 farms is the floor target even for tiny populations.
    expect(chooseBuildingType(low, builtFrom({ [BuildingType.Barracks]: 1, [BuildingType.Farm]: 9 }))).toBeNull();

    const large = scaledCiv({ population: 300, foodNeed: 180, foodProduction: 10, housing: 2000 });
    expect(chooseBuildingType(large, builtFrom({ [BuildingType.Barracks]: 1, [BuildingType.Farm]: 16 }))).toBe(
      BuildingType.Farm,
    );
    expect(chooseBuildingType(large, builtFrom({ [BuildingType.Barracks]: 1, [BuildingType.Farm]: 17 }))).toBeNull();
  });

  it('scales workshop and temple targets with population and caps them', () => {
    const town = scaledCiv({
      population: 120,
      foodNeed: 72,
      foodProduction: 200,
      housing: 2000,
      era: 1,
    });
    // Workshop target at pop 120 is min(9, 1 + 2) = 3.
    expect(chooseBuildingType(town, builtFrom({ [BuildingType.Barracks]: 1, [BuildingType.Workshop]: 2 }))).toBe(
      BuildingType.Workshop,
    );
    expect(chooseBuildingType(town, builtFrom({ [BuildingType.Barracks]: 1, [BuildingType.Workshop]: 3 }))).toBe(
      BuildingType.Temple,
    );

    const metropolis = scaledCiv({
      population: 450,
      foodNeed: 270,
      foodProduction: 500,
      housing: 4000,
      era: 1,
    });
    // Workshop target at pop 450 is min(9, 1 + 7) = 8.
    expect(
      chooseBuildingType(
        metropolis,
        builtFrom({ [BuildingType.Barracks]: 1, [BuildingType.Workshop]: 7, [BuildingType.Farm]: 25 }),
      ),
    ).toBe(BuildingType.Workshop);
    // Temple target at pop 450 is min(5, 1 + 4) = 5.
    expect(
      chooseBuildingType(
        metropolis,
        builtFrom({ [BuildingType.Barracks]: 1, [BuildingType.Workshop]: 8, [BuildingType.Farm]: 25 }),
      ),
    ).toBe(BuildingType.Temple);
    expect(
      chooseBuildingType(
        metropolis,
        builtFrom({
          [BuildingType.Barracks]: 1,
          [BuildingType.Workshop]: 8,
          [BuildingType.Temple]: 4,
          [BuildingType.Farm]: 25,
        }),
      ),
    ).toBe(BuildingType.Temple);

    const huge = scaledCiv({
      population: 600,
      foodNeed: 360,
      foodProduction: 700,
      housing: 4000,
      era: 1,
    });
    // Workshop target caps at 9 even at high population.
    expect(
      chooseBuildingType(
        huge,
        builtFrom({ [BuildingType.Barracks]: 1, [BuildingType.Workshop]: 8, [BuildingType.Farm]: 34 }),
      ),
    ).toBe(BuildingType.Workshop);
    expect(
      chooseBuildingType(
        huge,
        builtFrom({
          [BuildingType.Barracks]: 1,
          [BuildingType.Workshop]: 9,
          [BuildingType.Temple]: 4,
          [BuildingType.Farm]: 34,
        }),
      ),
    ).toBe(BuildingType.Temple);
    expect(
      chooseBuildingType(
        huge,
        builtFrom({
          [BuildingType.Barracks]: 2,
          [BuildingType.Workshop]: 9,
          [BuildingType.Temple]: 5,
          [BuildingType.Farm]: 34,
        }),
      ),
    ).toBeNull();
  });

  it('keeps barracks and housing priority in the early game', () => {
    const civ = scaledCiv({
      population: 12,
      foodNeed: 7.2,
      foodProduction: 20,
      housing: 40,
      era: 0,
    });
    expect(chooseBuildingType(civ, builtFrom({ [BuildingType.Farm]: 9 }))).toBe(BuildingType.Barracks);
    expect(
      chooseBuildingType(civ, builtFrom({ [BuildingType.Farm]: 9, [BuildingType.Barracks]: 1 })),
    ).toBeNull();
    const crowded = scaledCiv({ population: 12, foodNeed: 7.2, foodProduction: 20, housing: 13, era: 0 });
    expect(
      chooseBuildingType(crowded, builtFrom({ [BuildingType.Farm]: 9, [BuildingType.Barracks]: 1 })),
    ).toBe(BuildingType.House);
  });
});

describe('long-run growth', () => {
  it('grows a 512 world past 300 people and founds multiple cities', () => {
    const seed = 'DELTA';
    const totalTicks = 1600;
    const game = new Game({ size: 512, seedText: seed, startWithFactions: true });
    const maxPops = game.civs.map(() => 0);
    const curve: { tick: number; populations: number[] }[] = [];
    let earlyPopulation = 0;
    const started = performance.now();
    for (let tick = 1; tick <= totalTicks; tick += 1) {
      game.tick();
      for (let i = 0; i < game.civs.length; i += 1) {
        maxPops[i] = Math.max(maxPops[i], game.civs[i].population);
      }
      if (tick === 200) earlyPopulation = game.stats.population;
      if (tick % 200 === 0) {
        curve.push({ tick, populations: game.civs.map((civ) => civ.population) });
      }
    }
    const ms = Math.round(performance.now() - started);
    const alive = game.aliveCivs();
    const finalPops = alive.map((civ) => civ.population);
    const townCenters = game.buildings.filter((building) => building.type === BuildingType.TownCenter).length;
    console.log(
      '512 growth run',
      JSON.stringify(
        {
          seed,
          totalTicks,
          ms,
          curve,
          maxPops,
          finalPops,
          townCenters,
          alive: alive.map((civ) => ({
            name: civ.name,
            pop: civ.population,
            housing: civ.housing,
            era: civ.era,
          })),
          buildings: game.buildings.length,
        },
        null,
        1,
      ),
    );

    // Early pacing: growth must be brisk in the first two centuries, and a
    // faction must already be a Metropolis by year 400.
    expect(earlyPopulation).toBeGreaterThan(100);
    const metropolisMinPop = SETTLEMENT_TIERS[SETTLEMENT_TIERS.length - 1].minPop;
    expect(Math.max(...curve[1].populations)).toBeGreaterThanOrEqual(metropolisMinPop);
    // Long-run city growth: a faction passes the old ~200 plateau and is still
    // above 300 at the end of the run.
    expect(Math.max(...maxPops)).toBeGreaterThan(300);
    expect(Math.max(...finalPops)).toBeGreaterThan(300);
    // Expansion actually happened: at least one faction holds more than one city.
    expect(townCenters).toBeGreaterThanOrEqual(4);
    expect(townCenters).toBeGreaterThan(alive.length);
    expect(curve).toHaveLength(totalTicks / 200);
    expect(alive.length).toBeGreaterThanOrEqual(1);
    // The run must stay comfortably inside the test timeout.
    expect(ms).toBeLessThan(120_000);
  }, 120_000);
});
