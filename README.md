# Master FTO — Solve space

An independent, local face-turning octahedron simulator with every size from 2×2 to 20×20. Original implementation; no CubeSimulator code or assets are used.

## Play

Run `npm run dev` and visit http://127.0.0.1:5173. Node.js 20.19+ or 22.12+ is required. Dependencies are already installed in this workspace. On a fresh checkout, run `npm ci` first.

- **Solve layout:** the puzzle fills a left-aligned square with side `min(viewport width, viewport height)`. Undo/Redo sit at its top-right and Scramble at its bottom-right. Settings floats at the screen’s top-right. The side panel holds the timer, a scrollable saved time list, and the keyboard anchored at the bottom; narrow/portrait screens place that panel below the square. Use the square’s top-left dropdown for size. Open **Settings** for pointer mode, display preferences, view tools, history, reset, and help. Enable **Show move buttons** to reveal face buttons and slice/depth/direction controls. Every preference, including the current camera rotation and zoom, is saved locally; temporary held keyboard modifiers are not saved.
- **Swipe controls (default):** drag a sticker along a row to turn the slice beneath it; release to commit a 120° turn in the drag direction. Taps do not turn. Drag empty space or right-drag to orbit. Two fingers orbit, pinch to zoom, and twist to roll. Mouse wheel zooms. Multi-touch and cancelled gestures never commit a slice turn. Swipe direction and hit position determine the move independently of the button depth/direction settings.
- **Size and slices:** choose any size from 2×2 to 20×20. Each size keeps its own solve, camera view, redo history, timer, and pending turns across switches and reloads. Switching sizes parks the previous puzzle; returning resumes it, including turns accepted before switching away. The Slice menu selects any individual slice for face buttons and existing keyboard shortcuts; depth tabs restore the named outer/inner/wide modes. Wide modes are capped at the puzzle size.
- **Original controls:** select **Orbit + click (original)** in Pointer controls. Look around: drag anywhere, including on the puzzle. Horizontal drags rotate around the fixed viewer Y axis; vertical drags rotate around the fixed viewer X axis, at every orientation and through repeated full turns. Combining X/Y rotations naturally produces roll; hold the puzzle and scroll the wheel to adjust Z in 3° steps (up counterclockwise, down clockwise). Scroll without holding or pinch to zoom. Home view restores the starting camera.
- **Turn:** in original mode, click a face; in either mode, use a face button, or the default paired outer-move keys shown in [the keyboard guide](docs/keyboard.md). Every keyboard binding is editable.
- **Reverse:** right-click a face/button or use an explicit counterclockwise binding. Alt-reverse is unbound by default. The direction toggle applies to bindings set to follow the solve controls; explicit custom actions have their own direction.
- **Keyboard depths:** **2–9** select a wide count, **0** sets 10, and **1** sets 11. **Shift+1–9** set 11–19 and **Shift+0** sets 20. On 3×3, Space also selects two-wide and Shift holds slice. A configurable one-shot slice suffix stacks with a depth suffix. Suffixes wait for one accepted turn, glow while selected, and leave affected keys faintly lit. Out-of-range suffixes are blank. Full-size widths are labeled **Cube rotation** and rotate the view without adding a turn or starting the timer.
- **Mouse/button depths:** Shift turns two layers wide, Ctrl turns the inner slice, and Ctrl+Shift turns three layers wide. These are independent of editable keyboard bindings. Without modifiers, use the depth tabs or Slice menu.
- **Recording keyboard:** enable **Settings → Show keyboard**. **Keyboard & bindings** provides ANSI/ISO and 60% geometry, an optional numpad, live action labels, physical key highlights, width/opacity settings, and rolling TPS with peak and turn count. Unbound keys have no text. A lit key keeps the label of the move it executed until release. Press highlights have no afterglow or minimum duration.
- **Modes and manual bindings:** Each size saves its own bindings. 3×3 starts with CIF, EIF-R, EIF-L, and E Center; other sizes have outer moves and suffixes. Fixed moves such as 8U′ or 8Uw′, one-shot slice suffixes, and cube rotations can all be assigned directly. Create, duplicate, rename, or delete modes; edit each binding or record a chord. `A+F` is a held chord; `A F` is a tap sequence. Assign a key such as M to cycle modes, a key/chord to hold a temporary mode, or a binding to switch directly. Triggers are unique per mode; the same action can have multiple triggers and other modes can reuse keys. All configuration saves locally and can be exported/imported as JSON. See [the keyboard guide](docs/keyboard.md).
- **Undo:** **Ctrl/⌘ Z** or **Backspace**. Redo with **Ctrl/⌘ Shift Z** or **Ctrl Y**.
- **Cancel queued moves:** **Escape**. A turn already in progress finishes.

The color arrangement follows the standard DaYan FTO scheme: red → blue → purple counterclockwise around white, with opposite pairs white/yellow, red/orange, blue/green, and purple/gray. References: [DaYan product photos](https://speedcubeshop.com/products/dayan-fto-magnetic-ball-core) and [color adjacency guide](https://note.com/wajimaji/n/nc06ea912d878). Screen shades approximate the stickerless plastic.

Visible labels and keys use the same spatial frame. As you orbit, labels identify the screen’s upper and front faces, covering all 48 CIF/EIF holds, including when the puzzle is upside down. EIF side names follow the [Nautilus notation reference](https://nautilusfto.com/Notation/). The upper face may be hidden: a view showing F/L/R/D does not force a U label onto a visible side. Keyboard input is resolved against the displayed labels when entered. Switch off **Follow the view** to keep a fixed frame. Move history records the label at input time; undo stores the exact physical move, so it still works after orbiting.

Scrambles contain `max(50, size × 10)` random slice turns. Scramble always asks for confirmation because it replaces the current solve. Undo stops at the generated scramble; computer moves are not part of the editable player history. **Animate scrambling** is a separate saved setting: turn it on to watch each computer-generated turn, independently of manual-turn animation. Turning input is blocked until scramble preparation finishes. **Reset**, beside Scramble (also available as **Reset to solved** in Settings), cancels queued turns and returns to free play while preserving the PB.

The timer stays dormant during free play. A computer scramble arms it; the first accepted turn starts it, and completing the puzzle stops it. PBs and completed-attempt counts save separately for each size. Leaving the window/tab/site pauses elapsed time; returning or reloading resumes the saved attempt without counting away time. Queued and in-progress turns are saved too. The state and full undo/redo history persist in browser local storage; use the same browser and port to resume. These are local practice times, with undo/redo available during an attempt.

The app remains hidden on a dark background until its first complete puzzle frame is rendered. Turn animations adapt to input cadence; bursts apply every logical move in order and catch the rendered puzzle up on the next frame rather than accumulating full-length animations.

Rendering uses flat, unlit colors, no shadows, and no continuous idle WebGL render loop. Everything runs locally, without external fonts, analytics, or runtime network requests.

## Development

- `npm test`: exact geometry, piece counts, move inverses, random solve/undo stress, all 48 CIF/EIF holds, and unrestricted camera rotation.
- `npm run test:browser`: browser input, queueing, undo/redo, keyboard editor/modes/depths/TPS, persistence, and mobile layout checks. Requires Google Chrome or `npx playwright install chromium`.
- `npm run build`: static production files in `dist/`.
- `npm run preview`: serve the production build locally.

Every sticker vertex uses an integer lattice. A turn is a signed coordinate permutation, never a floating-point update to the stored puzzle. There are `8 × size²` triangular stickers (128 at 4×4, 3,200 at 20×20). Stickers are batched by color, with at most 16 sticker draw calls during a turn. At 4×4, the stickers form 86 physical pieces: 6 corners, 24 edges, and 56 centers. Rendering animation is separate from the exact state; inputs run in a serialized queue.

Generated builds, dependencies, browser reports, local environment/credential files, caches, and editor leftovers are excluded by `.gitignore`. Keep `package-lock.json` tracked for reproducible installs.

Only paused timed solves render every sticker gray. Settings and confirmation dialogs pause an active timed solve; its colors and timer return after the last dialog closes. Free play and ready inspection stay colored.

Moves use a soft, low-pitched mechanical-key thock; depth/slice suffixes use a soft tone. **Disable sounds** mutes both and is saved locally. Reset/scramble confirmation dialogs pause active timing and show gray stickers during timed breaks; cancelling restores the running attempt. Click outside a settings dialog to close it.

Completed times save per size and survive resets and new scrambles. Older saves retain their known last result; earlier individual times cannot be reconstructed from a PB alone. Free-play timing displays `00:00`. Keyboard mode names use at most two six-character words, with one separating space.
