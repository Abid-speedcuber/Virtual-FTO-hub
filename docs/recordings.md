# FTO solve recordings

Timed 2×2, 3×3 and 4×4 solves are recorded automatically from the first accepted turn
to the final solved turn. Inspection is excluded; the camera hold and any selected
keyboard suffixes at that first turn are retained. Each puzzle size retains its last completed recording
and its overall PB recording. A slower last solve replaces only the last record;
a faster PB replaces both. Resetting, scrambling, changing sizes and reloading
preserve completed records. Every new PB is also saved to the album, retaining
all historical PB recordings. Existing retained PB videos are imported into the
album on first use; old times without recordings cannot acquire videos retroactively.

Open **Settings → Recordings → Watch or share a solve**, or **Solve recordings**
in History. Download a `.ftoreplay.json` file and share it directly. Recipients
can import it and choose **Watch on home screen**. Playback supports play/pause,
seeking and 0.25×–4× speed. The main puzzle area shows a separate viewer, the
solver’s keyboard and recorded sounds; the action island becomes the progress
bar. The split panel compares with the solver’s previous PB, when it uses the
same checkpoints. The share icons next to the current time and PB download the
sharing modal. Choose **Copy as link**, **Copy as text**, **Download as JSON**,
or **Save to album**. It never applies replay turns to
the live solve or adds imported times to history.

## File format: `fto-replay-v1`

The UTF-8 JSON object contains:

- `format`, `size`, `createdAt`, `complete`, `duration`, and `solveMs`.
- `initial.scramble`: the exact simulator moves applied from solved.
- `initial.view`: puzzle-to-view quaternion `[x,y,z,w]` and camera radius.
- `initial.keyboard`: the bindings and modes used for this attempt.
- `initial.colors`: the face color settings.
- `events`: an ordered timeline, with millisecond `at` timestamps relative to
  the first accepted turn. Inspection, paused intervals and time away after a reload are excluded. `solveMs` stores the official timed result.

Event types:

| Type | Recorded data |
| --- | --- |
| `key` | Physical `code`, `down`/`up` edge, repeat flag and Shift/Ctrl/Alt/Meta flags; includes virtual-key input |
| `pointer` | Pointer edge, normalized viewport coordinates, button, pointer ID and wheel delta |
| `view` | The displayed quaternion, radius and current U/F notation hold |
| `start` | First accepted turn |
| `reset-input` | Clear held keys and pending modifiers at a pause cut |
| `sound` | Actual move-click or suffix-tone decisions made during the solve |
| `accept` | Accepted action ID, source, action type and official elapsed time |
| `animate` | Action ID, resolved geometric move and animation duration |
| `turn` | Action ID and the geometric move actually committed |

Moves use the simulator's signed integer face normals, direction `1` or `-1`,
layer kind, and slice depth/count where relevant. Commit events include Undo and
Redo as the moves actually applied. An animation ends at its matching commit,
including early interruption. Parallel motions combine on overlapping layers.
The player adds a synthetic introduction: scramble from the home hold snapped to perfect CIF at 160 ms per turn, then
pause for 1 second, slerp slowly for 2 seconds along the shortest quaternion arc
to `initial.view`, and pause for another second before solving. The scramble
subtitle stays visible through these stages, with the current turn highlighted
while scrambling, then disappears for the solve. All timings follow playback speed. This
introduction is generated from the scramble and is not recorded inspection.

View events store displayed interpolation samples, including regrips, snaps,
zoom and keyboard rotations. Resolved geometry makes replays independent of the
recipient's keyboard configuration.

Recordings are stored in the existing per-size `recordings` object in
`master-fto-v1`. Identical last/PB records share storage through `pbIsLast`.
Unfinished attempts retain active solve events across reloads. Paused input, audio
and camera motion are omitted; playback jumps directly to the resumed pose.
Raw input records key codes, not text typed into settings or file pickers.
Older recordings have their inspection prefix trimmed when shared or played.
Legacy `pause`/`resume` intervals are skipped during playback without changing
the original recording or its album identity. The introduction’s two 1-second
holds remain part of playback.
The recorded keyboard configuration drives key labels, modes, suffixes and press
highlights; the viewer’s bindings remain unchanged. `splitData` holds this run’s
checkpoints, while `previousBest` holds the previous PB time and its split data.

Imports validate supported sizes, views, move geometry, timelines and event types,
and are limited to 16 MB. Imported files are played locally.

## Personal recording album

The topbar album icon opens all archived recordings. Rows identify puzzle size,
solve time, local date and local time, with **[PB]** on every recording archived
as a personal best. Watch or share a recording directly from its row. Saving
an identical recording again does not create a duplicate or remove its PB badge.
Manually saving an imported solve does not add it to your solve history or PBs.

The album lives in IndexedDB (`master-fto-album-v1`, `recordings` store), separate
from the smaller local-storage area used for settings and current puzzle state.
Each entry contains its metadata and a compressed recording. A SHA-256 digest
of canonical recording JSON identifies duplicates. All entries are included in
full user-data backups; clearing all browser site data clears the album too.

## Share links and text

Links use `https://ftoers.web.app/virtual/#replay=1.<payload>`. The payload is
canonical UTF-8 recording JSON, gzip-compressed **before** Base64URL encoding.
Compression happens locally and preserves inputs, camera samples, solver bindings,
sounds, timing and split comparisons. The modal displays the resulting link
length. The URL fragment carries the data without a recording upload or server
shortener. Opening the link loads a paused replay; it never changes the viewer’s
times, PB or bindings. Pasted links, encoded payloads and JSON can also be opened
through **Paste link or text** in the recording chooser.

Decompression is bounded to 16 MB and imported data is validated before playback.
The production build uses relative assets so this works under `/virtual/` as well
as the root path. Very long recordings can be shared as JSON without depending
on chat applications’ URL length limits.
