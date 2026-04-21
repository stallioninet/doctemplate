import type { Request, Response } from 'express';
import { getAuth } from '../auth/auth.types';
import { documentService } from './document.service';

export const documentController = {
  async create(req: Request, res: Response) {
    const auth = getAuth(req);
    const doc = await documentService.create(auth.organizationId, req.body);
    res.status(201).json(doc);
  },

  async getById(req: Request, res: Response) {
    const auth = getAuth(req);
    const doc = await documentService.getById(auth.organizationId, req.params.id!);
    res.json(doc);
  },

  async list(req: Request, res: Response) {
    const auth = getAuth(req);
    const docs = await documentService.list(auth.organizationId);
    res.json(docs);
  },

  async download(req: Request, res: Response) {
    const auth = getAuth(req);
    await documentService.streamDownload(auth.organizationId, req.params.id!, res);
  },

  async downloadSigned(req: Request, res: Response) {
    const auth = getAuth(req);
    await documentService.streamSignedDownload(auth.organizationId, req.params.id!, res);
  },

  async downloadCertificate(req: Request, res: Response) {
    const auth = getAuth(req);
    await documentService.streamCertificate(auth.organizationId, req.params.id!, res);
  },

  async verifyCertificate(req: Request, res: Response) {
    const auth = getAuth(req);
    const result = await documentService.verifyCertificate(auth.organizationId, req.params.id!);
    res.json(result);
  },

  async generate(req: Request, res: Response) {
    const auth = getAuth(req);
    const job = await documentService.enqueueGeneration(auth.organizationId, req.params.id!);
    res.status(202).json(job);
  },

  async listJobs(req: Request, res: Response) {
    const auth = getAuth(req);
    const jobs = await documentService.listJobs(auth.organizationId, req.params.id!);
    res.json(jobs);
  },

  async listEvents(req: Request, res: Response) {
    const auth = getAuth(req);
    const events = await documentService.listEvents(auth.organizationId, req.params.id!);
    res.json(events);
  },

  async send(req: Request, res: Response) {
    const auth = getAuth(req);
    const result = await documentService.send(auth.organizationId, req.params.id!);
    res.status(202).json(result);
  },
};
