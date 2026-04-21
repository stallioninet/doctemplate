import { AppError, NotFoundError } from '../../utils/errors';
import { placeholderRepository } from './placeholder.repository';
import { templateRepository } from './template.repository';
import type {
  CreatePlaceholderInput,
  UpdatePlaceholderInput,
} from './placeholder.schema';

const ensurePdfTemplate = async (organizationId: string, templateId: string) => {
  const template = await templateRepository.findById(organizationId, templateId);
  if (!template) throw new NotFoundError('Template');
  if (template.templateMode !== 'PDF') {
    throw new AppError(
      409,
      'Placeholders are only supported on PDF-mode templates',
      'TEMPLATE_NOT_PDF',
    );
  }
  return template;
};

export const placeholderService = {
  async create(
    organizationId: string,
    templateId: string,
    input: CreatePlaceholderInput,
  ) {
    await ensurePdfTemplate(organizationId, templateId);
    return placeholderRepository.create(templateId, input);
  },

  async list(organizationId: string, templateId: string) {
    await ensurePdfTemplate(organizationId, templateId);
    return placeholderRepository.list(templateId);
  },

  async update(
    organizationId: string,
    templateId: string,
    placeholderId: string,
    input: UpdatePlaceholderInput,
  ) {
    await ensurePdfTemplate(organizationId, templateId);
    const placeholder = await placeholderRepository.findById(templateId, placeholderId);
    if (!placeholder) throw new NotFoundError('Placeholder');
    return placeholderRepository.update(placeholderId, input);
  },

  async remove(organizationId: string, templateId: string, placeholderId: string) {
    await ensurePdfTemplate(organizationId, templateId);
    const placeholder = await placeholderRepository.findById(templateId, placeholderId);
    if (!placeholder) throw new NotFoundError('Placeholder');
    await placeholderRepository.remove(placeholderId);
  },
};
