# Master FTO — Solve space

A local face-turning octahedron simulator with every size from 2×2 to 20×20.

## Run

Use `npm ci`, then `npm run dev` and open http://127.0.0.1:5173. Node.js 20.19+ or 22.12+ is required. `npm run build` produces a static site in `dist/`.

## Play

- The puzzle occupies a left-aligned square. A floating control island unifies Pause/Resume, Reset, Scramble, and Undo/Redo on wide screens. Undo and Redo stay visible; history remains in the side panel. Choose a puzzle using the tilted 2×2 FTO button before the recording album in the topbar; its modal offers sizes 2–20. A fixed topbar shows the FTO Simulator branding and icon buttons for Settings and About. Wide screens show the puzzle name beside its icon; narrow screens use the icon alone. New sessions default to 3×3; saved size choices are restored. Selecting a puzzle squares it to CIF with white on top and green in front.
- The side panel contains the timer and PB above past times. Enabling splits adds a second column for checkpoints. A recording keyboard stays at the bottom. On narrow screens the puzzle fills the space between the topbar and a fixed bottom bar. Free play shows Reset, Scramble, and History. Running solves show Pause, timer, Undo, and Redo; paused solves show Resume, timer, Scramble, Reset, and History. Finished solves keep the final time visible alongside Reset, Scramble, and History. History opens a modal containing the selected puzzle’s times and PB. The keyboard and its Show keyboard switch are hidden when the side column has too little room; the saved toggle preference is preserved. The overlay defaults to enabled on wide screens, using the compact 60% layout. The idle timer reads `00:00`.
- **Swipe to turn**: drag a sticker to turn its row, drag empty space or right-drag to orbit. Possible rows are calculated on contact; a turn starts after 6 pixels of movement, before release. Each contact triggers at most one turn. A new swipe completes any previous turn animation and starts immediately. Two fingers orbit, pinch to zoom, and twist to roll. Mouse wheel zooms. **Settings → Controls → Touch turn biasness** opens three saved sliders: Outer turn bias favors outer turns on ambiguous edge stickers, CIF U turn bias favors U over F where the two outer layers meet in CIF, and EIF U turn bias favors U/U′ over BR/BL on the shared outer U row in EIF. All default to 60%; set any to 0% for directional matching. At 100% EIF U turn bias, those top-row overlaps allow only U/U′; lower rows retain their normal behavior. The biases shrink the less-favored turn’s original angular activation range proportionally. For U turn bias, 90% leaves 10% of that range, and 100% makes the shared-edge stickers activate only U. At 100% outer turn bias, pieces with an outer-turn candidate activate only outer turns. Interior stickers and lower F stickers keep their normal response.
- **Orbit + click**: drag to orbit, click a face clockwise, or right-click counterclockwise. Hold the puzzle and scroll to roll. This mode and swipe turns share the keyboard’s suffix/held-action resolver: a pending width or slice suffix applies to one accepted pointer turn and is then consumed. Full-size widths rotate the view, labeled **Rot**, without adding a turn or starting timing.
- Keyboard bindings and modes are saved separately for each size. Every size provides CIF, EIF-R, and EIF-L, with outer turns, depth suffixes, and Shift for Slice. Only 3×3 additionally includes **E– cntr**. Every binding is editable; fixed deep slices/wides and cube rotations can be assigned directly. See [the keyboard guide](docs/keyboard.md).
- The overlay shows actual actions at physical key positions. ANSI, ISO, and 60% layouts are available. Unbound keys are blank; keys omitted by a compact layout never light another position. Press highlights follow key-down/up without afterglow. TPS counts accepted manual turns, excluding suffixes, modes, rotations, undo/redo, and automatic scrambles.
- Undo uses Backspace or Ctrl/⌘ Z. Redo uses **Shift+Backspace**, Ctrl/⌘ Shift Z, or Ctrl Y. Undo stops at the generated scramble.

Scramble requires confirmation, arms the timer, and animates each computer turn by default. Animate turns and Animate scrambling can be changed independently in Settings → Animation & sound. Animation speed in the same section adjusts turns, view rotations, and scrambling from 0.25× to 3×. Timing starts on the first accepted manual turn and stops when solved. Reset requires confirmation when discarding progress and returns to solved free play, preserving PBs and times.

**Escape / Pause** pauses an active timed solve, grays every sticker, and shows Resume in the control bar. The resume key is consumed, so it does not also make a move or select a suffix. Manual pauses survive reloads and size switches; focus changes and closing Settings do not end them. The Pause button/key label is absent during free play and inspection.

Settings, confirmation dialogs, and leaving the site pause active timing and gray the puzzle. Every pause waits for a resume key, even after returning focus, closing dialogs, reloading, or switching sizes. The resume key is consumed. Free play and ready inspection remain colored. Each size preserves its state, view, undo/redo, pending turns, timer, PB, and times across switches/reloads. These are stored in browser Local Storage under `master-fto-v1`, with preferences under `master-fto-settings-v1` and keyboard profiles under `master-fto-keyboard-v2`. Clearing the solve storage or site data reloads open simulator tabs so they cannot write old times back from memory.

Move sounds use locally bundled **Gateron Black Ink recordings by Thomas Lai**, from [tplai/kbsim](https://github.com/tplai/kbsim), under its MIT license. [Attribution and original license](public/audio/black-ink/ATTRIBUTION.md) are included with the files. Suffixes use a gentle synthesized tone. **Disable sounds** mutes both and saves locally; playback makes no third-party requests.

## Split tracking

**Settings → Splits → Configure splits** offers automatic Bencisco and Nautilus
presets for 3×3, with four coarse checkpoints each. Every puzzle size also supports
reusable named methods based on cumulative solved pieces, selected on an orbitable
3D FTO. Choose Add method…, name it, and name its final solved-puzzle phase
(for example LL); there is no additional Finish row. Presets apply immediately
when selected, while Save method saves a custom method to the list. Valid color-neutral schemes and physical rotations are accepted, and the
same color relationships carry through later checkpoints. Splits default to Off;
the home screen hides the split section entirely until enabled. Finish is automatic.

Segment and cumulative deltas compare against the fastest saved run with the same
phase definition. Canceled or simultaneous phase boundaries are shown as combined
segments rather than made-up zero times. Settings apply to the next scramble;
current split progress, references, and completed run breakdowns are saved locally.
See [the split tracking guide](docs/splits.md) for method sources, exact detection
rules, cancellation limits, and storage details.

## Shareable solve recordings

2×2, 3×3 and 4×4 timed solves automatically retain the last completed recording
and a separate PB recording until a faster PB replaces it. Both survive new
scrambles, reset, size switches and reloads in the existing per-size solve storage.
Every new PB is also archived permanently in the personal recording album,
which is opened from the album icon in the topbar. Older PB videos stay there
after a faster PB replaces them. Any shared recording can be saved manually;
album rows show puzzle size, solve time, date, time and a [PB] badge.

Open the recording album and choose **Import recording to watch** in its fixed
footer. Paste a recording link/JSON, drop a file, or choose a file to watch it
directly on the home screen with the solver’s
keyboard, recorded sounds and previous-PB splits. The action island becomes a
progress bar. Play, pause, seek and change playback speed; download a
`.ftoreplay.json` file or paste a link/recording text from someone else. Playback has its
own 3D viewer and does not alter the live puzzle, times, bindings or PB.

The versioned `fto-replay-v1` file stores the initial scramble, view, face colors
and keyboard configuration, plus timestamped key transitions, pointer gestures,
displayed camera poses, accepted actions, resolved turns and animation
starts. Resolved turns ensure faithful playback even if bindings later change.
Recording starts at the first move, without inspection. Playback adds the actual
scramble from perfect CIF at 160 ms per turn, a 1-second pause, a slow 2-second shortest orbit
into the starting view, and a second 1-second pause. The full scramble is shown
as a subtitle throughout this introduction. Paused intervals and time away after a reload are excluded from recordings.
Older recordings also skip pauses during playback; the official solve time is stored separately. Share icons beside the current time and PB open a modal
with Copy as link, Copy as text, Download as JSON and Save to album. Links use
`https://ftoers.web.app/virtual/#replay=…`, with UTF-8 JSON compressed using gzip
before Base64URL encoding. No recording upload or link-shortening server is used. Older times cannot acquire recordings retroactively.

## Move your data to another computer

Settings → Your data exports or restores a complete JSON backup: every puzzle’s
progress, history, times, PB and last recordings, the complete recording album,
splits, custom method list,
keyboard profiles, colors, controls and display settings. Import validates the
whole backup before offering Restore backup; restoration replaces this device’s
FTO data and reloads the app. Other local-storage data is untouched. See the
[backup guide](docs/user-data.md).

## Model and verification

Every sticker vertex uses an integer lattice. A turn is an exact signed coordinate permutation. Each puzzle has `8 × size²` stickers, batched by color; rotating slabs and caps keep the black body attached during animation. Layer turns and whole-puzzle rotations both follow Animate turns. Keyboard layer turns use their selected animation speed: parallel layers animate together (including overlapping wide turns and opposite faces); a nonparallel request immediately completes all active layer turns and animates the new turn at normal speed. Rotations smoothly interpolate the view, including csTimer quarter turns, and retarget with input cadence to avoid a backlog. Following moves resolve against the intended final hold. Grabbing the puzzle hands control to the pointer at the displayed pose; puzzle selections start in canonical CIF; reloads preserve the final accepted view. The app stays hidden until the first complete scene renders.

3×3 scrambles use [csTimer author Chen Shuang’s random-state FTO scrambler](https://gist.github.com/cs0x7f/1579492aa43c794d529057386c489702): sample a legal state, solve it, and invert that solution. Generation runs locally in `src/worker.js`. One scramble is prepared when the app opens; consuming it immediately starts preparing the next one, so normal scramble requests do not wait for generation. Other sizes keep their random-move scrambles. Both animated and instant scrambling use the generated sequence; the timer starts on your first turn afterward.


- `npm test`: geometry, inverse/permutation stress, all 48 CIF/EIF holds, gestures, keyboard resolution, pacing, and timers.
- `npm run test:browser`: real mouse/touch/keyboard input, suffixes, modes, pause/resume, persistence, recordings, and responsive layout. Requires Google Chrome or Playwright Chromium.
- `npm run preview`: serve the production build.

Dependencies, generated builds, test reports, caches, and local environment/credential files are ignored. No commits are made automatically.

## Keyboard presets and license

In **Keyboard & bindings**, use **Use Abid’s default bindings** or **Use csTimer’s default bindings** and confirm the replacement to replace the current size's bindings/modes. Puzzle progress, timing, overlay preferences, and other sizes' profiles are preserved.

Abid's preset adds independent U-axis rotations: **Backquote** = nUw and **Minus (-)** = nUw′ for an n×n puzzle. They do not start timing, count toward TPS, or consume a selected move suffix.

The csTimer preset retains its FTO muscle-memory keys, including C = BL, M = Rw′, 3 = BL′, 8 = BR, and its independent rotations. Additional mode keys are **Tab** for EIF-R, **Shift+Tab** for EIF-L, and **Space** for E– cntr on 3×3. The center mode uses F/D = U/U′, J/U = 2R′/2R, and K/I = R′/R, with no wide moves. M (or Space) returns to CIF; Tab and Shift+Tab select EIF-R and EIF-L. Native rotations retain their axes in EIF modes. csTimer's P/Q keys perform opposite 90° T rotations about the top/front vertex. Since 3 and 8 are face keys, their shifted number-suffix aliases are omitted; the remaining suffixes stay editable.

This project is distributed under **GPL-3.0-only**; see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md). The csTimer preset adapts the GPLv3 FTO mapping from cs0x7f/cstimer. The prior project MIT notice and the keyboard recordings' original MIT attribution/license remain included.

The logo and favicon are rasterized from the actual 2×2 geometry, square-on: green above, purple left, yellow right, orange below. With Vite running, regenerate them using `node scripts/render-logo.mjs` followed by `python3 scripts/make-icons.py` (Pillow required).

**Settings → Customize color scheme** opens the eight face swatches. Click a swatch to use the native color picker; colors update live and save across reloads and puzzle sizes. Reset to default colors restores the factory palette.
