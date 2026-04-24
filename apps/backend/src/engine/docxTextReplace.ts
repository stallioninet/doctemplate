/**
 * Find-and-replace plain text inside a .docx, surviving Word's habit of
 * splitting a single visible string across multiple `<w:r>` runs (e.g. when
 * the author retyped or re-formatted part of it).
 *
 * The replacement always lands in the FIRST affected run, so the new text
 * inherits that run's formatting. Subsequent runs in the matched range have
 * their text emptied (their `<w:r>`/`<w:rPr>` wrappers stay so paragraph
 * structure is preserved). This is the same shape docxtemplater produces
 * when it substitutes a `{{tag}}` that was split across runs.
 *
 * Operates on word/document.xml plus all header/footer parts so substitutions
 * placed in headers/footers are matched too.
 */

const BODY_PART_RE = /^word\/(document|header\d*|footer\d*)\.xml$/;

type ZipInstance = InstanceType<typeof import('pizzip')>;

const xmlEscape = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const xmlDecode = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

interface TextNode {
  fullStart: number; // index of '<w:t…>'
  fullEnd: number; // index just past '</w:t>'
  openTag: string; // the '<w:t…>' tag (with attrs)
  text: string; // decoded content
}

const indexTextNodes = (xml: string): TextNode[] => {
  const re = /(<w:t\b[^>]*>)([^<]*)(<\/w:t>)/g;
  const nodes: TextNode[] = [];
  for (const m of xml.matchAll(re)) {
    nodes.push({
      fullStart: m.index!,
      fullEnd: m.index! + m[0].length,
      openTag: m[1] ?? '<w:t>',
      text: xmlDecode(m[2] ?? ''),
    });
  }
  return nodes;
};

interface Edit {
  startInNode: number;
  endInNode: number;
  replacement: string;
}

const replaceInPart = (
  xml: string,
  search: string,
  replacement: string,
): { xml: string; matches: number } => {
  if (!search) return { xml, matches: 0 };
  const nodes = indexTextNodes(xml);
  if (nodes.length === 0) return { xml, matches: 0 };

  // Build concatenated text and per-node start offsets.
  const offsets: number[] = [];
  let combined = '';
  for (const n of nodes) {
    offsets.push(combined.length);
    combined += n.text;
  }

  // Locate every occurrence (non-overlapping).
  const matches: { start: number; end: number }[] = [];
  let from = 0;
  while (true) {
    const idx = combined.indexOf(search, from);
    if (idx === -1) break;
    matches.push({ start: idx, end: idx + search.length });
    from = idx + search.length;
  }
  if (matches.length === 0) return { xml, matches: 0 };

  // For each match, determine which nodes are affected and queue per-node edits.
  // The replacement always lands in the FIRST affected node; subsequent
  // affected nodes lose their portion of the matched range.
  const editsPerNode: Edit[][] = nodes.map(() => []);
  const findNodeIndex = (pos: number, after = false): number => {
    // Returns the node index whose [offset, offset + text.length] contains pos.
    // When `after` is true, prefer the earlier node when pos sits exactly on a boundary
    // (so a match that ends at a boundary stays in the previous node).
    for (let i = 0; i < nodes.length; i++) {
      const start = offsets[i] ?? 0;
      const end = start + nodes[i]!.text.length;
      if (after) {
        if (pos > start && pos <= end) return i;
      } else {
        if (pos >= start && pos < end) return i;
      }
    }
    return nodes.length - 1;
  };

  for (const m of matches) {
    const firstIdx = findNodeIndex(m.start, false);
    const lastIdx = findNodeIndex(m.end, true);
    const firstOff = offsets[firstIdx]!;

    if (firstIdx === lastIdx) {
      editsPerNode[firstIdx]!.push({
        startInNode: m.start - firstOff,
        endInNode: m.end - firstOff,
        replacement,
      });
      continue;
    }

    // First touched node: from match-start to end-of-node → insert replacement.
    editsPerNode[firstIdx]!.push({
      startInNode: m.start - firstOff,
      endInNode: nodes[firstIdx]!.text.length,
      replacement,
    });
    // Middle nodes: drop entirely.
    for (let i = firstIdx + 1; i < lastIdx; i++) {
      editsPerNode[i]!.push({
        startInNode: 0,
        endInNode: nodes[i]!.text.length,
        replacement: '',
      });
    }
    // Last touched node: drop from start-of-node to match-end.
    const lastOff = offsets[lastIdx]!;
    editsPerNode[lastIdx]!.push({
      startInNode: 0,
      endInNode: m.end - lastOff,
      replacement: '',
    });
  }

  // Apply per-node edits in reverse order so earlier indices remain valid.
  for (let i = 0; i < nodes.length; i++) {
    const queue = editsPerNode[i]!;
    if (queue.length === 0) continue;
    queue.sort((a, b) => b.startInNode - a.startInNode);
    let text = nodes[i]!.text;
    for (const e of queue) {
      text = text.slice(0, e.startInNode) + e.replacement + text.slice(e.endInNode);
    }
    nodes[i]!.text = text;
  }

  // Stitch the XML back together — process nodes in reverse to keep slice
  // indices valid as we replace each `<w:t>` element with its updated content.
  let out = xml;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]!;
    // xml:space="preserve" guards against Word collapsing leading/trailing
    // whitespace introduced by the replacement (e.g. "{{name}} " inserted
    // between sentences). Idempotent: safe to add even if already present
    // since we replace the whole open tag.
    const openTag = n.openTag.includes('xml:space=')
      ? n.openTag
      : n.openTag.replace(/<w:t\b/, '<w:t xml:space="preserve"');
    const inner = xmlEscape(n.text);
    out = out.slice(0, n.fullStart) + openTag + inner + '</w:t>' + out.slice(n.fullEnd);
  }
  return { xml: out, matches: matches.length };
};

export const replaceTextInDocx = async (
  docxBuffer: Buffer,
  search: string,
  replacement: string,
): Promise<{ buffer: Buffer; matches: number }> => {
  const { default: PizZip } = await import('pizzip');
  const zip: ZipInstance = new PizZip(docxBuffer);
  let totalMatches = 0;
  for (const path of Object.keys(zip.files)) {
    if (!BODY_PART_RE.test(path)) continue;
    const file = zip.file(path);
    if (!file) continue;
    const xml = file.asText();
    const result = replaceInPart(xml, search, replacement);
    if (result.matches > 0) {
      totalMatches += result.matches;
      zip.file(path, result.xml);
    }
  }
  if (totalMatches === 0) return { buffer: docxBuffer, matches: 0 };
  const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
  return { buffer: out, matches: totalMatches };
};
