import { DEFAULT_WORLD_SIZE, WORLD_SIZES } from '../config';
import { randomSeedText } from '../core/rng';
import { AUTOSAVE_SLOT, listSaves } from '../persist/storage';
import type { SaveMeta } from '../sim/save-types';
import { escapeHtml, formatNumber, formatYear, qs } from './dom';

export interface CreationOptions {
  size: number;
  seedText: string;
  startWithFactions: boolean;
}

export interface CreationCallbacks {
  onStart: (options: CreationOptions) => void;
  onResume: () => void;
  onBack: () => void;
}

const SIZE_COPY: Record<number, { name: string; sub: string; hint: string }> = {
  256: {
    name: 'Small',
    sub: '256 × 256',
    hint: '65,536 tiles · fastest · a close, crowded world',
  },
  512: {
    name: 'Large',
    sub: '512 × 512',
    hint: '262,144 tiles · room for many factions',
  },
  1024: {
    name: 'Vast',
    sub: '1024 × 1024',
    hint: '1,048,576 tiles · slower generation, more simulation load',
  },
};

export class CreationScreen {
  readonly root: HTMLElement;
  private readonly callbacks: CreationCallbacks;
  private selectedSize = DEFAULT_WORLD_SIZE as number;
  private readonly seedInput: HTMLInputElement;
  private readonly factionsInput: HTMLInputElement;
  private readonly createButton: HTMLButtonElement;
  private readonly backButton: HTMLButtonElement;
  private readonly errorNode: HTMLElement;
  private readonly resumeBox: HTMLElement;
  private readonly busy: HTMLElement;
  private readonly busyText: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly sizeButtons: HTMLButtonElement[];

  constructor(root: HTMLElement, callbacks: CreationCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.classList.add('overlay', 'creation');
    this.root.innerHTML = `
      <div class="creation-scrim"></div>
      <div class="creation-card">
        <div class="eyebrow">A LIVING WORLD SANDBOX</div>
        <h1>Worldsmith</h1>
        <p class="creation-lead">Shape a world. Seed its peoples. Watch history unfold on its own.</p>

        <div class="field">
          <div class="field-label">World size</div>
          <div class="size-options">
            ${WORLD_SIZES.map(
              (size) => `
              <button type="button" class="size-option" data-size="${size}">
                <span class="size-name">${SIZE_COPY[size].name}</span>
                <span class="size-sub">${SIZE_COPY[size].sub}</span>
              </button>`,
            ).join('')}
          </div>
          <p class="field-hint" id="size-hint"></p>
        </div>

        <div class="field">
          <label class="field-label" for="seed">World seed</label>
          <div class="seed-row">
            <input id="seed" class="text-input" maxlength="32" spellcheck="false" autocomplete="off" value="${escapeHtml(randomSeedText())}" />
            <button type="button" class="icon-button" id="randomize-seed" title="Randomize seed">⟳</button>
          </div>
        </div>

        <label class="switch-row">
          <input type="checkbox" id="seed-factions" checked />
          <span class="switch-box"></span>
          <span>Start with three factions and their peoples</span>
        </label>

        <button type="button" class="primary-button" id="create-world">Create world</button>
        <p class="creation-error hidden" id="creation-error"></p>
        <p class="creation-note">Pure sandbox. No win condition. Space pauses, scroll zooms.</p>

        <div class="resume-box hidden" id="resume-box">
          <div>
            <div class="resume-title">Autosave found</div>
            <div class="resume-meta" id="resume-meta"></div>
          </div>
          <button type="button" class="ghost-button" id="resume-world">Resume</button>
        </div>

        <button type="button" class="ghost-button back-button hidden" id="back-to-world">Back to current world</button>
      </div>
      <div class="busy-overlay hidden" id="busy-overlay">
        <div class="spinner"></div>
        <div id="busy-text">Shaping the world…</div>
        <div class="busy-error" id="busy-error"></div>
      </div>
    `;

    this.seedInput = qs<HTMLInputElement>(this.root, '#seed');
    this.factionsInput = qs<HTMLInputElement>(this.root, '#seed-factions');
    this.createButton = qs<HTMLButtonElement>(this.root, '#create-world');
    this.backButton = qs<HTMLButtonElement>(this.root, '#back-to-world');
    this.errorNode = qs<HTMLElement>(this.root, '#creation-error');
    this.resumeBox = qs<HTMLElement>(this.root, '#resume-box');
    this.busy = qs<HTMLElement>(this.root, '#busy-overlay');
    this.busyText = qs<HTMLElement>(this.root, '#busy-text');
    this.hint = qs<HTMLElement>(this.root, '#size-hint');
    this.sizeButtons = [...this.root.querySelectorAll<HTMLButtonElement>('.size-option')];

    this.sizeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedSize = Number(button.dataset.size);
        this.updateSizeButtons();
      });
    });
    qs<HTMLButtonElement>(this.root, '#randomize-seed').addEventListener('click', () => {
      this.seedInput.value = randomSeedText();
    });
    this.createButton.addEventListener('click', () => this.start());
    qs<HTMLButtonElement>(this.root, '#resume-world').addEventListener('click', () => {
      this.callbacks.onResume();
    });
    this.backButton.addEventListener('click', () => this.callbacks.onBack());
    this.updateSizeButtons();
  }

  private updateSizeButtons(): void {
    for (const button of this.sizeButtons) {
      button.classList.toggle('active', Number(button.dataset.size) === this.selectedSize);
    }
    this.hint.textContent = SIZE_COPY[this.selectedSize]?.hint ?? '';
  }

  private start(): void {
    const seedText = this.seedInput.value.trim() || randomSeedText();
    this.setBusy('Shaping continents…');
    this.callbacks.onStart({
      size: this.selectedSize,
      seedText,
      startWithFactions: this.factionsInput.checked,
    });
  }

  show(hasCurrentGame: boolean): void {
    this.root.classList.remove('hidden');
    this.backButton.classList.toggle('hidden', !hasCurrentGame);
    this.setBusy(null);
    this.refreshResume();
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  setBusy(message: string | null, error = ''): void {
    this.createButton.disabled = message !== null;
    this.seedInput.disabled = message !== null;
    this.factionsInput.disabled = message !== null;
    this.sizeButtons.forEach((button) => {
      button.disabled = message !== null;
    });
    this.busyText.textContent = message ?? '';
    qs<HTMLElement>(this.root, '#busy-error').textContent = error;
    this.busy.classList.toggle('hidden', message === null);
    if (message === null) {
      this.errorNode.classList.add('hidden');
      this.errorNode.textContent = '';
    }
  }

  showError(message: string): void {
    this.setBusy(null);
    this.errorNode.textContent = message;
    this.errorNode.classList.remove('hidden');
  }

  private async refreshResume(): Promise<void> {
    try {
      const saves = await listSaves();
      const auto = saves.find((save) => save.slot === AUTOSAVE_SLOT);
      if (auto) {
        this.resumeBox.classList.remove('hidden');
        this.resumeBox.dataset.meta = JSON.stringify(auto);
        qs<HTMLElement>(this.root, '#resume-meta').textContent = this.describe(auto);
      } else {
        this.resumeBox.classList.add('hidden');
      }
    } catch {
      this.resumeBox.classList.add('hidden');
    }
  }

  private describe(meta: SaveMeta): string {
    const size = SIZE_COPY[meta.size]?.name ?? `${meta.size}²`;
    return `${formatYear(meta.year)} · ${formatNumber(meta.population)} people · ${meta.factions} factions · ${size} world`;
  }
}
