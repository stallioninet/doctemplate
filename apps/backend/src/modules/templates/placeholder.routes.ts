import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateBody } from '../../middleware/validate';
import { placeholderController } from './placeholder.controller';
import {
  createPlaceholderSchema,
  updatePlaceholderSchema,
} from './placeholder.schema';

export const placeholderRouter: Router = Router({ mergeParams: true });

placeholderRouter.post(
  '/',
  validateBody(createPlaceholderSchema),
  asyncHandler(placeholderController.create),
);
placeholderRouter.get('/', asyncHandler(placeholderController.list));
placeholderRouter.patch(
  '/:id',
  validateBody(updatePlaceholderSchema),
  asyncHandler(placeholderController.update),
);
placeholderRouter.delete('/:id', asyncHandler(placeholderController.remove));
