---
name: coach-diary
description: Coach from this project's private app state and workout diary, reusing extracted records and reading only new or relevant unresolved images. Use for personal workout/nutrition coaching or image intake, not ordinary app code changes.
---

The external folder holds original diary images. `user-data/coach/` holds private app state, configuration, image hashes, raw extractions, corrections, uploads and AI drafts. It is Gitignored, not encrypted or automatically backed up. Do not copy personal records into tracked files or test fixtures.

## On-Demand Intake

When the user asks for diary analysis or coaching, run `npm run diary -- scan` from the repository. No background watcher is installed. If no configuration exists, ask for the original folder and run `init --source <absolute-folder>`.

- `pending` contains new or changed image content. Read those images with `view_image`, not all old images. Metadata-unchanged files reuse their existing hash; renames/copies are hashed and matched by bytes. Use `scan --verify-all` for an explicit integrity check or suspicious metadata-preserving changes.
- `review` is not an instruction to reopen every image: revisit only uncertainties relevant to the requested decision, contradictions, or an explicit review request. `damaged` needs repair; do not replace a corrupt cache or user correction with guesses.
- `deferred` means pre-existing images never visually processed here. They may be workout journals, body composition, physique photos or unrelated material. They are not analyzed and not rest days. The initial baseline is already configured; do not run `baseline` again or silently mark new uploads as historical.
- Output and old analysis directories are excluded from intake. Existing OCR summaries are `legacy-ocr`, not newly verified facts. Reuse them with their uncertainty/provenance, and check original images when a consequential comparison depends on them.

Read the header date and session title, not file creation/upload dates. Preserve raw names, machine brand/model, original units and markers (`W`, `D`, `A`, standalone `S`, etc.). Do not merge same-named exercise blocks, guess unilateral load conventions, or turn absent bodyweight/band loads into zero. Header total sets/volume/Cal and extracted sets are separate observations. A header time is not a known start/end time.

If scan fails (for example the external drive is offline), state that coaching uses the last successful scan's cache and current originals are unverified. `sourceAvailable` is explicitly last-scan metadata, not a live connectivity check. Missing configuration/manifest or correction head requires repair from verified backups/history; there is no automatic repair CLI and no permission to reinitialize or discard records.

Store a UTF-8 extraction draft under `user-data/coach/batches/` using the schema below. Commit it against the hash returned by scan:

```sh
npm run diary -- store --source "relative/path.png" --hash <sha256> --file <draft.json>
npm run diary -- context --from YYYY-MM-DD --to YYYY-MM-DD
```

Use `context --details` only when actual sets are relevant. Do not load all historical OCR/JSON into context for every turn. Session candidates from different images can describe the same workout: inspect `possibleDuplicates` before counting sessions. A replaced source's old session is archived only when its known date/time/title match an active replacement; unrelated workouts sharing a filename remain separate. Same-day morning/evening sessions stay distinct. Missing drive/files never implies no exercise.

## Data Shape And Corrections

Draft root: `{ "sessions": [session] }` (the first batch's `{ "filename": "...", "session": session }` is also supported). A session has:

```json
{
  "date": "2026-10-04", "time": null, "label": "Lower",
  "durationMinutes": null, "reportedSetCount": null,
  "reportedEnergyKcal": null, "reportedVolumeKg": null,
  "exercises": [{
    "rawName": "Original machine name", "loadConvention": "as-recorded",
    "reportedVolumeKg": null, "durationMinutes": null, "repsTotal": null,
    "sets": [{ "loadKg": null, "reps": 10, "marker": null }]
  }],
  "uncertainties": []
}
```

Unknowns are `null`; never invent missing repetitions, loads, RIR, sleep or pain. Put unclear standalone markers and distances in raw notes/uncertainties rather than attaching them to an arbitrary set. Multiple sessions per image are allowed.

Corrections are separate from immutable raw extraction. Use `correct --file <json>` with `{schemaVersion:1, hash, baseDigest, expectedRevision, reason, sessions}`. Obtain `baseDigest` and `correctionRevision` from context; set `expectedRevision` to that revision (initially `null`). Preserve earlier corrections and reject stale writes. Do not manually overwrite the extraction or latest correction pointer. Verify a rescan and context after writing.

## Coaching Boundary

Explain confirmed observations, reasonable interpretations, and remaining questions separately. Recorded kg totals and reported Cal are not muscle growth or measured expenditure. Brand/machine changes, rep range, technique and effort matter; raw-name similarities alone do not establish comparable loads or muscle-set allocation. Unrecorded dates are unknown. Deload/program/nutrition decisions need relevant history, recovery/effort and goal context, not one day's tonnage.

For personal coaching, use `npm run coach -- context --date YYYY-MM-DD` to read the connected app's bounded context and CAS digest. Missing PC state means the browser has not been connected; do not invent a profile or import an old backup as current. The browser imports cached journals through a visible preview and calls the installed Codex CLI for chat/image drafts. Do not reparse cached images merely because the app or AI answer changed.

When the user asks to reflect confirmed food/workout/advice in the app, prepare a UTF-8 proposal under `user-data/coach/` with `{schemaVersion:1, expectedDigest, state}`. Use `npm run coach -- propose --file <proposal>` to inspect changes before `--apply`. Completed days are immutable until explicitly reopened in the app; existing record deletions and stale proposals are rejected. Keep unknown food amounts as questions/drafts until confirmed rather than saving zero. Preserve Codex answers with their limits and source. Do not silently replace active browser data: the app's PC-record preview/restore resolves that boundary. No scheduled watcher or automatic future AI calls are implied.
