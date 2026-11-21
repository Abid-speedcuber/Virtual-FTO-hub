# Rendering and input performance

Measured November 17, 2026 against commit `f7da6ee`. The retained changes batch replay stickers by color and physical band, animate group transforms, reuse live geometry buffers, submit one replay render per frame, coalesce rapid input saves, reuse split-table rows, and skip unchanged live/replay keyboard legends.

## Results

Median wall time for each workload, after one warm-up and five measured repetitions. Lower is better.

| Workload                                                    |     Before |     After | Reduction |
| ----------------------------------------------------------- | ---------: | --------: | --------: |
| 4×4 replay: 8 animated frames                               |   196.0 ms |   11.1 ms |     94.3% |
| Replay keyboard: 60 updates without a key-state change      |  6125.3 ms |  139.2 ms |     97.7% |
| Split table: 60 timer updates                               |    37.6 ms |   13.1 ms |     65.2% |
| Live input: 20 turns                                        |  9331.4 ms | 3854.1 ms |     58.7% |
| Live input: 20 turns with a retained 10,001-event recording | 11117.6 ms | 3462.0 ms |     68.9% |

The largest replay improvements came from avoiding repeated keyboard work and batching sticker geometry. The live-input figures combine buffer reuse, keyboard caching, split-row reuse, and deferred checkpoints; they do not isolate the contribution of each change.

The rendering variants also isolate the extra WebGL submission. With the original 4×4 meshes, one render instead of two reduced the measured workload from 196.0 to 143.3 ms (26.9%). With batching enabled, it reduced 20.6 to 11.1 ms (46.1%). Batching with two submissions reduced 196.0 to 20.6 ms (89.5%).

Structural checks are less sensitive to timing noise:

- 4×4 replay draw calls per submission: **130 → 16**; submissions per frame: **2 → 1**.
- Geometry disposals during 120 live turns, including warm-up: **1080 → 0**. Buffers can still grow when a new size or larger band requires more capacity.
- Saves inside the synchronous 120-turn stress workload: **120 → 1**, including the initial durable checkpoint. With an existing recording already stored: **120 → 0** inside the handlers. The queued checkpoint is written after the burst; those counts do not imply that persistence was removed.

## Scope and limitations

Hardware: Intel Celeron N4020, two logical CPUs. Browser: headless Chrome 155, SwiftShader software rendering, device pixel ratio 1, and 4× CDP CPU throttling. No network requests are included in the measured loops. Results are main-thread workload wall times, not frame-rate measurements or GPU completion times. The unpaced input bursts intentionally stress input handling and saving. They exclude waiting for the deferred checkpoint. Background activity, JIT compilation, garbage collection, and software rendering introduce variance; inspect the raw samples before comparing small differences.

The 8×8 viewer case in the raw data exercises editor rendering. Saved solve replay currently supports sizes 2–4. Visual quality, antialiasing, pixel ratio, turn timing, and recorded pointer samples are preserved.

Rapid turns schedule a checkpoint within 250 ms. The first checkpoint and completed solves remain immediate. Existing explicit saves (including pause, pagehide, visibility changes, puzzle switching, and export) flush pending changes. This preserves normal reload/navigation persistence; abrupt process termination can lose the short interval since the last checkpoint.

## Reproduce

Run the current implementation:

```sh
npm run benchmark -- --output /tmp/fto-optimized.json
```

To compare with the baseline, prepare an isolated copy and use the same installed dependencies:

```sh
mkdir -p /tmp/fto-baseline
# Run from the repository root.
git archive f7da6ee | tar -x -C /tmp/fto-baseline
ln -s "$PWD/node_modules" /tmp/fto-baseline/node_modules
npm run benchmark -- --root /tmp/fto-baseline --output /tmp/fto-baseline.json
```

Run comparisons sequentially without changing the source files during a run. `--port` selects a different local port, and `CHROME_PATH` overrides `/usr/bin/google-chrome`. The harness checks that the retained recording fixture survives navigation before measuring it.

Raw measurements: [2026-11-17.json](benchmarks/2026-11-17.json). Harness: [benchmark-performance.mjs](../scripts/benchmark-performance.mjs).

## Validation

The production build passes. Targeted geometry, parallel-band, controls, recording, pointer, pause-free replay, and replay-data unit tests pass. New browser checks cover a single submission per frame, stable geometry buffers, coalesced saves and navigation flushes, preserved split rows, keyboard invalidation/seeking, and overlapping 4×4 turns with a pending turn restored on reload. The touch replay screenshot was visually checked.

The broader selected browser run passed 21 checks and exposed six existing failures: two keyboard tests use the removed `#size` selector, three parallel-turn tests assume a 4×4 default while opening the current 3×3 default, and an automatic-scramble test reverses physical face names using notation keys without accounting for the default frame. Representative parallel-turn and automatic-scramble failures were rerun against the untouched baseline and reproduced. A separate explicitly seeded 4×4 regression passes on the optimized code. The full unit suite also retains its existing keyboard-engine, keyboard-polish, and orientation assertion failures in unchanged engine/model modules.
