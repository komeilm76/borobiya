import { describe, expect, it } from 'vitest';
import {
  compressImageFile,
  dataUrlBytes,
  estimateBase64Bytes,
  fitWithin,
  ImageProcessingError,
  isAcceptedImageType,
  MAX_SOURCE_BYTES,
  EFFECTIVE_TARGET_BYTES,
  QUALITY_LADDER,
  SERVER_DATA_URL_LIMIT,
  TARGET_BYTES,
  WIRE_SAFE_BYTES
} from '../src/client/utils/image.ts';

/**
 * The SOS photo path exists because the server rejects data URLs over 160,000 characters and the
 * composer must never hand one over. These tests pin the arithmetic, the rejection codes and the
 * compress-then-verify contract; the browser boundary (decode + canvas) is injected.
 */

/** A fake decoder that reports fixed dimensions. */
const decode = (width = 4000, height = 3000) => async () => ({
  width,
  height,
  source: {} as CanvasImageSource
});

/** A fake canvas whose JPEG size scales with quality — enough to exercise the ladder. */
function fakeCanvas(bytesAtQuality: (quality: number) => number) {
  return {
    canvas: () => ({
      draw() {},
      toJpeg(quality: number) {
        const bytes = bytesAtQuality(quality);
        const base64Length = Math.ceil((bytes * 4) / 3);
        return `data:image/jpeg;base64,${'A'.repeat(Math.ceil(base64Length / 4) * 4)}`;
      }
    })
  };
}

function file(type: string, size: number): File {
  return new File([new Uint8Array(size)], 'photo.jpg', { type });
}

describe('image type and size validation', () => {
  it('accepts exactly the types the pipeline can re-encode', () => {
    expect(isAcceptedImageType('image/jpeg')).toBe(true);
    expect(isAcceptedImageType('image/png')).toBe(true);
    expect(isAcceptedImageType('image/webp')).toBe(true);
    expect(isAcceptedImageType('image/gif')).toBe(false);
    expect(isAcceptedImageType('image/heic')).toBe(false);
    expect(isAcceptedImageType('application/pdf')).toBe(false);
    expect(isAcceptedImageType('')).toBe(false);
  });

  it('rejects an unsupported type before decoding', async () => {
    await expect(compressImageFile(file('image/gif', 1000), { decode: decode() })).rejects.toMatchObject({ code: 'unsupported-type' });
  });

  it('rejects an empty file', async () => {
    await expect(compressImageFile(file('image/jpeg', 0), { decode: decode() })).rejects.toMatchObject({ code: 'empty-file' });
  });

  it('rejects a source beyond the decode ceiling', async () => {
    await expect(compressImageFile(file('image/png', MAX_SOURCE_BYTES + 1), { decode: decode() })).rejects.toMatchObject({
      code: 'source-too-large'
    });
  });
});

describe('geometry and byte arithmetic', () => {
  it('fits the longest edge and preserves aspect ratio', () => {
    expect(fitWithin(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(300, 1200, 1280)).toEqual({ width: 300, height: 1200 });
    expect(fitWithin(100, 100, 1280)).toEqual({ width: 100, height: 100 });
  });

  it('refuses dimensions it cannot work with', () => {
    expect(() => fitWithin(0, 100, 1280)).toThrow(ImageProcessingError);
    expect(() => fitWithin(NaN, 100, 1280)).toThrow(ImageProcessingError);
  });

  it('counts decoded base64 bytes, padding included', () => {
    expect(estimateBase64Bytes('AAAA')).toBe(3);
    expect(estimateBase64Bytes('AAA=')).toBe(2);
    expect(estimateBase64Bytes('AA==')).toBe(1);
    expect(dataUrlBytes('data:image/jpeg;base64,AAAA')).toBe(3);
    expect(dataUrlBytes('not-a-data-url')).toBe(0);
  });
});

describe('compression contract', () => {
  it('walks the quality ladder until the payload fits the target', async () => {
    const { canvas } = fakeCanvas((quality) => (quality >= 0.8 ? EFFECTIVE_TARGET_BYTES + 5 : EFFECTIVE_TARGET_BYTES - 1000));
    const result = await compressImageFile(file('image/jpeg', 9_000_000), { decode: decode(), canvas });
    expect(result.quality).toBe(0.6);
    expect(result.bytes).toBeLessThanOrEqual(EFFECTIVE_TARGET_BYTES);
    expect(result.dataUrl).toMatch(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/);
    expect(result.dataUrl.length).toBeLessThanOrEqual(SERVER_DATA_URL_LIMIT);
  });

  it('shrinks the edge when even the worst quality overshoots', async () => {
    // Payload scales with edge and quality; only the 0.55-edge, bottom-ladder pass fits.
    const canvas = (width: number) => {
      const edgeFactor = width / 1280;
      return {
        draw() {},
        toJpeg(quality: number) {
          const qualityFactor = quality >= 0.8 ? 1.6 : quality >= 0.6 ? 1.3 : quality >= 0.45 ? 1.05 : 0.8;
          const bytes = Math.round(TARGET_BYTES * 1.6 * edgeFactor * qualityFactor);
          const base64Length = Math.ceil((bytes * 4) / 3);
          return `data:image/jpeg;base64,${'A'.repeat(base64Length - (base64Length % 4))}`;
        }
      };
    };
    const result = await compressImageFile(file('image/jpeg', 9_000_000), { decode: decode(), canvas });
    expect(result.bytes).toBeLessThanOrEqual(EFFECTIVE_TARGET_BYTES);
    expect(result.quality).toBe(0.3);
    expect(result.width).toBe(Math.round(1280 * 0.55));
  });

  it('fails loudly when no edge/quality combination fits', async () => {
    const { canvas } = fakeCanvas(() => TARGET_BYTES * 10);
    await expect(compressImageFile(file('image/jpeg', 9_000_000), { decode: decode(), canvas })).rejects.toMatchObject({
      code: 'too-large'
    });
  });
});
