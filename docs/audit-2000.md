# Worldsmith — 2,000-Year Audit (2026-11-09)

**Scope:** headless `Game` runs on the post-iteration `feat/late-game-society` code,
no player intervention. Each run stopped at **year 2000** or at the **first civilization
extinction**, whichever came first. Fixed seeds and all three world sizes were sampled.

**Method:** a temporary Vitest harness (not committed) instantiated `Game`, ticked with
`game.tick()`, sampled economy/labour/war state and stopped when `aliveCivs().length`
fell below its starting value. The raw result file was kept outside the repository.
This audit made no code changes.

## Results

| Run | Final year | Outcome | Max pop | Cap hit | War starts / battles | Active-war years | Notes |
|---|---:|---|---:|---|---:|---:|---|
| 256² `ALPHA` | 2000 | no extinction | 1,200 | year 717 | 13 / 10 | 726 | one faction reduced to 161 pop / 1 city / 491 casualties |
| 256² `BRAVO` | 652 | **Velakin extinct** | 1,200 | year 386 | 2 / 2 | 122 | global cap full; at year 440 the dying faction still had 408 housing |
| 256² `CHARLIE` | 228 | **Moraspire extinct** | 162 | never | 1 / 0 | 61 | one war razed 21 buildings; housing fell 54→36 at pop 45 |
| 512² `DELTA` | 2000 | no extinction | 2,500 | year 630 | 11 / 5 | 670 | 4 cities/faction; materials and knowledge capped for most of the run |
| 1024² `TITAN` | 2000 | no extinction | 2,648 | never | 13 / 2 | 793 | 4 cities/faction, but only 224–234 / 440 building slots used |

The surviving factions in `ALPHA`, `BRAVO`, `DELTA` and `TITAN` reached the Zenith
era; `CHARLIE` ended early with its survivors in the Craft era. No famine events or
food-shortage ticks occurred in any run. Religion remained effectively dormant (0–2
conversions per run).

## Findings and suggested improvements

### 1. The global agent cap is a zero-sum birth pool (critical)

`bearChildren` processes civilizations in ID order and gates every birth on
`agentCap - agents.count`. Once the cap is full, a death frees one slot and the first
civilization with an eligible mother usually takes it. `settleWanderers` is also blocked
when the cap is full.

In `BRAVO`, the third-founded faction (Velakin) recorded **745 births** versus
**2,464** and **1,891** for the two earlier factions. It declined from 353 people at year
400 to 239 at 440, 108 at 480 and extinction at 652; at year 440 it still had **408
housing** and 999 food. The other two factions grew into the freed slots.

**Suggestions:** allocate freed birth slots fairly (rotate by population deficit, reserve
slots for low-population factions, or use per-faction soft caps); let emergency wanderers
ignore a portion of the global cap; expose per-faction population limits in the HUD.
A controlled regression test should assert that a later-founded, low-population faction
can recover while the world is at the cap.

### 2. War razing can trigger a demographic death spiral (critical)

Births require `population < civ.housing`. In `CHARLIE`, a single war razed 21 buildings
and cut Moraspire's housing from 54 to 36 while its population was 45. Births stopped;
the eligible female population fell 7 → 1 → 0 as the 16–48 cohort aged out, and the
faction went extinct at 228 with food at 999, no famine and no battle deaths. Keshhollow
was reduced to one elderly survivor.

**Suggestions:** allow births under small overcrowding (with a happiness/health penalty)
so a temporary housing loss does not permanently sterilise a faction; prioritise housing
reconstruction after war; protect houses or limit building razing; add emergency
immigration for factions with no fertile adults. A regression test should simulate
war-time housing loss and verify the faction can recover after peace.

### 3. Late-game resources saturate and famine is dead (high)

At 512²/1024², food was at cap for roughly **1,700–1,800 of 2,000 years**, knowledge
for **1,500–1,600 years**, and materials for **1,400–1,500 years**. Every faction ended with
materials 999 and knowledge 2,000; food was 864–999. `foodShortageTicks` and famine
events were **zero** in all runs.

Wealth did not cap, but it was extremely unequal: 512² ended at 6,978 / 216 / 291;
1024² at 8,039 / 8,284 / 259.

**Suggestions:** add population-scaled storage/spoilage; scale upkeep with era; add
late-game projects/wonders that consume materials, wealth and knowledge; make knowledge
unlock post-Zenith content; use the ~50% unused building capacity; consider lower food
yields or more consumption. The current upkeep is too small relative to production once
construction stops.

### 4. 1024² is underpopulated and its cap is unreachable (high)

`TITAN` reached only **2,648 / 4,000** people and never hit the cap. Each faction stabilised
around 880 people with ~888–924 housing and only 224–234 / 440 building slots used. The
population plateau is a housing equilibrium: houses are only built when
`housing - population <= 2`, so the faction stops expanding at a small housing surplus.
With only three starting factions, three × ~880 cannot reach 4,000.

**Suggestions:** scale starting factions and/or `MAX_SETTLEMENTS_PER_CIV` with world size;
build housing proactively when capacity remains; use the unused capacity for late-game
buildings; or lower/redefine the 4,000 cap. A 1024² world should not feel the same size as
a 512² one.

### 5. Wars are frequent, sometimes phoney, and very destructive (medium-high)

Active-war years were 33–40% of the sampled runs. 1024² had **13 war starts but only 2
battles**, with 793 active-war years — many wars ended without contact. 256² `ALPHA` had
13 starts / 10 battles and one faction lost 491 people while being reduced to one city.
256² `CHARLIE` had one war, zero battles and 21 buildings razed.

**Suggestions:** validate route/travel feasibility before declaring war or shorten wars
without contact; add naval interception/coastal combat; add longer peace cooldowns or
recovery pacts; limit razing of houses/critical economy buildings; add post-war
reconstruction and a war-exhaustion/recovery state.

### 6. Per-settlement housing remains imbalanced (medium)

Faction-level housing gates births, but settlements can be over capacity while others
have empty housing. Examples: 512² Ullacourt had settlements at **214 residents / 102
housing** and **199 / 90**, while its capital had 294 / 474. 1024² Caelhaven had a
settlement at **300 / 120**. Migration only moves labourers/idle adults, not children or
whole families.

**Suggestions:** gate births locally or migrate families/children; build houses in the
most crowded settlement; show a per-settlement overcrowding warning; increase migration
throughput/priority for crowded sources.

### 7. Demography and idle accounting (medium/low)

At 512²/1024², roughly **40–50% of people were elders (60+)**, ~40–48% adults and only
~12–16% children. This comes from the housing-gated birth rate at the cap; it is stable
but makes the population old and slow to recover after losses. The HUD also shows
**8 “idle adults”** in each large faction; the audit confirmed these are all exactly 14
years old and become assigned on the next tick after ageing — a one-tick transient, not a
labour failure.

**Suggestions:** review fertility/ageing curves and age-based labour; fix the transient
idle accounting by assigning jobs after ageing or labelling newly aged adults separately.

### 8. Religion remains inactive (low)

Conversions were 0–2 per 2,000-year run; faith does not shape late-game diplomacy or
society.

**Suggestions:** add stronger neighbour conversion pressure, reformations, religious
tensions and religion-driven alliances/wars.

### 9. Extinction feedback is thin (low)

The chronicle only records “The X are no more.” The player cannot see whether the cause
was war, housing collapse, famine or the cap, nor the population history.

**Suggestions:** record the extinction cause and a short history/population trend;
add a retrospective event.

## What is working

- Four settlements per faction are reachable on 512²/1024²; 512² reaches the population
  cap with four cities each.
- Laborers, civic buildings and upkeep work: building roles are staffed, true idle is
  near zero, and wealth is no longer universally capped.
- No zero-population “zombie” factions in 512²/1024²; extinctions only appeared on the
  sampled 256² seeds.
- Performance is healthy: 2,000 ticks took ~3.6 s (256²), ~7.6 s (512²) and ~8.5 s
  (1024²) in the headless harness.
- Save/load and the post-iteration checks remain green (96 tests).

## Suggested next iteration order

1. Fair global-cap birth allocation + low-population rescue.
2. Post-war housing recovery / soft overcrowding / razing limits.
3. Resource sinks and late-game content to make food/materials/knowledge meaningful.
4. Scale 1024² factions/housing so the vast world can grow into its cap.
5. War logistics, naval interception and per-settlement housing.
6. Religion and extinction feedback.

## Follow-up implementation (2026-11-09)

The requested five areas were implemented on `feat/late-game-society`: fair cap
allocation, post-war recovery, late-game economy, war fixes and player feedback. The
audit was rerun on the same scenarios after the changes.

### What changed

- **Fair cap allocation:** normal births stop at a reserve (12 / 25 / 40 agents by world
  size), birth slots are shared by sorting civilizations by population (lowest first),
  and each civilization has a per-tick birth budget. Factions with no fertile adult
  receive emergency wanderers even when the global cap is otherwise full.
- **Post-war recovery:** births continue through a small housing shortfall (35% slack at
  half chance), armies target houses only after other buildings, peace pays 25 materials
  and 15 food to both sides, war cooldowns are 30 years, and emergency immigration can
  restore a sterile faction.
- **Late-game economy:** food storage is population-scaled (1.5× annual need, minimum
  120); upkeep grows with era once a faction has more than 120 buildings; wealth above
  4,000 is spent down; Universities and Monuments cost knowledge/wealth as well as
  materials; Monuments scale to 6 per faction; and excess knowledge/wealth funds
  patronage every 20 years. Knowledge beyond the final era also adds happiness.
- **War fixes:** no-contact wars end as stalemates (45 years on land, 100 across water),
  houses are spared until no other target remains, peace relief and a longer cooldown
  replace the old immediate re-declaration treadmill, and stalemates get their own
  chronicle entry.
- **Feedback:** extinction causes appear in the chronicle and fallen-faction panel (with
  peak population, casualties and era), the top bar reports the birth limit and emergency
  reserve, food shows its population-scaled storage limit, and war stalemates are named.
- **Schema:** no new persisted fields; `SAVE_VERSION` stays 6.

### Post-implementation audit

| Run | Final year | Outcome | Max pop | Cap hit | War starts / battles / stalemates |
|---|---:|---|---:|---|---|
| 256² `ALPHA` | 2000 | no extinction | 1,188 | 353 | 13 / 12 / 0 |
| 256² `BRAVO` | 2000 | **no extinction** (was Velakin at 652) | 1,188 | 360 | 12 / 12 / 0 |
| 256² `CHARLIE` | 2000 | **no extinction** (was Moraspire at 228) | 1,188 | 307 | 8 / 5 / 1 |
| 512² `DELTA` | 2000 | no extinction | 2,475 | 506 | 11 / 1 / 10 |
| 1024² `TITAN` | 2000 | no extinction | 2,644 | never | 13 / 1 / 8 |

- Food cap ticks are now **zero** in every run, and no famine events occurred.
- 256² factions stabilise around 400 people and two cities each; 512²/1024² hold four
  cities each (one 512² faction fell to three after a war).
- Materials end at 0–21 for most large-world factions (one 512² faction still caps at
  999); knowledge ends at 1,700–2,000; wealth is soft-capped around 4,000 for the rich
  and remains near zero for poorer factions.
- Large-world wars are much shorter and mostly end as stalemates; battles are now rare on
  1024² (1 battle across 13 starts), so war logistics/naval interception is still needed.
- No faction extinction was observed in any sampled run.

### Remaining gaps after the follow-up

- Materials can still cap on 256² and for one industrious 512² faction; knowledge still
  reaches 2,000 for some factions (patronage is wealth-gated).
- 1,024² still stabilises well below its 4,000-agent cap; starting factions/settlements
  were deliberately not rescaled in this pass.
- Per-settlement housing, religion depth, the ageing pyramid and the 8 transient age-14
  “idle” adults were deliberately left out per the request.
- 1,024² war battles are rare; route feasibility and naval interception remain the
  missing pieces.

Verification for the follow-up: `npm run typecheck` and `npm run build` pass;
`npm test` is **104/104 across 23 files**, including new fair-cap and war-recovery
regression tests. Browser QA at 1280×800 covered the living/fallen faction panels,
dynamic food storage, war-stalemate and patronage chronicle entries, save → load, and
1,024² at 5× (~60 fps, no console errors).
