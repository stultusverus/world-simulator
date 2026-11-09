# AGENTS.md

Worldsmith is a browser-based god sandbox (Vite + strict TypeScript + Canvas 2D, no
runtime dependencies, procedural pixel art). Read [README.md](README.md) for the player
guide and [PLAN.md](PLAN.md) for goals, scope and current progress.

## Ground rules

- **Stay in scope.** Check PLAN.md before adding systems. The MVP deliberately excludes
  terrain sculpting, disasters, plague/weather, monsters, minimap, import/export, audio
  and touch controls. Ask before adding deferred scope.
- **Ask before publishing.** Do not push, force-push, deploy, or run destructive git
  operations unless the user explicitly requests it. `npm run deploy` requires
  Cloudflare credentials and must not be run speculatively.
- **Do not commit generated state** — `node_modules/`, `dist/`, `.wrangler/`,
  `.npm-cache/`, `browser-screenshots/` are ignored. Keep them out of commits.
- **Fix bugs with tests.** Add or extend a Vitest regression test. Keep the save
  round-trip test passing when touching simulation state.
- **Keep docs current.** Update PLAN.md status/progress when a milestone completes or a
  notable issue is discovered.
- Use short conventional commit messages (`feat:`, `fix:`, `perf:`, `docs:`, `test:`,
  `chore:`).

## Commands

```bash
npm install          # required after pulling; installs @types/node and wrangler
npm run dev          # app at http://127.0.0.1:5173/ (also bound to the network IP)
npm run typecheck    # tsc --noEmit
npm test             # Vitest suite
npm run build        # typecheck + production build into dist/
npm run preview      # preview production build on 0.0.0.0:4173
npm run deploy       # build + wrangler deploy (only when explicitly approved)
```

**Definition of done for a code change:** typecheck, tests and build pass, plus a
browser smoke check of the affected flow. For UI changes, verify at 1280×800 and check
the console. For simulation changes, also check save → load → continuation.

## Architecture map

- `src/config.ts` — all tuning: rates, caps, buildings, eras, traits, save version.
- `src/core/` — seeded RNG and noise.
- `src/world/` — world model, deterministic world generation, territory/ownership,
  derived land/water connectivity regions (`regions.ts`).
- `src/sim/game.ts` — `Game` orchestrator, tick order, snapshots, powers entry points.
- `src/sim/agents.ts`, `economy.ts`, `war.ts`, `diplomacy.ts`, `progress.ts`,
  `settlements.ts`, `naval.ts`, `environment.ts`, `powers.ts`, `pathfind.ts` —
  simulation systems.
- `src/render/` — procedural sprite atlas, camera, chunked Canvas renderer.
- `src/ui/` — creation screen, HUD/chronicle/civ panel, saves, help, power metadata,
  build-info label.
- `src/persist/` — IndexedDB storage with a temporary in-memory fallback.
- `src/main.ts` — app wiring, input, fixed-step loop, autosave, debug API.
- `tests/` — worldgen, simulation, war/pathfinding/cost, naval, settlements/growth,
  late-game labour/economy, extinction/famine, powers, storage, save round-trip.

## Invariants

- **Determinism:** seeded RNG state is saved/restored; same seed and inputs should
  produce the same world and continuation. Do not introduce `Math.random()` in the sim.
- **Saves:** `GameSave` is versioned by `SAVE_VERSION` in `config.ts`. Bump it when the
  schema changes and keep the deterministic save round-trip test green.
- **Speed:** new worlds start at 1×; loaded games restore their saved speed. Do not
  reset speed inside `installGame`.
- **Performance:** keep hot loops allocation-light; respect agent/wildlife caps and A*
  node budgets. Failed soldier route searches share a per-target retry throttle — do
  not multiply A* searches by soldier count per tick. Naval crossing plans are cached per
  target/region; keep them derived, not serialized.
- **Derived state:** land/water reachability and naval plans are recomputed on load;
  terrain-shape changes must call `refreshReachability()`. `toSave()` canonicalises the
  derived ownership map so a save/load reproduces the exact territory.
- **Rendering:** the HUD overlays an animating canvas. Avoid expensive `backdrop-filter`
  blurs on animated panels; chunk-cache terrain and reuse the 1 px/tile overview texture.
- **Assets:** no external art, fonts, audio or network access at runtime.
- **Build metadata:** `__COMMIT_HASH__` / `__BUILD_DATE__` are injected by
  `vite.config.ts` and defined for Vitest in `vitest.config.ts`; the HUD can be imported
  in tests without mocking them.

## Verification

- `npm test` currently covers **96 checks** across 21 files. Keep it green.
- Use `?debug=1` and the `window.__worldsmith` debug API
  (`startWorld`, `cast`, `save`, `load`, `speed`, `pause`, `stats`, `renderer`,
  `camera`) for browser verification.
- Check gameplay flows, not only rendering: creation, empty-world start, powers, save
  slots/autosave, resume, chronicle jump, a war if you touched combat, growth to a
  Metropolis/four settlements, the workforce/cap HUD, and a cross-water war if you
  touched navies.
- The dev server is app-only at `:5173`; do not modify or replace the DSH Web GUI on
  `:3080`. CI is intentionally not configured; run the local commands above.

## Current known constraints

- Armies can sail between landmasses; civilians cannot migrate by sea and new
  settlements must be founded on the same landmass.
- Settlement founding is automatic AI expansion (up to four per faction); there is no
  player "found city" power.
- Global agent caps (1,200 / 2,500 / 4,000 by world size) remain the authoritative
  population limit; the top bar now shows population / cap and a CAPPED tag.
- The global cap is also the global birth pool: births are processed by civilization
  order, so later-founded factions can be squeezed out at the cap. Treat this as a known
  balance/design risk; see [docs/audit-2000.md](docs/audit-2000.md).
- War razing can block births long enough for a faction's fertile cohort to age out and
  go extinct even with food and housing available; see the audit report.
- Late-game surplus adults become laborers and civic buildings (Market, University,
  Monument) add jobs; food, materials and knowledge can still reach their caps, famine
  is dormant, and 1,024² stabilises around 2,648/4,000 people with three factions.
- Settlement founding is population-gated at 250 people per existing centre; four cities
  are reachable on 512², and the minimum 16-tile gap still applies.
- Navies ferry armies only; there is no naval combat or coastal interception yet, and
  religion spread is sparse. These are documented gameplay-depth gaps, not save/schema
  changes.
- `SAVE_VERSION` is 6. Saves from older versions are refused (no migration); older
  autosaves will not resume.
- Land/water reachability and naval plans are derived from terrain; call
  `Game.refreshReachability()` after any terrain-shape edit.
- Deployment has only been validated locally; no production deployment has been
  performed.
- Browser storage may be unavailable; saves then fall back to session memory and the UI
  warns that they will be lost.
