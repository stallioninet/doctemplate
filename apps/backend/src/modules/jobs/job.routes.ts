import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth } from '../../middleware/requireAuth';
import { jobController } from './job.controller';

export const jobRouter: Router = Router();

jobRouter.use(requireAuth);

jobRouter.get('/:id', asyncHandler(jobController.getById));
