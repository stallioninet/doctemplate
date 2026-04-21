import type { Request, Response } from 'express';
import { getAuth } from '../auth/auth.types';
import { fieldService } from './field.service';

const docIdFrom = (req: Request): string => req.params.documentId!;

export const fieldController = {
  async create(req: Request, res: Response) {
    const auth = getAuth(req);
    const field = await fieldService.create(auth.organizationId, docIdFrom(req), req.body);
    res.status(201).json(field);
  },

  async list(req: Request, res: Response) {
    const auth = getAuth(req);
    const fields = await fieldService.list(auth.organizationId, docIdFrom(req));
    res.json(fields);
  },

  async update(req: Request, res: Response) {
    const auth = getAuth(req);
    const field = await fieldService.update(
      auth.organizationId,
      docIdFrom(req),
      req.params.id!,
      req.body,
    );
    res.json(field);
  },

  async remove(req: Request, res: Response) {
    const auth = getAuth(req);
    await fieldService.remove(auth.organizationId, docIdFrom(req), req.params.id!);
    res.status(204).send();
  },
};
