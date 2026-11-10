**Worldsmith: twelve worlds observed to year 3000 or first civilisation extinction**

**Eleven worlds reached year 3000 with all three civilisations alive. One stopped early: Valecourt in 512² `BRAVO` went extinct in year 1464.** Small worlds consistently filled their normal population allowance; larger worlds were less crowded but much more uneven economically. The broader seed/size grid exposed a failure to recover food production after war that the earlier benchmark runs had missed.

**Method and verification.** All worlds were fresh runs of commit `642a701ab61893a5ea90e6dd9efa7e042ca8ec0c` (PR #13), save version 7. ALPHA, BRAVO and CHARLIE were run at 256², 512² and 1024². The earlier benchmarks were also extended using fresh runs of 256² OBSERVE-2000, 512² DELTA and 1024² TITAN. Every world started in year 1 with three civilisations, six founders per civilisation and wildlife. There were no powers, edits, forced wars, interventions or balance changes.

The existing game engine advanced one tick per year. After every tick, the run checked whether any starting civilisation had ceased to be alive; it stopped immediately at that first extinction or at year 3000. The eleven complete runs advanced 2,999 ticks each; BRAVO 512² advanced 1,463. Wildlife loss did not trigger the civilisation condition. Five wars were still active when their worlds reached the year limit; those worlds were not advanced further to conclude them.

Annual records include populations, age groups, births, deaths by cause, jobs, health/hunger, resources, housing, buildings, relations, campaign history and wildlife. Detailed settlement occupancy was sampled every 25 years and at the final state. Observation wrappers retained all chronicle events, counted agent removals and building destruction, and measured repairs to already-built structures. The snapshots retain typed arrays and RNG state.

All twelve final saves round-tripped exactly; all twelve year-1000 clones continued identically to year 1120; and ALPHA at each size was independently replayed without the observation wrappers to exactly the same final state. Population and combat-death accounting balanced in every run. The twelve observation cases and a separate read-only endpoint diagnostic passed. This validates the recorded trajectories, not general extinction probabilities. The runs use fixed selected seeds, and changing world size changes generated geography as well as capacity. Recorded engine times include instrumentation and continuation checks, and are not browser frame-rate benchmarks.

**Outcomes**

| Size | Seed | Stop year | Survivors | People at stop | Settlements | Wars started | Combat deaths |
|---|---|---:|---:|---:|---:|---:|---:|
| 256² | `ALPHA` | 3000 | 3 | 1,185 | 6 | 15 | 530 |
| 256² | `BRAVO` | 3000 | 3 | 1,186 | 6 | 21 | 1,041 |
| 256² | `CHARLIE` | 3000 | 3 | 1,188 | 6 | 17 | 730 |
| 512² | `ALPHA` | 3000 | 3 | 1,736 | 10 | 14 | 228 |
| 512² | `BRAVO` | 1464 | 2 | 1,008 | 6 | 10 | 258 |
| 512² | `CHARLIE` | 3000 | 3 | 2,215 | 11 | 16 | 469 |
| 1024² | `ALPHA` | 3000 | 3 | 2,523 | 10 | 0 | 0 |
| 1024² | `BRAVO` | 3000 | 3 | 2,087 | 11 | 14 | 299 |
| 1024² | `CHARLIE` | 3000 | 3 | 2,477 | 10 | 11 | 85 |
| 256² | `OBSERVE-2000` | 3000 | 3 | 1,186 | 7 | 20 | 1,252 |
| 512² | `DELTA` | 3000 | 3 | 1,711 | 9 | 14 | 486 |
| 1024² | `TITAN` | 3000 | 3 | 1,876 | 8 | 17 | 231 |

Population at the early stop is the combined population of the two surviving factions. Its year-1464 row is not a year-3000 projection. Every civilisation reached the Zenith era before its endpoint, including the one that died out.

1. **The extinction was a failure to recover from economic destruction, not conquest or housing loss.** Valecourt in 512² BRAVO peaked at 845 people. In year 1000 it still had 405 people, 888 housing and three centres, but 372 residents were aged 60+ and there were no children. It subsequently recovered to over 400 people before another war stripped its farms. By year 1188 all farms had been razed; peace relief allowed two to be rebuilt, but those last two were lost again by year 1297.

| Year | Valecourt people | Farms | Housing | Food production / need | Materials |
|---:|---:|---:|---:|---:|---:|
| 900 | 828 | 38 | 882 | 580.1 / 496.8 | 7.2 |
| 1000 | 405 | 21 | 888 | 314.2 / 247.2 | 0.0 |
| 1100 | 146 | 21 | 888 | 264.2 / 83.4 | 0.0 |
| 1188 | 399 | 0 | 888 | 72.0 / 240.0 | 25.0 |
| 1200 | 367 | 2 | 888 | 78.1 / 222.0 | 0.0 |
| 1250 | 17 | 2 | 888 | 25.0 / 10.2 | 0.0 |
| 1297 | 15 | 0 | 888 | 0.0 / 9.0 | 25.0 |
| 1300 | 14 | 0 | 888 | 0.0 / 9.0 | 0.0 |
| 1400 | 4 | 0 | 888 | 0.0 / 2.4 | 0.0 |
| 1463 | 1 | 0 | 888 | 0.0 / 0.6 | 0.0 |
| 1464 | 0 | 0 | 0 | 0.0 / 0.6 | 0.0 |

Valecourt suffered **305 starvation deaths**, 77 combat deaths and 4,632 old-age deaths across its history. Twenty-six emergency immigrants arrived, but did not restore sustainable food production. The last person died of starvation in year 1464, 167 years after its final war ended. Until the preceding year it retained three town centres, 145 houses, 888 housing and 170 buildings. There was ample space in the global agent pool; this was not starvation of births at the population cap.

Two interacting rules blocked reconstruction. First, the population-tier building allowance fell as the faction shrank: in year 1210 it had 172 buildings against 138 permitted slots; by year 1297 it had 170 against 54 slots, and later only 24 slots. `planConstruction` refuses new construction when the faction is already over capacity. In year 1298 Valecourt had 15.12 materials—enough for a 10-material farm—but could not start one because 170 standing buildings exceeded its 54-slot allowance. Second, the remaining buildings imposed **16.4 materials of basic annual upkeep** at Zenith: 170 × 0.02 plus 50 × 0.02 × 13. That upkeep soon consumed the peace relief and repeatedly left materials at zero. Even a generous upper bound assuming all four remaining workshops and six markets were fully staffed, plus fourteen laborers, would yield only about 10.5 materials per year. The discretionary civic reserve does not protect against this pre-existing basic upkeep. A small surviving workforce was assigned to non-farm jobs, so it produced no fallback food. Empty houses protected family space but remained an economic burden.

The automatic extinction event then removed the remaining 170 buildings. Those removals are cleanup after population loss; they are not evidence that an enemy razed the last centres. The distinction is visible in the retained yearly states and chronicle. Shortly before extinction, the faction still displayed happiness 87/100, faith 100 and knowledge 2,000 while its last person had hunger 100 and about 1.4 health. Cultural and happiness indicators can therefore obscure severe subsistence failure.

2. **Small worlds remain stable; more map area does not create proportionate growth.** All four 256² worlds ended at 1,185–1,188 people, or 99.7–100% of their normal birth limit of 1,188. Their populations barely changed between years 2000 and 3000 despite substantial cumulative war losses. Each faction usually retained two settlements, with Moraspire in OBSERVE-2000 retaining three.

The three surviving 512² worlds ended at 1,711–2,215 people, only 69–89% of their 2,475 birth limit. The four 1024² worlds ended at 1,876–2,523 people, only 47–64% of their 3,960 limit. None of the 1024² runs reached its normal birth limit at any point. Several worlds became smaller during the extra millennium:

| World | People in year 2000 | People in year 3000 | Change |
|---|---:|---:|---:|
| 256² `OBSERVE-2000` | 1,186 | 1,186 | +0 |
| 512² `ALPHA` | 1,906 | 1,736 | -170 |
| 512² `CHARLIE` | 2,130 | 2,215 | +85 |
| 512² `DELTA` | 1,765 | 1,711 | -54 |
| 1024² `ALPHA` | 2,506 | 2,523 | +17 |
| 1024² `BRAVO` | 2,301 | 2,087 | -214 |
| 1024² `CHARLIE` | 2,600 | 2,477 | -123 |
| 1024² `TITAN` | 1,881 | 1,876 | -5 |

Aggregate survival also hides near-collapses. In 512² ALPHA, Ullavale fell from a peak of 821 people to six in year 1124. Ten emergency immigrants arrived over its history, and it survived, ending at 193 people while its two neighbours held 700 and 843. The recovery system can rescue a depleted population when food production survives; it did not rescue Valecourt once its food and material flows failed.

3. **Material balance is healthy in small worlds but often becomes permanent scarcity in larger ones.** No small-world faction hit the material or knowledge cap during any annual post-tick observation. At the endpoints, small-world materials were in the low hundreds and knowledge generally around 600–700, rather than permanently full. In contrast, weighted across the four runs at each larger size, materials were near zero for **53.7% of 512² civilisation-years** and **54.5% of 1024² civilisation-years**. These counts include each run only until its stopping year; near zero means below 0.01.

Wealth is also uneven: in 512² CHARLIE it was near zero in 85.2% of civilisation-year observations. Some large-world factions can sustain farming and population while accumulating little or nothing for rebuilding. Thus elimination of resource saturation has not produced broadly balanced economic resilience.

TITAN illustrates the opposite equilibrium. Daravale ended at 171 people, one town, 46/46 building slots, 168 housing and 999 materials. It never exceeded 175 people, so it never reached the 180-person Metropolis threshold or the 250-person second-settlement threshold. Its population also stayed below the mature-service threshold, leaving most material surplus untouched. It held capped materials in 2,582 of 2,999 sampled years, while its neighbours ended with zero materials. Physical map size did not overcome these progression and economic thresholds.

Food remains abundant for most factions: stores were full against their population-scaled limits in 98.5% of small-world, 97.3% of 512² and 98.8% of 1024² civilisation-year observations. All 305 starvation deaths and all fourteen famine chronicle events came from Valecourt. This is mostly abundance with a catastrophic recovery exception, rather than routine scarcity. Knowledge reached its cap only in the collapsing Valecourt faction, for 35 years; all other factions had zero knowledge-cap years.

4. **Wars usually make contact, but their economic damage matters more than centre conquest.** Across 169 declarations there were 164 completed wars and five still active at the stopping years. Only three completed wars ended without contact: one in 1024² CHARLIE and two in TITAN. The small worlds spent roughly 29–42% of elapsed time in war; they accumulated 530–1,252 combat deaths each but kept their populations near capacity.

Across all runs, combat killed **5,609 people** and produced 5,201 observed wounded retreats. Armies razed **1,590 buildings**: 785 farms, 192 workshops, 181 markets, 126 temples, 123 barracks, 121 universities and 62 monuments. No house or town centre was destroyed by warfare in these samples. An additional 170 buildings were removed by Valecourt’s extinction cleanup. Protecting homes and centres therefore does not by itself protect survival when food production can be completely removed.

Repairs did occur, restoring about 4,499.5 hit points at a cost of roughly 360 materials across all twelve runs. They restore damaged surviving structures; they cannot restore a razed farm without new construction. This is why repair crews alone did not prevent the extinction.

1024² ALPHA declared no wars in 3,000 years. Read-only diagnostics of its final state found all three faction pairs connected by terrain, but none passed the bounded campaign route/travel check. In contrast, all TITAN pairs passed at the endpoint, with planned travel estimates of 38, 51 and 90 years. The gate suppresses many ineffective declarations, but some large worlds can remain entirely without war even where coarse connectivity exists. The diagnostic does not prove that a physically possible path was absent; it establishes what the bounded planner accepted at the endpoint.

5. **Local housing improved substantially, but demographic age skew persists.** At the stopping states there were no excess residents in any small-world or 512² settlement. The 1024² worlds had nine, eight, zero and three excess residents in ALPHA, BRAVO, CHARLIE and TITAN respectively. TITAN’s three excess residents were in its capacity-limited small capital. These are endpoint results; the periodic occupancy samples also record temporary crowding during growth and war.

Every surviving agent had a valid home building at the endpoint, and no living agent older than fourteen was idle. Ages 60+ comprised **43.1–49.7%** of the living population across the twelve endpoints; the engine continues assigning jobs to elders. A lack of assigned jobs is not the main cause of unused population capacity. Large demographic waves, damaged production and the ability to fund construction matter more.

6. **Religion stays shallow and wolves always disappear.** There were 0–6 faction conversions per world, nineteen in total over the twelve histories. These are occasional switches rather than sustained late-game religious dynamics. Wolves reached zero in every run, between years **102 and 199**, and never returned; deer persisted. Civilisation survival does not imply a stable predator/prey system.

**What the audit establishes.** The current code supports long-lived small-world populations, mostly effective contact in declared wars, household occupancy improvements, productive surplus workers and reproducible saves. It does not yet ensure that a faction can rebuild a minimum food economy after severe razing, or that larger maps produce proportionate populations and balanced material flows. The most consequential observed failure is a shrinking construction allowance combined with unaffordable standing buildings preventing recovery of food production. No simulation implementation was changed during this observation, and no CI workflow was added.

**Retained artifacts.** Each scenario has annual JSON records, a complete chronicle, a summary and initial/final version-7 snapshots in Node V8 serialization. These are retained under `/workspace/observations/audit-3000-642a701/`. The directory also contains comparison CSV/JSON, a civilisation-level CSV, the temporary harness and plotting/analysis scripts. The snapshots are not a new in-game import format. All generated state remains outside version control.

The charts and CSV files are retained in the task artifact directory, outside the repository.
