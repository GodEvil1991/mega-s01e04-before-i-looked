import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { countNightStatuses, isCalendarNight } from './digest/reader.js';
import type { RunStatus } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: { night: string; counts: Record<RunStatus, number> }[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(entry.name))
      .map((entry) => entry.name.slice(0, 10))
      .filter(isCalendarNight)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).flatMap((night) => {
      try {
        return [{ night, counts: countNightStatuses(config.runsDir, night) }];
      } catch {
        // A log can become unavailable between listing and reading.
        return [];
      }
    }),
  };
}
