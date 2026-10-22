/**
 * Tool results can carry images (screenshots, read files) next to text. The
 * tool card in the frontend parses the emitted payload back into blocks, so
 * text-only results keep the plain string shape while image-bearing results
 * travel as a JSON array of blocks.
 */
interface ImageData {
  data: string;
  mimeType: string;
}

function imageBlockData(block: unknown): ImageData | null {
  if (!block || typeof block !== 'object') return null;
  const candidate = block as {
    type?: unknown;
    source?: unknown;
    data?: unknown;
    mimeType?: unknown;
  };
  if (candidate.type !== 'image') return null;
  // Anthropic wraps raster bytes in `source`; some MCP payloads put `data`
  // directly on the block.
  const source =
    candidate.source && typeof candidate.source === 'object'
      ? (candidate.source as { data?: unknown; media_type?: unknown })
      : null;
  const data = source?.data ?? candidate.data;
  const mimeType =
    (candidate.mimeType as unknown) ??
    (source?.media_type as unknown) ??
    (candidate.source && typeof candidate.source === 'object'
      ? (candidate.source as { mimeType?: unknown }).mimeType
      : undefined) ??
    'image/png';
  if (typeof data !== 'string' || data.length === 0) return null;
  return {
    data,
    mimeType:
      typeof mimeType === 'string' || typeof mimeType === 'number'
        ? String(mimeType)
        : 'image/png',
  };
}

export interface ExtractedToolResult {
  /** Plain text of the result (empty string for image-only results). */
  text: string;
  /** Raster blocks found in the result, normalized to Anthropic-style image blocks. */
  images: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }>;
  /** What should ride in the `session:tool_use` result field. */
  payload: string;
}

export function extractToolResultPayload(content: unknown): ExtractedToolResult {
  const textOf = (value: unknown): string =>
    value && typeof value === 'object' && typeof (value as { text?: unknown }).text === 'string'
      ? (value as { text: string }).text
      : '';
  if (typeof content === 'string') {
    return { text: content, images: [], payload: content };
  }
  if (!Array.isArray(content)) {
    return { text: '', images: [], payload: '' };
  }
  const images: ExtractedToolResult['images'] = [];
  const textLines: string[] = [];
  for (const block of content) {
    const raster = imageBlockData(block);
    if (raster) {
      images.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: typeof raster.mimeType === 'string' ? raster.mimeType : 'image/png',
          data: raster.data,
        },
      });
      continue;
    }
    const line = textOf(block);
    if (line) textLines.push(line);
  }
  const text = textLines.join('\n');
  // Text-only results keep the legacy plain string shape.
  const payload =
    images.length > 0
      ? JSON.stringify(
          text
            ? [
                ...images,
                ...text.split('\n').map((line) => ({ type: 'text', text: line })),
              ]
            : images
        )
      : text;
  return { text, images, payload };
}
