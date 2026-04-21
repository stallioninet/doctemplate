import type { Request, Response } from 'express';
import { ValidationError } from '../../utils/errors';
import { getAuth } from '../auth/auth.types';
import { uploadTemplateSchema } from './template.schema';
import { templateService } from './template.service';

export const templateController = {
  async create(req: Request, res: Response) {
    const auth = getAuth(req);
    const template = await templateService.create(auth.organizationId, req.body);
    res.status(201).json(template);
  },

  async upload(req: Request, res: Response) {
    const auth = getAuth(req);
    const file = req.file;
    if (!file) throw new ValidationError('Missing `file` field');

    const parsed = uploadTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid form fields', parsed.error.issues);
    }

    const template = await templateService.createUploaded(
      auth.organizationId,
      parsed.data,
      { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
    );
    res.status(201).json(template);
  },

  async getById(req: Request, res: Response) {
    const auth = getAuth(req);
    const template = await templateService.getById(auth.organizationId, req.params.id!);
    res.json(template);
  },

  async streamSourceFile(req: Request, res: Response) {
    const auth = getAuth(req);
    await templateService.streamSourceFile(auth.organizationId, req.params.id!, res);
  },

  async list(req: Request, res: Response) {
    const auth = getAuth(req);
    const templates = await templateService.list(auth.organizationId);
    res.json(templates);
  },
};
