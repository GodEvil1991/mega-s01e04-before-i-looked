---
plan: morning-digest
status: ready
owner: rook
opened: 2026-10-29
---

# Morning digest

The night's run log is a JSONL file nobody reads. By breakfast someone has to know what ran,
what retried, what failed, and whose it was, without opening `runs/`. rig already serves the
status board; the digest is one more page on it.

Out of scope: notifications, history across nights, auth (rig only listens on localhost).

## Priorities

Priorities set the order of work; they do not remove any section from the plan. P0 is reserved for
active production incidents, and this planned feature has no P0 work. P1 covers data correctness,
the digest interfaces, tests, review delivery, and marker cleanup. P2 covers the status-board links
and counts; it remains required for this plan to be done.

## 1. Run log reader

Priority: P1

Read `runs/<night>.jsonl` into one row per job: job, owner, runs, retries, last status, last
error, first and last time. One JSON object per line (`at`, `job`, `status`: `ok | retry | fail`,
`owner`, optional `error`). Keep the source timestamp text and its offset.

For each job, keep every valid event that has a non-empty `error` in an `errors` list. Each entry
contains the source line number, `at`, `status`, and the error text. Keep repeated messages as
separate occurrences in source order. `lastError` is the message from the latest error occurrence,
or `null` when there are none; a later successful event does not erase an earlier error.

`readNight(runsDir, night)` returns `{ rows, malformedLines }`. Each malformed-line entry contains
its 1-based source line number and a reason: `invalid-json` or `invalid-record`. Count every
malformed physical line separately, even when its text duplicates another line. A blank line inside
the file is malformed; the empty split after a final newline is not a record. Do not include raw
malformed text in the returned data or public page; the read-only source file remains available for
inspection. A malformed line is counted and skipped without stopping the rest of the night.

- Invalid lines are counted and skipped; processing continues with the rest of the night.
- `owner` can be `null`. Keep the row; show the owner as `—`.
- Lives in `src/digest/`. Commit `src/digest/types.ts` first with `DigestRow`, error and
  malformed-line types, the `{ rows, malformedLines }` result, and the typed
  `readNight(runsDir, night)` signature, so every part of section 2 can start against it.

Done when: reader tests pass on `runs/2026-10-28.jsonl` (5 jobs, 1 malformed line), including all
three `upstream 503` retry errors as separate entries and the malformed line number.

## 2. Digest page

Four small parts. Each needs only `src/digest/types.ts` from section 1, so once that is in they
can go to four workers at once. Small, well-specified work: a cheaper model is fine here.

### 2a. Page

Priority: P1

`GET /digest/:night` renders the rows with the usual layout: one table, sorted by job, retries of
3 or more and any `fail` marked. Render every error occurrence with its time, status, source line,
and text. Show the malformed-line count and line numbers without raw line contents. A night with no
file returns 404; an empty file renders "nothing ran".

Done when: `/digest/2026-10-28` renders locally.

### 2b. JSON

Priority: P1

`GET /api/digest/:night` returns `{ rows, malformedLines }` as JSON, including every error
occurrence and malformed-line diagnostic. Agents read this one; the page and the JSON must never
disagree (ADR 0001).

Done when: the JSON for 2026-10-28 has the same jobs, in the same order, as the page.

### 2c. Board link

Priority: P2

The status board links each night on disk to its digest, with its ok / retry / fail counts beside
it. Count valid log events by status; repeated events remain separate attempts, not unique jobs.

Done when: both nights on disk link to a digest that renders.

### 2d. Route tests

Priority: P1

Route tests for 2a and 2b: 200, 404 for a night with no file, the empty night, a night with a bad
line, all error occurrences (including duplicate messages), and malformed-line count and locations.
Use a temp runs dir; `runs/` is read-only.

Done when: `pnpm test` is green with the new tests.

## 3. Preview for review

Priority: P1

The reviewer reads the page from a copy, not from the lane. Run rig and save `/digest/2026-10-28` as
one HTML file, lane banner included (a command, not a browser's "save as"; the page is
self-contained, ADR 0001). Put it on your own public host, one where you can upload over it later (any bucket
or static host, ADR 0003), so it opens from a public HTTPS link. Send the reviewer the link and the
issues for this plan.

Done when: the preview link is sent to the reviewer.

## 4. Clean up

Priority: P1 after review

The preview carries this lane's marker on a public link (ADR 0003). Take the marker off: save the
page again with `LANE_MARKER` unset (the banner reads "no marker set") and upload it over the same
link. Move this plan to `docs/plans/done/` with its issue list.

Done when: the preview link no longer shows the lane marker.
