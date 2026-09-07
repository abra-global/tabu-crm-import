import { Router } from 'express';
import multer from 'multer';
import { extractTabuPdf } from '../services/tabuExtractor.js';
import { logger } from '../logger.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('יש להעלות קובץ PDF בלבד'));
      return;
    }
    cb(null, true);
  },
});

export const uploadRouter = Router();

uploadRouter.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'לא התקבל קובץ' });
    return;
  }
  try {
    const data = await extractTabuPdf(req.file.buffer);
    res.json({ data });
  } catch (err) {
    logger.error('routes/upload', 'Extraction failed', { message: err.message });
    res.status(500).json({ error: err.message });
  }
});
