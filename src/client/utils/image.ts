/**
 * Client-side image validation and compression for SOS photo upload.
 *
 * The server caps a photo data URL at 160,000 base64 characters (~120 KB of payload) and rejects
 * everything else with a bare "Invalid request." — and a raw camera frame data URL is routinely
 * several megabytes. Every upload therefore passes through here: decode, downscale to a bounded
 * edge, re-encode as JPEG and verify the result actually fits the wire format the server accepts.
 *
 * Everything except the thin browser boundary (decode + canvas) is a pure, exported helper so the
 * behaviour is testable without a real image pipeline.
 */

/** The largest decoded source file the composer will even attempt to read. */
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
/** The longest edge of the compressed image, in pixels. */
export const MAX_DIMENSION = 1280;
/** The design target for the compressed JPEG, in bytes of decoded payload. */
export const TARGET_BYTES = 128 * 1024;
/**
 * The server's data-url character limit. Re-declared here because this module must stay
 * dependency-free; it is pinned against the server validator by a contract test.
 */
export const SERVER_DATA_URL_LIMIT = 160000;
/** Prefix the canvas emits for a JPEG data URL. */
const JPEG_DATA_URL_PREFIX = 'data:image/jpeg;base64,';
/**
 * Largest decoded payload the server's 160,000-character data-url cap can carry after the
 * 4/3 base64 expansion and the prefix. This is the wall the encoder must respect: a full
 * 128 KB photo base64-inflates past the cap, so the effective ceiling sits below it.
 */
export const WIRE_SAFE_BYTES = Math.floor(((SERVER_DATA_URL_LIMIT - JPEG_DATA_URL_PREFIX.length) * 3) / 4) - 1;
/** The target the ladder actually enforces: the tighter of the design target and the wire cap. */
export const EFFECTIVE_TARGET_BYTES = Math.min(TARGET_BYTES, WIRE_SAFE_BYTES);

/** MIME types the browser may hand us; anything else is rejected before decode. */
export const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Why an image was rejected, in a form the view can translate. */
export type ImageErrorCode =
  | 'unsupported-type'
  | 'empty-file'
  | 'source-too-large'
  | 'decode-failed'
  | 'canvas-unavailable'
  | 'too-large';

/** An error with a stable machine-readable code. */
export class ImageProcessingError extends Error {
  readonly code: ImageErrorCode;
  constructor(code: ImageErrorCode, message: string) {
    super(message);
    this.name = 'ImageProcessingError';
    this.code = code;
  }
}

/** Decodes a file to bitmap-like dimensions. Injected so tests can run without a real decoder. */
export type ImageDecoder = (file: File) => Promise<{ width: number; height: number; source: CanvasImageSource }>;

/** The subset of canvas 2D operations the compressor needs. Injected for the same reason. */
export type CanvasFactory = (width: number, height: number) => {
  draw: (source: CanvasImageSource, width: number, height: number) => void;
  toJpeg: (quality: number) => string;
};

/** The compressed result, ready to attach to the SOS draft. */
export interface CompressionResult {
  dataUrl: string;
  width: number;
  height: number;
  quality: number;
  /** Decoded payload size in bytes, not the length of the data URL. */
  bytes: number;
}

/** True when the browser handed us a type the pipeline can handle. */
export function isAcceptedImageType(type: string): boolean {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(type);
}

/** Scales dimensions to fit a bounding square, preserving aspect ratio. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new ImageProcessingError('decode-failed', 'The image has no readable dimensions.');
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Decoded bytes carried by a base64 payload, padding included in the estimate. */
export function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/** Decoded bytes carried by a `data:…;base64,…` URL. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  return comma === -1 ? 0 : estimateBase64Bytes(dataUrl.slice(comma + 1));
}

/** The JPEG re-encode ladder, best quality first. */
export const QUALITY_LADDER = [0.8, 0.6, 0.45, 0.3] as const;

const DATA_URL_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

/** Default decoder: `createImageBitmap`, falling back to an `<img>` element. */
const defaultDecode: ImageDecoder = async (file) => {
  if (typeof createImageBitmap === 'function') {
    try {
      // `from-image` honours EXIF orientation on decode, so a rotated camera frame is not
      // handed to the canvas sideways; it is also what the <img> fallback path implies.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { width: bitmap.width, height: bitmap.height, source: bitmap };
    } catch {
      throw new ImageProcessingError('decode-failed', 'The image could not be decoded.');
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight, source: image });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageProcessingError('decode-failed', 'The image could not be decoded.'));
    };
    image.src = url;
  });
};

/** Default canvas factory backed by `document.createElement`. */
const defaultCanvas: CanvasFactory = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new ImageProcessingError('canvas-unavailable', 'This browser cannot process images.');
  return {
    draw(source, drawWidth, drawHeight) {
      context.drawImage(source, 0, 0, drawWidth, drawHeight);
    },
    toJpeg(quality) {
      return canvas.toDataURL('image/jpeg', quality);
    }
  };
};

/**
 * Validates, decodes, downscales and re-encodes an image file for the SOS upload.
 *
 * @param file The file the user picked.
 * @param deps Injectable decode/canvas for tests.
 * @returns The compressed JPEG data URL and its geometry.
 * @throws {ImageProcessingError} With a stable `code` when the file cannot be used.
 */
export async function compressImageFile(
  file: File,
  deps: { decode?: ImageDecoder; canvas?: CanvasFactory } = {}
): Promise<CompressionResult> {
  if (!isAcceptedImageType(file.type)) throw new ImageProcessingError('unsupported-type', `Unsupported image type: ${file.type || 'unknown'}.`);
  if (file.size === 0) throw new ImageProcessingError('empty-file', 'The selected file is empty.');
  if (file.size > MAX_SOURCE_BYTES) throw new ImageProcessingError('source-too-large', 'The selected image is too large to process.');

  const decode = deps.decode ?? defaultDecode;
  const canvas = deps.canvas ?? defaultCanvas;
  const bitmap = await decode(file);
  // Camera frames hold tens of megabytes of decoded pixel data; the GPU-backed bitmap has to
  // be released explicitly once the draws are done or mobile tabs accumulate them until reload.
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_DIMENSION);

    // Try the fitted size first; if every quality still overshoots the target, shrink the edge
    // once more before giving up. Two rounds is enough for a phone camera frame.
    for (const edgeScale of [1, 0.75, 0.55]) {
      const w = Math.max(1, Math.round(width * edgeScale));
      const h = Math.max(1, Math.round(height * edgeScale));
      const surface = canvas(w, h);
      surface.draw(bitmap.source, w, h);
      for (const quality of QUALITY_LADDER) {
        const dataUrl = surface.toJpeg(quality);
        const bytes = dataUrlBytes(dataUrl);
        if (bytes <= EFFECTIVE_TARGET_BYTES && DATA_URL_PATTERN.test(dataUrl) && dataUrl.length <= SERVER_DATA_URL_LIMIT) {
          return { dataUrl, width: w, height: h, quality, bytes };
        }
      }
    }
    throw new ImageProcessingError('too-large', 'The image could not be compressed below the upload limit.');
  } finally {
    const closeable = bitmap.source as { close?: () => void };
    closeable.close?.();
  }
}
