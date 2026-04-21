import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateBody } from '../../middleware/validate';
import { requireApiKey } from '../../middleware/apiKey';
import { env } from '../../config/env';
import { ingestionController } from './ingestion.controller';
import { createDocumentSchema } from './ingestion.schema';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_SIZE_BYTES },
});

export const ingestionRouter: Router = Router();

ingestionRouter.use(asyncHandler(requireApiKey));

ingestionRouter.post(
  '/templates',
  upload.single('file'),
  asyncHandler(ingestionController.registerTemplate),
);

ingestionRouter.post(
  '/documents',
  validateBody(createDocumentSchema),
  asyncHandler(ingestionController.createDocument),
);

ingestionRouter.get('/documents/:id', asyncHandler(ingestionController.getDocumentStatus));
