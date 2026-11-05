# Keyboard and recording overlay

Enable **Show keyboard** in Settings. The overlay sits at the bottom of the timer column, below a scrollable solve-time list. ANSI and ISO retain real staggered rows and modifier/Enter/Space footprints. The 60% option shows only the 61-key main block; omitted function/navigation/numpad keys never light other positions. The overlay is also clickable.

Keys display actions rather than physical letters. Unbound shortcut-prefix keys stay blank. Mode keys display destination names on one or two lines. Mode names allow at most two words of six characters each, separated by one space. Older long names are shortened without changing mode IDs or moves.

## Defaults

Each puzzle size has independent, editable bindings. Every size has CIF, EIF-R, and EIF-L, with outer moves, number suffixes, Shift for Slice, and common commands. Only 3×3 also includes **E– cntr**.

| Physical keys | CIF moves |
| --- | --- |
| F / J | U′ / U |
| G / H | F′ / F |
| E / D | L′ / L |
| I / K | R / R′ |
| R / U | B′ / B |
| S / W | BL / BL′ |
| L / O | BR′ / BR |
| A / ; | D / D′ |

Numbers 2–9 select that width; 0 selects 10, and 1 selects 11. Shift+1–9 selects 11–19; Shift+0 selects 20. Shift+8 (`*`) or NumpadMultiply selects 18. Two-wide suffixes are labeled **Wide**. Out-of-range suffixes are blank and inactive; full-size widths are labeled **Rot** and rotate the view without adding a turn, TPS, or timer start.

Shift holds Slice on every size, at the selected depth (depth two without a suffix). On 3×3, Space also selects Wide, Y/B are Rw/Rw′, and T/V are Lw′/Lw. Ctrl-wide, Alt-reverse, and the one-shot slice suffix begin unbound. Add **Next move: slice suffix** to any key to avoid holding Shift. Width and slice suffixes stack in either order: with Quote bound to slice, `8 ' F` performs `8U′` on a large enough puzzle.

Tab toggles CIF/EIF-R; C toggles CIF/EIF-L. EIF-R cycles F → R → BR → B → BL → L → F, including wide moves; EIF-L reverses that cycle. U/D stay unchanged. M toggles CIF/E– cntr. The center mode uses F/D = U/U′, J/U = 2R′/2R, and K/I = R′/R. It has no Rw/Rw′ keys. M returns to CIF, Tab selects EIF-R, and C selects EIF-L (Shift+Tab in the csTimer preset). Modes change bindings, not the camera. In Abid’s preset, **[** snaps the current CIF or EIF hold to a centered, level view, preserving U/R/F/L assignments, zoom, and selected suffixes. Home no longer resets the view. The action is also available as **Snap current CIF / EIF view** in the binding editor. Existing defaults upgrade on load; an already assigned [ key is preserved.

## Pointer input and one-shot suffixes

Both pointer modes use the same suffix and held-action engine as keyboard turns. In Orbit + click mode, select a width or slice suffix and click a face; right-click reverses its direction. In swipe mode, the gesture supplies a face, direction, and base slice; a selected suffix overrides its depth/width. Configured held slice/wide/reverse actions apply to either mode. Unbound physical modifiers do not add hidden pointer actions.

A short tap selects a suffix on release and waits for one accepted turn, including a pointer turn. Until release or hold activation, it does not change the move legends or hide Shift’s Slice legend. Holding a suffix for 200 ms, or using it with a turn sooner, activates it as a held modifier: it applies to every keyboard or pointer turn until release. Releasing a held suffix does not leave a one-shot selection behind. Held width and slice suffixes can stack. Unbound keys, held actions, mode changes, and rejected turns do not consume it. Selected suffix keys remain lit after release and affected moves glow faintly. Tap the same suffix again to cancel it. Full-size pointer turns become view rotations too.

## Pause, undo, and redo

Escape pauses an active timed solve. The puzzle turns gray and **Press any key to resume** appears beneath it. The next key only resumes; it does not perform its binding. Every pause waits for a resume key, including pauses caused by Settings, confirmations, leaving the page, reloads, and size switches. Closing a dialog or returning focus does not resume timing. Escape’s Pause label and the square’s Pause button are hidden in free play and before timing starts.

Backspace or Ctrl+Z (Windows/Linux) and Cmd+Z (macOS) undo player moves, stopping at the generated scramble. A finished timed solve becomes the new undo boundary. Later free-play moves can be undone and redone, including after reload, but undo cannot cross back into the completed solve. **Shift+Backspace**, Ctrl+Shift+Z, Ctrl+Y, and Cmd+Shift+Z redo. Both presets provide these shortcuts in every mode, including E– cntr. No default action requires the Windows/Super key. The binding editor also offers a separate cancel-pending-input command if desired.

## Editing and modes

Open **Settings → Controls → Edit keyboard and binding** for overlay layout, input preferences, presets and keyboard import/export. **Customize bindings** opens the separate action editor. Its puzzle selector changes which profile you edit without changing the live puzzle.

The catalogue lists every relevant outer turn, slice, wide turn, rotation, suffix, command and mode action for that size. Widths and slices stop at the puzzle’s layer count; there is no 1w. Each “All” option displays its complete matching list. Category and subgroup dropdowns narrow it by depth, width, face, suffix kind or target mode.

Click an assigned key to replace it, **×** to unassign it, or **+** to add another key. Press a key/chord and save, or type a tap sequence. Reassigning an occupied key requires **Replace existing key**. Esc dismisses capture; type `Escape` in the field when assigning Escape itself.

The Mode dropdown selects the bindings you edit, without activating that mode. **+ New mode** creates one. Right-click a mode (or tap its **⋯** button) to rename, duplicate, delete or make it the default. The default is labeled **(Default)**. Runtime mode changes use your keyboard bindings. The default-on **Reset mode after a solve** setting returns to the default after completion.

- `F`: one physical key.
- `A+F`: hold A, then F; chord order does not affect conflict detection.
- `A F`: tap A, then F within the configured sequence timeout.
- `KeyF`, `ShiftLeft`, `ShiftRight`, `ArrowUp`, `Numpad8`: explicit physical codes.
- Ctrl/Control, Shift, Alt, and Meta match either side. Cmd/Command, Win/Windows, and Super are aliases for Meta. The editor shows that key as Cmd on macOS, Win on Windows, and Super on Linux; physical left/right variants remain assignable. Side-specific bindings are supported.

A trigger can have one action per mode; different modes may reuse it, and an action may have multiple triggers. An immediate action cannot also begin a longer tap sequence. Held actions take single keys/chords. New mode creates a blank table; Duplicate copies a mode; deleting one removes bindings targeting it.

## Timing, sound, and persistence

Press highlights track key-down and key-up directly, with no minimum duration, afterglow, fade, or polling delay. Visible timing remains limited by rendering/display refresh. Selected suffix indicators are separate from held-key highlights. Move labels stay fixed for a physical press after a suffix is consumed.

TPS measures accepted manual turn input in a trailing 1-, 3-, or 5-second window. Pointer turns and keyboard turns count; suffixes, mode changes, rotations, undo/redo, automatic scrambles, and repeat/unmapped input do not. **Reset TPS and turn count** clears the current TPS window, peak TPS and accepted manual-turn count. It leaves the puzzle and solve history intact.

Move audio uses locally bundled Gateron Black Ink recordings from tplai/kbsim (MIT; license and attribution accompany the samples). Suffixes use a soft tone. Disable sounds is saved separately from keymaps.

Size-specific profiles live in `master-fto-keyboard-v2` local storage. Overlay preferences are shared. Untouched legacy defaults upgrade; customized keyboards retain their moves. Shipped Escape-cancel bindings migrate to Pause, and modes gain missing Backspace undo and Shift+Backspace redo bindings without replacing custom key actions. Shipped older center moves upgrade to the new six-move layout once. Temporary keys, suffix selections, and TPS do not survive reloads. Export/import applies to the current size. Import opens a drag-and-drop/file-picker modal, validates the entire configuration, then asks for confirmation before replacing the keyboard.

## Switching default presets

**Use Abid’s default bindings** and **Use csTimer’s default bindings** ask for confirmation before replacing bindings and modes for the current puzzle size. They keep puzzle progress, timer, TPS counters, overlay layout/visibility/size, and the sequence timeout. Resets select CIF and clear transient key/suffix state. Both presets include EIF-R/EIF-L on every size and Abid's E– cntr moves only on 3×3.

**Abid:** Backquote rotates nUw; Minus (-) rotates nUw′. Q/P rotate around R; Z/Period rotate around R′, including in EIF and center modes. These independent rotations ignore width/slice suffixes and leave them selected for the next turn. Tab/C select EIF-R/EIF-L; M selects centers on 3×3.

**csTimer:** I/K = R/R′, D/E = L/L′, J/F = U/U′, H/G = F/F′, S/L = D/D′, W/O = B/B′, 8/Comma = BR/BR′, C/3 = BL/BL′. U/M = Rw/Rw′; R/V = Lw′/Lw. Y/N rotate [R]/[R′]; T/B rotate [L′]/[L]; Semicolon/A rotate [U]/[U′]; P/Q rotate T/T′ by 90° about the top/front vertex. These are independent view rotations and remain unchanged in EIF modes. Turn faces cycle as usual.

For csTimer, Tab selects EIF-R (or returns to CIF), Shift+Tab selects EIF-L (or returns), and Space selects centers on 3×3. Centers retain Abid's moves and return via Space or M. The native C/M/3/8 actions take priority over Abid's shortcuts, so 3/8 and their shifted variants are not width suffixes. Other number suffixes, Shift for Slice, pause, and undo/redo remain available.

Source and GPLv3 attribution for the adapted csTimer mapping are recorded in [NOTICE.md](../NOTICE.md). Presets and edits save per size and export through the existing JSON controls.

Whole-puzzle rotations follow **Animate turns**, including csTimer’s 90° T rotations and full-width suffix rotations. The view interpolates smoothly and catches up fast rotation input without queuing old poses. Independent rotation keys still preserve selected suffixes and do not affect timing or TPS.
