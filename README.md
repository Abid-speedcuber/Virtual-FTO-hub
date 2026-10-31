# Master FTO — Solve space

An independent, local 4×4 face-turning octahedron simulator. Original implementation; no CubeSimulator code or assets are used.

## Play

Run `./start.sh` to start the simulator and open your browser, or run `npm run dev` and visit http://127.0.0.1:5173. Node.js 20.19+ or 22.12+ is required. Dependencies are already installed in this workspace. On a fresh checkout, run `npm ci` first.

- **Look around:** drag anywhere, including on the puzzle. Horizontal drags rotate around the fixed viewer Y axis; vertical drags rotate around the fixed viewer X axis, at every orientation and through repeated full turns. Combining X/Y rotations naturally produces roll; hold the puzzle and scroll the wheel to adjust Z in 3° steps (up counterclockwise, down clockwise). Scroll without holding or pinch to zoom. Home view restores the starting camera.
- **Turn:** click a face, use a face button, or press **U R F J L B K D** (J = BR, K = BL). **1–8** use that same order.
- **Reverse:** right-click a face or face button for a counterclockwise turn. The direction toggle sets the direction for keyboard input and left-clicks.
- **Turn depth:** **Shift + input** turns two layers wide; **Ctrl + input** turns the inner slice; **Ctrl+Shift + input** turns three layers ultra wide. These work with keyboard input, face buttons, and mouse clicks and override the depth selector. Face-button notation reflects the current depth and direction (`Uw`, `2U`, `3Uw`, or `Uw'`, for example). The depth tabs temporarily highlight the held modifier’s depth and restore your selected depth when you release it or leave the window. Without modifiers, the selected depth applies. History uses `Fw` for wide, `2F` for a slice, and `3Fw` for ultra wide (with the chosen face letter).
- **Undo:** **Ctrl/⌘ Z** or **Backspace**. Redo with **Ctrl/⌘ Shift Z** or **Ctrl Y**.
- **Cancel queued moves:** **Escape**. A turn already in progress finishes.

The color arrangement follows the standard DaYan FTO scheme: red → blue → purple counterclockwise around white, with opposite pairs white/yellow, red/orange, blue/green, and purple/gray. References: [DaYan product photos](https://speedcubeshop.com/products/dayan-fto-magnetic-ball-core) and [color adjacency guide](https://note.com/wajimaji/n/nc06ea912d878). Screen shades approximate the stickerless plastic.

Visible labels and keys use the same spatial frame. As you orbit, labels identify the screen’s upper and front faces, covering all 48 CIF/EIF holds, including when the puzzle is upside down. EIF side names follow the [Nautilus notation reference](https://nautilusfto.com/Notation/). The upper face may be hidden: a view showing F/L/R/D does not force a U label onto a visible side. Keyboard input is resolved against the displayed labels when entered. Switch off **Follow the view** to keep a fixed frame. Move history records the label at input time; undo stores the exact physical move, so it still works after orbiting.

Scrambles contain 50 outer and inner turns and are fully undoable. **Reset to solved**, beside Home view and Fit, restores the solved puzzle and clears history after confirmation. It also cancels queued or animated turns and keeps your current view. The state and full undo/redo history persist in browser local storage; use the same browser and port to resume. Rendering uses flat, unlit colors, no shadows, and no continuous idle render loop. Everything runs locally, without external fonts, analytics, or runtime network requests.

## Development

- `npm test`: exact geometry, piece counts, move inverses, random solve/undo stress, all 48 CIF/EIF holds, and unrestricted camera rotation.
- `npm run test:browser`: browser input, queueing, undo/redo, persistence, and mobile layout checks. Requires Google Chrome or `npx playwright install chromium`.
- `npm run build`: static production files in `dist/`.
- `npm run preview`: serve the production build locally.

Every sticker vertex uses an integer lattice. A turn is a signed coordinate permutation, never a floating-point update to the stored puzzle. There are 128 triangular stickers grouped into 86 physical pieces: 6 corners, 24 edges, and 56 centers. Rendering animation is separate from the exact state; inputs run in a serialized queue.

This environment mounts `.git` read-only. The local Git repository therefore stores metadata in `.repo`; use `./repo status`, `./repo log`, or `./repo diff` in this workspace. Fresh clones use normal Git commands. The initial source is committed on `main`.

Browser tests also cover actual mouse face clicks, reverse turns, modifiers, and rotation beyond 360 degrees.
