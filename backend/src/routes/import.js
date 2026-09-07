import { Router } from 'express';
import { runImport } from '../services/importService.js';
import { logger } from '../logger.js';

export const importRouter = Router();

importRouter.post('/', async (req, res) => {
  const { projectId, subParcels, separateAccountPerResident } = req.body || {};

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const emit = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    await runImport({ projectId, subParcels, separateAccountPerResident: Boolean(separateAccountPerResident) }, emit);
  } catch (err) {
    logger.error('routes/import', 'Fatal import error', { message: err.message });
    emit({ type: 'fatal_error', message: err.message });
  } finally {
    res.end();
  }
});
