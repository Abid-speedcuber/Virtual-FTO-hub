# Master FTO — Solve space

An independent, local face-turning octahedron simulator with every size from 2×2 to 20×20. Original implementation; no CubeSimulator code or assets are used.

## Play

Run `npm run dev` and visit http://127.0.0.1:5173. Node.js 20.19+ or 22.12+ is required. Dependencies are already installed in this workspace. On a fresh checkout, run `npm ci` first.

- **Minimal solve screen:** the puzzle, Scramble, Undo, Redo, and Settings. Open **Settings** for size, pointer mode, display preferences, view tools, history, reset, and help. Enable **Show move buttons** to reveal face buttons and slice/depth/direction controls. Every preference, including the current camera rotation and zoom, is saved locally; temporary held keyboard modifiers are not saved.
- **Swipe controls (default):** drag a sticker along a row to turn the slice beneath it; release to commit a 120° turn in the drag direction. Taps do not turn. Drag empty space or right-drag to orbit. Two fingers orbit, pinch to zoom, and twist to roll. Mouse wheel zooms. Multi-touch and cancelled gestures never commit a slice turn. Swipe direction and hit position determine the move independently of the button depth/direction settings.
- **Size and slices:** choose any size from 2×2 to 20×20. Each size keeps its own solve and undo/redo history, including across reloads. Switching sizes cancels unfinished turns and queued inputs. The Slice menu selects any individual slice for face buttons and existing keyboard shortcuts; depth tabs restore the named outer/inner/wide modes. Wide modes are capped at the puzzle size.
- **Original controls:** select **Orbit + click (original)** in Pointer controls. Look around: drag anywhere, including on the puzzle. Horizontal drags rotate around the fixed viewer Y axis; vertical drags rotate around the fixed viewer X axis, at every orientation and through repeated full turns. Combining X/Y rotations naturally produces roll; hold the puzzle and scroll the wheel to adjust Z in 3° steps (up counterclockwise, down clockwise). Scroll without holding or pinch to zoom. Home view restores the starting camera.
- **Turn:** in original mode, click a face; in either mode, use a face button, or press **U R F J L B K D** (J = BR, K = BL). **1–8** use that same order.
- **Reverse:** right-click a face or face button for a counterclockwise turn. The direction toggle sets the direction for keyboard input and left-clicks.
- **Turn depth:** **Shift + input** turns two layers wide; **Ctrl + input** turns the inner slice; **Ctrl+Shift + input** turns three layers ultra wide. These work with keyboard input, face buttons, and mouse clicks and override the depth selector. Face-button notation reflects the current depth and direction (`Uw`, `2U`, `3Uw`, or `Uw'`, for example). The depth tabs temporarily highlight the held modifier’s depth and restore your selected depth when you release it or leave the window. Without modifiers, the selected depth applies. History uses `Fw` for wide, `2F` for a slice, and `3Fw` for ultra wide (with the chosen face letter).
- **Undo:** **Ctrl/⌘ Z** or **Backspace**. Redo with **Ctrl/⌘ Shift Z** or **Ctrl Y**.
- **Cancel queued moves:** **Escape**. A turn already in progress finishes.

The color arrangement follows the standard DaYan FTO scheme: red → blue → purple counterclockwise around white, with opposite pairs white/yellow, red/orange, blue/green, and purple/gray. References: [DaYan product photos](https://speedcubeshop.com/products/dayan-fto-magnetic-ball-core) and [color adjacency guide](https://note.com/wajimaji/n/nc06ea912d878). Screen shades approximate the stickerless plastic.

Visible labels and keys use the same spatial frame. As you orbit, labels identify the screen’s upper and front faces, covering all 48 CIF/EIF holds, including when the puzzle is upside down. EIF side names follow the [Nautilus notation reference](https://nautilusfto.com/Notation/). The upper face may be hidden: a view showing F/L/R/D does not force a U label onto a visible side. Keyboard input is resolved against the displayed labels when entered. Switch off **Follow the view** to keep a fixed frame. Move history records the label at input time; undo stores the exact physical move, so it still works after orbiting.

Scrambles contain `max(50, size × 10)` random slice turns and are fully undoable. **Reset to solved**, in Settings, restores the solved puzzle and clears history after confirmation. It also cancels queued or animated turns and keeps your current view. The state and full undo/redo history persist in browser local storage; use the same browser and port to resume. Rendering uses flat, unlit colors, no shadows, and no continuous idle render loop. Everything runs locally, without external fonts, analytics, or runtime network requests.

## Development

- `npm test`: exact geometry, piece counts, move inverses, random solve/undo stress, all 48 CIF/EIF holds, and unrestricted camera rotation.
- `npm run test:browser`: browser input, queueing, undo/redo, persistence, and mobile layout checks. Requires Google Chrome or `npx playwright install chromium`.
- `npm run build`: static production files in `dist/`.
- `npm run preview`: serve the production build locally.

Every sticker vertex uses an integer lattice. A turn is a signed coordinate permutation, never a floating-point update to the stored puzzle. There are `8 × size²` triangular stickers (128 at 4×4, 3,200 at 20×20). Stickers are batched by color, with at most 16 sticker draw calls during a turn. At 4×4, the stickers form 86 physical pieces: 6 corners, 24 edges, and 56 centers. Rendering animation is separate from the exact state; inputs run in a serialized queue.

Generated builds, dependencies, browser reports, local environment/credential files, caches, and editor leftovers are excluded by `.gitignore`. Keep `package-lock.json` tracked for reproducible installs.
