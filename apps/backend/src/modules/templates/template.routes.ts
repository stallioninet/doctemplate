import { Router } from 'express';
import multer from 'multer';
import { env } from '../../config/env';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateBody } from '../../middleware/validate';
import { requireAuth } from '../../middleware/requireAuth';
import { placeholderRouter } from './placeholder.routes';
import { templateController } from './template.controller';
import { createTemplateSchema } from './template.schema';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_SIZE_BYTES },
});

export const templateRouter: Router = Router();

templateRouter.use(requireAuth);

templateRouter.post(
  '/',
  validateBody(createTemplateSchema),
  asyncHandler(templateController.create),
);
templateRouter.post(
  '/upload',
  upload.single('file'),
  asyncHandler(templateController.upload),
);
templateRouter.get('/', asyncHandler(templateController.list));
templateRouter.get('/:id', asyncHandler(templateController.getById));
templateRouter.get('/:id/file', asyncHandler(templateController.streamSourceFile));

// Nested placeholders sub-resource (req.params.templateId via mergeParams).
templateRouter.use('/:templateId/placeholders', placeholderRouter);
