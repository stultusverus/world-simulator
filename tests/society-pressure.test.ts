import { describe, expect, it } from 'vitest';
import { assignJobs } from '../src/sim/agents';
import { runEconomy } from '../src/sim/economy';
import { Game } from '../src/sim/game';
import { repairBuilding } from '../src/sim/maintenance';
import { nearestCenter, runMigration, settlementStats } from '../src/sim/settlements';
import { BuildingType, Job, Tile } from '../src/world/types';

function fixture() {
  const game = new Game({ size: 256, seedText: 'HOUSEHOLDS', startWithFactions: true });
  for (const b of [...game.buildings]) game.removeBuilding(b);
  for (let id = 0; id < game.agents.capacity; id++) if (game.agents.alive[id]) game.removeAgent(id);
  game.civs[1].alive = false;
  game.civs[2].alive = false;
  game.world.terrain.fill(Tile.Grass);
  game.world.fertility.fill(255);
  game.refreshReachability();
  const civ = game.civs[0];
  civ.centerX = 30;
  civ.centerY = 30;
  const source = game.addBuilding(civ.id, BuildingType.TownCenter, 30, 30, true);
  const destination = game.addBuilding(civ.id, BuildingType.TownCenter, 60, 30, true);
  for (let i = 0; i < 3; i++) game.addBuilding(civ.id, BuildingType.House, 60, 32 + i, true);
  const mother = game.spawnAgent(civ.id, 30, 30, {
    age: 30,
    gender: 1,
    home: source.id,
    job: Job.Farmer,
  });
  const father = game.spawnAgent(civ.id, 30, 30, {
    age: 30,
    gender: 0,
    home: source.id,
    job: Job.Worker,
  });
  game.agents.partner[mother] = father;
  game.agents.partner[father] = mother;
  const children = [5, 8].map((age) =>
    game.spawnAgent(civ.id, 30, 30, { age, gender: 0, home: source.id, mother, father }),
  );
  for (let i = 0; i < 6; i++)
    game.spawnAgent(civ.id, 30, 30, { age: 25, gender: 0, home: source.id, job: Job.Soldier });
  game.updateStats();
  return { game, civ, source, destination, family: [mother, father, ...children], children };
}

describe('households and local housing', () => {
  it('moves working parents with their dependent children out of overcrowding', () => {
    const { game, civ, source, destination, family, children } = fixture();
    expect(settlementStats(game, civ.id, source).residents).toBe(10);
    game.world.tick = 8;
    runMigration(game);
    for (const id of family) {
      const home = game.buildingById.get(game.agents.home[id])!;
      expect(nearestCenter(game, civ.id, home.x, home.y)?.id).toBe(destination.id);
    }
    for (const id of children) expect(game.agents.job[id]).toBe(Job.Idle);
    expect(settlementStats(game, civ.id, source).residents).toBe(6);
    expect(settlementStats(game, civ.id, destination).residents).toBe(4);
  });

  it('does not split a family to fill a small vacancy or move it across water', () => {
    const { game, civ, source, destination, family } = fixture();
    for (const b of [...game.buildings]) if (b.type === BuildingType.House) game.removeBuilding(b);
    for (let i = 0; i < 5; i++)
      game.spawnAgent(civ.id, 60, 30, {
        age: 25,
        gender: 0,
        home: destination.id,
        job: Job.Soldier,
      });
    game.world.tick = 8;
    runMigration(game);
    for (const id of family) expect(game.agents.home[id]).toBe(source.id);
    game.addBuilding(civ.id, BuildingType.House, 60, 32, true);
    for (let y = 0; y < 256; y++) game.world.terrain[y * 256 + 45] = Tile.ShallowWater;
    game.refreshReachability();
    runMigration(game);
    for (const id of family) expect(game.agents.home[id]).toBe(source.id);
  });

  it('builds housing at the crowded centre even when faction-wide housing is ample', () => {
    const { game, civ, source } = fixture();
    const farm = game.addBuilding(civ.id, BuildingType.Farm, 30, 32, true);
    farm.workers = 2;
    civ.materials = 100;
    civ.food = 120;
    expect(civ.housing).toBeGreaterThan(civ.population);
    runEconomy(game);
    const site = game.buildings.find((b) => !b.built)!;
    expect(site.type).toBe(BuildingType.House);
    expect(nearestCenter(game, civ.id, site.x, site.y)?.id).toBe(source.id);
  });
});

describe('continuing economic uses', () => {
  it('spends mature surplus on renewal and staffed scholarship, preserving research reserves', () => {
    const { game, civ } = fixture();
    const university = game.addBuilding(civ.id, BuildingType.University, 32, 30, true);
    university.workers = 4;
    for (let i = 0; i < 3; i++) game.addBuilding(civ.id, BuildingType.Workshop, 34, 31 + i, true);
    game.addBuilding(civ.id, BuildingType.House, 33, 30, false); // isolate recurring spending from new projects
    civ.era = 3;
    civ.population = 300;
    civ.materials = 800;
    civ.knowledge = 1500;
    runEconomy(game);
    expect(civ.materials).toBeLessThan(800);
    expect(civ.materials).toBeGreaterThan(200);
    expect(civ.knowledge).toBeLessThan(1500);
    expect(civ.knowledge).toBeGreaterThanOrEqual(480);
    civ.knowledge = 480;
    runEconomy(game);
    expect(civ.knowledge).toBeGreaterThanOrEqual(480);
  });

  it('does not charge scholarship for unstaffed institutions or spend scarce materials on renewal', () => {
    const { game, civ } = fixture();
    game.addBuilding(civ.id, BuildingType.University, 32, 30, true);
    for (let i = 0; i < 3; i++) game.addBuilding(civ.id, BuildingType.Workshop, 34, 31 + i, true);
    game.addBuilding(civ.id, BuildingType.House, 33, 30, false);
    civ.era = 3;
    civ.population = 300;
    civ.materials = 0;
    civ.knowledge = 1000;
    runEconomy(game);
    expect(civ.materials).toBeGreaterThan(0);
    expect(civ.materials).toBeLessThan(200);
    expect(civ.knowledge).toBeGreaterThanOrEqual(1000);
    expect(civ.wealth).toBeGreaterThanOrEqual(0);
  });

  it('funded scholarship improves construction and civic spending preserves the reserve', () => {
    const { game, civ, family } = fixture();
    const university = game.addBuilding(civ.id, BuildingType.University, 32, 30, true);
    university.workers = 4;
    for (let i = 0; i < 3; i++) game.addBuilding(civ.id, BuildingType.Workshop, 34, 31 + i, true);
    const site = game.addBuilding(civ.id, BuildingType.House, 33, 30, false);
    game.agents.job[family[0]] = Job.Builder;
    civ.era = 3;
    civ.population = 300;
    civ.materials = 200;
    civ.knowledge = 1500;
    const unfunded = Game.fromSave(game.toSave(0));
    unfunded.buildingById.get(university.id)!.workers = 0;
    runEconomy(game);
    runEconomy(unfunded);
    expect(site.work).toBeGreaterThan(unfunded.buildingById.get(site.id)!.work);
    expect(civ.materials).toBeGreaterThanOrEqual(200);
  });

  it('repairs war damage using builders and materials, and stops when either runs out', () => {
    const { game, civ, source } = fixture();
    source.hp = source.maxHp - 100;
    civ.materials = 3;
    repairBuilding(game, civ, 0);
    expect(source.hp).toBe(source.maxHp - 100);
    repairBuilding(game, civ, 2);
    expect(source.hp).toBe(source.maxHp - 80);
    expect(civ.materials).toBeCloseTo(1.4);
    repairBuilding(game, civ, 10);
    expect(civ.materials).toBeCloseTo(0);
    const hp = source.hp;
    repairBuilding(game, civ, 10);
    expect(source.hp).toBe(hp);
    civ.materials = 100;
    civ.warId = 1;
    repairBuilding(game, civ, 10);
    expect(source.hp).toBe(hp);
  });

  it('assigns repair crews after construction without taking the last farmer', () => {
    const game = new Game({ size: 256, seedText: 'REPAIR-CREW', startWithFactions: true });
    const civ = game.civs[0];
    const farm = game.buildings.find((b) => b.civ === civ.id && b.type === BuildingType.Farm)!;
    farm.hp = 10;
    civ.materials = 5;
    assignJobs(game);
    const builders = Array.from(game.agents.job).filter(
      (job, id) => game.agents.alive[id] && game.agents.civ[id] === civ.id && job === Job.Builder,
    );
    expect(builders.length).toBeGreaterThan(0);
    expect(
      game.buildings
        .filter((b) => b.civ === civ.id && b.type === BuildingType.Farm)
        .reduce((n, b) => n + b.workers, 0),
    ).toBeGreaterThan(0);
    runEconomy(game);
    expect(farm.hp).toBeGreaterThan(10);
    expect(civ.materials).toBeLessThan(5);
  });
});
