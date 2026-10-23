import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The volume half of photo storage (T3.2.3): bytes in, name and URL out.
 *
 * Nothing here takes a caller-supplied path. The file name is a server-generated UUID plus the
 * extension the *sniffed* format decided on, so a `../../etc/passwd`, a `.php`, and a name crafted to
 * collide with another request's evidence are all unreachable by construction. The directory itself
 * comes from configuration (`UPLOAD_DIR`), which is the one operator-controlled value in the path.
 */
export interface StoredPhoto {
  fileName: string;
  /** The path `docs/SECURITY.md` §9 reserves for the read route; see `photoUrlFor`. */
  photoUrl: string;
  byteLength: number;
}

export interface PhotoStorage {
  save(bytes: Uint8Array, extension: string): Promise<StoredPhoto>;
  /** Remove bytes whose database write failed, so a refused upload leaves nothing behind. */
  discard(fileName: string): Promise<void>;
}

/**
 * The URL a stored photo will be served from. It is a *path*, not a host: an attacker-influenced
 * absolute URL in `sos_requests.photo_url` is exactly what the create route refuses, and an
 * app-relative one is what a client can resolve against whatever origin it is talking to.
 */
export function photoUrlFor(fileName: string) {
  return `/uploads/${fileName}`;
}

/**
 * `.<name>.part` then rename, because `rename` is atomic within one filesystem: a reader (or a
 * container restart) can see the complete file or nothing, never a half-written image that the read
 * route would later serve as if it were the evidence.
 */
export function photoPartFileName(fileName: string, attempt: string = randomUUID()) {
  return `${fileName}.${attempt}.part`;
}

export function createPhotoStorage(directory: string): PhotoStorage {
  let prepared = false;

  return {
    async save(bytes, extension) {
      if (!prepared) {
        // Created on first write rather than at boot: an install that never receives a photo has no
        // reason to grow a directory, and the API process starts before its volume is guaranteed
        // to be writable in every orchestration.
        await mkdir(directory, { recursive: true });
        prepared = true;
      }

      const fileName = `${randomUUID()}.${extension}`;
      const target = join(directory, fileName);
      const tempFile = join(directory, photoPartFileName(fileName));
      try {
        // 0o600: these are pictures of people in trouble. The owner is the API user; anyone else who
        // needs to read them reads them through the API, which is the only place the participant rule
        // exists.
        await writeFile(tempFile, bytes, { mode: 0o600, flag: "wx" });
        await rename(tempFile, target);
      } catch (error) {
        await unlink(tempFile).catch(() => undefined);
        throw error;
      }

      return { fileName, photoUrl: photoUrlFor(fileName), byteLength: bytes.byteLength };
    },

    async discard(fileName) {
      // Deliberately not `join(directory, fileName)`-validating: the name came from `save` above.
      await unlink(join(directory, fileName)).catch(() => undefined);
    }
  };
}
