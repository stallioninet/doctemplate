import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateBody } from '../../middleware/validate';
import { requireAuth } from '../../middleware/requireAuth';
import { fieldRouter } from '../fields/field.routes';
import { signerRouter } from '../signers/signer.routes';
import { documentController } from './document.controller';
import { createDocumentSchema } from './document.schema';

export const documentRouter: Router = Router();

documentRouter.use(requireAuth);

documentRouter.post(
  '/',
  validateBody(createDocumentSchema),
  asyncHandler(documentController.create),
);
documentRouter.get('/', asyncHandler(documentController.list));
documentRouter.get('/:id', asyncHandler(documentController.getById));
documentRouter.get('/:id/download', asyncHandler(documentController.download));
documentRouter.get('/:id/signed/download', asyncHandler(documentController.downloadSigned));
documentRouter.get('/:id/certificate', asyncHandler(documentController.downloadCertificate));
documentRouter.get(
  '/:id/certificate/verify',
  asyncHandler(documentController.verifyCertificate),
);
documentRouter.post('/:id/generate', asyncHandler(documentController.generate));
documentRouter.get('/:id/jobs', asyncHandler(documentController.listJobs));
documentRouter.get('/:id/events', asyncHandler(documentController.listEvents));
documentRouter.post('/:id/send', asyncHandler(documentController.send));

// Nested e-sign sub-resources (req.params.documentId via mergeParams).
documentRouter.use('/:documentId/signers', signerRouter);
documentRouter.use('/:documentId/fields', fieldRouter);
