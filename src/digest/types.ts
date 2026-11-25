export type RunStatus = 'ok' | 'retry' | 'fail';

export type ErrorOccurrence = {
  line: number;
  at: string;
  status: RunStatus;
  message: string;
};

export type MalformedLine = {
  line: number;
  reason: 'invalid-json' | 'invalid-record';
};

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
  errors: ErrorOccurrence[];
};

export type ReadNightResult = {
  rows: DigestRow[];
  malformedLines: MalformedLine[];
};

export type ReadNight = (runsDir: string, night: string) => ReadNightResult;
