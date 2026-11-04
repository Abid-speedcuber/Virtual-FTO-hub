# FTO solve recordings

Timed 2×2, 3×3 and 4×4 solves are recorded automatically from scramble completion
to the final solved turn. Each puzzle size retains its last completed recording
and its overall PB recording. A slower last solve replaces only the last record;
a faster PB replaces both. Resetting, scrambling, changing sizes and reloading
preserve completed records. No recordings can be reconstructed from older times.

Open **Settings → Recordings → Watch or share a solve**, or **Solve recordings**
in History. Download a `.ftoreplay.json` file and share it directly. Recipients
can import it in the same player. Playback supports play/pause, seeking and
0.25×–4× speed, using an independent 3D viewer. It never applies replay turns to
the live solve or adds imported times to history.

## File format: `fto-replay-v1`

The UTF-8 JSON object contains:

- `format`, `size`, `createdAt`, `complete`, `duration`, and `solveMs`.
- `initial.scramble`: the exact simulator moves applied from solved.
- `initial.view`: puzzle-to-view quaternion `[x,y,z,w]` and camera radius.
- `initial.keyboard`: the bindings and modes used for this attempt.
- `initial.colors`: the face color settings.
- `events`: an ordered timeline, with millisecond `at` timestamps relative to
  scramble completion. Inspection, pauses and time away remain in this timeline;
  `solveMs` separately stores the official timed result.

Event types:

| Type | Recorded data |
| --- | --- |
| `key` | Physical `code`, `down`/`up` edge, repeat flag and Shift/Ctrl/Alt/Meta flags; includes virtual-key input |
| `pointer` | Pointer edge, normalized viewport coordinates, button, pointer ID and wheel delta |
| `view` | The displayed quaternion, radius and current U/F notation hold |
| `start`, `pause`, `resume` | Timer transitions |
| `accept` | Accepted action ID, source, action type and official elapsed time |
| `animate` | Action ID, resolved geometric move and animation duration |
| `turn` | Action ID and the geometric move actually committed |

Moves use the simulator's signed integer face normals, direction `1` or `-1`,
layer kind, and slice depth/count where relevant. Commit events include Undo and
Redo as the moves actually applied. An animation ends at its matching commit,
including early interruption. Parallel motions combine on overlapping layers.
View events store displayed interpolation samples, including regrips, snaps,
zoom and keyboard rotations. Resolved geometry makes replays independent of the
recipient's keyboard configuration.

Recordings are stored in the existing per-size `recordings` object in
`master-fto-v1`. Identical last/PB records share storage through `pbIsLast`.
Unfinished attempts retain their event timeline across normal reloads and pauses.
Raw input records key codes, not text typed into settings or file pickers.
Imports validate supported sizes, views, move geometry, timelines and event types,
and are limited to 16 MB. Imported files are played locally.
