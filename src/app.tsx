import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNightDetails } from './digest/reader.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestPage } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    const date = new Date(night + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== night) {
      return c.notFound();
    }

    try {
      const digest = readNightDetails(config.runsDir, night);
      return c.html(
        <Layout title={`digest · ${night}`} lane={lane()}>
          <DigestPage night={night} {...digest} />
        </Layout>,
      );
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return c.notFound();
      }
      throw error;
    }
  });

  return app;
}
