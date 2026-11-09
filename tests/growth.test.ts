import { describe, expect, it } from 'vitest';
import {
  FOOD_CAP,
  KNOWLEDGE_CAP,
  MATERIALS_CAP,
  SETTLEMENT_TIERS,
  WEALTH_CAP,
  settlementTier,
} from '../src/config';
import { countCivJobs } from '../src/sim/agents';
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
    // Two barracks are the peace-time target at this population.
    expect(chooseBuildingType(large, builtFrom({ [BuildingType.Barracks]: 2, [BuildingType.Farm]: 16 }))).toBe(
      BuildingType.Farm,
    );
    expect(chooseBuildingType(large, builtFrom({ [BuildingType.Barracks]: 2, [BuildingType.Farm]: 17 }))).toBeNull();
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
    // Once the basics are covered the town turns to markets.
    expect(
      chooseBuildingType(
        town,
        builtFrom({
          [BuildingType.Barracks]: 1,
          [BuildingType.Workshop]: 3,
          [BuildingType.Temple]: 2,
        }),
      ),
    ).toBe(BuildingType.Market);

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
        builtFrom({ [BuildingType.Barracks]: 2, [BuildingType.Workshop]: 7, [BuildingType.Farm]: 25 }),
      ),
    ).toBe(BuildingType.Workshop);
    // Temple target at pop 450 is min(5, 1 + 4) = 5.
    expect(
      chooseBuildingType(
        metropolis,
        builtFrom({ [BuildingType.Barracks]: 2, [BuildingType.Workshop]: 8, [BuildingType.Farm]: 25 }),
      ),
    ).toBe(BuildingType.Temple);
    expect(
      chooseBuildingType(
        metropolis,
        builtFrom({
          [BuildingType.Barracks]: 2,
          [BuildingType.Workshop]: 8,
          [BuildingType.Temple]: 4,
          [BuildingType.Farm]: 25,
        }),
      ),
    ).toBe(BuildingType.Temple);
    expect(
      chooseBuildingType(
        metropolis,
        builtFrom({
          [BuildingType.Barracks]: 2,
          [BuildingType.Workshop]: 8,
          [BuildingType.Temple]: 5,
          [BuildingType.Farm]: 25,
        }),
      ),
    ).toBe(BuildingType.Market);
    expect(
      chooseBuildingType(
        metropolis,
        builtFrom({
          [BuildingType.Barracks]: 2,
          [BuildingType.Workshop]: 8,
          [BuildingType.Temple]: 5,
          [BuildingType.Market]: 6,
          [BuildingType.Farm]: 25,
        }),
      ),
    ).toBeNull();

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
        builtFrom({ [BuildingType.Barracks]: 3, [BuildingType.Workshop]: 8, [BuildingType.Farm]: 34 }),
      ),
    ).toBe(BuildingType.Workshop);
    expect(
      chooseBuildingType(
        huge,
        builtFrom({
          [BuildingType.Barracks]: 3,
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
          [BuildingType.Barracks]: 3,
          [BuildingType.Workshop]: 9,
          [BuildingType.Temple]: 5,
          [BuildingType.Farm]: 34,
        }),
      ),
    ).toBe(BuildingType.Market);
    expect(
      chooseBuildingType(
        huge,
        builtFrom({
          [BuildingType.Barracks]: 3,
          [BuildingType.Workshop]: 9,
          [BuildingType.Temple]: 5,
          [BuildingType.Market]: 8,
          [BuildingType.Farm]: 34,
        }),
      ),
    ).toBeNull();
  });

  it('unlocks universities and monuments in the later eras', () => {
    const basics = {
      [BuildingType.Barracks]: 3,
      [BuildingType.Workshop]: 9,
      [BuildingType.Temple]: 5,
      [BuildingType.Market]: 8,
      [BuildingType.Farm]: 34,
    } as const;
    const engine = scaledCiv({
      population: 600,
      foodNeed: 360,
      foodProduction: 700,
      housing: 4000,
      era: 2,
    });
    expect(chooseBuildingType(engine, builtFrom(basics))).toBe(BuildingType.University);
    expect(
      chooseBuildingType(engine, builtFrom({ ...basics, [BuildingType.University]: 6 })),
    ).toBeNull();

    const zenith = { ...engine, era: 3 as const };
    expect(chooseBuildingType(zenith, builtFrom(basics))).toBe(BuildingType.University);
    expect(
      chooseBuildingType(
        zenith,
        builtFrom({ ...basics, [BuildingType.University]: 6 }),
      ),
    ).toBe(BuildingType.Monument);
    // At population 600 the Monument target is min(6, 1 + 3) = 4.
    expect(
      chooseBuildingType(
        zenith,
        builtFrom({ ...basics, [BuildingType.University]: 6, [BuildingType.Monument]: 3 }),
      ),
    ).toBe(BuildingType.Monument);
    expect(
      chooseBuildingType(
        zenith,
        builtFrom({ ...basics, [BuildingType.University]: 6, [BuildingType.Monument]: 4 }),
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
    const perCiv = alive.map((civ) => {
      const workforce = countCivJobs(game, civ.id);
      const centers = game.buildings.filter(
        (building) =>
          building.civ === civ.id && building.built && building.type === BuildingType.TownCenter,
      ).length;
      const adults = civ.population - workforce.children;
      const buildingJobs =
        workforce.farmers +
        workforce.workers +
        workforce.priests +
        workforce.builders +
        workforce.soldiers;
      const buildingCounts: Record<string, number> = {};
      for (const building of game.buildings) {
        if (building.civ !== civ.id || !building.built) continue;
        const name = BuildingType[building.type];
        buildingCounts[name] = (buildingCounts[name] ?? 0) + 1;
      }
      return {
        name: civ.name,
        pop: civ.population,
        housing: civ.housing,
        era: civ.era,
        centers,
        adults,
        buildingJobs,
        buildingShare: adults > 0 ? buildingJobs / adults : 0,
        idleShare: adults > 0 ? workforce.idle / adults : 0,
        workforce,
        buildingCounts,
        food: Math.round(civ.food),
        materials: Math.round(civ.materials),
        wealth: Math.round(civ.wealth),
        knowledge: Math.round(civ.knowledge),
        resourcesAtCap: [
          civ.food >= FOOD_CAP,
          civ.materials >= MATERIALS_CAP,
          civ.wealth >= WEALTH_CAP,
          civ.knowledge >= KNOWLEDGE_CAP,
        ].filter(Boolean).length,
      };
    });
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
          perCiv,
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
    // Expansion actually happened: at least one faction reached four cities.
    expect(Math.max(...perCiv.map((civ) => civ.centers))).toBeGreaterThanOrEqual(4);
    expect(townCenters).toBeGreaterThan(alive.length);
    // Late-game labour is productive: almost nobody is truly idle and a large
    // minority hold building or soldier roles.
    expect(game.stats.adults).toBeGreaterThan(0);
    expect(game.stats.idleAdults / game.stats.adults).toBeLessThanOrEqual(0.05);
    expect(Math.max(...perCiv.map((civ) => civ.buildingShare))).toBeGreaterThanOrEqual(0.3);
    expect(perCiv.every((civ) => civ.centers > 0)).toBe(true);
    // Resources must not all pin at their caps; wealth and materials in
    // particular should show the cost of upkeep.
    expect(
      perCiv.filter((civ) => civ.materials < MATERIALS_CAP * 0.9 || civ.wealth < WEALTH_CAP * 0.9)
        .length,
    ).toBeGreaterThanOrEqual(2);
    expect(curve).toHaveLength(totalTicks / 200);
    expect(alive.length).toBeGreaterThanOrEqual(1);
    // The run must stay comfortably inside the test timeout.
    expect(ms).toBeLessThan(120_000);
  }, 120_000);
});
