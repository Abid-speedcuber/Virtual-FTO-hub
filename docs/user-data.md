# Full user-data backups

Open **Settings → Your data → Export data as JSON**. The downloaded
`fto-user-data.json` contains every `master-fto-` local-storage entry plus the
complete IndexedDB recording album, including:

- Every puzzle size’s current state, scramble boundary, undo/redo and pending turns.
- Completed times, PBs, saved splits, last/PB recordings and unfinished recording.
- Every manually saved album recording and every archived historical PB, including
  its puzzle size, solve time, date/time and PB label. Album deletion markers are
  included so deleted PB clips do not reappear on the other computer.
- All keyboard presets, custom bindings, modes, default modes and overlay settings.
- The per-size named-method library and selected split method.
- Face colors, camera hold/zoom, pointer controls, biases, animation and audio settings.

An active solve is paused before exporting. On the other computer, open
**Import data as JSON**, then drop the backup into the import modal or use
**Choose a file**. Review the puzzle, time and album
recording counts, and choose **Restore backup**. This replaces the destination app’s data; it does not
merge two different histories. The app reloads after restoring. Imported times,
recordings, bindings and methods remain associated with their original puzzle
sizes. Paused solves stay paused, so time spent transferring is not solve time.

The versioned format is `fto-user-data-v1`, with a creation date and an `entries`
object mapping local-storage keys to their exact stored strings. Its `album`
field contains an `fto-recording-album-v1` envelope with all compressed entries. Export does not upload
anything. Import validates the entire payload, including stored moves, keyboard
profiles, recordings and method definitions, before changing storage. A failed
write attempts to restore the previous entries. Album replacement uses a single
IndexedDB transaction; validation checks every recording and its content hash
before the restore confirmation. Older backups without an album leave the
destination album intact. Keys outside the app’s
`master-fto-` prefix are not removed or overwritten.

Keep the backup file for recovery. Clearing browser site data also clears the
app’s local times, recordings, methods and preferences.
