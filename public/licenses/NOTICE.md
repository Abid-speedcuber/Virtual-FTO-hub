# License and third-party notices

Master FTO is distributed under GNU GPL version 3 (GPL-3.0-only).
Copyright (c) 2026 Master FTO contributors. There is no warranty.
The complete license is in LICENSE and public/licenses/GPL-3.0.txt.

The copyright and permission notice for previously MIT-licensed project
portions is retained in public/licenses/PROJECT-ORIGINAL-MIT.txt.

## csTimer FTO keyboard preset

The single-key FTO mapping in src/keyboard-presets.js is adapted from csTimer,
by Shuang Chen (cs0x7f) and csTimer contributors, distributed under GPLv3.

Pinned source revision: 13d24c50068981b86fa46cfd32fad14d78f9185d
Source mapping:
https://github.com/cs0x7f/cstimer/blob/13d24c50068981b86fa46cfd32fad14d78f9185d/src/js/twisty/twistypoly.js
Rotation/parser reference:
https://github.com/cs0x7f/cstimer/blob/13d24c50068981b86fa46cfd32fad14d78f9185d/src/js/lib/poly3dlib.js
Upstream license:
https://github.com/cs0x7f/cstimer/blob/13d24c50068981b86fa46cfd32fad14d78f9185d/LICENSE

Modified for Master FTO in 2026: translated the keyboard table into editable
bindings for 2x2–20x20, retained the native rotation keys including quarter-turn
T rotations, and added EIF modes, Abid's center mode, app commands, and compatible
one-shot depth/slice suffixes. csTimer touch gestures are not copied.

## csTimer FTO random-state scrambler

`src/vendor/cstimer-fto.mjs` is an unmodified copy of Chen Shuang's standalone
FTO random-state scrambler, published by csTimer's author under the MIT license.
Its full copyright and permission notice is retained at the top of the file
and in `public/licenses/CSTIMER-FTO-MIT.txt`.

Pinned gist revision: 30ef16c7db1d2758fe359786ee140a0f321b94e9
Source: https://gist.github.com/cs0x7f/1579492aa43c794d529057386c489702/30ef16c7db1d2758fe359786ee140a0f321b94e9
File SHA-256: a3424137ae08ab3b63bb2d4749af228e89e8e395d40527ddc42d07c37bdee06b

Master FTO runs this code in `src/worker.js`, keeps one scramble prepared ahead, parses its conventional CIF notation
into geometric outer turns, and uses it only for 3x3 FTO. Other sizes retain
the existing random-move scrambler.

## Keyboard recordings

Gateron Black Ink recordings by Thomas Lai (tplai), from tplai/kbsim, remain
under their original MIT license. See public/audio/black-ink/ATTRIBUTION.md
and public/audio/black-ink/LICENSE.md.

## Three.js

Three.js is MIT-licensed, copyright Three.js authors. Its complete copyright and license
notice is included in public/licenses/THREE-MIT.txt and distributed with the site.

## WCA profile-link logo

`public/wca-logo-themed.svg` is a custom two-color adaptation of the official
Primary logo from https://www.worldcubeassociation.org/logo (WCA Logo Assets,
1 Positive Primary). Colored regions use the app's green accent; dark outlines
and lettering separate the regions. The registered mark is retained.
This adaptation is not an official WCA color variant or an endorsement.
The WCA logo is a registered trademark and is not part of this project's GPL
license. It is used only for the creator's WCA profile link.
Original monochrome reference: `public/wca-logo-mono.svg`.
Usage policy: https://documents.worldcubeassociation.org/documents/policies/external/Logo%20Usage.pdf
