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

Tab toggles CIF/EIF-R; C toggles CIF/EIF-L. EIF-R cycles F → R → BR → B → BL → L → F, including wide moves; EIF-L reverses that cycle. U/D stay unchanged. M toggles CIF/E– cntr. The center mode uses F/H = U′/U, K/D = R/R′, S/L = Rw′/Rw, and E/I = 2R′/2R. Modes change bindings, not the camera.

## Pointer input and one-shot suffixes

Both pointer modes use the same suffix and held-action engine as keyboard turns. In the original click mode, select a width or slice suffix and click a face; right-click reverses its direction. In swipe mode, the gesture supplies a face, direction, and base slice; a selected suffix overrides its depth/width. Configured held slice/wide/reverse actions apply to either mode. Unbound physical modifiers do not add hidden pointer actions.

A suffix waits for one accepted turn, including a pointer turn. Unbound keys, held actions, mode changes, and rejected turns do not consume it. Selected suffix keys remain lit after release and affected moves glow faintly. Press the same suffix again to cancel it. Full-size pointer turns become view rotations too.

## Pause, undo, and redo

Escape pauses an active timed solve. The puzzle turns gray and **Press any key to resume** appears beneath it. The next key only resumes; it does not perform its binding. A manual pause survives reloads and switching sizes, and is not ended by closing Settings or returning focus. Escape’s Pause label and the square’s Pause button are hidden in free play and before timing starts.

Backspace or Ctrl/Meta+Z undo player moves, stopping at the generated scramble. **Shift+Backspace**, Ctrl/Meta+Shift+Z, or Ctrl+Y redo. The binding editor also offers a separate cancel-pending-input command if desired.

## Editing and modes

Open **Settings → Keyboard & bindings**. Select a mode and an existing binding, or choose New binding. Enter a key, chord, or sequence, or use Record chord. Actions include explicit outer/slice/wide moves at depths 1–20, Rot around a face axis, depth/slice suffixes, held actions, mode switches, and commands.

- `F`: one physical key.
- `A+F`: hold A, then F; chord order does not affect conflict detection.
- `A F`: tap A, then F within the configured sequence timeout.
- `KeyF`, `ShiftLeft`, `ShiftRight`, `ArrowUp`, `Numpad8`: explicit physical codes.
- Ctrl/Control, Shift, Alt, and Meta match either side. Side-specific bindings are supported.

A trigger can have one action per mode; different modes may reuse it, and an action may have multiple triggers. An immediate action cannot also begin a longer tap sequence. Held actions take single keys/chords. Add empty creates a blank table; Duplicate copies a mode; deleting one removes bindings targeting it.

## Timing, sound, and persistence

Press highlights track key-down and key-up directly, with no minimum duration, afterglow, fade, or polling delay. Visible timing remains limited by rendering/display refresh. Selected suffix indicators are separate from held-key highlights. Move labels stay fixed for a physical press after a suffix is consumed.

TPS measures accepted manual turn input in a trailing 1-, 3-, or 5-second window. Pointer turns and keyboard turns count; suffixes, mode changes, rotations, undo/redo, automatic scrambles, and repeat/unmapped input do not. Reset input stats clears peak and total.

Move audio uses locally bundled Gateron Black Ink recordings from tplai/kbsim (MIT; license and attribution accompany the samples). Suffixes use a soft tone. Disable sounds is saved separately from keymaps.

Size-specific profiles live in `master-fto-keyboard-v2` local storage. Overlay preferences are shared. Untouched legacy defaults upgrade; customized keyboards retain their moves. Shipped Escape-cancel bindings migrate to Pause, and redo gains Shift+Backspace where applicable. Temporary keys, suffix selections, and TPS do not survive reloads. Export/import applies to the current size and validates the entire configuration before replacing it.
