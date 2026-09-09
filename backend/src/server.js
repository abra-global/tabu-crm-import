import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { logger } from './logger.js';
import { projectsRouter } from './routes/projects.js';
import { uploadRouter } from './routes/upload.js';
import { importRouter } from './routes/import.js';

// Resolves to <repo-root>/frontend/dist regardless of the process's
// working directory - this file lives at backend/src/server.js, so two
// levels up is the repo root.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api/projects', projectsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/import', importRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve the built React/Vite frontend (frontend/dist) as static files, and
// fall back to index.html for any non-API GET request so client-side
// routing keeps working on refresh/direct navigation. This does not touch
// any /api/* behavior - unmatched /api/* requests still fall through to
// Express's normal 404 handling instead of getting index.html.
app.use(express.static(FRONTEND_DIST));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    next();
    return;
  }
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

// Centralized fallback error handler (e.g. multer errors).
app.use((err, req, res, next) => {
  logger.error('server', 'Unhandled error', { message: err.message });
  res.status(500).json({ error: err.message || 'שגיאת שרת פנימית' });
});

app.listen(config.port, () => {
  logger.info('server', `Backend listening on port ${config.port}`);
});
