# Worldsmith — Plan & Progress

> **Living document.** Update this file instead of replacing it when scope, status or
> priorities change. Last updated: **2026-11-09**.
>
> **Code baseline:** `main` @ `5691650` (PR #11 merged). **Iteration branch:**
> `feat/late-game-society` (new PR; no merge or deploy).

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
  targets, settlement-first civilian jobs with cross-settlement fallback and migration;
  up to four AI-founded settlements per faction; losing one town centre no longer
  destroys the faction.
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
- **Late-game society** — surplus adults become productive laborers; Markets, Universities
  and Monuments employ them and consume stockpiles; building/household upkeep and festivals
  create resource pressure; expansion is population-gated so four settlements are reachable;
  wounded soldiers retreat instead of always dying; and the HUD shows population/cap,
  workforce and resource limits.

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
| 8 | Naval transport, Metropolis + multi-settlement growth, saves refresh, build-metadata safety, docs | ✅ Done | PR #11; 78 tests at completion; browser QA |
| 9 | Audit fixes: zero-pop extinction, proportional/varied famine, city migration + cross-settlement labour, defender interception, HUD warnings | ✅ Done | PR #11 follow-up; 85 tests; 1000-year run QA |
| 10 | Post-fix audit: verified extinction path, population and settlement health; recorded remaining economy/cap/naval/religion gaps | ✅ Done | PR #11; 85 tests; audit runs |
| 11 | Late-game society & balance: laborers, civic buildings, upkeep/festivals, population-gated four-city expansion, wounded retreat, cap/workforce HUD | ✅ Done | `feat/late-game-society`; 96 tests; 512²/256² audits |

## 5. Verification snapshot

As of **2026-11-09** (branch `feat/late-game-society`, based on `5691650`):

- `npm install` completed; `@types/node` and `wrangler` present.
- `npm run typecheck` — pass.
- `npm test` — **96/96 pass** across 21 test files (16–28 s depending on load).
- `npm run build` — pass; production `dist/` generated (39 modules, 146.92 kB JS,
  22.98 kB CSS).
- 512² `DELTA`, 1,600 ticks — **12 town centres (4 per faction)**, 675 buildings;
  populations 891/893/714 = **2,498 / 2,500** global cap; building/soldier role share
  28.8% / 28.4% / 34.1%; true idle adults 1.0–1.3%; 8 Markets, 6 Universities and
  3 Monuments per faction; materials and knowledge capped, but wealth at
  5,411 / 273 / 219 and food at 960–999. Migration distributes residents across the
  four cities (sample 381 / 314 / 95 / 83) instead of filling only the largest one.
- 256² `ALPHA`, 1,000 ticks — **130 war casualties, 3 battles**, populations
  174 / 849 / 168; no zero-population faction, down from the previous worst audit of
  557 casualties.
- 1,024² pacing test — 200 ticks at ~2.4 ms/tick; performance headroom retained.
- Browser checks at 1280×800 — creation; 256² growth to the cap; cap badge; civ panel
  with workforce/resource limits/world-cap warning; new Market/University/Monument
  sprites; festival and first-Monument chronicle entries; save slot → load; no console
  errors.
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
- [x] **Late-game economy:** surplus adults are productive laborers; Markets,
      Universities and Monuments add jobs and consume stockpiles; building/household
      upkeep and festivals create pressure (see Verification snapshot).
- [x] **Four-city expansion:** expansion is population-gated at 250 people per existing
      centre and no longer waits for every building slot; 512² reaches four cities per
      faction before the cap.
- [x] **Expose the agent cap:** the top bar shows population / cap with a CAPPED tag;
      the civ panel shows workforce, resource limits and growth warnings.
- [x] **War balance:** half of lethal soldier hits become wounded retreats and wars end
      sooner; 256² casualties fell to 130 over 1,000 years in the audit seed.
- [ ] **Naval combat and coastal interception:** navies currently ferry armies only;
      armies can land and raze without naval opposition.
- [ ] **Religion depth:** spread is sparse (0–2 faith events per 1,000-year audit run);
      add conversion/reformation events.
- [ ] **Remaining resource pressure:** materials and knowledge can still reach their
      caps, and less mercantile factions can run wealth close to zero; add further sinks
      or rebalance upkeep.
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
| Materials and knowledge still reach their caps | 512² year-1000 audits show materials 999 and knowledge 2,000 for every faction; wealth pressure is now real (5,411 / 273 / 219) | Add further knowledge/material sinks or rebalance upkeep |
| Less mercantile factions run near zero wealth | Wealth can fall to 200–300, which can trigger the “no wealth with soldiers” happiness penalty | Tune household upkeep or add a small base income |
| Navies are transport-only | Armies can land and raze without naval battles or coastal interception | Add naval interception/coastal defence or transport attrition |
| Religion spread is sparse | Only 0–2 faith events per 1,000-year audit run | Add conversion/reformation events and stronger neighbour pressure |
| 256² wars are still lethal | The audit seed fell from 557 to 130 casualties over 1,000 years, but other seeds remain sensitive to war count and army size | Keep the audit band under review when balance changes |
| No civilian sea migration or overseas settlements | New cities must be on the same landmass; navies are military-only | Future coastal expansion/colony mechanic |
| Settlement founding is AI-only | Players cannot directly plant a city; factions expand on their own | Consider a "found settlement" power if requested |
| Per-settlement housing can lag population | A settlement may show residents above its own housing while the faction has a surplus elsewhere; migration corrects it slowly | Improve settlement-level housing migration if it persists |
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
  population-scaled farm/workshop/temple targets, up to four AI settlements,
  settlement-first jobs with cross-settlement fallback and migration, capital loss
  recentres instead of eliminating.
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
- **2026-11-09 — post-fix audit:** extinction now fires correctly (fresh 256² seeds at
  years 507, 508 and 754); population, settlement and famine fixes held. Remaining
  findings recorded: late-game saturation and idle labour, unreachable fourth city on
  512², ferry-only navies, sparse religion spread, and an invisible agent cap.
- **2026-11-09 — late-game iteration scope:** late-game society & balance; full
  rebalance (laborers, civic buildings, upkeep/festivals, expansion/war tuning, HUD);
  no deferred features, no CI/Playwright, feature branch + PR only, no deploy.
- **2026-11-09 — labor & civic design:** surplus adults become `Job.Laborer` and
  produce food/materials/wealth; Markets, Universities and Monuments share the artisan
  pool, adding jobs and stockpile sinks; market wealth output tuned to 1.2/tick,
  household upkeep 0.02 wealth per person, wounded retreat 0.5, war exhaustion 0.12.
- **2026-11-09 — expansion rule:** settlement founding is population-gated at 250 per
  existing centre; the “crowded or building capacity full” gate was removed so four
  cities are reachable before the 2,500-agent cap. Migration now fills the emptiest
  destinations round-robin (up to four adults per pass) after the audit found the
  capital overcrowded while satellite cities stayed empty.
- **2026-11-09 — saves:** `SAVE_VERSION` bumped 5 → 6 for the expanded persisted enum
  domain; old saves are refused with the existing message, no migration.
- **2026-11-09 — HUD:** top bar shows population / cap with a CAPPED tag; civ panel adds
  workforce, resource cap markers and growth warnings; debug stats expose agentCap,
  adults, labourers and idleAdults.

## 10. How progress is tracked

1. Keep the **Verification snapshot** current (date, code baseline, commands/results).
2. Move completed work into **Milestones** with commit/test evidence; do not delete
   completed history.
3. Update **Short-term goals** after each session and record blockers.
4. Record material scope changes in the **Decision log** before implementation.
5. Update the **Known issues** table when a risk is fixed or discovered.
6. Keep this file short enough to read before starting work; follow the commands and
   conventions in [AGENTS.md](AGENTS.md).
