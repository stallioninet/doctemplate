import type { Request, Response } from 'express';
import { getAuth } from '../auth/auth.types';
import { apiKeyService } from './apiKey.service';

export const apiKeyController = {
  async create(req: Request, res: Response) {
    const auth = getAuth(req);
    const result = await apiKeyService.create(auth.organizationId, req.body);
    res.status(201).json(result);
  },

  async list(req: Request, res: Response) {
    const auth = getAuth(req);
    const keys = await apiKeyService.list(auth.organizationId);
    res.json(keys);
  },

  async revoke(req: Request, res: Response) {
    const auth = getAuth(req);
    await apiKeyService.revoke(req.params.id!, auth.organizationId);
    res.status(204).send();
  },
};
