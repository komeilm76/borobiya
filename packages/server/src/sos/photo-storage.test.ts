import { afterEach, describe, expect, it } from "vitest";
import { chmod, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPhotoStorage, photoPartFileName, photoUrlFor } from "./photo-storage";

const directories: string[] = [];

afterEach(async () => {
  // Restore write permission before removing, so a test that made the directory read-only can clean up.
  for (const directory of directories.splice(0)) {
    await chmod(directory, 0o755).catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
});

/** A fresh parent per test, so nothing a test writes can be seen by another. */
async function tempDir(name = "uploads") {
  const root = await mkdtemp(join(tmpdir(), "borobiya-uploads-"));
  directories.push(root);
  return join(root, name);
}

describe("createPhotoStorage", () => {
  it("writes the bytes under a server-chosen name and points at the reserved URL prefix", async () => {
    const directory = await tempDir();
    const storage = createPhotoStorage(directory);
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x01]);

    const stored = await storage.save(bytes, "png");

    expect(stored.fileName).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(stored.photoUrl).toBe(photoUrlFor(stored.fileName));
    expect(stored.photoUrl.startsWith("/uploads/")).toBe(true);
    expect(stored.byteLength).toBe(bytes.byteLength);
    expect(new Uint8Array(await readFile(join(directory, stored.fileName)))).toEqual(bytes);
  });

  it("leaves the file readable only by the account that runs the API", async () => {
    const directory = await tempDir();
    const stored = await createPhotoStorage(directory).save(Uint8Array.from([0xff, 0xd8]), "jpg");

    // These are photographs of people in trouble; the read path is the only intended door, and a
    // permissive mode would let any other user of the host volume read them directly.
    expect((await stat(join(directory, stored.fileName))).mode & 0o777).toBe(0o600);
  });

  it("creates the configured directory on first use", async () => {
    const directory = join(await tempDir(), "nested", "uploads");
    await createPhotoStorage(directory).save(Uint8Array.from([0x52, 0x49, 0x46, 0x46]), "webp");

    expect(await readdir(directory)).toHaveLength(1);
  });

  it("gives every upload its own name, so a replacement never overwrites the photo before it", async () => {
    const directory = await tempDir();
    const storage = createPhotoStorage(directory);

    const first = await storage.save(Uint8Array.from([0x01]), "png");
    const second = await storage.save(Uint8Array.from([0x02]), "png");

    expect(first.fileName).not.toBe(second.fileName);
    // Both survive: `photo_url` points at the newer one, and the older bytes stay as evidence until a
    // retention rule for orphans exists (recorded in SECURITY §9).
    expect((await readdir(directory)).sort()).toEqual([first.fileName, second.fileName].sort());
  });

  it("discards a file whose database write failed, and stays quiet about one that is gone", async () => {
    const directory = await tempDir();
    const storage = createPhotoStorage(directory);
    const stored = await storage.save(Uint8Array.from([0x03]), "png");

    await storage.discard(stored.fileName);
    expect(await readdir(directory)).toEqual([]);
    await expect(storage.discard(stored.fileName)).resolves.toBeUndefined();
  });

  it("never leaves a .part behind when the write fails", async () => {
    const directory = await tempDir();
    // Pre-create the final name with the `wx` flag colliding? No — the failure this pins is the write
    // itself: a directory the process cannot write to.
    await createPhotoStorage(directory).save(Uint8Array.from([0x00]), "png");
    await chmod(directory, 0o500);

    await expect(createPhotoStorage(directory).save(Uint8Array.from([0x01]), "png")).rejects.toThrow();
    // Nothing the reader could half-see: only the earlier complete file is there, and no `.part` from
    // the failed attempt is left behind to accumulate across retries.
    expect(await readdir(directory)).toEqual([expect.not.stringMatching(/\.part$/)]);
    await chmod(directory, 0o755);
  });

  it("names the temporary file after the target so a crash is diagnosable", () => {
    expect(photoPartFileName("abc.png", "fixed")).toBe("abc.png.fixed.part");
    expect(photoPartFileName("abc.png")).toMatch(/^abc\.png\.[0-9a-f-]{36}\.part$/);
  });

  it("does not accept a caller-supplied name at all", async () => {
    const directory = await tempDir();
    const stored = await createPhotoStorage(directory).save(
      Uint8Array.from([...new Uint8Array(Buffer.from("../../etc/passwd", "utf8"))]),
      "png"
    );

    // The content cannot choose a name even when it spells a path: the name is a UUID and the
    // extension came from the sniffed format, so the only file written is inside the volume.
    expect(stored.fileName).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(await readdir(directory)).toEqual([stored.fileName]);
  });
});

describe("photoUrlFor", () => {
  it("is the app-relative path SECURITY §9 reserves for the read route", () => {
    expect(photoUrlFor("x.png")).toBe("/uploads/x.png");
    // Never absolute: an attacker-influenced absolute URL is what the create route refuses.
    expect(photoUrlFor("x.png")).not.toMatch(/^https?:/);
  });
});
