import type { Request, Response } from 'express';
import { getAuth } from '../auth/auth.types';
import { signerService } from './signer.service';

const docIdFrom = (req: Request): string => req.params.documentId!;

export const signerController = {
  async create(req: Request, res: Response) {
    const auth = getAuth(req);
    const signer = await signerService.create(auth.organizationId, docIdFrom(req), req.body);
    res.status(201).json(signer);
  },

  async list(req: Request, res: Response) {
    const auth = getAuth(req);
    const signers = await signerService.list(auth.organizationId, docIdFrom(req));
    res.json(signers);
  },

  async update(req: Request, res: Response) {
    const auth = getAuth(req);
    const signer = await signerService.update(
      auth.organizationId,
      docIdFrom(req),
      req.params.id!,
      req.body,
    );
    res.json(signer);
  },

  async remove(req: Request, res: Response) {
    const auth = getAuth(req);
    await signerService.remove(auth.organizationId, docIdFrom(req), req.params.id!);
    res.status(204).send();
  },
};
