import type { Request, Response } from 'express';
import { getAuth } from '../auth/auth.types';
import { generationJobService } from './generationJob.service';

export const jobController = {
  async getById(req: Request, res: Response) {
    const auth = getAuth(req);
    const job = await generationJobService.getById(auth.organizationId, req.params.id!);
    res.json(job);
  },
};
