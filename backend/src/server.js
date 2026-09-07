import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { logger } from './logger.js';
import { projectsRouter } from './routes/projects.js';
import { uploadRouter } from './routes/upload.js';
import { importRouter } from './routes/import.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api/projects', projectsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/import', importRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Centralized fallback error handler (e.g. multer errors).
app.use((err, req, res, next) => {
  logger.error('server', 'Unhandled error', { message: err.message });
  res.status(500).json({ error: err.message || 'שגיאת שרת פנימית' });
});

app.listen(config.port, () => {
  logger.info('server', `Backend listening on port ${config.port}`);
});
