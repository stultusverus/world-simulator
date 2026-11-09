**Worldsmith observation: year 1 to year 2000 — 9 November 2026**

The simulation reached **year 2000 with all three civilisations alive**. The final population was **1,187**, spread across **seven settlements and 416 buildings**. All factions reached the Zenith era. No famine, starvation death or emergency immigration occurred. The strongest late-game pattern was convergence toward equal populations at the global birth limit, with abundant resources and recurrent wars that often produced no contact.

**Run and verification.** This was a fresh world, not a continuation of an existing save: seed `OBSERVE-2000`, the configured default size of 256 × 256, three factions with six founders each, wildlife enabled, and no player powers. The world is named *The Wandering Isles*; 49.3% of its tiles are land. The code baseline was `d70aa03440df75a138304877204c0150de8f1807`. The existing `Game` engine was called directly, one tick per year, from year 1, checking every founding civilisation after each tick. Exactly 1,999 ticks ran; none went past year 2000.

Annual samples recorded population, age groups, jobs, housing, economy, religion, buildings, wildlife, relations and active wars. Settlement detail was sampled every 25 years. Observation wrappers counted births, deaths and building losses and retained the entire chronicle (364 entries), including events that could otherwise be dropped by its history limit. An independent run without those wrappers produced an exactly equal final save. Loading the final save and saving again also reproduced it exactly. Birth/death accounting balances separately for every civilisation. The observed simulation loop took 8.39 seconds; this measures engine execution plus instrumentation, not browser rendering or frame rate. The final snapshot is retained, and the headless run is stopped.

**Civilisations at year 2000**

| Civilisation | Traits | People | Peak people | Settlements | Buildings | Housing | War deaths | Zenith reached |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Ethreach | zealous, militarist | 392 | 436 | 2 | 122 | 444 | 33 | 255 |
| Torspire | mercantile, stoic | 395 | 542 | 2 | 149 | 558 | 341 | 269 |
| Moraspire | industrious, militarist | 400 | 508 | 3 | 145 | 528 | 63 | 205 |

1. **Population recovered from early inequality, then remained near the birth limit.** Torspire peaked at 542 people in year 426 and Moraspire at 508 in year 546. Ethreach lagged: in year 556 it had 165 people with 168 housing, while the other factions occupied most of the global pool. It recovered to 384 by year 750, without immigrants. By year 2000 the factions held 392, 395 and 400 people. This supports the population-ordered birth allocation in this seed; it does not establish that all seeds are protected from extinction.

The ordinary birth limit of 1,188 was first reached in year 434. The hard cap is 1,200, with 12 places reserved for emergency recovery. Average world population from year 434 onward was 1,186.3; during the last 500 years it ranged from 1,181 to 1,188. The unused places are deliberate reserve capacity. No faction reached four settlements: Ethreach reached two, Torspire three before losing one, and Moraspire three. With a global population near 1,188, sustained growth beyond roughly 400 people per faction is constrained even where housing and building capacity remain available.

| Year | Ethreach | Torspire | Moraspire | Total |
|---:|---:|---:|---:|---:|
| 1 | 6 | 6 | 6 | 18 |
| 100 | 55 | 62 | 64 | 181 |
| 250 | 150 | 186 | 171 | 507 |
| 500 | 171 | 523 | 491 | 1185 |
| 750 | 384 | 400 | 402 | 1186 |
| 1000 | 406 | 369 | 412 | 1187 |
| 1500 | 398 | 399 | 391 | 1188 |
| 2000 | 392 | 395 | 400 | 1187 |

2. **War caused real losses, but most declarations were ineffective.** There were 14 wars: five with combat and nine that ended without a battle. All nine no-battle wars involved Ethreach and Moraspire, each ending 46 years after declaration. They caused no deaths or building losses. The logs establish absent contact; this run did not isolate the routing cause. First combat deaths appeared in year 896, almost eight centuries after the first declaration.

Combat killed **437 people**: Ethreach 33, Torspire 341, Moraspire 63. Torspire suffered 78% of all war deaths. There were five casualty-bearing battle summaries. War destroyed 17 buildings in total: eight temples, three workshops, two barracks, two farms, one market and one town centre. No houses were lost. In year 1182 Ethreach razed Torspire’s Lunemere town centre; Torspire continued with its other two settlements and survived. Its population later recovered, although Lunemere was not replaced by year 2000. There were no active wars at the endpoint.

| Participants | Years | Deaths | Buildings razed |
|---|---|---:|---:|
| Torspire / Moraspire | 889–950 | 118 | 0 |
| Torspire / Moraspire | 1038–1099 | 119 | 0 |
| Ethreach / Torspire | 1143–1204 | 25 | 14 |
| Torspire / Moraspire | 1541–1602 | 96 | 2 |
| Ethreach / Torspire | 1833–1894 | 79 | 1 |

The sum of elapsed war durations was 719 years, or 36.0% of the 1,999-year interval. Counting both declaration-year and peace-year annual samples gives 733 samples with a war present at the start or end of the tick; this is a different measurement.

3. **Food and materials remain saturated.** There were zero food-shortage years for every faction and zero starvation deaths. Food was at or above its *population-scaled* storage limit in 1,985 / 1,979 / 1,961 post-tick years for Ethreach / Torspire / Moraspire: 99.3%, 99.0% and 98.1%. All three stores were full together in 1,948 years. Peace relief can briefly exceed the derived limit, and festivals briefly reduce stocks. Thus a value below the absolute 999 ceiling does not mean food scarcity or unsaturated storage.

All three factions ended with 999 materials and spent about 75–79% of simulated years at that cap. Their combined building use was 416 of 770 derived slots (54%). Knowledge repeatedly reached 2,000 between patronage expenditures; each faction ended at 1,700 following year-2000 patronage. Sinks produce visible activity, but reserves replenish quickly. Wealth remained more differentiated and was available late in the run; the 4,000 threshold is a soft spending threshold, so amounts above it are expected.

| Civilisation | Food / dynamic storage | Annual food production / need | Materials | Wealth | Knowledge |
|---|---:|---:|---:|---:|---:|
| Ethreach | 351 / 351 | 299.7 / 234.6 | 999 | 3599 | 1700 |
| Torspire | 355 / 355 | 384.3 / 237.0 | 999 | 4384 | 1700 |
| Moraspire | 300 / 360 | 389.4 / 240.0 | 999 | 4066 | 1700 |

4. **Housing is sufficient globally but uneven locally.** Ethreach’s capital had 296 residents with 270 housing, while its second settlement had 96 residents with 174 housing. Torspire’s Orenfield had 105 residents with 84 housing, while its capital had 290 with 474 housing. All final agents had a valid home building; that does not imply local occupancy was within capacity. Migration has filled secondary settlements, but has not balanced residents against housing.

| Faction / centre | Residents | Housing |
|---|---:|---:|
| Ethreach / capital | 296 | 270 |
| Ethreach / centre 381 | 96 | 174 |
| Torspire / capital | 290 | 474 |
| Torspire / centre 264 | 105 | 84 |
| Moraspire / capital | 304 | 420 |
| Moraspire / centre 274 | 76 | 84 |
| Moraspire / centre 340 | 20 | 24 |

5. **The workforce is active, but the population is old.** At year 2000 there were 157 children under 14 (13.2%), 486 people aged 14–59 (40.9%) and 544 aged 60+ (45.8%). The engine assigns jobs to people aged 14 and above, including elders; the 1,030 reported adults should not be read as a conventional working-age population. Of them, 549 were laborers and 60 soldiers. Six agents were labelled idle, all aged exactly 14; there were no idle agents older than 14 in the final 500 years. Final mean health was about 99.5/100 for every faction, hunger was zero, and faction happiness and faith were both 100.

Across the run, 19,113 births and 17,944 deaths transformed the original 18 founders into 1,187 living people. Deaths comprise 17,507 from old age and 437 from combat. Every faction retained fertile women throughout the annual samples; none required the emergency wanderer system.

6. **Religion changed briefly, then froze; the wolf population did not survive.** Torspire converted from its original Radiant Vigil to Ethreach’s Radiant Tide in year 337, to Moraspire’s Endless Spire in 351, then back to Radiant Tide in 360. There were no further conversions through year 2000. Ethreach and Torspire shared Radiant Tide at the endpoint; Moraspire retained Endless Spire. All factions reached maximum faith, but this did not prevent later wars.

Wildlife began at 45 deer and 12 wolves. Wolves peaked at 23, then reached zero in year 175 and never returned. Deer persisted, frequently near their 120-species ceiling, ending at 107. Wolf loss did not trigger the requested stop because the condition concerned a civilisation. The animal system has no automatic reintroduction after a species loses its last individual.

**Implications.** This world demonstrated civilian survival, recovery from combat losses, productive surplus workers, and survival after a secondary town centre fell. The strongest remaining issues were repeated no-contact wars, resource abundance after the population plateau, and local housing imbalance. Those are observations and investigation priorities, not implemented changes. The early disappearance of wolves is an additional ecological finding. One fixed seed at one world size cannot establish balance or extinction rates generally; no divine interventions or forced-extinction scenarios were tested. Browser rendering and interactive save-menu behaviour were not validated in this run.

**Artifacts.** The observation harness, annual data, full event chronicle, summary, typed-array snapshots, chart and PDF are retained in `/workspace/observations/worldsmith-2000/`. The snapshot files use Node V8 serialization, not a new in-game import format. `final-state.v8` contains the existing version-6 `GameSave` at exactly year 2000. Its SHA-256 is `6298251bba131062e37d622e6c806f2163af99b7feba1d21c773299994825cca`. The harness passed its exact replay, save round-trip and stopping-condition assertions. No gameplay implementation was edited.


The full datasets and charts remain in the task workspace; they are not committed to this repository.
