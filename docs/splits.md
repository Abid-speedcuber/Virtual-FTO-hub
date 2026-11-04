# Solve splits

Splits default to Off on every size, with no split section or prompts on the home screen. Settings → Splits offers Bencisco,
Nautilus, custom phases, or Off. Automatic presets are restricted to 3×3; custom
phases are supported separately on every size from 2×2 through 20×20.

## Primary method references

- [Ben Streeter's Bencisco guide](https://docs.google.com/document/d/e/2PACX-1vTDL7-XvpNrhIc2Q_1nHfeJyG7tIazgBCq88PE8ahqIbvPb3LPQsM3_vsdqX6y8sxte1n5jGk2J3c5V/pub)
  describes the reduction into four large centers (each three edges and three
  triangles) and six triples (each a corner and two triangles). Its first center
  and first two triples are grouped here as First block; second center and last
  two centers are grouped as E centers. The remaining coarse checkpoints are
  Last bottom triple and Last three triples.
- [Nautilus First Block](https://nautilusfto.com/Step1/),
  [Centers](https://nautilusfto.com/Step2/),
  [Last Triple](https://nautilusfto.com/Step3/), and
  [Last Layer](https://nautilusfto.com/Step4/) define the four Nautilus phases.
  The author's [summary](https://nautilusfto.com/Summary/) also discusses merging
  the last slot with centers and influencing later phases.

## Detection

For 3×3, membership in the four alternating outer layers partitions the 72
stickers into four nine-sticker center groups and six six-sticker triple groups.
A first block contains a center and two neighboring triples: 21 stickers,
including every sticker of the involved edge and corner pieces. E centers requires
all four center groups to be formed with correct relative colors. Bencisco’s next checkpoint requires all four centers aligned and all three
triples around the first center solved: 54 stickers. Nautilus instead completes
the opposite last slot, leaving the physical last layer; its distinct 54-sticker
goal accepts all three U adjustments. The final checkpoint is the fully solved puzzle.

Both alternating face families, all first blocks, and all 24 proper whole-puzzle
rotations are checked. Once a first block is observed, its reference is retained
for the attempt. Identically colored center stickers are interchangeable; the
tracker tests color patterns rather than sticker IDs. These are standard coarse
landmarks, not a guess at the solver's intended algorithm or recognition time.

Boundary timestamps use the accepted turn's solve time, excluding animation and
pause time. Checkpoints retain their accepted-move index. Undo removes a checkpoint only
when it actually reverses past that move; temporary block disruptions during
algorithms do not erase completed phases. This also applies to custom checkpoints.

## Cancellation and combined phases

A canceled or skipped intermediate state may never occur. Move history alone
cannot uniquely recover its intended timestamp. When a later checkpoint is seen
without a separately observed earlier boundary, the tracker records **one combined
segment** and labels both phases. It does not invent a zero duration or claim an
exact cancellation point. A combined segment is compared with the same combined
range of the reference run. If the reference lacks the necessary boundaries, the
delta is shown as unavailable. Already completed inspection checkpoints are marked
Skipped separately from these unobserved boundaries.

## Custom phases

Add named checkpoints by clicking whole physical pieces on the orbitable 3D FTO.
Dragging orbits, and clicking selects every sticker on that piece. Face controls
also allow selecting or clearing a face. Each checkpoint includes the pieces
from all earlier checkpoints, so phases always add solved structure.

Detection checks all 24 proper rotations of the color scheme independently of
all 24 physical poses. It retains every color assignment compatible with the
first checkpoint, then narrows that set as later checkpoints add pieces. This
allows color neutrality while preserving opposite colors, adjacency and the
same chosen color relationships across the entire solve. Mirror color schemes
and arbitrary color permutations are not accepted. Undo restores the compatible
color assignments at the checkpoint it returns to. Manual split entry is no
longer offered.

Finish is automatic. Settings apply to the next scramble, preserving the current
attempt's phase definition. Per-size configurations and unfinished split progress
survive reloads and puzzle switches.

## Comparisons and storage

Segment and cumulative deltas use the fastest recorded run with exactly the same
method and phase definition on the same puzzle size. The UI calls this the Best
tracked run: a historical overall PB without split data cannot supply honest
phase comparisons. The reference stays fixed throughout an attempt, including
when a new PB is completed. The next attempt can use that improved run.

Split records are stored with each timed solve in `master-fto-v1`; phase profiles
are stored with settings in `master-fto-settings-v1`. Existing times remain intact.

## Detector validation and diagnostics

The Nautilus goals are checked against the method author’s highlighted goal masks
and legal example setups, converted independently using cubing.js KPattern and
PuzzleGeometry. The geometry conversion is cross-checked against the simulator’s
U/F/L/R moves. Regression fixtures cover white and every other first-center color,
every proper physical pose, the distinct Nautilus last slot, U adjustments, and Undo.

Automatic records identify their detector version. Older automatic traces and
full-solve totals with no separately observed phase boundary are not used as
split-PB references. Their actual solve times and overall PBs are preserved.

Settings → Splits → Export current solve downloads a diagnostic JSON with the
current move history, checkpoint data, and accepted-move observations from the
current attempt. Detailed observations stay with the current attempt rather than
being duplicated in every historical time. Earlier attempts without move timestamps
cannot have their missing split times reconstructed reliably.
