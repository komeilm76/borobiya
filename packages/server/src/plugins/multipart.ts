import multipart from "@fastify/multipart";
import { MAX_SOS_PHOTO_BYTES } from "@borobiya/shared";
import type { FastifyInstance } from "fastify";

/**
 * The multipart parser, registered with the upload limits the contract states.
 *
 * `MAX_SOS_PHOTO_BYTES` is spec §11.2's 5 MB, and it is enforced *here* rather than in a handler
 * because by the time a handler can look at a buffer, the bytes have already been transferred and
 * collected — which is the whole cost. `files: 1` is the same rule from the other side: an SOS carries
 * one photo, so a second file part is a client bug, not a variant to tolerate. `throwFileSizeLimit`
 * turns an oversized body into an error instead of a silently truncated buffer; the photo route checks
 * `truncated` as well, so disabling this flag would degrade to a 413 from the handler rather than to
 * storing half an image.
 *
 * The byte ceiling arrives from configuration (`SOS_PHOTO_MAX_SIZE_MB`), because that is the knob the
 * spec's own environment table lists; everything else about the shape is structural and stays here.
 *
 * Registered once for the app, because the plugin must be on the instance before any multipart route is
 * created; the one caller today is `POST /_user/sos/requests/:id/photo`.
 */
export function multipartLimits(maxBytes: number = MAX_SOS_PHOTO_BYTES) {
  return {
    fileSize: maxBytes,
    files: 1,
    fields: 5,
    fieldNameSize: 100,
    fieldSize: 2_000
  } as const;
}

export async function registerMultipartParser(
  app: FastifyInstance,
  options: { maxBytes?: number } = {}
): Promise<void> {
  await app.register(multipart, {
    limits: multipartLimits(options.maxBytes),
    throwFileSizeLimit: true
  });
}
