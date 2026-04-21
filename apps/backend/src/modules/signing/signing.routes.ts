import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateBody } from '../../middleware/validate';
import { signingController } from './signing.controller';
import { declineSchema, submitFieldSchema } from './signing.schema';

/**
 * Public surface — authentication is the per-signer access token in the URL.
 * No JWT or API key required.
 */
export const signingRouter: Router = Router();

signingRouter.get('/:token', asyncHandler(signingController.getContext));
signingRouter.get('/:token/document', asyncHandler(signingController.downloadDocument));
signingRouter.get('/:token/signed', asyncHandler(signingController.downloadSignedDocument));
signingRouter.post(
  '/:token/fields/:fieldId',
  validateBody(submitFieldSchema),
  asyncHandler(signingController.submitField),
);
signingRouter.post('/:token/complete', asyncHandler(signingController.complete));
signingRouter.post(
  '/:token/decline',
  validateBody(declineSchema),
  asyncHandler(signingController.decline),
);
