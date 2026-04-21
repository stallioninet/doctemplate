import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateBody } from '../../middleware/validate';
import { signerController } from './signer.controller';
import { createSignerSchema, updateSignerSchema } from './signer.schema';

// mergeParams so :documentId from the parent router is visible.
export const signerRouter: Router = Router({ mergeParams: true });

signerRouter.post(
  '/',
  validateBody(createSignerSchema),
  asyncHandler(signerController.create),
);
signerRouter.get('/', asyncHandler(signerController.list));
signerRouter.patch(
  '/:id',
  validateBody(updateSignerSchema),
  asyncHandler(signerController.update),
);
signerRouter.delete('/:id', asyncHandler(signerController.remove));
