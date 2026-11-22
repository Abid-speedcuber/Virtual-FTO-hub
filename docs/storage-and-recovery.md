# Solve storage and recovery

Solve checkpoints and time history now use IndexedDB (`master-fto-solves-v2`).
A save writes its current puzzle checkpoint and new/edited results, rather than
serializing every puzzle, all times and completed replays on each timer tick.
Completed replays use lossless gzip; last/PB membership refers to recording IDs.
A small synchronous localStorage journal covers closing a page before its
IndexedDB transaction commits.

On first reload, the old `master-fto-v1` document is archived verbatim before
migration. Each puzzle is validated independently. Healthy puzzle histories
remain usable when another puzzle is damaged. The migration reads back times
and completed recordings before removing the old localStorage key. Failures
keep the source data and offer a recovery download.

Per-puzzle revisions reject stale tab writes. A conflicting tab stops accepting
moves, preserves its branch and offers reload/recovery. Other puzzle sizes can
be saved independently. Browser Web Locks protect live journals from another
tab's recovery replay. Unreferenced completed payloads are collected on reload
only when no other writer is active. Browsers without Web Locks retain these
payloads conservatively. Imported previous generations and unresolved recovery
branches are retained deliberately.

The album has separate metadata and payload stores. Listing recordings reads
metadata; exporting an average reads its referenced recordings. Full backup
export intentionally includes all recordings. Before restore, the current data
and affected album are saved durably, in addition to rollback protection.

Keyboard layouts are immutable snapshots addressed by SHA-256. Local storage
interns individual binding arrays and keyboard configurations. Both the album
and completed solve store hydrate the original configuration when loading a
recording. Public JSON, full links and portable backups remain self-contained.
Changing today's keyboard never changes an older recording. Legacy albums are
migrated on reload without changing recording IDs.

Backend migration `20261122000002_recording_keyboard_snapshots.sql` similarly
stores shared keyboard configurations once, hydrates at replay/review/short-link
boundaries, preserves existing recording fingerprints and short codes, includes
snapshots in the storage quota and collects unreferenced snapshots. This and
review pagination are local migrations pending hand testing and deployment.

## Hand testing before deployment

- Export a backup before testing; reload an existing installation and compare
  times, comments, PB recordings, keyboard layouts and all puzzle sizes.
- Change bindings, complete a solve, change them again, and watch/export both
  recordings. Check that each replay shows its own bindings.
- Open two tabs on the same puzzle, save new work in both, and check conflict
  recovery. Repeat on different puzzle sizes.
- Close/reopen during a solve; verify recovery and replay, including DNFs.
- Restore/export a complete backup and a saved average on another browser.
- Scroll a long history to the earliest result; open single/average statistics.
- With the local backend migrations applied, page/filter active and held reviews;
  check that short links, public top-ten replay and admin recovery retain keys.
