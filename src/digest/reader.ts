import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, MalformedLine, ReadNight, RunStatus } from './types.js';

type RunRecord = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isRunRecord(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null) return false;
  return 'at' in value && typeof value.at === 'string' && Number.isFinite(Date.parse(value.at))
    && 'job' in value && typeof value.job === 'string' && value.job.trim().length > 0
    && 'status' in value && (value.status === 'ok' || value.status === 'retry' || value.status === 'fail')
    && 'owner' in value && (value.owner === null || typeof value.owner === 'string')
    && (!('error' in value) || typeof value.error === 'string');
}

function* readLines(runsDir: string, night: string): Generator<{ line: number; event: RunRecord } | MalformedLine> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) throw new Error('Invalid night');
  const lines = readFileSync(join(runsDir, night + '.jsonl'), 'utf8').split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();

  for (const [index, content] of lines.entries()) {
    const line = index + 1;
    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch {
      yield { line, reason: 'invalid-json' };
      continue;
    }
    if (isRunRecord(value)) yield { line, event: value };
    else yield { line, reason: 'invalid-record' };
  }
}

export function readNightDetails(runsDir: string, night: string) {
  const jobs = new Map<string, { row: DigestRow; lastErrorTime: number }>();
  const malformedLines: MalformedLine[] = [];
  const failedJobs = new Set<string>();

  for (const entry of readLines(runsDir, night)) {
    if ('reason' in entry) {
      malformedLines.push(entry);
      continue;
    }
    const { line, event } = entry;
    const { at, job, status, owner, error } = event;
    let group = jobs.get(job);
    if (!group) {
      group = {
        row: { job, owner, runs: 0, retries: 0, lastStatus: status, lastError: null, firstAt: at, lastAt: at, errors: [] },
        lastErrorTime: -Infinity,
      };
      jobs.set(job, group);
    }

    const { row } = group;
    const time = Date.parse(at);
    row.runs++;
    if (status === 'retry') row.retries++;
    if (status === 'fail') failedJobs.add(job);
    if (time < Date.parse(row.firstAt)) row.firstAt = at;
    if (time >= Date.parse(row.lastAt)) {
      row.lastAt = at;
      row.lastStatus = status;
      row.owner = owner;
    }
    if (error?.trim()) {
      row.errors.push({ line, at, status, message: error });
      if (time >= group.lastErrorTime) {
        group.lastErrorTime = time;
        row.lastError = error;
      }
    }
  }
  const rows = Array.from(jobs.values(), ({ row }) => row).sort((a, b) => a.job.localeCompare(b.job));
  return { rows, malformedLines, failedJobs };
}

export const readNight: ReadNight = (runsDir, night) => {
  const { rows, malformedLines } = readNightDetails(runsDir, night);
  return { rows, malformedLines };
};

export function countNightStatuses(runsDir: string, night: string): Record<RunStatus, number> {
  const counts = { ok: 0, retry: 0, fail: 0 };
  for (const entry of readLines(runsDir, night)) {
    if ('event' in entry) counts[entry.event.status]++;
  }
  return counts;
}
