import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_VERSION } from '../src/config';
import { Game } from '../src/sim/game';

const save = new Game({ size: 256, seedText: 'STORAGE', startWithFactions: false }).toSave(123);

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

function mockOpening() {
  const request = {} as IDBOpenDBRequest;
  const open = vi.fn(() => request);
  vi.stubGlobal('indexedDB', { open });
  const fire = (type: 'error' | 'blocked' | 'success') => {
    request[`on${type}`]?.call(request, Object.assign(new Event(type), { oldVersion: 0, newVersion: 1 }));
  };
  return { request, open, fire };
}

describe('storage initialization', () => {
  it('reports pending until opening succeeds and shares initialization', async () => {
    const { request, open, fire } = mockOpening();
    const storage = await import('../src/persist/storage');
    expect(storage.getStorageStatus()).toBe('pending');
    expect(storage.isPersistentStorage()).toBe(false);
    const ready = storage.initializeStorage();
    const other = storage.initializeStorage();
    Object.defineProperty(request, 'result', { value: {} });
    expect(storage.getStorageStatus()).toBe('pending');
    fire('success');
    expect(await ready).toBe('persistent');
    expect(await other).toBe('persistent');
    expect(storage.isPersistentStorage()).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it.each(['unavailable', 'throw', 'error', 'blocked'] as const)(
    'supports temporary save, read, list and delete when IndexedDB is %s', async (failure) => {
      const opening = mockOpening();
      if (failure === 'unavailable') vi.stubGlobal('indexedDB', undefined);
      if (failure === 'throw') opening.open.mockImplementation(() => { throw new Error('Denied'); });
      const storage = await import('../src/persist/storage');
      const saving = storage.saveToSlot('slot1', save);
      if (failure === 'error' || failure === 'blocked') opening.fire(failure);
      const meta = await saving;
      expect(await storage.initializeStorage()).toBe('temporary');
      expect(storage.isPersistentStorage()).toBe(false);
      expect(await storage.readFromSlot('slot1')).toEqual(save);
      expect(await storage.listSaves()).toEqual([meta]);
      await storage.deleteSlot('slot1');
      expect(await storage.readFromSlot('slot1')).toBeNull();
      expect(await storage.listSaves()).toEqual([]);
    },
  );

  it('closes a late successful connection after a blocked request without switching backends', async () => {
    const { request, fire } = mockOpening();
    const storage = await import('../src/persist/storage');
    const saving = storage.saveToSlot('slot1', save);
    fire('blocked');
    await saving;
    const close = vi.fn();
    Object.defineProperty(request, 'result', { value: { close } });
    fire('success');
    expect(close).toHaveBeenCalledOnce();
    expect(storage.getStorageStatus()).toBe('temporary');
    expect(await storage.readFromSlot('slot1')).toEqual(save);
  });
});

// Only the DOM operations used by SaveMenu are needed for these behavior tests.
function menuRoot() {
  const elements = new Map<string, ReturnType<typeof element>>();
  function element() {
    const classes = new Set<string>();
    return {
      textContent: '', innerHTML: '',
      classList: {
        add: (...names: string[]) => names.forEach((name) => classes.add(name)),
        remove: (name: string) => classes.delete(name),
        toggle: (name: string, force: boolean) => force ? classes.add(name) : classes.delete(name),
        contains: (name: string) => classes.has(name),
      },
      addEventListener: vi.fn(),
      querySelectorAll: () => [],
      querySelector: (selector: string) => elements.get(selector),
    };
  }
  for (const selector of ['#save-slots', '#save-status', '#saves-close', '#storage-note']) {
    elements.set(selector, element());
  }
  return { root: element() as unknown as HTMLElement, elements };
}

describe('save menu persistence feedback', () => {
  it.each(['error', 'blocked', 'success'] as const)('updates after asynchronous opening %s', async (outcome) => {
    const { request, fire } = mockOpening();
    const { SaveMenu } = await import('../src/ui/save-menu');
    const { root, elements } = menuRoot();
    new SaveMenu(root, { getGame: () => null, onLoad: vi.fn(), onToast: vi.fn() });
    const note = elements.get('#storage-note')!;
    expect(note.textContent).toBe('Checking save storage…');
    expect(note.classList.contains('hidden')).toBe(false);
    Object.defineProperty(request, 'result', { value: {} });
    fire(outcome);
    await vi.waitFor(() => {
      if (outcome === 'success') expect(note.classList.contains('hidden')).toBe(true);
      else {
        expect(note.classList.contains('hidden')).toBe(false);
        expect(note.textContent).toContain('Saves are temporary');
        expect(note.textContent).toContain('reloaded or closed');
      }
    });
  });

  it('labels manual memory saves as temporary in feedback', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { SaveMenu } = await import('../src/ui/save-menu');
    const { root, elements } = menuRoot();
    const onToast = vi.fn();
    const menu = new SaveMenu(root, { getGame: () => ({ toSave: () => save }), onLoad: vi.fn(), onToast });
    await menu.show();
    const list = elements.get('#save-slots')!;
    const click = list.addEventListener.mock.calls.find(([event]) => event === 'click')![1];
    click({ target: { closest: () => ({ dataset: { slot: 'slot1', action: 'save' } }) } });
    await vi.waitFor(() => expect(onToast).toHaveBeenCalledWith(
      expect.stringMatching(/Temporarily saved Slot I.*reloaded or closed/), 'info',
    ));
    expect(list.innerHTML).toContain('Load');
  });

  it('refreshes the autosave row while the menu is open', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const storage = await import('../src/persist/storage');
    const { SaveMenu } = await import('../src/ui/save-menu');
    const { root, elements } = menuRoot();
    const base = { ...save, savedAt: 1000, world: { ...save.world, tick: 1 } };
    const later = { ...save, savedAt: 2000, world: { ...save.world, tick: 42 } };
    await storage.saveToSlot('autosave', base);
    const menu = new SaveMenu(root, { getGame: () => null, onLoad: vi.fn(), onToast: vi.fn() });
    await menu.show();
    const list = elements.get('#save-slots')!;
    expect(list.innerHTML).toContain('Year 1');

    await storage.saveToSlot('autosave', later);
    menu.refreshIfOpen();
    await vi.waitFor(() => expect(list.innerHTML).toContain('Year 42'));

    menu.hide();
    await storage.saveToSlot('autosave', { ...base, savedAt: 3000, world: { ...base.world, tick: 7 } });
    menu.refreshIfOpen();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(list.innerHTML).toContain('Year 42');
  });
});

describe('save schema version', () => {
  it('refuses to write a save from another schema version', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const storage = await import('../src/persist/storage');
    const stale = { ...save, version: SAVE_VERSION - 1 };
    await expect(storage.saveToSlot('slot1', stale)).rejects.toThrow('Save version mismatch');
  });

  it('refuses to read a stored save from another schema version', async () => {
    const stale = { ...save, version: SAVE_VERSION - 1 };
    const getRequest: { onsuccess?: () => void; result?: unknown } = {};
    const db = {
      transaction: () => ({
        objectStore: () => ({
          get: () => {
            setTimeout(() => getRequest.onsuccess?.(), 0);
            return getRequest;
          },
        }),
      }),
    };
    const openRequest: {
      result?: unknown;
      onsuccess?: () => void;
      onerror?: () => void;
      onblocked?: () => void;
      onupgradeneeded?: () => void;
    } = {};
    vi.stubGlobal('indexedDB', {
      open: () => {
        setTimeout(() => {
          openRequest.result = db;
          openRequest.onsuccess?.();
        }, 0);
        return openRequest;
      },
    });
    const storage = await import('../src/persist/storage');
    await storage.initializeStorage();
    getRequest.result = { slot: 'slot1', save: stale };
    await expect(storage.readFromSlot('slot1')).rejects.toThrow('incompatible');
  });
});
