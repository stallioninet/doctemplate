/**
 * Word bookmark substitution for the high-fidelity DOCX path.
 *
 * Word bookmarks are named ranges authored in MS Word via Insert → Bookmark.
 * They round-trip cleanly through `.docx` as paired
 *   <w:bookmarkStart w:name="…" w:id="N"/> … <w:bookmarkEnd w:id="N"/>
 * markers in the OOXML, optionally spanning runs and paragraphs.
 *
 * `extractBookmarkNames` lists user-defined bookmark names (skipping Word's
 * underscore-prefixed system bookmarks like `_GoBack`, `_Toc…`).
 *
 * `fillDocxBookmarks` replaces the contents of each named bookmark with a
 * single text run carrying the supplied value — collapsing any markup that
 * sat inside the bookmark range. Operates on word/document.xml plus all
 * header/footer parts so values placed in headers/footers also substitute.
 */

const isUserBookmark = (name: string): boolean => Boolean(name) && !name.startsWith('_');

const xmlEscape = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

interface BodyPart {
  path: string;
  xml: string;
}

const BODY_PART_RE = /^word\/(document|header\d*|footer\d*)\.xml$/;

type ZipInstance = InstanceType<typeof import('pizzip')>;

const loadBodyParts = async (
  docxBuffer: Buffer,
): Promise<{ zip: ZipInstance; parts: BodyPart[] }> => {
  const { default: PizZip } = await import('pizzip');
  const zip = new PizZip(docxBuffer);
  const parts: BodyPart[] = [];
  for (const path of Object.keys(zip.files)) {
    if (!BODY_PART_RE.test(path)) continue;
    const file = zip.file(path);
    if (!file) continue;
    parts.push({ path, xml: file.asText() });
  }
  return { zip, parts };
};

export const extractBookmarkNames = async (docxBuffer: Buffer): Promise<string[]> => {
  const { parts } = await loadBodyParts(docxBuffer);
  const names = new Set<string>();
  // w:name and w:id can appear in any attribute order, so match the start
  // tag and pull `w:name` out of its attribute string.
  const startTagRe = /<w:bookmarkStart\b([^/>]*?)\/>/g;
  const nameAttrRe = /\sw:name="([^"]+)"/;
  for (const { xml } of parts) {
    for (const m of xml.matchAll(startTagRe)) {
      const attrs = m[1] ?? '';
      const nm = nameAttrRe.exec(attrs);
      const name = nm?.[1];
      if (name && isUserBookmark(name)) names.add(name);
    }
  }
  return Array.from(names).sort();
};

/**
 * Scan visible text for `{{var}}` markers. We extract just the text content
 * of every `<w:t>` run and concatenate per body part — Word may split a single
 * `{{var}}` across multiple runs (when the author retyped or formatted part
 * of it), so per-run scanning misses some markers. Concatenation recovers
 * those, which matches docxtemplater's own behavior.
 */
export const extractTemplateTags = async (docxBuffer: Buffer): Promise<string[]> => {
  const { parts } = await loadBodyParts(docxBuffer);
  const names = new Set<string>();
  const tagRe = /\{\{\s*([A-Za-z_][A-Za-z0-9_.\-]*)\s*\}\}/g;
  const textRunRe = /<w:t\b[^>]*>([^<]*)<\/w:t>/g;
  for (const { xml } of parts) {
    let combined = '';
    for (const m of xml.matchAll(textRunRe)) combined += m[1] ?? '';
    for (const tm of combined.matchAll(tagRe)) {
      const name = tm[1];
      if (name) names.add(name);
    }
  }
  return Array.from(names).sort();
};

interface BookmarkRange {
  name: string;
  startOuterStart: number; // index of '<' for <w:bookmarkStart…/>
  startOuterEnd: number; // index just past '/>' of <w:bookmarkStart…/>
  endOuterStart: number; // index of '<' for <w:bookmarkEnd…/>
  endOuterEnd: number; // index just past '/>' of <w:bookmarkEnd…/>
}

const indexBookmarks = (xml: string): BookmarkRange[] => {
  // Walk the XML and pair start/end by w:id.
  const startRe = /<w:bookmarkStart\b([^/>]*?)\/>/g;
  const endRe = /<w:bookmarkEnd\b([^/>]*?)\/>/g;
  const idAttrRe = /\sw:id="([^"]+)"/;
  const nameAttrRe = /\sw:name="([^"]+)"/;

  const starts = new Map<string, { name: string; outerStart: number; outerEnd: number }>();
  for (const m of xml.matchAll(startRe)) {
    const attrs = m[1] ?? '';
    const id = idAttrRe.exec(attrs)?.[1];
    const name = nameAttrRe.exec(attrs)?.[1];
    if (!id || !name || !isUserBookmark(name)) continue;
    starts.set(id, {
      name,
      outerStart: m.index!,
      outerEnd: m.index! + m[0].length,
    });
  }

  const ranges: BookmarkRange[] = [];
  for (const m of xml.matchAll(endRe)) {
    const attrs = m[1] ?? '';
    const id = idAttrRe.exec(attrs)?.[1];
    if (!id) continue;
    const start = starts.get(id);
    if (!start) continue;
    const endOuterStart = m.index!;
    const endOuterEnd = m.index! + m[0].length;
    if (endOuterStart < start.outerEnd) continue; // malformed/inverted
    ranges.push({
      name: start.name,
      startOuterStart: start.outerStart,
      startOuterEnd: start.outerEnd,
      endOuterStart,
      endOuterEnd,
    });
  }
  // Process from the end of the document forward so earlier indices stay valid
  // as we splice.
  return ranges.sort((a, b) => b.startOuterStart - a.startOuterStart);
};

const replaceBookmarkContent = (
  xml: string,
  range: BookmarkRange,
  value: string,
): string => {
  // Replace the full bookmark (start tag + interior + end tag) with a fresh
  // start tag, a single value-bearing run, then the matching end tag. We
  // preserve the original tags verbatim so id/name attributes stay intact —
  // they're the source of truth for bookmark identity.
  const startTag = xml.slice(range.startOuterStart, range.startOuterEnd);
  const endTag = xml.slice(range.endOuterStart, range.endOuterEnd);
  const newRun = `<w:r><w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r>`;
  return (
    xml.slice(0, range.startOuterStart) +
    startTag +
    newRun +
    endTag +
    xml.slice(range.endOuterEnd)
  );
};

const substituteInPart = (xml: string, values: Record<string, unknown>): string => {
  const ranges = indexBookmarks(xml); // already sorted descending
  let out = xml;
  for (const r of ranges) {
    if (!(r.name in values)) continue;
    const raw = values[r.name];
    const text = raw == null ? '' : String(raw);
    out = replaceBookmarkContent(out, r, text);
  }
  return out;
};

export const fillDocxBookmarks = async (
  docxBuffer: Buffer,
  values: Record<string, unknown>,
): Promise<Buffer> => {
  if (Object.keys(values).length === 0) return docxBuffer;
  const { zip, parts } = await loadBodyParts(docxBuffer);
  for (const part of parts) {
    const updated = substituteInPart(part.xml, values);
    if (updated !== part.xml) zip.file(part.path, updated);
  }
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
};

