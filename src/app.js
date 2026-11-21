import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ScheduleService } from './services/scheduleService.js';
import { createApiRouter } from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');

/**
 * Factory function creating the configured Express application.
 */
export function createApp({ dataPath } = {}) {
  const app = express();
  const scheduleService = new ScheduleService(dataPath);

  app.disable('x-powered-by');
  app.use(express.json());

  // Mount REST API
  app.use('/api', createApiRouter(scheduleService));

  // Unmatched API endpoints return structured 404 JSON
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: 'API endpoint not found',
      path: req.originalUrl,
    });
  });

  // Serve static frontend files
  app.use(express.static(PUBLIC_DIR));

  // SPA fallback to index.html for non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  // Centralized error handler
  app.use((err, _req, res, _next) => {
    console.error('[Server Error]', err);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  });

  return app;
}
