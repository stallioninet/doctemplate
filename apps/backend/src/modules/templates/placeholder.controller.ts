import type { Request, Response } from 'express';
import { getAuth } from '../auth/auth.types';
import { placeholderService } from './placeholder.service';

const tplIdFrom = (req: Request): string => req.params.templateId!;

export const placeholderController = {
  async create(req: Request, res: Response) {
    const auth = getAuth(req);
    const placeholder = await placeholderService.create(
      auth.organizationId,
      tplIdFrom(req),
      req.body,
    );
    res.status(201).json(placeholder);
  },

  async list(req: Request, res: Response) {
    const auth = getAuth(req);
    const placeholders = await placeholderService.list(auth.organizationId, tplIdFrom(req));
    res.json(placeholders);
  },

  async update(req: Request, res: Response) {
    const auth = getAuth(req);
    const placeholder = await placeholderService.update(
      auth.organizationId,
      tplIdFrom(req),
      req.params.id!,
      req.body,
    );
    res.json(placeholder);
  },

  async remove(req: Request, res: Response) {
    const auth = getAuth(req);
    await placeholderService.remove(auth.organizationId, tplIdFrom(req), req.params.id!);
    res.status(204).send();
  },
};
