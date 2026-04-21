import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateBody } from '../../middleware/validate';
import { fieldController } from './field.controller';
import { createFieldSchema, updateFieldSchema } from './field.schema';

export const fieldRouter: Router = Router({ mergeParams: true });

fieldRouter.post(
  '/',
  validateBody(createFieldSchema),
  asyncHandler(fieldController.create),
);
fieldRouter.get('/', asyncHandler(fieldController.list));
fieldRouter.patch(
  '/:id',
  validateBody(updateFieldSchema),
  asyncHandler(fieldController.update),
);
fieldRouter.delete('/:id', asyncHandler(fieldController.remove));
