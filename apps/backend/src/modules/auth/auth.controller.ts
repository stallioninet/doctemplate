import type { Request, Response } from 'express';
import { authService } from './auth.service';
import { getAuth } from './auth.types';

export const authController = {
  async register(req: Request, res: Response) {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  },

  async login(req: Request, res: Response) {
    const result = await authService.login(req.body);
    res.json(result);
  },

  async me(req: Request, res: Response) {
    const auth = getAuth(req);
    const me = await authService.me(auth.userId!);
    res.json(me);
  },
};
