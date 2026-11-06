import {
  BUILDING_DEFS,
  COLORS,
  ERA_KNOWLEDGE_REQ,
  ERA_NAMES,
  ERA_POP_REQ,
  MAX_FACTIONS,
  SETTLEMENT_TIERS,
  TRAITS,
  settlementTier,
} from '../config';
import { personalName } from '../sim/names';
import type { Game } from '../sim/game';
import type { PowerId } from '../sim/powers';
import {
  BuildingType,
  JOB_NAMES,
  TILE_NAMES,
  type ChronicleKind,
} from '../world/types';
import { escapeHtml, formatNumber, formatYear, qs } from './dom';
import { POWER_META, POWER_ORDER } from './power-meta';

export type InspectorSelection =
  | { kind: 'agent'; id: number }
  | { kind: 'building'; id: number }
  | { kind: 'tile'; x: number; y: number }
  | null;

export type ToastKind = 'info' | 'error' | 'good';

type ChronicleFilter = 'all' | 'war' | 'society' | 'faith' | 'power';

export interface HudCallbacks {
  onPower: (power: PowerId | null) => void;
  onSpeed: (speed: number) => void;
  onPauseToggle: () => void;
  onFitWorld: () => void;
  onCenter: (x: number, y: number) => void;
  onOpenSaves: () => void;
  onOpenHelp: () => void;
  onOpenCreation: () => void;
  onBrushRadius: (radius: number) => void;
}

const POWER_HINTS: Record<PowerId, string> = {
  spawnFaction: 'Click open land to raise a faction · Esc to cancel',
  spawnVillagers: "Click a faction's territory to add settlers",
  spawnDeer: 'Click open land to release deer',
  spawnWolves: 'Click open land to release wolves',
  heal: 'Click to heal everyone inside the brush',
  fertility: 'Click a settlement to bless its farms and cradles',
  peace: 'Click anywhere to end every war',
  inspire: 'Click a settlement to grant knowledge',
};

const KIND_LABEL: Record<ChronicleKind, string> = {
  society: 'SOCIETY',
  war: 'WAR',
  diplomacy: 'DIPLOMACY',
  faith: 'FAITH',
  progress: 'ERA',
  power: 'POWER',
  nature: 'NATURE',
};

const KIND_COLOR: Record<ChronicleKind, string> = {
  society: '#8fd07a',
  war: '#e07a6f',
  diplomacy: '#f0c987',
  faith: '#d9b3ff',
  progress: '#9ad0e8',
  power: '#e6c060',
  nature: '#b6e07a',
};

function matchesFilter(kind: ChronicleKind, filter: ChronicleFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'war') return kind === 'war' || kind === 'diplomacy';
  if (filter === 'society') return kind === 'society' || kind === 'progress';
  return kind === filter;
}

function bar(ratio: number, color: string): string {
  const width = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  return `<span class="meter"><span class="meter-fill" style="width:${width}%;background:${color}"></span></span>`;
}

function relationBar(value: number): string {
  const width = Math.min(50, Math.abs(value) / 2);
  const style =
    value >= 0
      ? `left:50%;width:${width}%`
      : `left:${50 - width}%;width:${width}%`;
  return `<span class="relation-track"><span class="relation-zero"></span><span class="relation-fill ${value >= 0 ? 'positive' : 'negative'}" style="${style}"></span></span>`;
}

export class Hud {
  readonly root: HTMLElement;
  private readonly callbacks: HudCallbacks;
  private game: Game | null = null;
  private activePower: PowerId | null = null;
  private selection: InspectorSelection = null;
  private filter: ChronicleFilter = 'all';
  private openCivId: number | null = null;
  private lastFast = 0;
  private lastChronicleCount = -1;
  private lastCivRender = 0;
  private lastInspectorRender = 0;
  private chipSignature = '';

  private readonly yearLabel: HTMLElement;
  private readonly worldName: HTMLElement;
  private readonly chips: HTMLElement;
  private readonly worldStats: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly pauseBadge: HTMLElement;
  private readonly speedButtons: HTMLButtonElement[];
  private readonly dockTools: HTMLButtonElement[];
  private readonly brushPanel: HTMLElement;
  private readonly brushRange: HTMLInputElement;
  private readonly brushValue: HTMLElement;
  private readonly modeHint: HTMLElement;
  private readonly chroniclePanel: HTMLElement;
  private readonly chronicleList: HTMLElement;
  private readonly inspector: HTMLElement;
  private readonly civPanel: HTMLElement;
  private readonly toasts: HTMLElement;

  constructor(mount: HTMLElement, callbacks: HudCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'hud';
    const dockGroups = (['spawn', 'bless'] as const)
      .map((group) => {
        const tools = POWER_ORDER.filter((id) => POWER_META[id].group === group)
          .map(
            (id) => `
            <button type="button" class="dock-tool" data-power="${id}" title="${escapeHtml(POWER_META[id].title)} — ${escapeHtml(POWER_META[id].description)}">
              <span class="dock-tool-icon">${POWER_META[id].icon}</span>
              <span class="dock-tool-label">${POWER_META[id].label}</span>
            </button>`,
          )
          .join('');
        return `
          <div class="dock-section-label">${group === 'spawn' ? 'SPAWN' : 'BLESS'}</div>
          <div class="dock-grid">${tools}</div>
        `;
      })
      .join('');

    this.root.innerHTML = `
      <header class="topbar">
        <div class="brand"><span class="brand-mark">◇</span><span>Worldsmith</span></div>
        <div class="world-meta">
          <span class="world-name" id="world-name">The Unnamed World</span>
          <span class="world-year" id="year-label">Year 1</span>
        </div>
        <div class="civ-chips" id="civ-chips"></div>
        <div class="top-actions">
          <button type="button" class="top-button" id="btn-new" title="Start a new world">New</button>
          <button type="button" class="top-button" id="btn-saves" title="Save or load a world">Saves</button>
          <button type="button" class="top-button" id="btn-help" title="How to play (H)">Help</button>
        </div>
      </header>

      <aside class="power-dock">
        <div class="dock-title">POWERS</div>
        <button type="button" class="dock-tool inspect-tool" data-power="none" title="Inspect — with no power selected, hover and click anything">
          <span class="dock-tool-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg></span>
          <span class="dock-tool-label">Inspect</span>
        </button>
        ${dockGroups}
        <div class="brush-panel hidden" id="brush-panel">
          <div class="brush-head"><span>BRUSH</span><span id="brush-value">6</span></div>
          <input type="range" id="brush-range" min="2" max="12" step="1" value="6" aria-label="Brush radius" />
        </div>
        <div class="dock-foot">Right-drag<br/>to pan</div>
      </aside>

      <div class="pause-badge hidden" id="pause-badge">PAUSED</div>

      <aside class="chronicle-panel" id="chronicle-panel">
        <div class="panel-head">
          <div class="panel-title">CHRONICLE</div>
          <button type="button" class="panel-close-mini" id="chronicle-collapse" title="Toggle chronicle (C)">⟩</button>
        </div>
        <div class="chronicle-filters" id="chronicle-filters">
          <button type="button" data-filter="all" class="active">All</button>
          <button type="button" data-filter="war">War</button>
          <button type="button" data-filter="society">Society</button>
          <button type="button" data-filter="faith">Faith</button>
          <button type="button" data-filter="power">Powers</button>
        </div>
        <div class="chronicle-list" id="chronicle-list"></div>
      </aside>

      <section class="inspector hidden" id="inspector"></section>
      <aside class="civ-panel hidden" id="civ-panel"></aside>

      <footer class="bottom-bar">
        <div class="world-stats" id="world-stats"></div>
        <div class="time-controls">
          <button type="button" class="pause-button" id="pause-button" title="Pause / resume (Space)">❚❚</button>
          <div class="speed-group" id="speed-group">
            <button type="button" data-speed="1" class="active">1×</button>
            <button type="button" data-speed="2">2×</button>
            <button type="button" data-speed="5">5×</button>
          </div>
        </div>
        <div class="mode-hint" id="mode-hint">Hover to inspect · drag to pan · scroll to zoom</div>
      </footer>
      <div class="toasts" id="toasts"></div>
    `;
    mount.appendChild(this.root);

    this.yearLabel = qs<HTMLElement>(this.root, '#year-label');
    this.worldName = qs<HTMLElement>(this.root, '#world-name');
    this.chips = qs<HTMLElement>(this.root, '#civ-chips');
    this.worldStats = qs<HTMLElement>(this.root, '#world-stats');
    this.pauseButton = qs<HTMLButtonElement>(this.root, '#pause-button');
    this.pauseBadge = qs<HTMLElement>(this.root, '#pause-badge');
    this.speedButtons = [...this.root.querySelectorAll<HTMLButtonElement>('#speed-group button')];
    this.dockTools = [...this.root.querySelectorAll<HTMLButtonElement>('.dock-tool')];
    this.brushPanel = qs<HTMLElement>(this.root, '#brush-panel');
    this.brushRange = qs<HTMLInputElement>(this.root, '#brush-range');
    this.brushValue = qs<HTMLElement>(this.root, '#brush-value');
    this.modeHint = qs<HTMLElement>(this.root, '#mode-hint');
    this.chroniclePanel = qs<HTMLElement>(this.root, '#chronicle-panel');
    this.chronicleList = qs<HTMLElement>(this.root, '#chronicle-list');
    this.inspector = qs<HTMLElement>(this.root, '#inspector');
    this.civPanel = qs<HTMLElement>(this.root, '#civ-panel');
    this.toasts = qs<HTMLElement>(this.root, '#toasts');

    this.bindEvents();
    this.setActivePower(null);
  }

  private bindEvents(): void {
    for (const tool of this.dockTools) {
      tool.addEventListener('click', () => {
        const value = tool.dataset.power;
        if (value === 'none' || !value) {
          this.callbacks.onPower(null);
          return;
        }
        if (this.activePower === value) this.callbacks.onPower(null);
        else this.callbacks.onPower(value as PowerId);
      });
    }
    this.pauseButton.addEventListener('click', () => this.callbacks.onPauseToggle());
    for (const button of this.speedButtons) {
      button.addEventListener('click', () => this.callbacks.onSpeed(Number(button.dataset.speed)));
    }
    qs<HTMLButtonElement>(this.root, '#btn-saves').addEventListener('click', () => this.callbacks.onOpenSaves());
    qs<HTMLButtonElement>(this.root, '#btn-help').addEventListener('click', () => this.callbacks.onOpenHelp());
    qs<HTMLButtonElement>(this.root, '#btn-new').addEventListener('click', () => this.callbacks.onOpenCreation());
    qs<HTMLButtonElement>(this.root, '#chronicle-collapse').addEventListener('click', () => {
      this.chroniclePanel.classList.toggle('collapsed');
    });
    qs<HTMLElement>(this.root, '#chronicle-filters').addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-filter]');
      if (!button) return;
      this.filter = (button.dataset.filter ?? 'all') as ChronicleFilter;
      for (const chip of this.root.querySelectorAll<HTMLButtonElement>('button[data-filter]')) {
        chip.classList.toggle('active', chip === button);
      }
      this.renderChronicle(true);
    });
    this.chronicleList.addEventListener('click', (event) => {
      const entry = (event.target as HTMLElement).closest<HTMLElement>('.chronicle-entry');
      if (!entry || !entry.dataset.x || !entry.dataset.y) return;
      this.callbacks.onCenter(Number(entry.dataset.x), Number(entry.dataset.y));
    });
    this.chips.addEventListener('click', (event) => {
      const chip = (event.target as HTMLElement).closest<HTMLElement>('.civ-chip');
      if (!chip) return;
      const id = Number(chip.dataset.civ);
      this.openCivId = this.openCivId === id ? null : id;
      this.renderCivPanel();
    });
    this.civPanel.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-close-civ]')) {
        this.openCivId = null;
        this.civPanel.classList.add('hidden');
        return;
      }
      const center = target.closest<HTMLElement>('[data-center-civ]');
      if (center?.dataset.x && center.dataset.y) {
        this.callbacks.onCenter(Number(center.dataset.x), Number(center.dataset.y));
      }
    });
    this.brushRange.addEventListener('input', () => {
      const value = Number(this.brushRange.value);
      this.brushValue.textContent = String(value);
      this.callbacks.onBrushRadius(value);
    });
  }

  setGame(game: Game): void {
    this.game = game;
    this.openCivId = null;
    this.civPanel.classList.add('hidden');
    this.selection = null;
    this.inspector.classList.add('hidden');
    this.chipSignature = '';
    this.lastChronicleCount = -1;
    this.renderFast(game, true);
    this.renderChronicle(true);
    this.bumpChronicleFilters();
  }

  setActivePower(power: PowerId | null): void {
    this.activePower = power;
    for (const tool of this.dockTools) {
      tool.classList.toggle('active', tool.dataset.power === (power ?? 'none'));
    }
    const meta = power ? POWER_META[power] : null;
    this.brushPanel.classList.toggle('hidden', !meta?.needsRadius);
    if (power) {
      this.modeHint.textContent = POWER_HINTS[power];
    } else {
      this.modeHint.textContent = 'Hover to inspect · drag to pan · scroll to zoom · F to fit';
    }
  }

  setBrushRadius(value: number): void {
    this.brushRange.value = String(value);
    this.brushValue.textContent = String(value);
  }

  setInspector(selection: InspectorSelection): void {
    const same =
      (this.selection === null && selection === null) ||
      (this.selection !== null &&
        selection !== null &&
        this.selection.kind === selection.kind &&
        ('id' in this.selection ? this.selection.id : -1) === ('id' in selection ? selection.id : -1) &&
        ('x' in this.selection ? this.selection.x : -1) === ('x' in selection ? selection.x : -1) &&
        ('y' in this.selection ? this.selection.y : -1) === ('y' in selection ? selection.y : -1));
    this.selection = selection;
    if (!same) this.renderInspector();
  }

  refreshInspector(): void {
    this.renderInspector();
  }

  update(game: Game, now: number): void {
    this.game = game;
    if (now - this.lastFast > 120) {
      this.lastFast = now;
      this.renderFast(game, false);
    }
    if (game.chronicle.entries.length !== this.lastChronicleCount) {
      this.renderChronicle();
    }
    if (this.openCivId !== null && now - this.lastCivRender > 400) {
      this.lastCivRender = now;
      this.renderCivPanel();
    }
    if (this.selection !== null && now - this.lastInspectorRender > 250) {
      this.lastInspectorRender = now;
      this.renderInspector();
    }
  }

  private renderFast(game: Game, force: boolean): void {
    this.yearLabel.textContent = formatYear(game.year);
    this.worldName.textContent = game.worldName;
    this.worldStats.innerHTML = `
      <span><b>${formatNumber(game.stats.population)}</b> people</span>
      <span class="sep">·</span>
      <span><b>${game.stats.factions}</b> factions</span>
      <span class="sep">·</span>
      <span><b>${game.stats.wars}</b> wars</span>
      <span class="sep">·</span>
      <span><b>${formatNumber(game.stats.animals)}</b> wildlife</span>
    `;
    this.pauseButton.textContent = game.paused ? '▶' : '❚❚';
    this.pauseButton.title = game.paused ? 'Resume (Space)' : 'Pause (Space)';
    this.pauseBadge.classList.toggle('hidden', !game.paused);
    for (const button of this.speedButtons) {
      button.classList.toggle('active', !game.paused && Number(button.dataset.speed) === game.speed);
    }
    this.updateChips(game, force);
  }

  private updateChips(game: Game, force: boolean): void {
    const signature = game.civs.map((civ) => `${civ.id}:${civ.alive}:${civ.color}`).join('|');
    if (force || signature !== this.chipSignature) {
      this.chipSignature = signature;
      this.chips.innerHTML = game.civs
        .map((civ) => {
          const era = ERA_NAMES[civ.era] ?? 'Hearth';
          const traits = civ.traits
            .map((id) => TRAITS.find((trait) => trait.id === id)?.name ?? id)
            .join(', ');
          return `<button type="button" class="civ-chip ${civ.alive ? '' : 'fallen'}" data-civ="${civ.id}"
            title="${escapeHtml(civ.name)} — ${era} era — ${escapeHtml(traits)}${civ.alive ? '' : ' — fallen'}">
            <span class="civ-dot" style="background:${COLORS[civ.color] ?? COLORS[0]}"></span>
            <span class="civ-name">${escapeHtml(civ.name)}</span>
            <span class="civ-pop" data-civ-pop="${civ.id}">${civ.population}</span>
          </button>`;
        })
        .join('');
    } else {
      for (const civ of game.civs) {
        const node = this.chips.querySelector<HTMLElement>(`[data-civ-pop="${civ.id}"]`);
        if (node) node.textContent = String(civ.population);
      }
    }
  }

  private renderChronicle(force = false): void {
    if (!this.game) return;
    const game = this.game;
    const entries = game.chronicle.entries.filter((entry) => matchesFilter(entry.kind, this.filter));
    this.lastChronicleCount = game.chronicle.entries.length;
    const atTop = this.chronicleList.scrollTop < 24;
    const previousScroll = this.chronicleList.scrollTop;
    if (entries.length === 0) {
      this.chronicleList.innerHTML = `<div class="chronicle-empty">No events yet. Give the world time.</div>`;
      return;
    }
    const recent = entries.slice(-140).reverse();
    this.chronicleList.innerHTML = recent
      .map((entry) => {
        const civ = entry.civ !== undefined ? game.civs[entry.civ] : undefined;
        const color = civ ? COLORS[civ.color] ?? COLORS[0] : KIND_COLOR[entry.kind];
        const jump = entry.x !== undefined && entry.y !== undefined;
        return `<button type="button" class="chronicle-entry ${entry.kind} ${jump ? 'jumpable' : ''}"
          ${jump ? `data-x="${entry.x}" data-y="${entry.y}" title="Jump to location"` : ''}>
          <span class="entry-year">Y${entry.year}</span>
          <span class="entry-body">
            <span class="entry-kind"><span class="entry-dot" style="background:${color}"></span>${KIND_LABEL[entry.kind]}</span>
            <span class="entry-text">${escapeHtml(entry.text)}</span>
          </span>
        </button>`;
      })
      .join('');
    if (force || atTop) this.chronicleList.scrollTop = 0;
    else this.chronicleList.scrollTop = previousScroll;
  }

  private bumpChronicleFilters(): void {
    for (const chip of this.root.querySelectorAll<HTMLButtonElement>('button[data-filter]')) {
      chip.classList.toggle('active', chip.dataset.filter === this.filter);
    }
  }

  private renderInspector(): void {
    if (!this.game || !this.selection) {
      this.inspector.classList.add('hidden');
      return;
    }
    const game = this.game;
    let html = '';
    if (this.selection.kind === 'agent') {
      const id = this.selection.id;
      const agents = game.agents;
      if (!agents.isAlive(id)) {
        this.selection = null;
        this.inspector.classList.add('hidden');
        return;
      }
      const civ = game.civs[agents.civ[id]];
      const name = personalName(game.world.seedText, id, agents.gender[id]);
      const home = game.buildingById.get(agents.home[id]);
      const partner =
        agents.partner[id] !== 0xffffffff && agents.isAlive(agents.partner[id])
          ? personalName(game.world.seedText, agents.partner[id], agents.gender[agents.partner[id]])
          : '—';
      const job = JOB_NAMES[agents.job[id]] ?? 'Citizen';
      const age = agents.age[id];
      html = `
        <div class="inspect-head">
          <span class="civ-dot" style="background:${COLORS[civ?.color ?? 0]}"></span>
          <div><div class="inspect-title">${escapeHtml(name)}</div>
          <div class="inspect-sub">${escapeHtml(civ?.name ?? 'No faction')} · ${age < 14 ? 'Child' : job} · ${age} years</div></div>
        </div>
        <div class="stat-row"><span>Health</span><span>${Math.round(agents.health[id])}</span></div>${bar(agents.health[id] / 100, '#8fd07a')}
        <div class="stat-row"><span>Hunger</span><span>${Math.round(agents.hunger[id])}</span></div>${bar(agents.hunger[id] / 100, '#e07a6f')}
        <div class="stat-row"><span>Happiness</span><span>${Math.round(agents.happiness[id])}</span></div>${bar(agents.happiness[id] / 100, '#e6c060')}
        <div class="stat-row"><span>Faith</span><span>${Math.round(agents.faith[id])}</span></div>
        <div class="inspect-divider"></div>
        <div class="stat-row"><span>Home</span><span>${home ? escapeHtml(BUILDING_DEFS[home.type].name) : 'None'}</span></div>
        <div class="stat-row"><span>Partner</span><span>${escapeHtml(partner)}</span></div>
      `;
    } else if (this.selection.kind === 'building') {
      const building = game.buildingById.get(this.selection.id);
      if (!building) {
        this.selection = null;
        this.inspector.classList.add('hidden');
        return;
      }
      const def = BUILDING_DEFS[building.type];
      const civ = game.civs[building.civ];
      const production = Object.entries(def.produces)
        .map(([resource, amount]) => `${formatNumber(amount ?? 0)} ${resource}/year`)
        .join(' · ');
      html = `
        <div class="inspect-head">
          <span class="civ-dot" style="background:${COLORS[civ?.color ?? 0]}"></span>
          <div><div class="inspect-title">${escapeHtml(def.name)}</div>
          <div class="inspect-sub">${escapeHtml(civ?.name ?? 'No faction')} · ${building.built ? 'standing' : 'under construction'}</div></div>
        </div>
        <p class="inspect-desc">${escapeHtml(def.description)}</p>
        <div class="stat-row"><span>Health</span><span>${Math.round(building.hp)} / ${building.maxHp}</span></div>${bar(building.hp / building.maxHp, '#8fd07a')}
        <div class="stat-row"><span>Workers</span><span>${building.workers}${def.workers > 0 ? ` / ${def.workers}` : ''}</span></div>
        ${production ? `<div class="stat-row"><span>Output</span><span>${production}</span></div>` : ''}
        <div class="stat-row"><span>Position</span><span>${building.x}, ${building.y}</span></div>
      `;
    } else {
      const { x, y } = this.selection;
      const world = game.world;
      if (x < 0 || y < 0 || x >= world.size || y >= world.size) {
        this.inspector.classList.add('hidden');
        return;
      }
      const index = y * world.size + x;
      const owner = world.owner[index];
      const civ = owner !== 255 ? game.civs[owner] : undefined;
      const fertility = Math.round((world.fertility[index] / 255) * 100);
      html = `
        <div class="inspect-head">
          <span class="civ-dot" style="background:${civ ? COLORS[civ.color] : '#5a6672'}"></span>
          <div><div class="inspect-title">${TILE_NAMES[world.terrain[index]] ?? 'Land'}</div>
          <div class="inspect-sub">${x}, ${y} · ${civ ? escapeHtml(civ.name) : 'Unclaimed'}</div></div>
        </div>
        <div class="stat-row"><span>Soil fertility</span><span>${fertility}%</span></div>
        <div class="stat-row"><span>Elevation</span><span>${Math.round((world.elevation[index] / 255) * 100)}%</span></div>
        <div class="stat-row"><span>River</span><span>${world.river[index] === 1 ? 'Yes' : 'No'}</span></div>
      `;
    }
    this.inspector.innerHTML = html;
    this.inspector.classList.remove('hidden');
    this.lastInspectorRender = performance.now();
  }

  private renderCivPanel(): void {
    if (!this.game || this.openCivId === null) {
      this.civPanel.classList.add('hidden');
      return;
    }
    const game = this.game;
    const civ = game.civs[this.openCivId];
    if (!civ) {
      this.civPanel.classList.add('hidden');
      return;
    }
    const tierIndex = settlementTier(civ.population);
    const tier = SETTLEMENT_TIERS[tierIndex];
    const color = COLORS[civ.color] ?? COLORS[0];
    const nextEra = Math.min(3, civ.era + 1);
    const eraKnowledge = ERA_KNOWLEDGE_REQ[nextEra] ?? 0;
    const eraPop = ERA_POP_REQ[nextEra] ?? 0;
    const eraLabel = ERA_NAMES[civ.era] ?? 'Hearth';
    const nextEraLabel = ERA_NAMES[nextEra] ?? 'Hearth';
    const knowledgeRatio = civ.era >= 3 ? 1 : Math.min(1, civ.knowledge / Math.max(1, eraKnowledge));
    const traits = civ.traits
      .map((id) => TRAITS.find((trait) => trait.id === id))
      .filter((trait): trait is NonNullable<typeof trait> => Boolean(trait));
    const buildingCounts = new Map<BuildingType, number>();
    for (const building of game.buildings) {
      if (building.civ !== civ.id || !building.built) continue;
      buildingCounts.set(building.type, (buildingCounts.get(building.type) ?? 0) + 1);
    }
    const buildingHtml =
      buildingCounts.size === 0
        ? '<span class="muted">Nothing built yet.</span>'
        : [...buildingCounts.entries()]
            .map(
              ([type, count]) =>
                `<span class="building-chip"><span class="chip-count">${count}×</span> ${BUILDING_DEFS[type].short}</span>`,
            )
            .join('');
    const relations = game.civs
      .filter((other) => other.id !== civ.id)
      .map((other) => {
        const relation = game.relations[civ.id * MAX_FACTIONS + other.id] ?? 0;
        const war = game.wars.some(
          (candidate) =>
            (candidate.a === civ.id && candidate.b === other.id) ||
            (candidate.b === civ.id && candidate.a === other.id),
        );
        return `
          <div class="relation-row">
            <div class="relation-label"><span class="civ-dot small" style="background:${COLORS[other.color]}"></span>${escapeHtml(other.name)}${war ? '<span class="war-tag">WAR</span>' : ''}</div>
            ${relationBar(relation)}
            <span class="relation-value ${relation >= 0 ? 'positive' : 'negative'}">${relation > 0 ? '+' : ''}${Math.round(relation)}</span>
          </div>`;
      })
      .join('');
    this.civPanel.innerHTML = `
      <div class="civ-head">
        <span class="civ-swatch" style="background:${color}"></span>
        <div class="civ-head-text">
          <div class="civ-title">${escapeHtml(civ.name)}</div>
          <div class="civ-subtitle">${eraLabel} era · ${tier.name} · ${escapeHtml(civ.religion)}${civ.alive ? '' : ' · FALLEN'}</div>
        </div>
        <button type="button" class="panel-close" data-close-civ aria-label="Close faction panel">×</button>
      </div>
      <div class="civ-stats">
        <div><span class="stat-label">People</span><span class="stat-value">${civ.population}</span></div>
        <div><span class="stat-label">Housing</span><span class="stat-value">${civ.housing}</span></div>
        <div><span class="stat-label">Soldiers</span><span class="stat-value">${civ.soldiers}</span></div>
        <div><span class="stat-label">Happiness</span><span class="stat-value">${Math.round(civ.happiness)}</span></div>
      </div>
      <div class="stat-row"><span>Food</span><span>${Math.round(civ.food)} <span class="muted">+${civ.foodProduction.toFixed(1)}/yr</span></span></div>
      <div class="stat-row"><span>Materials</span><span>${Math.round(civ.materials)}</span></div>
      <div class="stat-row"><span>Wealth</span><span>${Math.round(civ.wealth)}</span></div>
      <div class="stat-row"><span>Knowledge</span><span>${Math.round(civ.knowledge)}</span></div>
      <div class="stat-row"><span>Faith</span><span>${Math.round(civ.faith)}</span></div>${bar(civ.faith / 100, '#d9b3ff')}
      <div class="era-block">
        <div class="stat-row"><span>${civ.era >= 3 ? 'Era' : `Next era · ${nextEraLabel}`}</span><span>${civ.era >= 3 ? 'Zenith reached' : `${Math.round(civ.knowledge)} / ${eraKnowledge} knowledge`}</span></div>
        ${bar(knowledgeRatio, '#9ad0e8')}
        <div class="muted small-text">${civ.era >= 3 ? 'The faction has reached the final era.' : `Needs ${Math.max(0, eraPop - civ.population)} more people and ${Math.max(0, eraKnowledge - Math.round(civ.knowledge))} more knowledge.`}</div>
      </div>
      <div class="section-title">TRAITS</div>
      <div class="trait-list">${traits
        .map((trait) => `<span class="trait-chip" title="${escapeHtml(trait.description)}">${escapeHtml(trait.name)}</span>`)
        .join('')}</div>
      <div class="section-title">BUILDINGS · ${civ.buildings}/${SETTLEMENT_TIERS[settlementTier(civ.population)].maxBuildings}</div>
      <div class="building-list">${buildingHtml}</div>
      <div class="section-title">RELATIONS</div>
      <div class="relations-list">${relations || '<span class="muted">No other factions remain.</span>'}</div>
      <div class="modal-actions">
        <button type="button" class="ghost-button" data-center-civ data-x="${civ.centerX}" data-y="${civ.centerY}">Center on capital</button>
      </div>
    `;
    this.civPanel.classList.remove('hidden');
    this.lastCivRender = performance.now();
  }

  toast(message: string, kind: ToastKind = 'info'): void {
    const toast = document.createElement('div');
    toast.className = `toast ${kind}`;
    toast.textContent = message;
    this.toasts.appendChild(toast);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => {
      toast.classList.add('leaving');
      window.setTimeout(() => toast.remove(), 240);
    }, 3400);
  }

  toggleChronicle(): void {
    this.chroniclePanel.classList.toggle('collapsed');
  }

  closeCivPanel(): void {
    this.openCivId = null;
    this.civPanel.classList.add('hidden');
  }

  isCivPanelOpen(): boolean {
    return this.openCivId !== null;
  }
}
