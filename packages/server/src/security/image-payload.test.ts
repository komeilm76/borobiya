import { describe, expect, it } from "vitest";
import { MAX_SOS_PHOTO_BYTES } from "@borobiya/shared";
import { sniffSosPhoto } from "./image-payload";

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IEND = Uint8Array.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

function png(body: number[] = [0x00, 0x01, 0x02]) {
  return Uint8Array.from([...PNG_SIGNATURE, ...body, ...PNG_IEND]);
}

function jpeg(bytes: number[] = [0xe0, 0x00, 0x10]) {
  return Uint8Array.from([0xff, 0xd8, 0xff, ...bytes, 0xff, 0xd9]);
}

/** A RIFF container whose 4-byte size field declares the payload length, as a real encoder writes it. */
function webp(payload: number[] = [0x01, 0x02, 0x03], extraBytes = 0) {
  const contentLength = 4 + payload.length + extraBytes;
  return Uint8Array.from([
    0x52, 0x49, 0x46, 0x46,
    contentLength % 256,
    Math.floor(contentLength / 256) % 256,
    Math.floor(contentLength / 65_536) % 256,
    Math.floor(contentLength / 16_777_216),
    0x57, 0x45, 0x42, 0x50,
    ...payload,
    ...new Array<number>(extraBytes).fill(0)
  ]);
}

describe("sniffSosPhoto", () => {
  it("identifies each allowed format and names the file it produces", () => {
    expect(sniffSosPhoto(png())).toMatchObject({ status: "ok", mime: "image/png", extension: "png" });
    expect(sniffSosPhoto(jpeg())).toMatchObject({ status: "ok", mime: "image/jpeg", extension: "jpg" });
    expect(sniffSosPhoto(webp())).toMatchObject({ status: "ok", mime: "image/webp", extension: "webp" });
  });

  it("reports the size it actually holds, so the store can log what it wrote", () => {
    const bytes = png();
    expect(sniffSosPhoto(bytes)).toMatchObject({ byteLength: bytes.byteLength });
  });

  it("accepts a file at exactly the contract limit and refuses one byte more", () => {
    // The boundary is 5 MiB inclusive: a camera export that lands on the limit is legal, and a client
    // that measures with 1,000,000 rather than 1,048,576 will "discover" the limit at the wrong size.
    const atLimit = jpeg(new Array<number>(MAX_SOS_PHOTO_BYTES - 5).fill(0x20));
    expect(atLimit.byteLength).toBe(MAX_SOS_PHOTO_BYTES);
    expect(sniffSosPhoto(atLimit).status).toBe("ok");

    const overLimit = jpeg(new Array<number>(MAX_SOS_PHOTO_BYTES - 4).fill(0x20));
    expect(overLimit.byteLength).toBe(MAX_SOS_PHOTO_BYTES + 1);
    const result = sniffSosPhoto(overLimit);
    expect(result).toMatchObject({ status: "rejected", code: "too_large" });
    if (result.status === "rejected") {
      // Human units, because the message is read by a person holding a phone in the rain.
      expect(result.message).toContain("5 MB");
      expect(result.message).not.toMatch(/\d{6,}/);
    }
  });

  it("refuses an image that stops before its terminator instead of storing a broken picture", () => {
    const clipped = png().slice(0, png().byteLength - 4);
    expect(clipped.byteLength).toBeGreaterThan(8);
    expect(sniffSosPhoto(clipped)).toMatchObject({ status: "rejected", code: "truncated" });

    const noEoi = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x01, 0x02]);
    const result = sniffSosPhoto(noEoi);
    expect(result).toMatchObject({ status: "rejected", code: "truncated" });
    if (result.status === "rejected") expect(result.message).toContain("end-of-image");
  });

  it("tolerates the zero padding some JPEG encoders append after the end marker", () => {
    const padded = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x01, 0x02, 0xff, 0xd9, 0x00, 0x00]);
    expect(sniffSosPhoto(padded).status).toBe("ok");
  });

  it("rejects a RIFF header that promises more bytes than the file has", () => {
    const lying = Uint8Array.from([...webp(), 0x00, 0x00]);
    expect(sniffSosPhoto(lying)).toMatchObject({ status: "rejected", code: "truncated" });
  });

  it("accepts the one trailing pad byte the RIFF spec allows", () => {
    expect(sniffSosPhoto(webp([0x01, 0x02, 0x03], 1)).status).toBe("ok");
  });

  it("refuses an empty payload rather than storing a zero-byte photo", () => {
    expect(sniffSosPhoto(new Uint8Array(0))).toMatchObject({ status: "rejected", code: "empty" });
  });

  it("ignores the file name and judges the bytes, and says so", () => {
    // A ZIP archive renamed `photo.png` is the classic case: extension sniffing would accept it.
    const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    const result = sniffSosPhoto(zip);
    expect(result).toMatchObject({ status: "rejected", code: "unsupported_format" });
    if (result.status === "rejected") {
      expect(result.message).toContain("ZIP archive");
      expect(result.message).toContain("image/jpeg, image/png, image/webp");
    }
  });

  it("names a format the sender probably meant, when it recognizes one", () => {
    for (const [bytes, label] of [
      [Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), "GIF"],
      [Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]), "PDF"],
      [Uint8Array.from([0x42, 0x4d, 0x00, 0x00]), "BMP"]
    ] as const) {
      const result = sniffSosPhoto(bytes);
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") expect(result.message).toContain(label);
    }
  });

  it("tells a client that posted a data URL text blob what to do instead", () => {
    const text = new TextEncoder().encode("data:image/png;base64,iVBORw0KGgo=");
    const result = sniffSosPhoto(text);
    expect(result).toMatchObject({ status: "rejected", code: "unsupported_format" });
    if (result.status === "rejected") expect(result.message).toContain("data URL");
  });

  it("refuses an SVG, whose markup an admin's browser would happily render", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    expect(sniffSosPhoto(svg)).toMatchObject({ status: "rejected", code: "unsupported_format" });
  });
});
