/**
 * Wrap a fragment in a minimal, print-ready HTML shell if it isn't already
 * a full document. Used by PDF + DOCX adapters to ensure consistent
 * typography and page layout regardless of template style.
 */
export const wrapHtml = (content: string): string => {
  if (/^\s*(<!DOCTYPE|<html\b)/i.test(content)) return content;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:Helvetica,Arial,sans-serif;font-size:12pt;line-height:1.5;margin:0;color:#222}
    h1{font-size:20pt;margin:16pt 0 8pt}
    h2{font-size:16pt;margin:14pt 0 6pt}
    h3{font-size:14pt;margin:12pt 0 4pt}
    p{margin:0 0 8pt}
    ul,ol{margin:0 0 8pt 24pt}
    table{border-collapse:collapse;width:100%;margin:0 0 8pt}
    td,th{border:1px solid #888;padding:6pt;text-align:left;vertical-align:top}
    th{background:#f2f2f2}
  </style></head><body>${content}</body></html>`;
};
