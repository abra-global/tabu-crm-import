import { Router } from 'express';
import { listProjects } from '../services/projectService.js';
import { logger } from '../logger.js';

export const projectsRouter = Router();

projectsRouter.get('/', async (req, res) => {
  try {
    const projects = await listProjects();
    res.json({ projects });
  } catch (err) {
    logger.error('routes/projects', 'Failed to load projects', { message: err.message });
    res.status(500).json({ error: err.message });
  }
});
