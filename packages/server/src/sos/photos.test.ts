import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import { MAX_SOS_PHOTO_BYTES, SOS_PHOTO_FIELD_NAME } from "@borobiya/shared";
import type { AttachSosPhotoInput, SosPhotoStore } from "../db/sos-photo-store";
import type { SecurityQuestionsUserRecord, UserSecurityQuestionsStore } from "../db/security-questions-store";
import { registerUserSecurityQuestionsRoute } from "../auth/user-security-questions";
import type { SosRequestStore } from "../db/sos-request-store";
import { parseServerEnv } from "../config/env";
import { registerHttpSecurityPlugins } from "../plugins/security";
import { registerMultipartParser } from "../plugins/multipart";
import { registerSosRequestRoutes } from "./requests";
import { createPhotoStorage } from "./photo-storage";
import { photoSizeLimitMessage, readPhotoPart, registerSosPhotoRoutes } from "./photos";

const jwtSecret = "a".repeat(48);
const requesterId = randomUUID();
const requestId = randomUUID();
const createdAt = new Date("2026-10-22T09:00:00.000Z");

const apps: FastifyInstance[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function accessToken(subject: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: "user", deviceId: randomUUID(), sessionId: randomUUID(), tokenUse: "access" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(subject)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 900)
    .sign(new TextEncoder().encode(jwtSecret));
}

function userRow(id: string): SecurityQuestionsUserRecord {
  return {
    id,
    username: "field_responder",
    role: "user",
    isActive: true,
    isSuspended: false,
    mustCompleteSecurityQuestions: false,
    avgRating: null,
    createdAt
  };
}

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x01, 0x02, 0xff, 0xd9]);
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00]);

const BOUNDARY = "borobiya-test-boundary";

type MultipartPart = { name: string; filename?: string; contentType?: string; bytes: Uint8Array | string };

/**
 * The body assembled by hand rather than with `FormData`, because light-my-request does not serialize a
 * `FormData` into a boundary-delimited payload: the server would have been handed text that merely
 * mentioned a boundary, and every "rejected the upload" assertion below would have passed for the wrong
 * reason.
 */
function multipartBody(parts: MultipartPart[]) {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const disposition = `Content-Disposition: form-data; name="${part.name}"${part.filename ? `; filename="${part.filename}"` : ""}`;
    const headers = [disposition, ...(part.contentType ? [`Content-Type: ${part.contentType}`] : [])].join("\r\n");
    chunks.push(Buffer.from(`--${BOUNDARY}\r\n${headers}\r\n\r\n`, "utf8"));
    chunks.push(typeof part.bytes === "string" ? Buffer.from(part.bytes, "utf8") : Buffer.from(part.bytes));
    chunks.push(Buffer.from("\r\n", "utf8"));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`, "utf8"));
  return {
    body: Buffer.concat(chunks),
    headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` }
  };
}

/** The volume may not exist yet — a refused upload never creates it, and that is part of the claim. */
async function storedFiles(directory: string) {
  return readdir(directory).catch(() => []);
}

/**
 * `maxBytes` is here so one test can prove the route quotes the *configured* limit rather than the
 * documented default — an operator who set 2 MB must see 2 MB in the refusal they get.
 */
/** The limiter lives in a plugin, so a test that counts 429s has to build the app the way `app.ts` does. */
const serverConfig = parseServerEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://borobiya:test-password@localhost:5432/borobiya_test",
  JWT_SECRET: jwtSecret,
  JWT_REFRESH_SECRET: "b".repeat(48),
  CORS_ORIGINS: "http://localhost:5173"
});

async function makeApp(
  options: {
    attach?: (input: AttachSosPhotoInput) => Promise<{ status: "attached"; photoUrl: string } | { status: "not_found" }>;
    maxBytes?: number;
    withLimits?: boolean;
  } = {}
) {
  const directory = join(await mkdtemp(join(tmpdir(), "borobiya-photo-route-")), "uploads");
  directories.push(directory);
  const storage = createPhotoStorage(directory);

  const securityStore: UserSecurityQuestionsStore = {
    async findUserById(id) {
      return userRow(id);
    },
    async hasActiveSession() {
      return true;
    },
    async securityQuestionsExist() {
      return true;
    },
    async completeSecurityQuestions() {
      return true;
    }
  };
  const attachPhoto = vi.fn<SosPhotoStore["attachPhoto"]>(
    options.attach ?? (async (input) => ({ status: "attached", photoUrl: input.photoUrl }))
  );

  // Only needed by the throttle test, but it has to be the real route: the photo budget is documented
  // as *shared in figure and separate in counter*, and that second half is only observable next to the
  // route it must not spend.
  const createRequest = vi.fn<SosRequestStore["createRequest"]>(async () => ({
    requestId: randomUUID(),
    status: "pending" as const
  }));

  const app = Fastify({ logger: false });
  if (options.withLimits) {
    await registerHttpSecurityPlugins(app, serverConfig);
    await registerSosRequestRoutes(app, { store: { createRequest } });
  }
  await registerUserSecurityQuestionsRoute(app, { store: securityStore, jwtSecret });
  await registerMultipartParser(app, { maxBytes: options.maxBytes });
  await registerSosPhotoRoutes(app, { store: { attachPhoto }, storage, maxBytes: options.maxBytes });
  await app.ready();
  apps.push(app);
  return { app, attachPhoto, directory, createRequest };
}

async function upload(
  app: FastifyInstance,
  parts: MultipartPart[],
  id: string = requestId,
  token: string | null = null
) {
  const { body, headers } = multipartBody(parts);
  return app.inject({
    method: "POST",
    url: `/_user/sos/requests/${id}/photo`,
    headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    payload: body
  });
}

describe("POST /_user/sos/requests/:id/photo", () => {
  it("stores the bytes it was given and answers with the path the row now holds", async () => {
    const { app, attachPhoto, directory } = await makeApp();
    const token = await accessToken(requesterId);

    const response = await upload(app, [{ name: SOS_PHOTO_FIELD_NAME, filename: "IMG_0042.png", bytes: PNG }], requestId, token);

    expect(response.statusCode).toBe(200);
    const photoUrl = response.json().photoUrl as string;
    expect(photoUrl).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
    expect(response.headers["cache-control"]).toBe("no-store");

    const fileName = photoUrl.replace("/uploads/", "");
    expect(new Uint8Array(await readFile(join(directory, fileName)))).toEqual(PNG);
    expect(attachPhoto).toHaveBeenCalledWith({ requesterId, requestId, photoUrl });
  });

  it("derives the extension from the bytes, never from the name or the declared type", async () => {
    const { app, directory } = await makeApp();
    const token = await accessToken(requesterId);

    // A JPEG named `.png` with `Content-Type: image/png`: the file on disk is a JPEG, so the stored
    // extension is `.jpg` and nothing downstream has to trust a label.
    const response = await upload(
      app,
      [{ name: SOS_PHOTO_FIELD_NAME, filename: "liar.png", contentType: "image/png", bytes: JPEG }],
      requestId,
      token
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().photoUrl).toMatch(/\.jpg$/);
    expect(await storedFiles(directory)).toEqual([expect.stringMatching(/\.jpg$/)]);
  });

  it("refuses a body that is not multipart at all", async () => {
    const { app, attachPhoto } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: `/_user/sos/requests/${requestId}/photo`,
      headers: { authorization: `Bearer ${await accessToken(requesterId)}`, "content-type": "application/json" },
      payload: { photo: "data:image/png;base64,iVBORw0KGgo=" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      issues: [expect.objectContaining({ code: "expected_multipart" })]
    });
    expect(attachPhoto).not.toHaveBeenCalled();
  });

  it("refuses a file in the wrong field and names both fields", async () => {
    const { app } = await makeApp();
    const response = await upload(
      app,
      [{ name: "image", filename: "photo.png", bytes: PNG }],
      requestId,
      await accessToken(requesterId)
    );

    expect(response.statusCode).toBe(400);
    const message = response.json().issues[0].message as string;
    expect(message).toContain("photo");
    expect(message).toContain("`image`");
  });

  it("refuses extra text fields instead of silently dropping them", async () => {
    const { app, directory } = await makeApp();
    const response = await upload(
      app,
      [
        { name: SOS_PHOTO_FIELD_NAME, filename: "photo.png", bytes: PNG },
        { name: "caption", bytes: "the roof on our street" }
      ],
      requestId,
      await accessToken(requesterId)
    );

    // The caption is the information a client would most plausibly send and most plausibly lose, so a
    // silent 200 would be the worst possible answer.
    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([expect.objectContaining({ code: "unexpected_field" })]);
    expect(await storedFiles(directory)).toEqual([]);
  });

  it("says which field arrived when no file was among them", async () => {
    const { app } = await makeApp();
    const response = await upload(
      app,
      [{ name: "caption", bytes: "oops" }],
      requestId,
      await accessToken(requesterId)
    );

    expect(response.statusCode).toBe(400);
    const message = response.json().issues[0].message as string;
    expect(message).toContain("`caption`");
    expect(message).toContain(SOS_PHOTO_FIELD_NAME);
  });

  it("says so plainly when the body has no parts at all", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: `/_user/sos/requests/${requestId}/photo`,
      headers: {
        authorization: `Bearer ${await accessToken(requesterId)}`,
        "content-type": `multipart/form-data; boundary=${BOUNDARY}`
      },
      payload: Buffer.from(`--${BOUNDARY}--\r\n`, "utf8")
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([expect.objectContaining({ code: "no_file" })]);
  });

  it("refuses a second file rather than choosing one of the two", async () => {
    const { app } = await makeApp();
    const response = await upload(
      app,
      [
        { name: SOS_PHOTO_FIELD_NAME, filename: "one.png", bytes: PNG },
        { name: SOS_PHOTO_FIELD_NAME, filename: "two.png", bytes: PNG }
      ],
      requestId,
      await accessToken(requesterId)
    );

    // The parser's `files: 1` limit is what answers here, before the handler ever sees a second part;
    // the route's own `multiple_photos` branch is the door behind it, for a build that raises the limit.
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      issues: [expect.objectContaining({ code: "TOO_MANY_PARTS" })]
    });
    expect(response.json().message).not.toBe(photoSizeLimitMessage());
  });

  it("quotes the configured limit when a deployment set one", async () => {
    const { app, directory } = await makeApp({ maxBytes: 1_048_576 });
    const twoMegabytes = Uint8Array.from([0xff, 0xd8, 0xff, ...new Array<number>(2 * 1024 * 1024 - 5).fill(0x20), 0xff, 0xd9]);

    const response = await upload(
      app,
      [{ name: SOS_PHOTO_FIELD_NAME, filename: "big.png", bytes: twoMegabytes }],
      requestId,
      await accessToken(requesterId)
    );

    expect(response.statusCode).toBe(413);
    expect(response.json().message).toContain("1 MB");
    expect(response.json().message).not.toContain("5 MB");
    expect(await storedFiles(directory)).toEqual([]);
  });

  it("answers 413 when the body is bigger than the contract allows, without storing anything", async () => {
    const { app, attachPhoto, directory } = await makeApp();
    const huge = Uint8Array.from([0xff, 0xd8, 0xff, ...new Array<number>(MAX_SOS_PHOTO_BYTES - 4).fill(0x20), 0xff, 0xd9]);
    expect(huge.byteLength).toBe(MAX_SOS_PHOTO_BYTES + 1);

    const response = await upload(app, [{ name: SOS_PHOTO_FIELD_NAME, filename: "huge.jpg", bytes: huge }], requestId, await accessToken(requesterId));

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ code: "PHOTO_TOO_LARGE", message: expect.stringContaining("5 MB") });
    expect(attachPhoto).not.toHaveBeenCalled();
    expect(await storedFiles(directory)).toEqual([]);
  });

  it("accepts a photo at exactly the limit", async () => {
    const { app } = await makeApp();
    const exact = Uint8Array.from([0xff, 0xd8, 0xff, ...new Array<number>(MAX_SOS_PHOTO_BYTES - 5).fill(0x20), 0xff, 0xd9]);
    expect(exact.byteLength).toBe(MAX_SOS_PHOTO_BYTES);

    expect((await upload(app, [{ name: SOS_PHOTO_FIELD_NAME, filename: "exact.jpg", bytes: exact }], requestId, await accessToken(requesterId))).statusCode).toBe(200);
  });

  it("refuses a file whose bytes are not an allowed image, and says what arrived", async () => {
    const { app, directory } = await makeApp();
    const response = await upload(app, [{ name: SOS_PHOTO_FIELD_NAME, filename: "photo.png", bytes: GIF }], requestId, await accessToken(requesterId));

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([expect.objectContaining({ code: "unsupported_format", path: ["photo"] })]);
    expect((response.json().issues[0].message as string)).toContain("GIF");
    expect(await storedFiles(directory)).toEqual([]);
  });

  it("refuses an empty file rather than attaching a zero-byte photo", async () => {
    const { app } = await makeApp();
    const response = await upload(
      app,
      [{ name: SOS_PHOTO_FIELD_NAME, filename: "empty.png", bytes: new Uint8Array(0) }],
      requestId,
      await accessToken(requesterId)
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([expect.objectContaining({ code: "empty" })]);
  });

  it("deletes the file it wrote when the request turns out not to be the caller's", async () => {
    const { app, directory } = await makeApp({ attach: async () => ({ status: "not_found" as const }) });
    const response = await upload(app, [{ name: SOS_PHOTO_FIELD_NAME, filename: "photo.png", bytes: PNG }], randomUUID(), await accessToken(requesterId));

    expect(response.statusCode).toBe(404);
    // The same answer for an id that does not exist at all: this route could otherwise walk the table.
    expect(response.json()).toMatchObject({ code: "SOS_REQUEST_NOT_FOUND" });
    expect(await storedFiles(directory)).toEqual([]);
  });

  it("keeps the previous photo on the volume when a request is re-uploaded", async () => {
    const { app, directory } = await makeApp();
    const token = await accessToken(requesterId);

    const first = await upload(app, [{ name: SOS_PHOTO_FIELD_NAME, filename: "blurry.png", bytes: PNG }], requestId, token);
    const second = await upload(app, [{ name: SOS_PHOTO_FIELD_NAME, filename: "clear.png", bytes: PNG }], requestId, token);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().photoUrl).not.toBe(first.json().photoUrl);
    // Two files, one row: the request points at the newer one, and the older bytes are left alone
    // because destroying evidence nobody asked to destroy is worse than an object nobody references.
    expect(await storedFiles(directory)).toHaveLength(2);
  });

  it("is guarded by the /_user hook and needs a uuid in the path", async () => {
    const { app } = await makeApp();

    expect((await upload(app, [{ name: SOS_PHOTO_FIELD_NAME, filename: "p.png", bytes: PNG }], requestId, null)).statusCode).toBe(401);

    const badId = await upload(
      app,
      [{ name: SOS_PHOTO_FIELD_NAME, filename: "p.png", bytes: PNG }],
      "not-a-uuid",
      await accessToken(requesterId)
    );
    expect(badId.statusCode).toBe(400);
    expect(badId.json().message).toBe("Path parameter validation failed.");
  });

  it("has no read route yet, which is the half SECURITY §9 still owes", async () => {
    const { app } = await makeApp();
    const token = await accessToken(requesterId);
    const uploaded = await upload(app, [{ name: SOS_PHOTO_FIELD_NAME, filename: "photo.png", bytes: PNG }], requestId, token);
    const photoUrl = uploaded.json().photoUrl as string;

    // Pinned so the gap is visible in the suite rather than assumed: the bytes are durable and
    // referenced, and `GET /uploads/:id` arrives with T3.2.6 together with the decision about how an
    // image load is authenticated. Serving them from a static mount would make every SOS photo public.
    expect((await app.inject({ method: "GET", url: photoUrl })).statusCode).toBe(404);
  });
});

describe("the photo route's share of the SECURITY §3 budget", () => {
  it("is three per minute on its own counter, and leaves the SOS filing budget untouched", async () => {
    const { app, attachPhoto, createRequest } = await makeApp({ withLimits: true });
    const token = await accessToken(requesterId);

    const codes: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      codes.push(
        (await upload(app, [{ name: SOS_PHOTO_FIELD_NAME, filename: "roof.png", bytes: PNG }], requestId, token))
          .statusCode
      );
    }

    expect(codes).toEqual([200, 200, 200, 429]);
    expect(attachPhoto).toHaveBeenCalledTimes(3);

    const filed = await app.inject({
      method: "POST",
      url: "/_user/sos/requests",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        severity: "high",
        description: "Roof collapse, two people unaccounted for inside.",
        incidentTypeId: randomUUID(),
        location: { lat: 35.7, lon: 51.4, isManual: false }
      }
    });

    // A shared counter would answer 429 here, and the emergency it turns away is not the attacker's.
    expect(filed.statusCode).toBe(201);
    expect(createRequest).toHaveBeenCalledTimes(1);
  });
});

describe("readPhotoPart stream drainage on early rejection", () => {
  it("resumes unconsumed file streams on unexpected field names and duplicate file parts", async () => {
    const resumeWrongField = vi.fn();
    const wrongFieldResult = await readPhotoPart({
      isMultipart: () => true,
      async *parts() {
        yield {
          fieldname: "image",
          type: "file",
          file: { resume: resumeWrongField },
          toBuffer: async () => Buffer.from(PNG)
        };
      }
    } as unknown as Parameters<typeof readPhotoPart>[0]);

    expect(wrongFieldResult).toMatchObject({ status: "error", code: "unexpected_field" });
    expect(resumeWrongField).toHaveBeenCalledOnce();

    const resumeDuplicate = vi.fn();
    const duplicateResult = await readPhotoPart({
      isMultipart: () => true,
      async *parts() {
        yield {
          fieldname: SOS_PHOTO_FIELD_NAME,
          type: "file",
          file: { resume: vi.fn() },
          toBuffer: async () => Buffer.from(PNG)
        };
        yield {
          fieldname: SOS_PHOTO_FIELD_NAME,
          type: "file",
          file: { resume: resumeDuplicate },
          toBuffer: async () => Buffer.from(PNG)
        };
      }
    } as unknown as Parameters<typeof readPhotoPart>[0]);

    expect(duplicateResult).toMatchObject({ status: "error", code: "multiple_photos" });
    expect(resumeDuplicate).toHaveBeenCalledOnce();
  });
});
