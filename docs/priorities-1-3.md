# Priorities 1–3: campaign routes, household housing and continuing economic uses

Implemented against `main` at `d70aa03` on `feat/reachable-wars-households-economy`.
The [initial observation](observation-2000.md) supplies the before-state for
256² seed `OBSERVE-2000`.

The original validation below describes commit `642a701` (save format 7). The subsequent
[PR review fixes](pr13-review-fixes.md) correct long-route A* and bound aggregate routing
work; current save format is 8. Historical audit numbers below have not been rerun on
that changed simulation trajectory.

## Behaviour

**Campaigns.** AI declarations now verify a usable route to an eligible enemy building,
not just connected regions. Planning checks up to six candidate targets with a
12,000-node land-search budget and the existing bounded naval planner. Travel must fit
within 120 years. Confirmed longer routes extend the normal 45-year land / 100-year
naval contact deadline and campaign duration. Armies withdraw after 12 land / 24 naval
years without advance or combat. Failed no-contact pairs wait 90, 180, 360, then at most
600 years before another attempt; contact resets that history. Other pairs retain the
ordinary 30-year peace cooldown.

Soldiers share successful and failed routes, bounded to 2,048 cached start/target
queries per game. Uniform campaign travel costs match movement speed and let forest
growth leave route results valid. A reachability refresh invalidates routes and clears
active soldier paths. Naval plans include their source anchor so relocating a capital
or loading without a warm cache cannot select a stale origin. The land A* heuristic now
uses octile distance with deterministic tie-breaking. Economic/military buildings are
preferred before town centres, with houses last; this preserves recovery opportunities
now that armies reach their targets more reliably.

**Housing.** Migration runs every eight years with a budget of twelve people, prioritising
crowded sources and vacant destinations on the same landmass. Partners and dependent
children move as a household, including working civilian parents from overcrowded towns.
A family is skipped when it cannot fit as a whole; soldiers stay with their armies.
Live occupancy is updated after each move, and an occupancy margin prevents oscillation.
Housing construction targets the most crowded settlement with building capacity while
retaining urgent food-production priority. Soft overcrowding births and emergency
wanderers remain intact.

**Repairs and services.** Once current construction is finished, peacetime builders
repair the most damaged built structure. Every restored hit point costs 0.08 materials;
repair is limited by available builders and materials and cannot heal buildings during
an active war. Construction keeps first claim on labour and the last civilian farmer
is protected.

Engine/Zenith economies with at least 180 people and three workshops fund civic services
according to population and staffed infrastructure. Discretionary services and capital
renewal consume only funds above a 200-material construction reserve. They scale back
when cash is scarce, without imposing new debt or stopping young economies before they
can build workshops. Basic existing upkeep still applies. Renewal spends 6% of the
remaining material surplus each year.

At Zenith, staffed temples and universities continuously spend surplus knowledge above
the 480-point era threshold. The rate scales with staffing, reaching 6% with four
scholarly workers. Scholarship and funded services give bounded happiness benefits;
scholarship also improves construction and repair efficiency by up to 10%, with
diminishing returns. Unstaffed institutions do not charge scholarship. Existing
patronage and festivals continue.

**Persistence at the original validation.** Save version was **7**. War progress, targets, arrival deadlines and
failed-pair cooldowns are persisted; route caches remain derived. Version-6 and older
saves are explicitly refused, following the project's existing no-migration policy.
The baseline observation's version-6 snapshots remain historical artifacts.

## Validation

All checks ran locally. No CI workflow was added, and there was no merge or deployment.

- `npm run typecheck` passed.
- `npm test -- --maxWorkers=2` passed: **119 tests across 25 files** (the temporary
  audit harness was excluded from this suite run and is retained outside the repository).
- `npm run build` passed: 41 modules, 154.96 kB JavaScript / 49.33 kB gzip.
- New regressions cover route feasibility and shared-cache invalidation, long-march
  deadlines, blocked armies, post-combat withdrawal, escalating/persisted cooldowns,
  moving-army continuation, dependent-child migration, constrained vacancies, water
  boundaries, local housing construction, funded scholarship benefits, protected
  reserves, unstaffed institutions, material-limited repair and repair-crew allocation.
- Existing deterministic save/load continuation, naval ferry/return/mid-voyage tests,
  population-cap fairness, post-war recovery, construction, famine and growth tests pass.
- Shared Chromium smoke check: creation, a running war and its battle/peace chronicle,
  5× pacing, autosave resume, manual slot save, load and continued simulation. The
  on-screen counter showed about 60 fps while running a roughly 1,187-person world.
  DevTools was blocked by managed browser policy, so console inspection was unavailable.
  No new browser automation framework was added.

The audit harness recorded all chronicle events, annual economy/cap observations and
25-year settlement occupancy samples. Each of six fresh worlds stopped at year 2000 or
the first civilisation extinction. No extinction occurred. `OBSERVE-2000` was also
cloned at year 1000 and advanced in lockstep to 1100 with exact save equality.

| World / seed | Final year | People | Survivors | War starts | No-contact endings | Battle summaries | War deaths |
|---|---:|---:|---:|---:|---:|---:|---:|
| 256² `OBSERVE-2000` | 2000 | 1,186 | 3 | 14 | 0 | 14 | 800 |
| 256² `ALPHA` | 2000 | 1,186 | 3 | 9 | 0 | 11 | 315 |
| 256² `BRAVO` | 2000 | 1,186 | 3 | 14 | 0 | 16 | 690 |
| 256² `CHARLIE` | 2000 | 1,187 | 3 | 11 | 0 | 12 | 398 |
| 512² `DELTA` | 2000 | 1,765 | 3 | 10 | 0 | 11 | 289 |
| 1024² `TITAN` | 2000 | 1,881 | 3 | 12 | 1 | 13 | 123 |

The original `OBSERVE-2000` run had 14 wars, nine no-contact endings, five battle
summaries and 437 war deaths. The new run has 14 wars, no no-contact endings, 14 battle
summaries and 800 war deaths. Combat is more effective and correspondingly more costly;
no immortality or extinction-prevention rule was introduced.

At year 2000 in that seed, all seven settlements were within their local housing
capacity, compared with 47 excess residents across two settlements before the change.
Faction material balances ended at 340 / 331 / 285 instead of 999 / 999 / 999, and
knowledge ended at 677 / 684 / 690 instead of 1,700 each. Neither resource hit its cap
in any annual observation for any of the four 256² seeds. All six runs recorded zero
knowledge-cap years and no famine chronicle events. A few short food deficits occurred
in BRAVO and CHARLIE; food storage otherwise remains mostly full, outside priorities 1–3.

Limits remain visible in the larger worlds. DELTA ended with 3/2/4 settlements and
zero local overcrowding; its material balances were near zero. TITAN ended with 1/4/3
settlements and five excess residents in its small faction's capital. That faction
remained below the mature-service population threshold and retained capped materials;
material saturation also occurred earlier in a second TITAN faction. Total population
was 1,765 on DELTA and 1,881 on TITAN: recovery, uneven development and unused global
capacity still need further balance work. The 120-year horizon and bounded searches
can deliberately reject very distant or difficult campaigns. This is not a claim that
all routes, all housing configurations or every resource equilibrium are solved.

Raw audit data and the temporary harness are retained under
`/workspace/observations/pr-priorities-1-3/`, outside version control. Rendering captures,
build output, dependency caches and generated simulation state are not committed.
