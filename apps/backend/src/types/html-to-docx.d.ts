/**
 * `html-to-docx` ships no types. We declare the shape we use:
 * a default-exported function that takes an HTML string and returns
 * a DOCX Buffer (Node) or Blob (browser).
 */
declare module 'html-to-docx' {
  interface HtmlToDocxOptions {
    font?: string;
    fontSize?: number;
    title?: string;
    margins?: { top?: number; right?: number; bottom?: number; left?: number };
    table?: { row?: { cantSplit?: boolean } };
    [key: string]: unknown;
  }

  const htmlToDocx: (
    htmlString: string,
    headerHTMLString?: string | null,
    options?: HtmlToDocxOptions,
    footerHTMLString?: string,
  ) => Promise<Buffer | Blob>;

  export default htmlToDocx;
}
