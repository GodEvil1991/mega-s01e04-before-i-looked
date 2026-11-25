import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('links each night to its digest and counts every valid attempt by status', async () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-status-board-'));
    try {
      const record = { at: '2026-10-28T23:30:00+02:00', job: 'sync', owner: 'rook' };
      const retry = JSON.stringify({ ...record, status: 'retry', error: 'upstream 503' });
      const lines = [
        retry,
        'invalid log entry',
        retry,
        JSON.stringify({ ...record, status: 'fail' }),
        JSON.stringify({ ...record, status: 'ok' }),
      ];
      writeFileSync(join(runsDir, '2026-10-28.jsonl'), lines.join('\n') + '\n');
      writeFileSync(join(runsDir, '2026-10-27.jsonl'), '');

      const app = createApp({ ...config, runsDir });
      const response = await app.request('/');
      expect(response.status).toBe(200);
      const html = await response.text();
      const links = Array.from(
        html.matchAll(/<li\b[^>]*>\s*<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g),
        ([, path, contents]) => ({ path, text: contents.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }),
      );
      expect(links).toEqual([
        { path: '/digest/2026-10-28', text: '2026-10-28 · ok 1 · retry 2 · fail 1' },
        { path: '/digest/2026-10-27', text: '2026-10-27 · ok 0 · retry 0 · fail 0' },
      ]);
      for (const { path } of links) {
        expect((await app.request(path)).status).toBe(200);
      }
    } finally {
      rmSync(runsDir, { recursive: true, force: true });
    }
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
