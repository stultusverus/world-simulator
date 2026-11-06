import './styles.css';
import { AUTOSAVE_INTERVAL_MS, MAX_CATCHUP_TICKS, ticksForSpeed } from './config';
import { AUTOSAVE_SLOT, isPersistentStorage, readFromSlot, saveToSlot } from './persist/storage';
import { Renderer, type PowerEffect, type RenderOverlay } from './render/renderer';
import { Game } from './sim/game';
import { applyPower, type PowerId } from './sim/powers';
import type { GameSave } from './sim/save-types';
import { CreationScreen, type CreationOptions } from './ui/creation';
import { HelpOverlay } from './ui/help';
import { Hud, type InspectorSelection } from './ui/hud';
import { POWER_META } from './ui/power-meta';
import { SaveMenu } from './ui/save-menu';

const COOLDOWNS: Record<PowerId, number> = {
  spawnFaction: 1400,
  spawnVillagers: 1100,
  spawnDeer: 900,
  spawnWolves: 900,
  heal: 1200,
  fertility: 7000,
  peace: 10000,
  inspire: 4500,
};

const appElement = document.querySelector<HTMLDivElement>('#app');
if (!appElement) throw new Error('Missing #app root');
const app: HTMLDivElement = appElement;

app.innerHTML = `
  <canvas id="world-canvas"></canvas>
  <div class="hud-root"></div>
  <div class="creation-root"></div>
  <div class="modal-root"></div>
  <div class="perf hidden" id="perf"></div>
`;

const canvasElement = document.querySelector<HTMLCanvasElement>('#world-canvas');
if (!canvasElement) throw new Error('Missing canvas');
const canvas: HTMLCanvasElement = canvasElement;

interface DebugStats {
  year: number;
  population: number;
  factions: number;
  wars: number;
  animals: number;
  buildings: number;
  agents: number;
  fps: number;
  zoom: number;
  paused: boolean;
  speed: number;
}

class WorldsmithApp {
  readonly renderer: Renderer;
  private readonly hud: Hud;
  private readonly creation: CreationScreen;
  private readonly saveMenu: SaveMenu;
  private readonly help: HelpOverlay;
  private readonly hudRoot: HTMLElement;
  private readonly creationRoot: HTMLElement;
  private readonly perfNode: HTMLElement;
  private game: Game | null = null;
  private tool: PowerId | null = null;
  private brushRadius = 6;
  private selection: InspectorSelection = null;
  private hoverSelection: InspectorSelection = null;
  private hoverTile: { x: number; y: number } | null = null;
  private cursorWorld: { x: number; y: number } | null = null;
  private pointer = {
    down: false,
    panning: false,
    painting: false,
    tap: false,
    moved: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastPaint: 0,
    id: -1,
  };
  private spaceDown = false;
  private effects: PowerEffect[] = [];
  private cooldowns = new Map<PowerId, number>();
  private accumulator = 0;
  private lastFrame = 0;
  private lastAutosave = 0;
  private lastPick = 0;
  private autosaveWarned = false;
  private temporaryAutosaveWarned = false;
  private fps = 0;
  private frameCount = 0;
  private fpsAt = 0;
  private lastSimMs = 0;
  private debug = new URLSearchParams(window.location.search).has('debug');

  constructor() {
    this.renderer = new Renderer(canvas);
    this.hudRoot = app.querySelector<HTMLElement>('.hud-root') as HTMLElement;
    this.creationRoot = app.querySelector<HTMLElement>('.creation-root') as HTMLElement;
    this.perfNode = app.querySelector<HTMLElement>('#perf') as HTMLElement;
    const modalRoot = app.querySelector<HTMLElement>('.modal-root') as HTMLElement;

    this.hud = new Hud(this.hudRoot, {
      onPower: (power) => this.setTool(power),
      onSpeed: (speed) => this.setSpeed(speed),
      onPauseToggle: () => this.togglePause(),
      onFitWorld: () => this.fitWorld(),
      onCenter: (x, y) => this.centerOn(x, y),
      onOpenSaves: () => {
        if (this.game) void this.saveMenu.show();
      },
      onOpenHelp: () => this.help.show(),
      onOpenCreation: () => this.openCreation(),
      onBrushRadius: (radius) => {
        this.brushRadius = radius;
      },
    });

    this.creation = new CreationScreen(this.creationRoot, {
      onStart: (options) => this.createWorld(options),
      onResume: () => void this.resumeAutosave(),
      onBack: () => this.closeCreation(),
    });

    const saveHost = document.createElement('div');
    const helpHost = document.createElement('div');
    modalRoot.append(saveHost, helpHost);
    this.saveMenu = new SaveMenu(saveHost, {
      getGame: () => this.game,
      onLoad: (save) => this.loadGameSave(save),
      onToast: (message, kind) => this.hud.toast(message, kind),
    });
    this.help = new HelpOverlay(helpHost);

    this.bindEvents();
    this.creation.show(false);
    this.setTool(null);
    this.hud.setBrushRadius(this.brushRadius);
    if (this.debug) this.perfNode.classList.remove('hidden');
    this.fpsAt = performance.now();
    requestAnimationFrame(this.frame);
    this.exposeDebugApi();
  }

  get currentGame(): Game | null {
    return this.game;
  }

  private bindEvents(): void {
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerUp);
    canvas.addEventListener('pointerleave', this.handlePointerLeave);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('blur', () => {
      this.spaceDown = false;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.autosave();
    });
  }

  private screenPosition(event: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private setCursorFromScreen(x: number, y: number): void {
    const world = this.renderer.camera.screenToWorld(x, y);
    this.cursorWorld = world;
    this.hoverTile = { x: Math.floor(world.x), y: Math.floor(world.y) };
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.game || this.creation.isOpen()) return;
    const { x, y } = this.screenPosition(event);
    this.setCursorFromScreen(x, y);
    this.pointer.down = true;
    this.pointer.id = event.pointerId;
    this.pointer.startX = x;
    this.pointer.startY = y;
    this.pointer.lastX = x;
    this.pointer.lastY = y;
    this.pointer.moved = false;
    this.pointer.panning = false;
    this.pointer.painting = false;
    this.pointer.tap = false;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Ignore capture failures on exotic browsers.
    }

    if (event.button === 1 || event.button === 2 || this.spaceDown) {
      this.pointer.panning = true;
      canvas.classList.add('panning');
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    if (this.tool) {
      this.pointer.painting = true;
      this.pointer.lastPaint = performance.now();
      this.castPowerAt(x, y, true);
    } else {
      this.pointer.tap = true;
    }
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.game) return;
    const { x, y } = this.screenPosition(event);
    this.setCursorFromScreen(x, y);
    const dx = x - this.pointer.lastX;
    const dy = y - this.pointer.lastY;
    const movedDistance = Math.hypot(x - this.pointer.startX, y - this.pointer.startY);

    if (this.pointer.down) {
      if (this.pointer.panning) {
        this.renderer.camera.panScreen(dx, dy);
        this.pointer.moved = true;
      } else if (this.pointer.painting) {
        if (movedDistance > 2) {
          this.pointer.moved = true;
          const now = performance.now();
          if (now - this.pointer.lastPaint > 150) {
            this.pointer.lastPaint = now;
            this.castPowerAt(x, y, false);
          }
        }
      } else if (this.pointer.tap && movedDistance > 6) {
        this.pointer.panning = true;
        this.pointer.tap = false;
        this.pointer.moved = true;
        canvas.classList.add('panning');
        this.renderer.camera.panScreen(dx, dy);
      }
    }

    this.pointer.lastX = x;
    this.pointer.lastY = y;
    if (!this.pointer.down) this.updateHover(performance.now());
    else if (!this.pointer.panning) this.updateHover(performance.now(), true);
  };

  private handlePointerUp = (): void => {
    if (!this.game) return;
    if (this.pointer.tap && !this.pointer.moved) {
      this.setSelection(this.hoverSelection);
    }
    this.resetPointer();
  };

  private resetPointer(): void {
    if (this.pointer.id >= 0) {
      try {
        canvas.releasePointerCapture(this.pointer.id);
      } catch {
        // Ignore.
      }
    }
    this.pointer.down = false;
    this.pointer.panning = false;
    this.pointer.painting = false;
    this.pointer.tap = false;
    this.pointer.moved = false;
    this.pointer.id = -1;
    canvas.classList.remove('panning');
  }

  private handlePointerLeave = (): void => {
    if (this.pointer.down) return;
    this.cursorWorld = null;
    this.hoverTile = null;
    this.hoverSelection = null;
    this.hud.setInspector(this.selection);
  };

  private handleWheel = (event: WheelEvent): void => {
    if (!this.game || this.creation.isOpen()) return;
    event.preventDefault();
    const { x, y } = this.screenPosition(event);
    const factor = Math.exp(-event.deltaY * 0.0012);
    this.renderer.camera.zoomAt(x, y, factor);
    this.setCursorFromScreen(x, y);
    this.updateHover(performance.now(), true);
  };

  private updateHover(now: number, force = false): void {
    if (!this.game || !this.cursorWorld) {
      this.hoverSelection = null;
      this.hud.setInspector(this.selection);
      return;
    }
    if (!force && now - this.lastPick < 70) return;
    this.lastPick = now;
    this.hoverSelection = this.pickAt(this.cursorWorld.x, this.cursorWorld.y);
    this.hud.setInspector(this.selection ?? this.hoverSelection);
  }

  private pickAt(worldX: number, worldY: number): InspectorSelection {
    const game = this.game;
    if (!game) return null;
    const size = game.world.size;
    const tx = Math.floor(worldX);
    const ty = Math.floor(worldY);
    if (tx < 0 || ty < 0 || tx >= size || ty >= size) return null;

    if (this.renderer.camera.zoom >= 7) {
      let best = -1;
      let bestDistance = 0.75;
      const agents = game.agents;
      for (let id = 0; id < agents.capacity; id += 1) {
        if (agents.alive[id] === 0) continue;
        const dx = agents.x[id] - worldX;
        const dy = agents.y[id] - worldY;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) continue;
        const distance = Math.hypot(dx, dy);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = id;
        }
      }
      if (best >= 0) return { kind: 'agent', id: best };
    }

    let building = game.buildingAt.get(ty * size + tx);
    if (!building) {
      for (let dy = -1; dy <= 1 && !building; dy += 1) {
        for (let dx = -1; dx <= 1 && !building; dx += 1) {
          const candidate = game.buildingAt.get((ty + dy) * size + (tx + dx));
          if (candidate && Math.hypot(candidate.x + 0.5 - worldX, candidate.y + 0.5 - worldY) < 1.2) {
            building = candidate;
          }
        }
      }
    }
    if (building) return { kind: 'building', id: building.id };
    return { kind: 'tile', x: tx, y: ty };
  }

  private setSelection(selection: InspectorSelection): void {
    this.selection = selection;
    this.hud.setInspector(selection ?? this.hoverSelection);
  }

  private setTool(power: PowerId | null): void {
    this.tool = power;
    this.hud.setActivePower(power);
    canvas.classList.toggle('tool-active', power !== null);
    if (power) {
      this.selection = null;
      this.hud.setInspector(this.hoverSelection);
    }
  }

  private castPowerAt(screenX: number, screenY: number, announce: boolean): void {
    if (!this.game || !this.tool) return;
    const world = this.renderer.camera.screenToWorld(screenX, screenY);
    this.castPower(this.tool, world.x, world.y, announce);
  }

  private castPower(power: PowerId, x: number, y: number, announce = true): { ok: boolean; message: string } {
    if (!this.game) return { ok: false, message: 'No world is running.' };
    const now = performance.now();
    const cooldownUntil = this.cooldowns.get(power) ?? 0;
    if (now < cooldownUntil) {
      if (announce) this.hud.toast(`${POWER_META[power].title} is still gathering.`, 'info');
      return { ok: false, message: 'recharging' };
    }
    const result = applyPower(this.game, power, x, y, this.brushRadius);
    if (!result.ok) {
      if (announce) this.hud.toast(result.message, 'error');
      return result;
    }
    this.cooldowns.set(power, now + COOLDOWNS[power]);
    const meta = POWER_META[power];
    const radius = power === 'peace' ? 28 : meta.needsRadius ? this.brushRadius : 2.5;
    this.effects.push({
      x,
      y,
      radius,
      color: meta.color,
      kind: power === 'peace' ? 'burst' : 'ring',
      startMs: now,
      durationMs: power === 'peace' ? 1500 : 900,
    });
    this.hud.toast(result.message, 'good');
    this.hud.refreshInspector();
    return result;
  }

  private togglePause(): void {
    if (!this.game || this.creation.isOpen()) return;
    this.game.paused = !this.game.paused;
    this.hud.update(this.game, performance.now());
  }

  private setSpeed(speed: number): void {
    if (!this.game) return;
    this.game.speed = speed;
    this.game.paused = false;
    this.hud.update(this.game, performance.now());
  }

  private fitWorld(): void {
    this.renderer.camera.fit();
  }

  private centerOn(x: number, y: number): void {
    const camera = this.renderer.camera;
    camera.zoom = Math.max(camera.zoom, 14);
    camera.centerOn(x + 0.5, y + 0.5);
  }

  private createWorld(options: CreationOptions): void {
    this.creation.setBusy(`Shaping a ${options.size}² world…`);
    window.setTimeout(() => {
      try {
        const started = performance.now();
        const game = new Game({
          size: options.size,
          seedText: options.seedText,
          startWithFactions: options.startWithFactions,
        });
        console.info(
          `[worldsmith] generated ${options.size}² in ${(performance.now() - started).toFixed(0)}ms`,
        );
        this.installGame(game);
        this.hud.toast(
          game.startWithFactions
            ? 'A world stirs. Three peoples begin their history.'
            : 'An empty wilderness awaits its first people.',
          'good',
        );
      } catch (error) {
        console.error(error);
        this.creation.showError(error instanceof Error ? error.message : 'World generation failed.');
      }
    }, 60);
  }

  private installGame(game: Game): void {
    this.game = game;
    game.paused = false;
    game.speed = 1;
    this.selection = null;
    this.hoverSelection = null;
    this.hoverTile = null;
    this.cursorWorld = null;
    this.effects = [];
    this.cooldowns.clear();
    this.accumulator = 0;
    this.lastFrame = performance.now();
    this.lastAutosave = this.lastFrame;
    this.renderer.setGame(game);
    const first = game.aliveCivs()[0];
    if (first) {
      const camera = this.renderer.camera;
      camera.zoom = Math.max(camera.minZoom, game.world.size >= 1024 ? 9 : game.world.size >= 512 ? 11 : 16);
      camera.centerOn(first.centerX + 0.5, first.centerY + 0.5);
    } else {
      this.renderer.camera.fit();
    }
    this.hud.setGame(game);
    this.hud.setActivePower(null);
    this.tool = null;
    canvas.classList.remove('tool-active');
    this.hud.setBrushRadius(this.brushRadius);
    this.creation.hide();
    this.creation.setBusy(null);
    this.saveMenu.hide();
    this.help.hide();
    app.classList.add('playing');
    document.title = `Worldsmith — ${game.worldName}`;
  }

  private loadGameSave(save: GameSave): void {
    try {
      const game = Game.fromSave(save);
      this.installGame(game);
      this.hud.toast(`World restored at year ${game.year}.`, 'good');
    } catch (error) {
      console.error(error);
      this.hud.toast(error instanceof Error ? error.message : 'Could not load the world.', 'error');
    }
  }

  private openCreation(): void {
    if (this.game) this.game.paused = true;
    this.creation.show(Boolean(this.game));
    this.setTool(null);
  }

  private closeCreation(): void {
    this.creation.hide();
    this.creation.setBusy(null);
    if (this.game) {
      this.game.paused = false;
      app.classList.add('playing');
    }
  }

  private async resumeAutosave(): Promise<void> {
    try {
      this.creation.setBusy('Restoring the world…');
      const save = await readFromSlot(AUTOSAVE_SLOT);
      if (!save) {
        this.creation.showError('No autosave was found.');
        return;
      }
      this.loadGameSave(save);
    } catch (error) {
      console.error(error);
      this.creation.showError(error instanceof Error ? error.message : 'Could not read the autosave.');
    }
  }

  private async autosave(): Promise<void> {
    if (!this.game) return;
    try {
      await saveToSlot(AUTOSAVE_SLOT, this.game.toSave());
      if (!isPersistentStorage() && !this.temporaryAutosaveWarned) {
        this.temporaryAutosaveWarned = true;
        this.hud.toast('Autosave is temporary and will be lost when this page is reloaded or closed.', 'info');
      }
    } catch (error) {
      console.warn('[worldsmith] autosave failed', error);
      if (!this.autosaveWarned) {
        this.autosaveWarned = true;
        this.hud.toast('Autosave failed — storage may be full.', 'error');
      }
    }
  }

  private handleResize = (): void => {
    this.renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  };

  private isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element || typeof element.tagName !== 'string') return false;
    const tag = element.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable === true;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (this.isTypingTarget(event.target)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      this.spaceDown = true;
      if (!event.repeat) this.togglePause();
      return;
    }
    if (event.repeat) return;
    switch (event.code) {
      case 'Digit1':
        this.setSpeed(1);
        break;
      case 'Digit2':
        this.setSpeed(2);
        break;
      case 'Digit3':
        this.setSpeed(5);
        break;
      case 'KeyF':
        this.fitWorld();
        break;
      case 'KeyC':
        this.hud.toggleChronicle();
        break;
      case 'KeyH':
        if (this.help.isOpen()) this.help.hide();
        else this.help.show();
        break;
      case 'BracketLeft':
        this.brushRadius = Math.max(2, this.brushRadius - 1);
        this.hud.setBrushRadius(this.brushRadius);
        break;
      case 'BracketRight':
        this.brushRadius = Math.min(12, this.brushRadius + 1);
        this.hud.setBrushRadius(this.brushRadius);
        break;
      case 'Escape':
        this.handleEscape();
        break;
      default:
        break;
    }
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') this.spaceDown = false;
  };

  private handleEscape(): void {
    if (this.saveMenu.isOpen()) {
      this.saveMenu.hide();
      return;
    }
    if (this.help.isOpen()) {
      this.help.hide();
      return;
    }
    if (this.hud.isCivPanelOpen()) {
      this.hud.closeCivPanel();
      return;
    }
    if (this.creation.isOpen()) {
      if (this.game) this.closeCreation();
      return;
    }
    if (this.tool) {
      this.setTool(null);
      return;
    }
    if (this.selection) {
      this.selection = null;
      this.hud.setInspector(this.hoverSelection);
    }
  };

  private frame = (timestamp: number): void => {
    const now = timestamp;
    const dt = this.lastFrame === 0 ? 0 : Math.min(250, now - this.lastFrame);
    this.lastFrame = now;

    if (this.game && !this.creation.isOpen()) {
      if (!this.game.paused) {
        this.accumulator += (dt / 1000) * ticksForSpeed(this.game.speed);
        let steps = 0;
        const start = performance.now();
        while (this.accumulator >= 1 && steps < MAX_CATCHUP_TICKS) {
          this.game.tick();
          this.accumulator -= 1;
          steps += 1;
          if (performance.now() - start > 5) break;
        }
        if (this.accumulator > 3) this.accumulator = 3;
        this.lastSimMs = performance.now() - start;
      }
      this.effects = this.effects.filter((effect) => now - effect.startMs < effect.durationMs);
      const overlay: RenderOverlay = {
        cursor:
          this.tool && this.cursorWorld
            ? {
                x: this.cursorWorld.x,
                y: this.cursorWorld.y,
                radius: POWER_META[this.tool].needsRadius ? this.brushRadius : 2.5,
                color: POWER_META[this.tool].color,
              }
            : null,
        hover: this.hoverTile,
        selectedAgent: this.selection?.kind === 'agent' ? this.selection.id : null,
        selectedBuilding: this.selection?.kind === 'building' ? this.selection.id : null,
        effects: this.effects,
      };
      this.renderer.render(this.game, overlay, now);
      this.hud.update(this.game, now);
      if (now - this.lastAutosave > AUTOSAVE_INTERVAL_MS) {
        this.lastAutosave = now;
        void this.autosave();
      }
    }

    this.frameCount += 1;
    if (now - this.fpsAt > 500) {
      this.fps = (this.frameCount * 1000) / (now - this.fpsAt);
      this.frameCount = 0;
      this.fpsAt = now;
      if (this.debug) this.updatePerf();
    }
    requestAnimationFrame(this.frame);
  };

  private updatePerf(): void {
    if (!this.debug) return;
    const game = this.game;
    if (!game) {
      this.perfNode.textContent = 'Worldsmith · no world';
      return;
    }
    this.perfNode.textContent = `${this.fps.toFixed(0)} fps · tick ${game.year} · ${game.agents.count} agents · ${game.animals.count} animals · sim ${this.lastSimMs.toFixed(1)}ms · zoom ${this.renderer.camera.zoom.toFixed(1)}`;
  }

  private exposeDebugApi(): void {
    const getGame = (): Game | null => this.game;
    const debugApi = {
      get game(): Game | null {
        return getGame();
      },
      renderer: this.renderer,
      camera: this.renderer.camera,
      startWorld: (options: CreationOptions): Game => {
        const game = new Game(options);
        this.installGame(game);
        return game;
      },
      cast: (power: PowerId, x: number, y: number) => this.castPower(power, x, y, true),
      pause: (paused?: boolean): void => {
        if (!this.game) return;
        this.game.paused = paused ?? !this.game.paused;
      },
      speed: (speed: number): void => {
        if (!this.game) return;
        this.game.speed = speed;
        this.game.paused = false;
      },
      fit: (): void => this.fitWorld(),
      save: (slot = 'slot1'): Promise<unknown> => {
        if (!this.game) return Promise.reject(new Error('No game'));
        return saveToSlot(slot, this.game.toSave());
      },
      load: async (slot = 'slot1'): Promise<boolean> => {
        const save = await readFromSlot(slot);
        if (!save) return false;
        this.loadGameSave(save);
        return true;
      },
      stats: (): DebugStats | null => {
        if (!this.game) return null;
        return {
          year: this.game.year,
          population: this.game.stats.population,
          factions: this.game.stats.factions,
          wars: this.game.stats.wars,
          animals: this.game.stats.animals,
          buildings: this.game.stats.buildings,
          agents: this.game.agents.count,
          fps: this.fps,
          zoom: this.renderer.camera.zoom,
          paused: this.game.paused,
          speed: this.game.speed,
        };
      },
      openSaves: (): void => {
        if (this.game) void this.saveMenu.show();
      },
      hud: this.hud,
    };
    (window as unknown as { __worldsmith?: unknown }).__worldsmith = debugApi;
  }
}

const worldsmith = new WorldsmithApp();
(window as unknown as { worldsmith?: unknown }).worldsmith = worldsmith;
