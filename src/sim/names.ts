import { RNG, hashString } from '../core/rng';

const FACTION_PREFIX = [
  'Ash', 'Vela', 'Orin', 'Kesh', 'Mira', 'Tor', 'Lune', 'Dara',
  'Bel', 'Sora', 'Eth', 'Kai', 'Nero', 'Vale', 'Ith', 'Mora',
  'Aster', 'Rune', 'Oren', 'Sava', 'Cael', 'Nira', 'Thal', 'Ulla',
];

const FACTION_SUFFIX = [
  'kin', 'hold', 'reach', 'court', 'concord', 'assembly', 'garde',
  'march', 'haven', 'spire', 'watch', 'circle', 'vale', 'hollow',
];

const RELIGION_ADJ = [
  'Silent', 'Radiant', 'Endless', 'Patient', 'Burning', 'Hidden',
  'Gentle', 'Iron', 'Verdant', 'Star-lit', 'Drowned', 'Hollow',
];

const RELIGION_NOUN = [
  'Flame', 'River', 'Wheel', 'Spire', 'Moon', 'Song', 'Harvest',
  'Tide', 'Gate', 'Word', 'Ember', 'Vigil',
];

const WORLD_ADJ = [
  'Verdant', 'Sundered', 'Quiet', 'Amber', 'Drowned', 'Hollow',
  'Bright', 'Wandering', 'Fallow', 'Crowned', 'Distant', 'Ashen',
];

const WORLD_NOUN = [
  'Reach', 'Expanse', 'Cradle', 'Frontier', 'Basin', 'Isles',
  'Marches', 'Vale', 'Threshold', 'Horizon', 'Concord', 'Shore',
];

const MALE_NAMES = [
  'Aren', 'Bram', 'Cael', 'Doran', 'Eli', 'Fenn', 'Galen', 'Hale',
  'Ivar', 'Joss', 'Kerr', 'Lorn', 'Milo', 'Niko', 'Orin', 'Pell',
  'Quin', 'Rook', 'Sayer', 'Tobin', 'Ulan', 'Voss', 'Wren', 'Yale',
];

const FEMALE_NAMES = [
  'Ada', 'Briar', 'Cire', 'Dara', 'Eira', 'Faye', 'Gwen', 'Hana',
  'Iris', 'Juna', 'Kira', 'Lena', 'Mira', 'Nell', 'Oona', 'Peta',
  'Quill', 'Rhea', 'Sage', 'Tess', 'Uma', 'Vera', 'Willa', 'Yara',
];

const FAMILY_NAMES = [
  'Ashford', 'Brook', 'Cairn', 'Dunmore', 'Elder', 'Fenwick',
  'Grove', 'Harrow', 'Ivers', 'Juniper', 'Kestrel', 'Lark',
  'Moss', 'North', 'Oakes', 'Pike', 'Quarry', 'Reed', 'Stone',
  'Thorn', 'Umber', 'Vane', 'Wold', 'Yarrow',
];

export function makeWorldName(seedText: string): string {
  const rng = new RNG(hashString(`${seedText}:world`));
  return `The ${rng.pick(WORLD_ADJ)} ${rng.pick(WORLD_NOUN)}`;
}

export function makeFactionName(seedText: string, index: number, used: ReadonlySet<string>): string {
  const rng = new RNG(hashString(`${seedText}:faction:${index}`));
  const prefix = rng.pick(FACTION_PREFIX);
  let suffix = rng.pick(FACTION_SUFFIX);
  const needsSpace = /[aeiou]$/i.test(prefix) && /^[aeiou]/i.test(suffix);
  if (needsSpace) suffix = suffix.charAt(0).toUpperCase() + suffix.slice(1);
  let base = needsSpace ? `${prefix} ${suffix}` : `${prefix}${suffix}`;
  base = base.charAt(0).toUpperCase() + base.slice(1);
  let name = base;
  let ordinal = 2;
  while (used.has(name)) {
    name = `${base} ${ordinal}`;
    ordinal += 1;
  }
  return name;
}

export function makeReligionName(seedText: string, index: number): string {
  const rng = new RNG(hashString(`${seedText}:faith:${index}`));
  return `The ${rng.pick(RELIGION_ADJ)} ${rng.pick(RELIGION_NOUN)}`;
}

export function personalName(seedText: string, agentId: number, gender: number): string {
  const rng = new RNG(hashString(`${seedText}:person:${agentId}`));
  const first = gender === 0 ? rng.pick(MALE_NAMES) : rng.pick(FEMALE_NAMES);
  const family = rng.pick(FAMILY_NAMES);
  return `${first} ${family}`;
}
