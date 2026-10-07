import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { pool } from './db/index.js';
import { migrate } from './db/migrate.js';
import { bootstrap } from './db/seed.js';
import { authenticate, csrfGuard, enforce2fa } from './lib/auth.js';
import { HttpError } from './lib/http.js';
import { getPublicSettings } from './lib/settings.js';
import authRoutes from './routes/auth.js';
import spaceRoutes from './routes/spaces.js';
import pageRoutes from './routes/pages.js';
import searchRoutes from './routes/search.js';
import tagRoutes from './routes/tags.js';
import attachmentRoutes from './routes/attachments.js';
import templateRoutes from './routes/templates.js';
import adminRoutes from './routes/admin.js';
import importRoutes from './routes/imports.js';
import integrationRoutes from './routes/integrations.js';
import secretRoutes from './routes/secrets.js';
import activityRoutes from './routes/activity.js';
import runRoutes from './routes/runs.js';
import inventoryRoutes from './routes/inventory.js';
import shareRoutes, { publicRouter as publicShareRoutes } from './routes/shares.js';
import operationsRoutes from './routes/operations.js';
import pagePermissionRoutes from './routes/pagePermissions.js';
import trashRoutes from './routes/trash.js';
import commentRoutes from './routes/comments.js';
import schemaRoutes from './routes/schemas.js';
import snippetRoutes from './routes/snippets.js';
import approvalRoutes from './routes/approvals.js';
import handbookRoutes from './routes/handbook.js';
import { ensureLinkIndex } from './lib/links.js';
import { startScheduler } from './lib/scheduler.js';
import { metricsMiddleware, renderMetrics } from './lib/metrics.js';
import { recoverJobs } from './importers/jobs.js';
import { initCrypto } from './lib/crypto.js';

const app = express();
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'worker-src': ["'self'"],
        'manifest-src': ["'self'"],
        'upgrade-insecure-requests': config.cookieSecure ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.cookieSecure,
  }),
);
app.use(metricsMiddleware);
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

// ------------------------------------------------------------------ API
const api = express.Router();
api.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'db-unavailable' });
  }
});
api.use(authenticate);
api.use(csrfGuard);
api.use(enforce2fa);
api.get('/settings/public', async (_req, res) => res.json({ settings: await getPublicSettings() }));
api.use(publicShareRoutes);
api.use(authRoutes);
api.use(activityRoutes);
api.use(secretRoutes);
api.use(inventoryRoutes);
api.use(shareRoutes);
api.use(pagePermissionRoutes);
api.use(trashRoutes);
api.use(commentRoutes);
api.use(schemaRoutes);
api.use(snippetRoutes);
api.use(approvalRoutes);
api.use(handbookRoutes);
api.use(spaceRoutes);
api.use(pageRoutes);
api.use(searchRoutes);
api.use(tagRoutes);
api.use(attachmentRoutes);
api.use(templateRoutes);
api.use(importRoutes);
api.use(integrationRoutes);
api.use(operationsRoutes);
api.use(runRoutes);
api.use(adminRoutes);
api.use((_req, _res, next) => next(new HttpError(404, 'API-Endpunkt nicht gefunden')));
api.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(`[api] ${req.method} ${req.originalUrl}`, err);
  res.status(status).json({
    error: status >= 500 ? 'Interner Serverfehler' : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
});
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
}, api);

// ------------------------------------------------------------------ Prometheus
// Bearer METRICS_TOKEN, or an admin session / admin API token
app.get('/metrics', authenticate, async (req, res, next) => {
  try {
    const token = process.env.METRICS_TOKEN;
    const bearer = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const [got, want] = [Buffer.from(bearer), Buffer.from(token || '')];
    const tokenOk = Boolean(token) && got.length === want.length && crypto.timingSafeEqual(got, want);
    if (!tokenOk && req.user?.role !== 'admin') {
      res.setHeader('WWW-Authenticate', 'Bearer');
      return res.status(401).type('text/plain').send('unauthorized\n');
    }
    res.type('text/plain; version=0.0.4').send(await renderMetrics());
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------ PWA manifest (reflects branding settings)
app.get('/manifest.webmanifest', async (_req, res) => {
  const s = await getPublicSettings();
  res.type('application/manifest+json').send({
    name: `${s.siteName} Wiki`,
    short_name: s.siteName,
    description: s.tagline,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#24292c',
    theme_color: s.accentColor || '#2b3135',
    lang: 'de',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
    shortcuts: [
      { name: 'Suche', url: '/search', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Neue Seite', url: '/new', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  });
});

// ------------------------------------------------------------------ SPA
if (fs.existsSync(config.publicDir)) {
  app.get('/sw.js', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile(path.join(config.publicDir, 'sw.js'));
  });
  app.use(
    express.static(config.publicDir, {
      index: false,
      setHeaders(res, file) {
        if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );
  const indexHtml = path.join(config.publicDir, 'index.html');
  app.get(/.*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
} else {
  console.warn(`[web] ${config.publicDir} not found – serving API only`);
}

async function main() {
  initCrypto();
  await migrate();
  await bootstrap();
  await recoverJobs();
  await ensureLinkIndex();
  startScheduler();
  const server = app.listen(config.port, () => console.log(`[web] Bastion läuft auf http://0.0.0.0:${config.port}`));
  const shutdown = () => {
    console.log('[web] shutting down');
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
