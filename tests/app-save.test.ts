import { deepStrictEqual } from 'node:assert/strict';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '../src/sim/game';
import type { GameOptions } from '../src/sim/game';

// Keep application wiring, Game and storage real; replace browser presentation.
vi.mock('../src/render/renderer', () => ({
  Renderer: class {
    camera = { fit: vi.fn(), centerOn: vi.fn(), minZoom: 1, zoom: 1 };
    setGame = vi.fn();
  },
}));
vi.mock('../src/ui/hud', () => ({
  Hud: class {
    setGame = vi.fn();
    setActivePower = vi.fn();
    setBrushRadius = vi.fn();
    toast = vi.fn();
  },
}));
vi.mock('../src/ui/creation', () => ({
  CreationScreen: class {
    show = vi.fn();
    hide = vi.fn();
    setBusy = vi.fn();
  },
}));
vi.mock('../src/ui/save-menu', () => ({ SaveMenu: class { hide = vi.fn(); } }));
vi.mock('../src/ui/help', () => ({ HelpOverlay: class { hide = vi.fn(); } }));

interface AppApi {
  game: Game;
  startWorld(options: GameOptions): Game;
  save(slot?: string): Promise<unknown>;
  load(slot?: string): Promise<boolean>;
  hud: { setGame: ReturnType<typeof vi.fn> };
}

let api: AppApi;
beforeEach(async () => {
  vi.resetModules();
  const node = {
    innerHTML: '',
    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
    addEventListener: vi.fn(),
    append: vi.fn(),
    querySelector: (): unknown => node,
  };
  vi.stubGlobal('document', {
    querySelector: () => node,
    createElement: () => node,
    addEventListener: vi.fn(),
  });
  vi.stubGlobal('window', { location: { search: '' }, addEventListener: vi.fn() });
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  vi.stubGlobal('indexedDB', undefined);
  await import('../src/main');
  api = (window as unknown as { __worldsmith: AppApi }).__worldsmith;
});
afterEach(() => vi.unstubAllGlobals());

const options = { size: 256, seedText: 'APP-SAVE', startWithFactions: true };

describe('application save installation', () => {
  it.each([1, 2, 5])('preserves saved speed %s through storage and application load', async (speed) => {
    const original = api.startWorld(options);
    original.speed = speed;
    for (let i = 0; i < 4; i += 1) original.tick();
    await api.save();
    const saved = original.toSave(0);
    original.speed = speed === 1 ? 5 : 1;
    original.tick();

    expect(await api.load()).toBe(true);
    expect(api.game).not.toBe(original);
    expect(api.game.speed).toBe(speed);
    deepStrictEqual(api.game.toSave(0), saved);
    expect(api.hud.setGame).toHaveBeenLastCalledWith(api.game);
  });

  it('installs new worlds at default speed even after a faster world', () => {
    expect(api.startWorld(options).speed).toBe(1);
    api.game.speed = 5;
    expect(api.startWorld(options).speed).toBe(1);
  });
});
