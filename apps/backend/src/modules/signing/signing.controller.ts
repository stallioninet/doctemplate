import type { Request, Response } from 'express';
import { signingService } from './signing.service';

const tokenFrom = (req: Request): string => req.params.token!;

export const signingController = {
  async getContext(req: Request, res: Response) {
    const ctx = await signingService.getContext(
      tokenFrom(req),
      req.ip,
      req.get('User-Agent') ?? undefined,
    );
    res.json(ctx);
  },

  async downloadDocument(req: Request, res: Response) {
    await signingService.streamDocument(tokenFrom(req), res);
  },

  async downloadSignedDocument(req: Request, res: Response) {
    await signingService.streamSignedDocument(tokenFrom(req), res);
  },

  async submitField(req: Request, res: Response) {
    const field = await signingService.submitField(
      tokenFrom(req),
      req.params.fieldId!,
      req.body,
    );
    res.json({ id: field.id, value: field.value, filledAt: field.filledAt });
  },

  async complete(req: Request, res: Response) {
    const result = await signingService.complete(tokenFrom(req));
    res.json(result);
  },

  async decline(req: Request, res: Response) {
    const result = await signingService.decline(tokenFrom(req), req.body);
    res.json(result);
  },
};
