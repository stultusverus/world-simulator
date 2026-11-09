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
- `src/world/` — world model, deterministic world generation, territory/ownership.
- `src/sim/game.ts` — `Game` orchestrator, tick order, snapshots, powers entry points.
- `src/sim/agents.ts`, `economy.ts`, `war.ts`, `diplomacy.ts`, `progress.ts`,
  `environment.ts`, `powers.ts`, `pathfind.ts` — simulation systems.
- `src/render/` — procedural sprite atlas, camera, chunked Canvas renderer.
- `src/ui/` — creation screen, HUD/chronicle/civ panel, saves, help, power metadata.
- `src/persist/` — IndexedDB storage with a temporary in-memory fallback.
- `src/main.ts` — app wiring, input, fixed-step loop, autosave, debug API.
- `tests/` — worldgen, simulation, war/pathfinding, powers, storage, save round-trip.

## Invariants

- **Determinism:** seeded RNG state is saved/restored; same seed and inputs should
  produce the same world and continuation. Do not introduce `Math.random()` in the sim.
- **Saves:** `GameSave` is versioned by `SAVE_VERSION` in `config.ts`. Bump it when the
  schema changes and keep the deterministic save round-trip test green.
- **Speed:** new worlds start at 1×; loaded games restore their saved speed. Do not
  reset speed inside `installGame`.
- **Performance:** keep hot loops allocation-light; respect agent/wildlife caps and A*
  node budgets. Failed soldier route searches share a per-target retry throttle — do
  not multiply A* searches by soldier count per tick.
- **Rendering:** the HUD overlays an animating canvas. Avoid expensive `backdrop-filter`
  blurs on animated panels; chunk-cache terrain and reuse the 1 px/tile overview texture.
- **Assets:** no external art, fonts, audio or network access at runtime.
- **Build metadata:** `__COMMIT_HASH__` / `__BUILD_DATE__` are injected by
  `vite.config.ts`. Tests that import the HUD must mock it or arrange for these
  constants to be defined.

## Verification

- `npm test` currently covers 45 checks. Keep it green.
- Use `?debug=1` and the `window.__worldsmith` debug API
  (`startWorld`, `cast`, `save`, `load`, `speed`, `pause`, `stats`, `renderer`,
  `camera`) for browser verification.
- Check gameplay flows, not only rendering: creation, empty-world start, powers, save
  slots/autosave, resume, chronicle jump, and a war if you touched combat.
- The dev server is app-only at `:5173`; do not modify or replace the DSH Web GUI on
  `:3080`.

## Current known constraints

- No navies: wars can still be declared between landmasses without a land route; armies
  stall, and the war ends by duration. Reachability gate/naval transport is a follow-up.
- The Saves menu does not live-refresh its autosave row while it stays open.
- Deployment has only been validated with `wrangler deploy --dry-run`; no production
  deployment has been performed.
- Browser storage may be unavailable; saves then fall back to session memory and the UI
  warns that they will be lost.
