import { createHmac, timingSafeEqual } from "node:crypto";
import { apiRoutes } from "@borobiya/shared/api";
import { sosRequestParamsSchema } from "@borobiya/shared";
import type { FastifyInstance } from "fastify";
import type { SosPhotoStore } from "../db/sos-photo-store";
import type { SosRequestStore } from "../db/sos-request-store";
import type { PhotoStorage } from "./photo-storage";

const PHOTO_URL_TTL_MS = 60_000;
const FILE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/;
const CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg", png: "image/png", webp: "image/webp"
};

export interface SosPhotoAccessDependencies {
  sosRequests: SosRequestStore;
  photos: SosPhotoStore;
  storage: PhotoStorage;
  jwtSecret: string;
  maxBytes: number;
}

function error(code: string, message: string) {
  return { error: true as const, code, message, issues: [] };
}

function signature(secret: string, requestId: string, fileName: string, expires: number): string {
  return createHmac("sha256", secret)
    .update(`borobiya:sos-photo:v1:${requestId}:${fileName}:${expires}`)
    .digest("base64url");
}

function validSignature(secret: string, requestId: string, fileName: string, expires: number, submitted: string): boolean {
  if (!Number.isSafeInteger(expires) || expires <= Date.now() || expires > Date.now() + PHOTO_URL_TTL_MS) return false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(submitted)) return false;
  const expected = Buffer.from(signature(secret, requestId, fileName, expires), "base64url");
  return timingSafeEqual(expected, Buffer.from(submitted, "base64url"));
}

/** A path is an identifier, not a capability: the signer is only called after a participant check. */
export function signedPhotoPath(secret: string, requestId: string, photoUrl: string, now = Date.now()): string | null {
  const fileName = photoUrl.startsWith("/uploads/") ? photoUrl.slice("/uploads/".length) : "";
  if (!FILE_NAME.test(fileName)) return null;
  const expires = now + PHOTO_URL_TTL_MS;
  const query = new URLSearchParams({
    requestId,
    expires: String(expires),
    signature: signature(secret, requestId, fileName, expires)
  });
  return `/uploads/${fileName}?${query}`;
}

export async function registerSosPhotoAccessRoutes(app: FastifyInstance, dependencies: SosPhotoAccessDependencies): Promise<void> {
  const issueRoute = apiRoutes.sos.getPhotoAccess;
  const readRoute = apiRoutes.public.readSosPhoto;

  app.get(issueRoute.url, async (request, reply) => {
    const user = request.authenticatedUser;
    if (!user) return reply.code(401).header("cache-control", "no-store").send(error("UNAUTHORIZED", "Authentication required."));
    const params = sosRequestParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).header("cache-control", "no-store").send(error("VALIDATION_ERROR", "Invalid SOS request ID."));
    const record = await dependencies.sosRequests.getRequestById?.(params.data.id);
    const permitted = record && (user.role === "admin" || record.requesterId === user.userId ||
      await dependencies.photos.hasReadableProposal?.(record.id, user.userId));
    if (!record?.photoUrl || !permitted) {
      return reply.code(404).header("cache-control", "no-store").send(error("SOS_PHOTO_NOT_FOUND", "Photo not found."));
    }
    const url = signedPhotoPath(dependencies.jwtSecret, record.id, record.photoUrl);
    if (!url) return reply.code(404).header("cache-control", "no-store").send(error("SOS_PHOTO_NOT_FOUND", "Photo not found."));
    return reply.header("cache-control", "no-store").header("referrer-policy", "no-referrer")
      .send({ url, expiresAt: new Date(Number(new URL(url, "http://localhost").searchParams.get("expires"))).toISOString() });
  });

  // The proxy must not log query strings on this route; nginx.conf disables access_log here.
  // Fastify's automatic request logger is likewise silent for this one route only.
  app.get(readRoute.url, { logLevel: "silent" }, async (request, reply) => {
    const params = readRoute.schema.params.safeParse(request.params);
    const query = readRoute.schema.query.safeParse(request.query);
    const missing = () => reply.code(404).header("cache-control", "no-store")
      .header("referrer-policy", "no-referrer").send(error("SOS_PHOTO_NOT_FOUND", "Photo not found."));
    if (!params.success || !query.success) return missing();
    const { id: fileName } = params.data;
    const { requestId, expires, signature: proof } = query.data;
    if (!FILE_NAME.test(fileName) || !validSignature(dependencies.jwtSecret, requestId, fileName, expires, proof)) return missing();
    // Reread the *current* database pointer: even a correctly signed old URL must not serve a
    // superseded file or an unlinked/unknown request from the volume.
    const record = await dependencies.sosRequests.getRequestById?.(requestId);
    if (record?.photoUrl !== `/uploads/${fileName}`) return missing();
    const bytes = await dependencies.storage.read?.(fileName, dependencies.maxBytes);
    if (!bytes) return missing();
    const extension = fileName.split(".").at(-1)!;
    return reply.header("cache-control", "no-store").header("referrer-policy", "no-referrer")
      .header("x-content-type-options", "nosniff")
      .type(CONTENT_TYPE[extension]!).send(bytes);
  });
}
