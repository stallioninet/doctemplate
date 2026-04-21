import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateBody } from '../../middleware/validate';
import { requireAuth } from '../../middleware/requireAuth';
import { apiKeyController } from './apiKey.controller';
import { createApiKeySchema } from './apiKey.schema';

export const apiKeyRouter: Router = Router();

apiKeyRouter.use(requireAuth);

apiKeyRouter.post(
  '/',
  validateBody(createApiKeySchema),
  asyncHandler(apiKeyController.create),
);
apiKeyRouter.get('/', asyncHandler(apiKeyController.list));
apiKeyRouter.delete('/:id', asyncHandler(apiKeyController.revoke));
