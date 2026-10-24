import { apiRoutes } from "@borobiya/shared/api";
import { MAX_SOS_PHOTO_BYTES, SOS_PHOTO_FIELD_NAME, sosRequestParamsSchema } from "@borobiya/shared";
import { megabytesLabel } from "../security/image-payload";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sniffSosPhoto } from "../security/image-payload";
import type { PhotoStorage } from "./photo-storage";
import type { SosPhotoStore } from "../db/sos-photo-store";
import { sosRequestRecordPayload, type SosRequestStore } from "../db/sos-request-store";
import { emitSosNewRequest, type RoomEmitter } from "../realtime/socket";
import { sosCreateRateLimit } from "./requests";

export interface SosPhotoRouteDependencies {
  store: SosPhotoStore;
  storage: PhotoStorage;
  /** Bytes, from `SOS_PHOTO_MAX_SIZE_MB`; defaults to the 5 MB the spec states. */
  maxBytes?: number;
  sosRequests?: Pick<SosRequestStore, "getRequestById">;
  io?: RoomEmitter;
}

/** The size the container will accept, in the words the caller needs. */
export function photoSizeLimitMessage(maxBytes: number = MAX_SOS_PHOTO_BYTES) {
  return `A photo must be ${megabytesLabel(maxBytes)} or smaller.`;
}

function errorResponse(code: string, message: string, issues: unknown[] = []) {
  return { error: true as const, code, message, issues };
}

function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  issues: unknown[] = []
) {
  return reply
    .code(statusCode)
    .header("cache-control", "no-store")
    .send(errorResponse(code, message, issues));
}

function invalid(reply: FastifyReply, code: string, message: string, path: unknown[] = ["photo"]) {
  return sendError(reply, 400, "VALIDATION_ERROR", "Request body validation failed.", [
    { code, message, path }
  ]);
}

/**
 * Which of the plugin's own limit errors this is, translated into something a client can act on.
 *
 * `@fastify/multipart` enforces the size and part-count limits while the body streams, so the failure
 * arrives as a thrown error rather than a response — and its default message ("file too large" /
 * "attach limit exceeded") does not say which limit or what to do about it.
 */
export function multipartLimitError(
  error: unknown,
  maxBytes: number = MAX_SOS_PHOTO_BYTES
): { statusCode: number; code: string; message: string } | null {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  // Size and count both fail as thrown 413s from the parser, and they need different answers: "make it
  // smaller" is the only advice for a big file, while a second file is a client that misread the shape.
  if (code === "FST_REQ_FILE_TOO_LARGE") {
    return { statusCode: 413, code: "PHOTO_TOO_LARGE", message: photoSizeLimitMessage(maxBytes) };
  }
  if (code === "FST_FILES_LIMIT" || code === "FST_PARTS_LIMIT" || code === "FST_FIELDS_LIMIT") {
    return {
      statusCode: 400,
      code: "TOO_MANY_PARTS",
      message: `An SOS carries one photo: send exactly one file part named \`${SOS_PHOTO_FIELD_NAME}\` and nothing else.`
    };
  }
  return null;
}

/** Either the bytes of the one accepted file part, or the reason this body is not that. */
export type PhotoPartResult =
  | { status: "ok"; bytes: Uint8Array }
  | { status: "error"; code: string; message: string };

/**
 * The parts of one multipart body, reduced to the photo.
 *
 * The accepted shape is narrow on purpose: one file part named `photo`, no other parts. Anything else is
 * refused rather than half-read, because a client that sent `image` instead of `photo` and a caption
 * field would otherwise get a `200` for a request whose caption was silently dropped — and a dropped
 * note on an emergency report is information loss the sender never hears about.
 */
export async function readPhotoPart(
  request: FastifyRequest,
  options: { maxBytes?: number } = {}
): Promise<PhotoPartResult> {
  const maxBytes = options.maxBytes ?? MAX_SOS_PHOTO_BYTES;
  if (!request.isMultipart()) {
    return {
      status: "error",
      code: "expected_multipart",
      message: `Photos are uploaded as multipart/form-data with one file field named \`${SOS_PHOTO_FIELD_NAME}\`.`
    };
  }

  // The part's declared `filename` is read by nobody: it is the one field a client gets wrong most
  // often (and the one a hostile one would lie about), so the bytes below are the only authority.
  let file: { bytes: Uint8Array } | null = null;
  try {
    for await (const part of request.parts()) {
      if (part.fieldname !== SOS_PHOTO_FIELD_NAME) {
        if (part.type === "file") {
          part.file.resume();
        }
        // One refusal for a wrongly named part whether it carries a file or a value: a client that put
        // the photo in `image` and a client that added a `caption` have the same bug, which is sending
        // something this endpoint has no place for. Silently dropping the caption would be worse than
        // the 400 — the sender would never learn their note about the emergency was thrown away.
        return {
          status: "error",
          code: "unexpected_field",
          message:
            part.type === "file"
              ? `The photo has to arrive in the \`${SOS_PHOTO_FIELD_NAME}\` part; this file was named \`${part.fieldname}\`.`
              : `An SOS photo upload carries one part: the file in \`${SOS_PHOTO_FIELD_NAME}\`. This request also sent \`${part.fieldname}\`, which has nowhere to go.`
        };
      }
      if (part.type === "file") {
        if (file) {
          part.file.resume();
          return {
            status: "error",
            code: "multiple_photos",
            message: "An SOS carries one photo. Re-post with a single file part to replace it."
          };
        }
        const buffer = await part.toBuffer();
        // `throwFileSizeLimit` is on in `app.ts`, so an oversized file normally arrives as an error.
        // This is the second door: if that flag is ever turned off, a truncated buffer must still not
        // be stored as a complete photo.
        if ((part as unknown as { file?: { truncated?: boolean } }).file?.truncated === true) {
          return { status: "error", code: "photo_too_large", message: photoSizeLimitMessage(maxBytes) };
        }
        file = { bytes: new Uint8Array(buffer) };
        continue;
      }
    }
  } catch (error) {
    const limit = multipartLimitError(error, maxBytes);
    if (limit) {
      return { status: "error", code: limit.code, message: limit.message };
    }
    throw error;
  }

  if (!file) {
    return {
      status: "error",
      code: "no_file",
      message: `The multipart body contained no file part. Send the photo as the \`${SOS_PHOTO_FIELD_NAME}\` part.`
    };
  }

  return { status: "ok", bytes: file.bytes };
}

/**
 * `POST /_user/sos/requests/:id/photo` (T3.2.3): attach the optional evidence photo to a request the
 * caller filed.
 *
 * Four rules carry the whole design:
 *
 * 1. **Only the requester's own request.** The ownership check is folded into the update's predicate, so
 *    somebody else's id and an unknown id answer the same `404` — this route can otherwise probe which
 *    SOS numbers exist.
 * 2. **The bytes decide the format, never the file name or the declared type** (`sniffSosPhoto`), and a
 *    signature with no terminator is refused as incomplete rather than stored.
 * 3. **The file is named by the server.** A client-supplied name never reaches the filesystem, and the
 *    stored URL is app-relative for the same reason the create route refuses `photoUrl`: nothing that
 *    gets read back may be an address somebody else chose.
 * 4. **A photo is written only when the row accepts it, and unlinked when it does not.** Bytes on disk
 *    that no request points at are readable-by-luck evidence, so the failed write is cleaned up.
 *
 * The read path lives separately in `photo-access.ts`: it checks participants before issuing a
 * short-lived signed URL and rechecks the database pointer before serving bytes. This upload route
 * never grants read permission by returning the bare path.
 *
 * A re-post replaces which photo the request points at; the previous file stays privately on the
 * volume as evidence, unreachable via the read API. Deletion needs a separate retention policy.
 */
export async function registerSosPhotoRoutes(
  app: FastifyInstance,
  dependencies: SosPhotoRouteDependencies
): Promise<void> {
  const route = apiRoutes.sos.uploadRequestPhoto;
  const maxBytes = dependencies.maxBytes ?? MAX_SOS_PHOTO_BYTES;

  app.post(route.url, {
    config: {
      rateLimit: {
        // The 5 MB ceiling makes an unbounded upload loop a disk-fill attack, so this route borrows the
        // per-account budget SECURITY §3 already states for filing an SOS rather than inventing a
        // second number. `groupId` keeps the two counts independent.
        ...sosCreateRateLimit,
        groupId: "sos-photo",
        keyGenerator: (request: FastifyRequest) => request.authenticatedUser?.userId ?? request.ip
      }
    }
  }, async (request, reply) => {
    const user = request.authenticatedUser;
    if (!user) {
      return sendError(reply, 401, "UNAUTHORIZED", "A valid access token is required.");
    }

    const parsedParams = sosRequestParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Path parameter validation failed.",
        parsedParams.error.issues.map(({ code, message, path }) => ({ code, message, path }))
      );
    }

    const photo = await readPhotoPart(request, { maxBytes });
    if (photo.status === "error") {
      // The size refusal is a 413, which the contract declares and which a camera app handles by
      // offering to compress; every other refusal here is a fixable mistake in the request.
      if (photo.code === "photo_too_large" || photo.code === "PHOTO_TOO_LARGE") {
        return sendError(reply, 413, "PHOTO_TOO_LARGE", photo.message);
      }
      return invalid(reply, photo.code, photo.message);
    }

    const sniffed = sniffSosPhoto(photo.bytes, maxBytes);
    if (sniffed.status === "rejected") {
      if (sniffed.code === "too_large") {
        return sendError(reply, 413, "PHOTO_TOO_LARGE", sniffed.message);
      }
      return invalid(reply, sniffed.code, sniffed.message);
    }

    const stored = await dependencies.storage.save(photo.bytes, sniffed.extension);
    let attached: Awaited<ReturnType<SosPhotoStore["attachPhoto"]>>;
    try {
      attached = await dependencies.store.attachPhoto({
        requesterId: user.userId,
        requestId: parsedParams.data.id,
        photoUrl: stored.photoUrl
      });
    } catch (error) {
      // The file was written before the DB call. Discard only while the attachment has not
      // returned success; notification failures below must never delete an attached photo.
      try {
        await dependencies.storage.discard(stored.fileName);
      } catch (cleanupError) {
        request.log.warn({ err: cleanupError, requestId: parsedParams.data.id }, "SOS photo cleanup failed");
      }
      throw error;
    }
    if (attached.status === "not_found") {
      await dependencies.storage.discard(stored.fileName);
      return sendError(
        reply,
        404,
        "SOS_REQUEST_NOT_FOUND",
        "No SOS request of yours has that id. A photo can only be attached to a request you filed."
      );
    }

    // The row now references this file. The admin refresh is best-effort; failing it must not
    // make the requester retry a successful attachment or lose its URL.
    try {
      const refreshed = await dependencies.sosRequests?.getRequestById?.(parsedParams.data.id);
      if (refreshed) {
        emitSosNewRequest(dependencies.io, sosRequestRecordPayload(refreshed));
      }
    } catch (error) {
      request.log.warn({ err: error, requestId: parsedParams.data.id }, "SOS photo notification failed");
    }

    // The URL the row now holds, answered from the store rather than recomputed here, so a client
    // cannot end up caching a path the request does not carry.
    return reply.code(200).header("cache-control", "no-store").send({ photoUrl: attached.photoUrl });
  });
}
