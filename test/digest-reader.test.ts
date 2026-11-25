import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { countNightStatuses, readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
let runsDir: string;
let logPath: string;

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  logPath = join(runsDir, night + '.jsonl');
});
afterEach(() => rmSync(runsDir, { recursive: true, force: true }));

describe('nightly log reader', () => {
  it('groups the October 28 fixture and retains the three upstream retry occurrences', () => {
    copyFileSync(new URL('../runs/2026-10-28.jsonl', import.meta.url), logPath);
    const { rows, malformedLines } = readNight(runsDir, night);
    expect(rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(malformedLines).toEqual([{ line: 16, reason: 'invalid-json' }]);
    expect(rows[0]).toMatchObject({ owner: null, lastError: null, errors: [] });
    expect(rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok',
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
      lastError: 'upstream 503',
      errors: [
        { line: 5, at: '2026-10-29T01:30:00+01:00', status: 'retry', message: 'upstream 503' },
        { line: 6, at: '2026-10-29T01:31:00+01:00', status: 'retry', message: 'upstream 503' },
        { line: 7, at: '2026-10-29T01:33:00+01:00', status: 'retry', message: 'upstream 503' },
      ],
    });
  });

  it('reports each malformed line and continues through CRLF and repeated invalid input', () => {
    const record = { at: '2026-10-28T23:30:00+02:00', job: 'sync', owner: null, status: 'fail' };
    const lines = [
      'broken private log', 'broken private log', '', 'null', '[]',
      JSON.stringify({ ...record, status: 'unknown' }), JSON.stringify({ ...record, at: 'yesterday' }),
      JSON.stringify({ ...record, owner: undefined }), JSON.stringify({ ...record, error: 5 }),
      JSON.stringify(record), JSON.stringify(record), JSON.stringify({ ...record, status: 'ok', error: '   ' }),
    ];
    writeFileSync(logPath, lines.join('\r\n') + '\r\n');
    const { rows, malformedLines } = readNight(runsDir, night);
    expect(malformedLines).toEqual(lines.slice(0, 9).map((_, index) => ({
      line: index + 1, reason: index < 3 ? 'invalid-json' : 'invalid-record',
    })));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ owner: null, runs: 3, retries: 0, lastStatus: 'ok', lastError: null, errors: [] });
    expect(countNightStatuses(runsDir, night)).toEqual({ ok: 1, retry: 0, fail: 2 });
  });

  it('keeps source order and timestamp offsets when event times arrive out of order', () => {
    const record = { job: 'sync', owner: 'rook', status: 'retry' };
    const later = '2026-10-28T02:10:00+01:00';
    const earlier = '2026-10-28T02:40:00+02:00';
    writeFileSync(logPath, [
      { ...record, at: later, error: 'later error' },
      { ...record, at: earlier, error: 'earlier error' },
      { ...record, at: later, owner: null, status: 'ok' },
    ].map((event) => JSON.stringify(event)).join('\n'));
    expect(readNight(runsDir, night).rows[0]).toMatchObject({
      owner: null, firstAt: earlier, lastAt: later, lastStatus: 'ok', lastError: 'later error',
      errors: [
        { line: 1, at: later, status: 'retry', message: 'later error' },
        { line: 2, at: earlier, status: 'retry', message: 'earlier error' },
      ],
    });
    expect(countNightStatuses(runsDir, night)).toEqual({ ok: 1, retry: 2, fail: 0 });
  });

  it('distinguishes an empty file from one blank physical line', () => {
    writeFileSync(logPath, '');
    expect(readNight(runsDir, night)).toEqual({ rows: [], malformedLines: [] });
    writeFileSync(logPath, '\n');
    expect(readNight(runsDir, night)).toEqual({ rows: [], malformedLines: [{ line: 1, reason: 'invalid-json' }] });
  });
});
