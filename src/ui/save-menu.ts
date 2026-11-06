import {
  AUTOSAVE_SLOT,
  MANUAL_SLOTS,
  deleteSlot,
  isPersistentStorage,
  listSaves,
  readFromSlot,
  saveToSlot,
  slotLabel,
} from '../persist/storage';
import type { GameSave, SaveMeta } from '../sim/save-types';
import { escapeHtml, formatNumber, formatYear, qs } from './dom';

export type ToastKind = 'info' | 'error' | 'good';

export interface SaveMenuCallbacks {
  onLoad: (save: GameSave) => void;
  onToast: (message: string, kind: ToastKind) => void;
  getGame: () => { toSave: () => GameSave } | null;
}

const SLOTS = [AUTOSAVE_SLOT, ...MANUAL_SLOTS];

export class SaveMenu {
  readonly root: HTMLElement;
  private open = false;
  private busy = false;
  private readonly callbacks: SaveMenuCallbacks;
  private readonly list: HTMLElement;
  private readonly status: HTMLElement;

  constructor(root: HTMLElement, callbacks: SaveMenuCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.classList.add('overlay', 'hidden');
    this.root.innerHTML = `
      <div class="modal-card saves-card">
        <div class="modal-head">
          <div>
            <div class="eyebrow">THE ARCHIVE</div>
            <h2>Saves</h2>
          </div>
          <button type="button" class="panel-close" id="saves-close" aria-label="Close saves">×</button>
        </div>
        <p class="modal-lead">Autosave runs every thirty seconds. Three manual slots are yours to keep.</p>
        <div class="storage-note hidden" id="storage-note">This browser does not allow persistent storage. Saves will last only for this session.</div>
        <div class="save-slots" id="save-slots"></div>
        <div class="save-status" id="save-status"></div>
      </div>
    `;
    this.list = qs<HTMLElement>(this.root, '#save-slots');
    this.status = qs<HTMLElement>(this.root, '#save-status');
    qs<HTMLButtonElement>(this.root, '#saves-close').addEventListener('click', () => this.hide());
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.hide();
    });
    this.list.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (!button) return;
      const slot = button.dataset.slot;
      const action = button.dataset.action;
      if (!slot || !action) return;
      void this.handleAction(slot, action);
    });
    if (!isPersistentStorage()) {
      qs<HTMLElement>(this.root, '#storage-note').classList.remove('hidden');
    }
  }

  async show(): Promise<void> {
    this.root.classList.remove('hidden');
    this.open = true;
    this.busy = false;
    this.setStatus('');
    await this.refresh();
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.open = false;
  }

  isOpen(): boolean {
    return this.open;
  }

  private setStatus(text: string, error = false): void {
    this.status.textContent = text;
    this.status.classList.toggle('error', error);
  }

  private async refresh(): Promise<void> {
    this.setStatus('Loading slots…');
    try {
      const metas = await listSaves();
      this.render(metas);
      this.setStatus('');
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Could not read saves.', true);
    }
  }

  private render(metas: SaveMeta[]): void {
    const bySlot = new Map(metas.map((meta) => [meta.slot, meta]));
    const rows: string[] = [];
    for (const slot of SLOTS) {
      const meta = bySlot.get(slot);
      const isAuto = slot === AUTOSAVE_SLOT;
      const details = meta
        ? `${formatYear(meta.year)} · ${formatNumber(meta.population)} people · ${meta.factions} ${meta.factions === 1 ? 'faction' : 'factions'} · ${meta.size}² tiles<br><span class="save-date">${new Date(meta.savedAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}</span>`
        : '<span class="save-empty">Empty slot</span>';
      rows.push(`
        <div class="save-row ${isAuto ? 'autosave' : ''}">
          <div class="save-meta">
            <div class="save-title">${escapeHtml(slotLabel(slot))}${isAuto ? '<span class="save-tag">AUTO</span>' : ''}</div>
            <div class="save-details">${details}</div>
          </div>
          <div class="save-actions">
            ${!isAuto ? `<button type="button" class="ghost-button small" data-action="save" data-slot="${slot}">${meta ? 'Overwrite' : 'Save here'}</button>` : ''}
            ${meta ? `<button type="button" class="gold-button small" data-action="load" data-slot="${slot}">Load</button>` : ''}
            ${!isAuto && meta ? `<button type="button" class="ghost-button small danger" data-action="delete" data-slot="${slot}">Delete</button>` : ''}
          </div>
        </div>
      `);
    }
    this.list.innerHTML = rows.join('');
    if (this.busy) this.setBusy(true);
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.list.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = busy;
    });
  }

  private async handleAction(slot: string, action: string): Promise<void> {
    if (this.busy) return;
    try {
      if (action === 'save') {
        const game = this.callbacks.getGame();
        if (!game) {
          this.callbacks.onToast('No world is running.', 'error');
          return;
        }
        this.setBusy(true);
        const meta = await saveToSlot(slot, game.toSave());
        this.callbacks.onToast(`Saved ${slotLabel(slot)} at year ${meta.year}.`, 'good');
        await this.refresh();
      } else if (action === 'load') {
        this.setBusy(true);
        const save = await readFromSlot(slot);
        if (!save) {
          this.callbacks.onToast('That save could not be read.', 'error');
          this.setBusy(false);
          return;
        }
        this.callbacks.onLoad(save);
        this.hide();
      } else if (action === 'delete') {
        if (!window.confirm(`Delete ${slotLabel(slot)}? This cannot be undone.`)) return;
        this.setBusy(true);
        await deleteSlot(slot);
        this.callbacks.onToast(`${slotLabel(slot)} deleted.`, 'info');
        await this.refresh();
      }
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Save action failed.', true);
      this.callbacks.onToast(error instanceof Error ? error.message : 'Save action failed.', 'error');
    } finally {
      this.setBusy(false);
    }
  }
}
