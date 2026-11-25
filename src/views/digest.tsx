import type { ReadNightResult } from '../digest/types.js';

type DigestPageProps = ReadNightResult & { night: string; failedJobs: ReadonlySet<string> };

export function DigestPage({ night, rows, malformedLines, failedJobs }: DigestPageProps) {
  return (
    <>
      <h1>digest · {night}</h1>
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table class="digest-table">
          <thead>
            <tr>
              <th scope="col">job</th>
              <th scope="col">owner</th>
              <th scope="col">runs</th>
              <th scope="col">retries</th>
              <th scope="col">last status</th>
              <th scope="col">run times</th>
              <th scope="col">errors</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr>
                <th scope="row">{row.job}</th>
                <td>{row.owner || '—'}</td>
                <td>{row.runs}</td>
                <td>{row.retries >= 3 ? <strong class="warn">{row.retries}</strong> : row.retries}</td>
                <td>
                  {row.lastStatus === 'fail' ? <strong class="warn">fail</strong> : row.lastStatus}
                  {row.lastStatus !== 'fail' && failedJobs.has(row.job) && (
                    <div><strong class="warn">earlier fail</strong></div>
                  )}
                </td>
                <td>
                  <div><span class="mute">first</span> {row.firstAt}</div>
                  <div><span class="mute">last</span> {row.lastAt}</div>
                </td>
                <td>
                  {row.errors.length === 0 ? '—' : (
                    <ul class="digest-errors">
                      {row.errors.map((error) => (
                        <li>
                          <div>{error.at} · {error.status} · line {error.line}</div>
                          <div class="digest-error-message">{error.message}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p class={malformedLines.length ? 'warn' : 'mute'}>
        {malformedLines.length} malformed {malformedLines.length === 1 ? 'line' : 'lines'}
      </p>
      {malformedLines.length > 0 && (
        <ul>
          {malformedLines.map(({ line, reason }) => <li>line {line} · {reason}</li>)}
        </ul>
      )}
    </>
  );
}
