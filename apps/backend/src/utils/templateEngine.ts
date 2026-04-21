/**
 * Canonical HTML template engine.
 *
 * Phase 1 scope: `{{variable}}` and `{{nested.path}}` substitution.
 * HTML is the single source of truth — every output format in Phase 2
 * (PDF / DOCX / RTF) is derived from the rendered HTML snapshot.
 */

const VARIABLE_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export class MissingVariableError extends Error {
  constructor(public readonly variable: string) {
    super(`Missing value for variable: ${variable}`);
    this.name = 'MissingVariableError';
  }
}

export interface RenderOptions {
  strict?: boolean;
  escape?: boolean;
}

export const extractVariables = (html: string): string[] => {
  const vars = new Set<string>();
  for (const match of html.matchAll(VARIABLE_RE)) {
    vars.add(match[1]!);
  }
  return [...vars];
};

export const renderTemplate = (
  html: string,
  data: Record<string, unknown>,
  options: RenderOptions = {},
): string => {
  const { strict = true, escape = true } = options;
  return html.replace(VARIABLE_RE, (_, path: string) => {
    const value = resolvePath(data, path);
    if (value === undefined || value === null) {
      if (strict) throw new MissingVariableError(path);
      return '';
    }
    const str = String(value);
    return escape ? escapeHtml(str) : str;
  });
};

const resolvePath = (data: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, data);

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
