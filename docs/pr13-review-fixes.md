# PR #13: long-route correctness and bounded planning

Both major review comments were reproduced and accepted:

- [Feasible oblique routes rejected](https://github.com/stultusverus/world-simulator/pull/13#issuecomment-6755935262).
- [Seconds-long campaign preflights](https://github.com/stultusverus/world-simulator/pull/13#issuecomment-6755935622).

The before-state is PR head `642a701`. All checks below ran locally on 2026-11-10.
No CI workflow or browser automation framework was added.

## Changes

Land and sea A* now use integer octile costs (1,000 cardinal / 1,414 diagonal), so
equal-cost routes compare exactly. Equal scores prefer greater travelled cost, as
intended. Heap removal also preserves the replacement node's tie value. Reusable,
generation-stamped search buffers avoid per-query Map/Set allocation; a 1024² world
uses about 20 MiB of scratch buffers once it performs a search.

All simulation land/sea queries share **six searches and 16,384 expanded nodes per
year**, including declarations and soldier movement. Each pair check probes at most
two source/target candidates. Failed checks resume at later candidates; coast-pair
cursors likewise advance across real queries so deferred crossings explore other
shore combinations. Eligible diplomatic pairs rotate their first turn each year.
Disconnected land regions skip unnecessary land A* searches.

A verified civilisation pair retains its travel estimate while its source centre and
enemy target remain valid. Adding another enemy building does not force another full
preflight. Removing either endpoint or refreshing reachability invalidates verification.
Exhausting the shared allowance defers work and never caches an unreachable result.
Completed route/crossing caches last one simulation year; resetting them at year
boundaries makes warm-game and cold-load scheduling agree. Coast geometry can remain
cached because it does not consume the routing allowance or change decisions.

**Save version is 8.** Pair verifications, candidate retries and bounded coast-probe
cursors are persisted. Search buffers, computed routes and crossing plans remain
derived; active soldiers retain their existing saved movement paths. Version-7 and
older saves are refused under the existing no-migration policy.

## Verification

- Strict typecheck, **131 tests across 27 files**, and production build pass.
- The reviewed all-grass 1024² routes now return 300 and 900 steps within the unchanged
  12,000-node ceiling. Both expand at most four nodes per returned step. Weighted grass
  and forward/reverse sea queries also find the 900-step route within 1,800 nodes.
- Generated 1024² `TITAN-PROBE` same-land pairs verify within the 120-year horizon.
- The 600-tick generated `PROFILE` regression asserts the aggregate search/node
  limits every tick, across diplomacy and movement.
- Regressions cover deferred retries, rotation among eligible pairs, new enemy
  construction, terrain invalidation, multi-centre sea failures, advancing coast
  alternatives, and matching cold-load probe choices. Full-save equality holds after
  deferred planning and 120 years of continuation. Existing moving-army, mid-voyage,
  ferry/return, growth, cap fairness and recovery tests pass.
- An existing capital-loss fixture now refreshes connectivity after replacing terrain,
  matching the documented terrain-edit invariant.
- Shared Chromium: created 1024² `PROFILE`, ran at 5×, saved slot II at year 528,
  loaded it with 5× retained, and observed continuation to year 807 with an active war
  declared in year 784. Automatic approval review rejected opening DevTools because
  managed browser policy blocks console access, so console inspection was unavailable.
- Production bundle: 42 modules, 158.38 kB JavaScript / 50.51 kB gzip.

## Timing comparison

A temporary harness ran the old and fixed engines sequentially on fresh 1024²
`PROFILE` worlds for 600 ticks each, without observation instrumentation inside the
simulation. It retained every tick duration and the fixed engine's routing counters.

| Headless tick measurement | Before (`642a701`) | After fixes |
|---|---:|---:|
| Mean | 52.07 ms | 12.00 ms |
| 95th percentile | 39.62 ms | 35.86 ms |
| 99th percentile | 847.27 ms | 48.83 ms |
| Maximum | 7,398.79 ms | 138.72 ms |
| Maximum expanded routing nodes per tick | not instrumented | 16,384 |
| Maximum routing searches per tick | not instrumented | 6 |

These are measurements from one shared runtime, not browser frame-rate guarantees.
The remaining timing tail is material; stable 60 fps has not been established. The
hard work limits are regression-tested independently of elapsed time. Fixing routing
also changes simulation outcomes: these runs ended in year 601 with populations
2,489 / 2,491 and one / two war starts respectively, so they do not perform identical
combat work. The 120-year travel horizon and per-search ceilings still deliberately
bound which campaigns can be verified; difficult routes can take multiple checks.

Raw timings and the temporary harness are retained outside version control at
`/workspace/observations/pr13-review/`. The earlier [2,000-year implementation audit](priorities-1-3.md)
and [3,000-year observation](audit-3000.md) describe save-version-7 trajectories and
have not been rerun after these review fixes. The latter's post-war food-reconstruction
trap remains a separate balance finding.
