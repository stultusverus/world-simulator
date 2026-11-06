import type { PowerId } from '../sim/powers';

export interface PowerMeta {
  id: PowerId;
  label: string;
  title: string;
  description: string;
  color: string;
  group: 'spawn' | 'bless';
  icon: string;
  needsRadius: boolean;
}

const icons: Record<PowerId, string> = {
  spawnFaction:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 14h12"/><path d="M4 14V6l4-3 4 3v8"/><path d="M8 3v3"/><path d="M8 2l2-1"/></svg>',
  spawnVillagers:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="5" r="2.3"/><path d="M3.5 14c0-2.6 2-4.5 4.5-4.5s4.5 1.9 4.5 4.5"/></svg>',
  spawnDeer:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 13V8l2-3 3 2 3-2 2 3v5"/><path d="M4 8l-1-2M12 8l1-2"/><path d="M4 13h8"/></svg>',
  spawnWolves:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 5l3 2 3-1 3 1 3-2v7l-3 2-3-1-3 1-3-2z"/><path d="M6 9h.01M10 9h.01"/></svg>',
  heal:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3v10M3 8h10"/><circle cx="8" cy="8" r="6"/></svg>',
  fertility:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 14V7"/><path d="M8 7C8 4 5 2 2 3c0 3 2 5 6 4z"/><path d="M8 10c0-2 2-4 5-3 0 2-2 4-5 3z"/></svg>',
  peace:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6"/><path d="M8 2v12M2 8h12"/></svg>',
  inspire:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 2l1.4 4.1L14 7.5l-4.6 1.4L8 14 6.6 8.9 2 7.5l4.6-1.4z"/></svg>',
};

export const POWER_META: Record<PowerId, PowerMeta> = {
  spawnFaction: {
    id: 'spawnFaction',
    label: 'Faction',
    title: 'Spawn faction',
    description: 'Raise a new people with a town center, house and farmland.',
    color: '#e6c060',
    group: 'spawn',
    icon: icons.spawnFaction,
    needsRadius: false,
  },
  spawnVillagers: {
    id: 'spawnVillagers',
    label: 'Settlers',
    title: 'Spawn settlers',
    description: 'Add four settlers to the faction whose land you click.',
    color: '#9ad0e8',
    group: 'spawn',
    icon: icons.spawnVillagers,
    needsRadius: false,
  },
  spawnDeer: {
    id: 'spawnDeer',
    label: 'Deer',
    title: 'Spawn deer',
    description: 'Release grazing deer onto open land.',
    color: '#c9a46a',
    group: 'spawn',
    icon: icons.spawnDeer,
    needsRadius: false,
  },
  spawnWolves: {
    id: 'spawnWolves',
    label: 'Wolves',
    title: 'Spawn wolves',
    description: 'Release wolves that will hunt deer across the wilds.',
    color: '#9aa7b4',
    group: 'spawn',
    icon: icons.spawnWolves,
    needsRadius: false,
  },
  heal: {
    id: 'heal',
    label: 'Heal',
    title: 'Blessing of healing',
    description: 'Restore health and ease hunger for everyone near the click.',
    color: '#8fd07a',
    group: 'bless',
    icon: icons.heal,
    needsRadius: true,
  },
  fertility: {
    id: 'fertility',
    label: 'Grow',
    title: 'Blessing of fertility',
    description: 'Enrich farms and cradles across a settlement for twelve years.',
    color: '#b6e07a',
    group: 'bless',
    icon: icons.fertility,
    needsRadius: true,
  },
  peace: {
    id: 'peace',
    label: 'Peace',
    title: 'Blessing of peace',
    description: 'End every war on the map and cool tempers for a time.',
    color: '#a9d6e8',
    group: 'bless',
    icon: icons.peace,
    needsRadius: false,
  },
  inspire: {
    id: 'inspire',
    label: 'Spark',
    title: 'Blessing of insight',
    description: 'Grant knowledge and hope to the settlements near the click.',
    color: '#d9b3ff',
    group: 'bless',
    icon: icons.inspire,
    needsRadius: true,
  },
};

export const POWER_ORDER: PowerId[] = [
  'spawnFaction',
  'spawnVillagers',
  'spawnDeer',
  'spawnWolves',
  'heal',
  'fertility',
  'peace',
  'inspire',
];
