import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { ReadNightResult } from '../src/digest/types.js';

const night = '2026-10-28';
let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
});

afterEach(() => rmSync(runsDir, { recursive: true, force: true }));

function requestDigest(date = night) {
  return Promise.all([app.request(`/digest/${date}`), app.request(`/api/digest/${date}`)]);
}

function elementContents(html: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g');
  return Array.from(html.matchAll(pattern), ([, contents]) => contents);
}

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

describe('digest routes', () => {
  it('serves the same sorted jobs, error occurrences and malformed-line diagnostics in HTML and JSON', async () => {
    const later = '2026-10-28T23:38:00+02:00';
    const earlier = '2026-10-28T22:10:00+02:00';
    const retry = { job: 'zulu/sync', owner: 'rook', status: 'retry', error: 'upstream 503' };
    const invalidJson = 'private malformed log text';
    const invalidRecord = JSON.stringify({ error: 'private malformed record data' });
    const lines = [
      JSON.stringify({ ...retry, at: later }),
      invalidJson,
      JSON.stringify({ at: earlier, job: 'alpha/backup', owner: null, status: 'fail', error: 'disk full' }),
      invalidJson,
      '',
      JSON.stringify({ ...retry, at: earlier }),
      invalidRecord,
      JSON.stringify({ at: later, job: 'bravo/verify', owner: 'rook', status: 'ok' }),
    ];
    writeFileSync(join(runsDir, `${night}.jsonl`), lines.join('\n') + '\n');

    const [pageResponse, apiResponse] = await requestDigest();
    expect(pageResponse.status).toBe(200);
    expect(apiResponse.status).toBe(200);
    expect(pageResponse.headers.get('content-type')).toMatch(/^text\/html\b/);
    expect(apiResponse.headers.get('content-type')).toMatch(/^application\/json\b/);
    const html = await pageResponse.text();
    const json = await apiResponse.text();
    const digest: ReadNightResult = JSON.parse(json);

    const jobsAndErrors = digest.rows.map(({ job, errors }) => ({ job, errors }));
    expect(jobsAndErrors).toEqual([
      { job: 'alpha/backup', errors: [{ line: 3, at: earlier, status: 'fail', message: 'disk full' }] },
      { job: 'bravo/verify', errors: [] },
      {
        job: 'zulu/sync',
        errors: [
          { line: 1, at: later, status: 'retry', message: 'upstream 503' },
          { line: 6, at: earlier, status: 'retry', message: 'upstream 503' },
        ],
      },
    ]);
    expect(digest.malformedLines).toEqual([
      { line: 2, reason: 'invalid-json' },
      { line: 4, reason: 'invalid-json' },
      { line: 5, reason: 'invalid-json' },
      { line: 7, reason: 'invalid-record' },
    ]);

    expect(elementContents(html, 'h1').map(visibleText)).toEqual([`digest · ${night}`]);
    const tableRows = elementContents(html, 'tbody').flatMap((body) => elementContents(body, 'tr'));
    const renderedJobs = tableRows.map((row) => ({
      job: visibleText(elementContents(row, 'th').join(' ')),
      errors: elementContents(row, 'li').map(visibleText),
    }));
    expect(renderedJobs).toEqual(jobsAndErrors.map(({ job, errors }) => ({
      job,
      errors: errors.map(({ at, status, line, message }) => `${at} · ${status} · line ${line} ${message}`),
    })));

    expect(elementContents(html, 'p').map(visibleText)).toContain(`${digest.malformedLines.length} malformed lines`);
    const renderedDiagnostics = elementContents(html, 'li').map(visibleText).filter((item) => /^line \d+ · /.test(item));
    expect(renderedDiagnostics).toEqual(digest.malformedLines.map(({ line, reason }) => `line ${line} · ${reason}`));
    for (const body of [html, json]) {
      expect(body).not.toContain(invalidJson);
      expect(body).not.toContain('private malformed record data');
    }
  });

  it('returns 404 for a valid night with no log file', async () => {
    const responses = await requestDigest();
    expect(responses.map(({ status }) => status)).toEqual([404, 404]);
  });

  it('returns 404 for an invalid calendar date even when a file has that name', async () => {
    const invalidNight = '2026-02-30';
    writeFileSync(join(runsDir, `${invalidNight}.jsonl`), '');
    const responses = await requestDigest(invalidNight);
    expect(responses.map(({ status }) => status)).toEqual([404, 404]);
  });

  it('serves an empty digest for an empty file', async () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), '');
    const [pageResponse, apiResponse] = await requestDigest();
    expect(pageResponse.status).toBe(200);
    expect(apiResponse.status).toBe(200);
    const html = await pageResponse.text();
    expect(elementContents(html, 'p').map(visibleText)).toEqual(['nothing ran', '0 malformed lines']);
    expect(elementContents(html, 'tbody')).toEqual([]);
    expect(await apiResponse.json()).toEqual({ rows: [], malformedLines: [] });
  });
});
