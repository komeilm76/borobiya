import { ALLOWED_SOS_PHOTO_MIME_TYPES, MAX_SOS_PHOTO_BYTES, type SosPhotoMimeType } from "@borobiya/shared";

/**
 * What the bytes of an uploaded photo actually are.
 *
 * `docs/SECURITY.md` §9 asks for magic-byte validation "not just extension", and names `file-type` as the
 * means. This module is that validation, written here instead of depending on the package for two reasons
 * worth recording: the three accepted formats have short, well-known headers that fit in a page of code,
 * and the checks below are *stricter* than a header sniff. `file-type` would accept a 40-byte file that
 * begins with a PNG signature; this refuses it, because a truncated image is exactly what a partial
 * upload, a filtered camera export, or a hand-crafted disguise looks like — and an SOS photo is evidence
 * that somebody is going to read under pressure.
 */
export type PhotoFormat = {
  mime: SosPhotoMimeType;
  extension: (typeof PHOTO_EXTENSIONS)[SosPhotoMimeType];
};

export type PhotoRejectionCode = "empty" | "too_large" | "unsupported_format" | "truncated";

export type PhotoSniff =
  | ({ status: "ok"; byteLength: number } & PhotoFormat)
  | { status: "rejected"; code: PhotoRejectionCode; message: string };

const PHOTO_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
} as const;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** The `IEND` chunk and its CRC — the last 12 bytes of every complete PNG. */
const PNG_TERMINATOR = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
const JPEG_START = [0xff, 0xd8, 0xff];
const JPEG_TERMINATOR = [0xff, 0xd9];
/** A file named something else whose bytes start with a signature the user would recognize. */
const DISGUISES: Array<{ label: string; bytes: number[] }> = [
  { label: "a GIF image", bytes: [0x47, 0x49, 0x46, 0x38] },
  { label: "a BMP image", bytes: [0x42, 0x4d] },
  { label: "a TIFF image", bytes: [0x49, 0x49, 0x2a, 0x00] },
  { label: "a TIFF image", bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { label: "a ZIP archive", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { label: "a PDF document", bytes: [0x25, 0x50, 0x44, 0x46] },
  { label: "an AVI/RIFF container", bytes: [0x52, 0x49, 0x46, 0x46] },
  { label: "markup", bytes: [0x3c, 0x3f, 0x78, 0x6d, 0x6c] },
  { label: "markup", bytes: [0x3c, 0x73, 0x76, 0x67] },
  { label: "HTML", bytes: [0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45] }
];

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0) {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/** Bytes in the unit a person reads an upload limit in — never a raw byte count in a refusal. */
export function megabytesLabel(byteLength: number) {
  const MB = 1024 * 1024;
  const size = byteLength / MB;
  // Human units, and only as precise as the number needs: "5 MB" reads better in an error than
  // "5.24288 MB" or "5242880 bytes" when the rule the caller broke is "the limit is 5 MB".
  const rounded = Math.round(size * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)} MB`;
}

/** Names the format the bytes really start with, so a refusal can say what arrived instead of "no". */
function describeDisguise(bytes: Uint8Array) {
  // `<!doctype`/`<?xml` are case-insensitive in the wild, and `data:image/png;base64,` is the other
  // common way a client ends up posting text where an image belongs.
  const head = String.fromCharCode(...bytes.slice(0, 12)).toLowerCase();
  for (const disguise of DISGUISES) {
    const matched = disguise.bytes.every((byte, index) => bytes[index] === byte);
    if (matched) return disguise.label;
  }
  if (head.startsWith("<svg") || head.startsWith("<html") || head.startsWith("<?xml")) return "markup";
  if (head.startsWith("data:")) return "a data URL, which has to be decoded before it is uploaded";
  return null;
}

function eightByteLengthAt(bytes: Uint8Array, offset: number) {
  // `?? 0` because the caller only reaches this after the header matched, so the bytes exist; the
  // guard is for the type checker rather than for a case that can happen.
  return (
    (bytes[offset] ?? 0) + (bytes[offset + 1] ?? 0) * 2 ** 8 + (bytes[offset + 2] ?? 0) * 2 ** 16 + (bytes[offset + 3] ?? 0) * 2 ** 24
  );
}

/**
 * Identifies the payload by its bytes and returns the format the storage layer may use for the file
 * name and the `Content-Type` of a later read. The caller's declared MIME type and file name are never
 * consulted: both are attacker- or bug-controlled, and the only reason `image/png` appears in the
 * accept list is so a client can label what it is sending, not to tell the server what it received.
 */
export function sniffSosPhoto(bytes: Uint8Array, maxBytes: number = MAX_SOS_PHOTO_BYTES): PhotoSniff {
  if (bytes.byteLength === 0) {
    return {
      status: "rejected",
      code: "empty",
      message: "The uploaded file has no bytes. Take the photo again, or send the request without one."
    };
  }
  if (bytes.byteLength > maxBytes) {
    // The configured limit is quoted back, not the constant: an operator who set 2 MB has to be able to
    // read the number that will actually free them, and a client cannot infer it from the docs.
    return {
      status: "rejected",
      code: "too_large",
      message: `A photo must be ${megabytesLabel(maxBytes)} or smaller; this one is ${megabytesLabel(bytes.byteLength)}.`
    };
  }

  const formats: Array<{ mime: SosPhotoMimeType; matches: () => boolean; complete: () => boolean; hint: string }> = [
    {
      mime: "image/png",
      matches: () => startsWith(bytes, PNG_SIGNATURE),
      complete: () => startsWith(bytes, PNG_TERMINATOR, bytes.byteLength - PNG_TERMINATOR.length),
      hint: "the image ends early, so it is missing its IEND chunk"
    },
    {
      mime: "image/jpeg",
      matches: () => startsWith(bytes, JPEG_START),
      // The EOI marker is the last two bytes; some encoders pad with zero bytes after it, which is
      // harmless and would otherwise reject a perfectly good camera JPEG.
      complete: () => {
        for (let offset = bytes.byteLength - 2; offset >= Math.max(0, bytes.byteLength - 9); offset -= 1) {
          if (bytes[offset] === JPEG_TERMINATOR[0] && bytes[offset + 1] === JPEG_TERMINATOR[1]) return true;
        }
        return false;
      },
      hint: "the image ends early, so it is missing its end-of-image marker"
    },
    {
      mime: "image/webp",
      matches: () => startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8),
      // A RIFF header declares the payload length; a mismatch means the stream was cut short (or the
      // header was pasted onto the front of something else). One trailing pad byte is legal per the
      // container spec, so the file may be exactly one byte longer than declared.
      complete: () => {
        const declared = eightByteLengthAt(bytes, 4);
        return declared + 8 === bytes.byteLength || declared + 9 === bytes.byteLength;
      },
      hint: "the RIFF header declares a different length than the file has"
    }
  ];

  for (const format of formats) {
    if (!format.matches()) continue;
    if (!format.complete()) {
      return {
        status: "rejected",
        code: "truncated",
        message: `That ${formatLabel(format.mime)} looks incomplete: ${format.hint}. Re-export the photo and try again.`
      };
    }
    return {
      status: "ok",
      mime: format.mime,
      extension: PHOTO_EXTENSIONS[format.mime],
      byteLength: bytes.byteLength
    };
  }

  const disguise = describeDisguise(bytes);
  const allowed = ALLOWED_SOS_PHOTO_MIME_TYPES.join(", ");
  return {
    status: "rejected",
    code: "unsupported_format",
    message: disguise
      ? `An SOS photo has to be ${allowed}. The file name was ignored, and the bytes are ${disguise}.`
      : `An SOS photo has to be ${allowed}, judged by the file's bytes rather than its name or declared type.`
  };
}

function formatLabel(mime: SosPhotoMimeType) {
  return mime === "image/jpeg" ? "JPEG" : mime === "image/png" ? "PNG" : "WebP";
}
