import { qs } from './dom';

export class HelpOverlay {
  readonly root: HTMLElement;
  private open = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.classList.add('overlay', 'hidden');
    this.root.innerHTML = `
      <div class="modal-card help-card">
        <div class="modal-head">
          <div>
            <div class="eyebrow">A QUIET GOD</div>
            <h2>How to play</h2>
          </div>
          <button type="button" class="panel-close" id="help-close" aria-label="Close help">×</button>
        </div>
        <p class="modal-lead">Worldsmith is a living sandbox. You do not win. You seed, shape and witness:
        factions grow from six founders into towns, learn crafts, quarrel, worship, starve, and go to war.
        Nothing you do is required — everything you do leaves a mark in the chronicle.</p>

        <h3>Powers</h3>
        <div class="help-grid">
          <div><strong>Spawn</strong><p>Factions, settlers, deer and wolves. New factions need open land away from existing capitals.</p></div>
          <div><strong>Bless</strong><p>Heal the wounded, bless fields and cradles, calm every war, or grant a settlement a spark of knowledge.</p></div>
          <div><strong>Inspect</strong><p>With no power selected, hover anything to read its story. Click to pin a selection.</p></div>
          <div><strong>Territory</strong><p>Tinted land belongs to a faction. Borders, capitals and their banners tell the rest.</p></div>
        </div>

        <h3>Controls</h3>
        <div class="key-grid">
          <div><kbd>Space</kbd><span>Pause / resume</span></div>
          <div><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><span>Speed 1×, 2×, 5×</span></div>
          <div><kbd>Scroll</kbd><span>Zoom toward cursor</span></div>
          <div><kbd>Right drag</kbd><span>Pan the map (middle drag also works)</span></div>
          <div><kbd>Left drag</kbd><span>Brush a power over the land, or pan when no power is selected</span></div>
          <div><kbd>F</kbd><span>Fit the whole world</span></div>
          <div><kbd>C</kbd><span>Toggle the chronicle</span></div>
          <div><kbd>[</kbd><kbd>]</kbd><span>Brush radius</span></div>
          <div><kbd>H</kbd><span>This help</span></div>
          <div><kbd>Esc</kbd><span>Cancel power / close panels</span></div>
        </div>

        <h3>The chronicle</h3>
        <p class="modal-lead">Every war, peace, famine, era and divine act is recorded. Click an entry with a location to
        jump there. Autosave runs every thirty seconds; use <strong>Saves</strong> for three manual slots.</p>

        <div class="modal-actions">
          <button type="button" class="primary-button" id="help-done">Return to the world</button>
        </div>
      </div>
    `;
    const close = (): void => this.hide();
    qs<HTMLButtonElement>(this.root, '#help-close').addEventListener('click', close);
    qs<HTMLButtonElement>(this.root, '#help-done').addEventListener('click', close);
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) close();
    });
  }

  show(): void {
    this.root.classList.remove('hidden');
    this.open = true;
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.open = false;
  }

  isOpen(): boolean {
    return this.open;
  }
}
