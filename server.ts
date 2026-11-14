import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiApp } from './server/app.ts';
import {
  isLiveModeEnabled,
  redactConfiguredSecrets,
  REQUIRED_CARBON_MODEL_ID,
  resolveServerHost,
  SERVER_PORT,
} from './server/config.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function assertSafeServerBindHost(rawHost = process.env.HOST): string {
  const hostCfg = resolveServerHost(rawHost);
  if (!hostCfg.isLoopback) {
    throw new Error(
      `Refusing non-loopback server bind host "${hostCfg.host}". Temporary event runtime must bind only to 127.0.0.1, localhost, or ::1.`,
    );
  }
  return hostCfg.host;
}

async function startServer() {
  const bindHost = assertSafeServerBindHost(process.env.HOST);
  const app = createApiApp();

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        res.sendFile(path.join(distDir, 'index.html'));
        return;
      }
      next();
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const liveFlag = isLiveModeEnabled() ? 'enabled' : 'disabled (set GAMMAFOLD_LIVE_MODE=true to enable)';
  app.listen(SERVER_PORT, bindHost, () => {
    console.log(
      `GammaFold Final local server listening on http://${bindHost}:${SERVER_PORT} (model: ${REQUIRED_CARBON_MODEL_ID}, liveMode: ${liveFlag})`,
    );
  });
}

if (path.resolve(process.argv[1] ?? '') === __filename) {
  startServer().catch((err) => {
    const rawMsg = err instanceof Error ? err.message : String(err);
    console.error(
      'Server startup error:',
      redactConfiguredSecrets(rawMsg, [process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL]),
    );
    process.exit(1);
  });
}
