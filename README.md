# Master FTO — Solve space

A local face-turning octahedron simulator with every size from 2×2 to 20×20.

## Run

Use `npm ci`, then `npm run dev` and open http://127.0.0.1:5173. Node.js 20.19+ or 22.12+ is required. `npm run build` produces a static site in `dist/`.

## Play

- The puzzle occupies a left-aligned square. Undo/Redo and the timed Pause button are at its top right; Scramble and Reset are at its bottom right on wide screens. Choose a puzzle using the tilted FTO icon to the left of Settings in the topbar; its modal offers sizes 2–20. A fixed topbar shows the FTO Simulator branding and icon buttons for Settings and About. New sessions default to 3×3; saved size choices are restored.
- The side panel contains the timer, PB, a scrollable time list, and a bottom-anchored recording keyboard. On narrow screens the puzzle fills the space between the topbar and a fixed bottom bar. Free play shows Reset, Scramble, and History. Running solves show Pause, timer, Undo, and Redo; paused solves show Resume, timer, Scramble, Reset, and History. Finished solves keep the final time visible alongside Reset, Scramble, and History. History opens a modal containing the selected puzzle’s times and PB. The keyboard and its Show keyboard switch are hidden when the side column has too little room; the saved toggle preference is preserved. The overlay defaults to the compact 60% layout. The idle timer reads `00:00`.
- **Swipe to turn**: drag a sticker to turn its row, drag empty space or right-drag to orbit. Possible rows are calculated on contact; a turn starts after 6 pixels of movement, before release. Each contact triggers at most one turn. A new swipe completes any previous turn animation and starts immediately. Two fingers orbit, pinch to zoom, and twist to roll. Mouse wheel zooms. **Settings → Controls → Touch turn biasness** opens three saved sliders: Outer turn bias favors outer turns on ambiguous edge stickers, CIF U turn bias favors U over F where the two outer layers meet in CIF, and EIF U turn bias favors U/U′ over BR/BL on the shared outer U row in EIF. All default to 60%; set any to 0% for directional matching. At 100% EIF U turn bias, those top-row overlaps allow only U/U′; lower rows retain their normal behavior. The biases shrink the less-favored turn’s original angular activation range proportionally. For U turn bias, 90% leaves 10% of that range, and 100% makes the shared-edge stickers activate only U. At 100% outer turn bias, pieces with an outer-turn candidate activate only outer turns. Interior stickers and lower F stickers keep their normal response.
- **Orbit + click**: drag to orbit, click a face clockwise, or right-click counterclockwise. Hold the puzzle and scroll to roll. This mode and swipe turns share the keyboard’s suffix/held-action resolver: a pending width or slice suffix applies to one accepted pointer turn and is then consumed. Full-size widths rotate the view, labeled **Rot**, without adding a turn or starting timing.
- Keyboard bindings and modes are saved separately for each size. Every size provides CIF, EIF-R, and EIF-L, with outer turns, depth suffixes, and Shift for Slice. Only 3×3 additionally includes **E– cntr**. Every binding is editable; fixed deep slices/wides and cube rotations can be assigned directly. See [the keyboard guide](docs/keyboard.md).
- The overlay shows actual actions at physical key positions. ANSI, ISO, and 60% layouts are available. Unbound keys are blank; keys omitted by a compact layout never light another position. Press highlights follow key-down/up without afterglow. TPS counts accepted manual turns, excluding suffixes, modes, rotations, undo/redo, and automatic scrambles.
- Undo uses Backspace or Ctrl/⌘ Z. Redo uses **Shift+Backspace**, Ctrl/⌘ Shift Z, or Ctrl Y. Undo stops at the generated scramble.

Scramble requires confirmation, arms the timer, and animates each computer turn by default. Animate turns and Animate scrambling can be changed independently in Settings → Animation & sound. Animation speed in the same section adjusts turns, view rotations, and scrambling from 0.25× to 3×. Timing starts on the first accepted manual turn and stops when solved. Reset requires confirmation when discarding progress and returns to solved free play, preserving PBs and times.

**Escape / Pause** pauses an active timed solve, grays every sticker, and displays **Press any key to resume** below the puzzle. The resume key is consumed, so it does not also make a move or select a suffix. Manual pauses survive reloads and size switches; focus changes and closing Settings do not end them. The Pause button/key label is absent during free play and inspection.

Settings, confirmation dialogs, and leaving the site pause active timing and gray the puzzle. Every pause waits for a resume key, even after returning focus, closing dialogs, reloading, or switching sizes. The resume key is consumed. Free play and ready inspection remain colored. Each size preserves its state, view, undo/redo, pending turns, timer, PB, and times across switches/reloads. These are stored in browser Local Storage under `master-fto-v1`, with preferences under `master-fto-settings-v1` and keyboard profiles under `master-fto-keyboard-v2`. Clearing the solve storage or site data reloads open simulator tabs so they cannot write old times back from memory.

Move sounds use locally bundled **Gateron Black Ink recordings by Thomas Lai**, from [tplai/kbsim](https://github.com/tplai/kbsim), under its MIT license. [Attribution and original license](public/audio/black-ink/ATTRIBUTION.md) are included with the files. Suffixes use a gentle synthesized tone. **Disable sounds** mutes both and saves locally; playback makes no third-party requests.

## Model and verification

Every sticker vertex uses an integer lattice. A turn is an exact signed coordinate permutation. Each puzzle has `8 × size²` stickers, batched by color; rotating slabs and caps keep the black body attached during animation. Layer turns and whole-puzzle rotations both follow Animate turns. Keyboard layer turns use their selected animation speed: parallel layers animate together (including overlapping wide turns and opposite faces); a nonparallel request immediately completes all active layer turns and animates the new turn at normal speed. Rotations smoothly interpolate the view, including csTimer quarter turns, and retarget with input cadence to avoid a backlog. Following moves resolve against the intended final hold. Grabbing the puzzle hands control to the pointer at the displayed pose; size switches and reloads preserve the final accepted view. The app stays hidden until the first complete scene renders.

- `npm test`: geometry, inverse/permutation stress, all 48 CIF/EIF holds, gestures, keyboard resolution, pacing, and timers.
- `npm run test:browser`: real mouse/touch/keyboard input, suffixes, modes, pause/resume, persistence, recordings, and responsive layout. Requires Google Chrome or Playwright Chromium.
- `npm run preview`: serve the production build.

Dependencies, generated builds, test reports, caches, and local environment/credential files are ignored. No commits are made automatically.

## Keyboard presets and license

In **Keyboard & bindings**, use **Reset to Abid's Default** or **Reset to csTimer's Default** to replace the current size's bindings/modes. Puzzle progress, timing, overlay preferences, and other sizes' profiles are preserved.

Abid's preset adds independent U-axis rotations: **Backquote** = nUw and **Minus (-)** = nUw′ for an n×n puzzle. They do not start timing, count toward TPS, or consume a selected move suffix.

The csTimer preset retains its FTO muscle-memory keys, including C = BL, M = Rw′, 3 = BL′, 8 = BR, and its independent rotations. Additional mode keys are **Tab** for EIF-R, **Shift+Tab** for EIF-L, and **Space** for E– cntr on 3×3. The center mode uses F/D = U/U′, J/U = 2R′/2R, and K/I = R′/R, with no wide moves. M (or Space) returns to CIF; Tab and Shift+Tab select EIF-R and EIF-L. Native rotations retain their axes in EIF modes. csTimer's P/Q keys perform opposite 90° T rotations about the top/front vertex. Since 3 and 8 are face keys, their shifted number-suffix aliases are omitted; the remaining suffixes stay editable.

This project is distributed under **GPL-3.0-only**; see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md). The csTimer preset adapts the GPLv3 FTO mapping from cs0x7f/cstimer. The prior project MIT notice and the keyboard recordings' original MIT attribution/license remain included.

The logo and favicon are rasterized from the actual 2×2 geometry, square-on: green above, purple left, yellow right, orange below. With Vite running, regenerate them using `node scripts/render-logo.mjs` followed by `python3 scripts/make-icons.py` (Pillow required).

**Settings → Customize color scheme** opens the eight face swatches. Click a swatch to use the native color picker; colors update live and save across reloads and puzzle sizes. Reset to default colors restores the factory palette.
