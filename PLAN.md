# Worldsmith — Plan & Progress

> **Living document.** Update this file instead of replacing it when scope, status or
> priorities change. Last updated: **2026-11-09**.
>
> **Code baseline:** `850f5ab` (`main` == `origin/main`). **Iteration branch:**
> `feat/navies-settlements-hardening` (PR #11 open; no merge or deploy).

## 1. Product goal

A playable, offline-capable **browser god sandbox**: generate a world, seed factions,
then watch people and societies grow, build, worship, trade, argue and fight while the
player intervenes through spawning and blessing powers. No win condition, no loss
condition — a pure sandbox where history is recorded and can be resumed at any time.

In one line: **WorldBox-style living world, focused on societies rather than disasters.**

## 2. Locked decisions

| Area | Decision |
|---|---|
| Genre | God sandbox; pure sandbox; all MVP powers unlocked |
| Setting | Abstract / mechanics-first; generated factions, not fantasy races |
| View | 2D top-down pixel tiles, fully procedural art |
| World | Configurable 256², 512², 1024²; seed-based generation |
| Time | Real-time; pause; 1× / 2× / 5×; one tick = one game year |
| Deep systems | Civs & settlements · individual agents/families/jobs · food/resources/economy · war/diplomacy · eras/culture/religion |
| Terrain | Procedural terrain, biomes, rivers, light wildlife |
| War | Agent armies that march, sail, skirmish and siege; AI wars gated by land/coastal reachability |
| MVP powers | Spawn faction/settlers/deer/wolves; Heal/Fertility/Peace/Insight |
| Start | Pre-seeded with three factions, with optional empty wilderness |
| Presentation | Cosmetic day/night tint; English UI; desktop-first mouse/keyboard |
| Persistence | IndexedDB autosave + 3 manual slots; event chronicle |
| Stack | Vite + strict TypeScript + Canvas 2D; no runtime dependencies |

## 3. Delivered MVP

- **World generation** — seeded fractal terrain, adaptive sea level, biomes, moisture,
  fertility, rivers, spawn sites; deterministic per seed.
- **Factions** — generated names/colours/traits; faction AI builds housing, farms,
  workshops, temples and barracks; territory and building caps by settlement tier.
- **Cities & expansion** — Metropolis tier, population-scaled farm/workshop/temple
  targets, settlement-aware civilian jobs and construction; up to four AI-founded
  settlements per faction; losing one town centre no longer destroys the faction.
- **People** — every villager is an agent with needs, health, hunger, happiness, faith,
  a home, a job, a partner and children; aging, births, marriages and death.
- **Economy** — food, materials, wealth and knowledge; era multipliers; famine and
  starvation; construction labour and staffing rules.
- **Progress & culture** — Hearth/Craft/Engine/Zenith eras, culture traits, patron
  religions and spread between neighbours.
- **Diplomacy & war** — relations drift and incidents, war declarations, soldier armies,
  land A* movement, cross-water ferry crossings, skirmishes, sieges, building
  destruction, peace and faction collapse. Unreachable factions cannot declare war.
- **Wildlife** — deer and wolf populations with grazing, hunting and reproduction.
- **Powers** — spawning tools and four blessings with radius brush, cooldowns, effects,
  toasts and chronicle entries.
- **UI** — creation screen, HUD, time controls, power dock, inspector, faction panel,
  filterable chronicle with jump-to-location, saves menu, help overlay.
- **Persistence** — deterministic save/load including RNG state and soldier routes;
  autosave; manual slots; persistent/temporary storage status feedback.
- **Rendering & performance** — procedural sprite atlas, chunk caching, overview
  texture, territory overlay, cosmetic day/night, capital and settlement labels, boats.
- **Ops** — Cloudflare Workers static-assets config, deploy script, commit/build
  metadata in the game header, dev server on `0.0.0.0`.
- **Reliability & balance pass** — zero-population factions are eliminated, famine scales
  with the food deficit and varies per person, migration/cross-settlement labour populates
  new cities, defenders intercept and wars cause casualties, and the HUD exposes
  per-settlement population/housing plus food shortages.

## 4. Milestones

| # | Milestone | Status | Evidence |
|---|---|---|---|
| 1 | Foundation: scaffold, RNG/noise, worldgen, A* | ✅ Done | `4dfd88f`–`0d05fe4`; worldgen tests |
| 2 | Simulation: agents, families, economy, war, diplomacy, eras, religion, wildlife | ✅ Done | `d586e99`; simulation tests |
| 3 | Playable shell: creation screen, HUD, powers, chronicle, saves | ✅ Done | `c25670e`; deterministic save tests |
| 4 | Polish, performance pass, docs, browser QA | ✅ Done | `3f976c0`, `89eac6b`; 60 fps measurements |
| 5 | Integrate remote fixes: workshop staffing, construction labour, soldier paths, storage status, saved speed, header/deploy | ✅ Done | `63a236a`; 44 upstream tests |
| 6 | Review-found war retry throttle | ✅ Done | `80cdd95`; 45 tests; 1024 pacing test 4.3 s → 1.1 s |
| 7 | AGENTS.md & PLAN.md tracking | ✅ Done | This document |
| 8 | Naval transport, Metropolis + multi-settlement growth, saves refresh, build-metadata safety, docs | ✅ Done | PR #11; 78 tests; browser QA |
| 9 | Audit fixes: zero-pop extinction, proportional/varied famine, city migration + cross-settlement labour, defender interception, HUD warnings | ✅ Done | PR #11 follow-up; 85 tests; 1000-year run QA |

## 5. Verification snapshot

As of **2026-11-09** (branch `feat/navies-settlements-hardening`, based on `850f5ab`):

- `npm install` completed; `@types/node` and `wrangler` present.
- `npm run typecheck` — pass.
- `npm test` — **85/85 pass** across 19 test files (~15 s).
- `npm run build` — pass; production `dist/` generated (39 modules, ~140 kB JS).
- Browser checks at 1280×800 — creation, 512²/1024² growth runs, Metropolis and
  three-city faction panel with per-settlement residents/housing, settlement labels,
  boat rendering, save slot → load, live autosave row refresh while the Saves menu is
  open, no console errors.
- Audit runs (AUDIT3 512², AUDIT4 256², 1,000 years) — no zero-population “zombie”
  factions, no empty satellite settlements, no famine extinctions; 2–12 battles and
  47–557 casualties per run; navies sailed and landed.
- Performance — 1024² at year 1401: **2,522 people / 9 cities / 626 buildings**, solid
  **60 fps at 5×** zoomed out; a 512² run reached 2,468 people / 9 cities by year 1000
  and stayed at ~60 fps at 5× in browser QA.
- Dev server — `http://127.0.0.1:5173/`; responsive; no replacement server started.
- Deployment — not performed; Cloudflare remains unauthenticated.
- CI — intentionally **not added** (explicit user request); all verification is local.

## 6. Short-term goals (next)

- [x] **Publishing:** iteration delivered on a feature branch with a PR; merge and
      Cloudflare deploy remain explicit user decisions.
- [x] **Cross-water wars:** armies auto-ferry across water and AI declarations are
      gated by land/coastal reachability; cross-water wars get a longer duration.
- [x] **Saves menu freshness:** an open Saves menu refreshes when an autosave lands.
- [ ] **CI:** explicitly deferred by user request — do not add a workflow unless asked.
- [x] **Build metadata test safety:** `__COMMIT_HASH__`/`__BUILD_DATE__` are defined
      for Vitest; header rendering is covered by `tests/build-info.test.ts`.
- [x] **Keep docs current:** README screenshots, PLAN status, AGENTS constraints.
- [x] **Audit fixes:** population extinction, proportional famine, empty-city
      migration/labour, defender interception, food-shortage HUD warnings.
- [ ] **Late-game economy:** resources cap and much of the population is idle; add
      upkeep/sinks, more job slots or new late-era content.
- [ ] **Four-city expansion:** the 512² agent cap makes the fourth city rare; tune the
      expansion threshold or cap.
- [ ] **War balance:** 256² casualty counts are high; tune army size and recovery.
- [ ] **Automated browser smoke tests:** manual browser QA performed; automation
      (e.g. Playwright) still deferred.
- [ ] **Deploy after approval:** needs Cloudflare credentials and explicit permission.

## 7. Long-term goals

### Iteration 2 — deferred features from the original scope

- Terrain and water sculpting; destructive disasters (fire, meteor, earthquake, flood).
- Plague, drought and weather systems; monsters/hostile wildlife.
- Minimap, world-file export/import and shareable seeds.
- Statistics graphs, audio/ambience, mobile/touch controls, PNG map export.

### Gameplay depth

- Coastal expansion beyond armies: civilian sea migration and overseas settlements.
- Alliances, trade routes, coalitions and richer peace terms.
- Deeper technology trees, wonders, more culture/religion events.
- Balance and pacing work across all three world sizes; more meaningful late-game.

### Engineering & operations

- CI/CD with preview and production deployment; automated smoke screenshots.
- Save migrations and compatibility policy beyond the current version check.
- Performance profiling and caps for low-end hardware and very large populations.
- Localization infrastructure (English-only in the MVP).
- Accessibility review (keyboard focus, reduced motion, contrast).

## 8. Known issues & risks

| Issue | Impact | Next step |
|---|---|---|
| Late-game resources cap and much labour is idle | Food/materials/wealth/knowledge saturate; most adults have no job slot | Add upkeep/sinks, more job slots or late-era content |
| Fourth city is rare on 512² | Three civs reach the 2,500-agent cap before the 900-pop expansion mark | Tune expansion thresholds or raise the cap after profiling |
| 256² wars are very costly | 557 casualties over 1,000 years in one audit run | Tune army size, healing and peace conditions |
| No civilian sea migration or overseas settlements | New cities must be on the same landmass; navies are military-only | Future coastal expansion/colony mechanic |
| Settlement founding is AI-only | Players cannot directly plant a city; factions expand on their own | Consider a "found settlement" power if requested |
| Reachability/naval plans are derived, not serialized | Terrain-shape changes must call `refreshReachability()` | Keep future sculpting behind that hook |
| Production deployment not performed | Cloudflare config validated locally only | Needs credentials + explicit approval |
| Temporary IndexedDB fallback is session-only | Saves lost on reload/close | UI warns; expected for blocked storage |
| Dev server binds `0.0.0.0` | Exposed to the container network | Intentional for access; restrict with `--host 127.0.0.1` if needed |
| `@types/node` must be installed after pulling | Typecheck fails on stale `node_modules` | Documented; run `npm install` |

## 9. Decision log

- **2026-11-06 — initial scope:** WorldBox-style pure sandbox, abstract factions,
  individual agents, economy/war/diplomacy/eras/religion, procedural terrain and light
  wildlife, 256/512/1024 worlds, real-time 1×/2×/5×, 2D pixel Canvas, Vite + strict TS,
  English UI, procedural art, pre-seeded or empty starts, save slots + chronicle, MVP
  before iteration.
- **2026-11-06 — deferred:** terrain sculpting, destructive disasters, plague/weather,
  monsters, minimap, import/export, graphs, audio, mobile, PNG export.
- **2026-11-09 — remote fixes integrated:** workshop staffing, construction labour,
  soldier path endpoints/retries, asynchronous storage status, saved speed restoration,
  header build metadata, network dev binding, Cloudflare deploy config.
- **2026-11-09 — review fix:** throttled failed soldier route searches per target per
  tick after finding a 1024² war-cost regression; no gameplay rule change.
- **2026-11-09 — iteration scope:** naval transport + city growth + hardening on a
  feature branch with a PR; **no CI** and no Playwright/review extras (explicit request).
- **2026-11-09 — naval design:** auto-ferry armies (no ship control/building), derived
  4-connected land/water regions, diplomacy gated by reachability, 105-tick cross-water
  wars, procedural boat rendering; civilian sea migration deferred.
- **2026-11-09 — city growth:** Metropolis tier (180 pop / radius 14 / 110 buildings),
  population-scaled farm/workshop/temple targets, up to four AI settlements, local
  settlement jobs, capital loss recentres instead of eliminating.
- **2026-11-09 — saves:** `toSave` canonicalises the derived ownership map so load
  reproduces exactly; reachability and naval caches are derived and never serialized.
- **2026-11-09 — no CI:** explicitly excluded from this iteration; verification is
  local commands plus browser QA.
- **2026-11-09 — audit run:** 1,000-year runs exposed zero-population factions still
  marked alive, lockstep famine deaths, unpopulated satellite cities with idle capital
  labour, and largely bloodless wars.
- **2026-11-09 — audit fixes:** zero-population factions are eliminated; starvation is
  proportional to the deficit with per-person variation; cross-settlement labour and
  migration fill new cities; defenders intercept and wars produce casualties; HUD shows
  settlement residents/housing and food shortages; settlement minimum spacing raised to
  16 tiles. Late-game resource caps, fourth-city reach and war-cost tuning remain open.

## 10. How progress is tracked

1. Keep the **Verification snapshot** current (date, code baseline, commands/results).
2. Move completed work into **Milestones** with commit/test evidence; do not delete
   completed history.
3. Update **Short-term goals** after each session and record blockers.
4. Record material scope changes in the **Decision log** before implementation.
5. Update the **Known issues** table when a risk is fixed or discovered.
6. Keep this file short enough to read before starting work; follow the commands and
   conventions in [AGENTS.md](AGENTS.md).
