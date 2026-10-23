import { z } from "zod";
import {
  createSosRequestSchema,
  incidentTypeSchema,
  SOS_PHOTO_FIELD_NAME,
  sosRequestCreatedSchema,
  sosRequestParamsSchema,
  type CreateSosRequestInput,
  type IncidentType,
  type SosRequestCreated
} from "@shared/index";
import { apiRoutes } from "@shared/api";
import { apiBasePath, ApiError, requestJson } from "./http";

const incidentTypeListSchema = z.array(incidentTypeSchema);
const photoUploadResponseSchema = z.strictObject({
  photoUrl: z.string().trim().min(1)
});

interface MultipartErrorPayload {
  code?: unknown;
  message?: unknown;
  issues?: unknown;
}

/** Reads the incident-type catalog (`GET /_public/incident-types`) that populates the SOS dropdown. */
export async function listSosIncidentTypes(signal?: AbortSignal): Promise<IncidentType[]> {
  const response = await requestJson<unknown>(apiRoutes.public.incidentTypes.url, { signal });
  return incidentTypeListSchema.parse(response);
}

/**
 * Files an emergency SOS request (`POST /_user/sos/requests`).
 *
 * `photoUrl` is stripped if a caller ever passed one because the create endpoint deliberately
 * refuses pre-upload URLs (`400 PHOTO_URL_NOT_ACCEPTED`); evidence is uploaded afterwards through
 * `uploadSosRequestPhoto`.
 */
export async function createSosRequest(
  input: CreateSosRequestInput,
  accessToken: string
): Promise<SosRequestCreated> {
  const { photoUrl: _omitted, ...cleanInput } = input;
  const body = createSosRequestSchema.parse(cleanInput);
  const response = await requestJson<unknown>(apiRoutes.sos.createRequest.url, {
    method: "POST",
    body,
    accessToken
  });
  return sosRequestCreatedSchema.parse(response);
}

/**
 * Uploads one optional JPEG/PNG/WebP evidence photo (`POST /_user/sos/requests/:id/photo`).
 *
 * The server strictly accepts a single multipart file field named `photo` (`SOS_PHOTO_FIELD_NAME`)
 * and rejects extra form fields rather than silently ignoring them.
 */
export async function uploadSosRequestPhoto(
  requestId: string,
  file: Blob,
  accessToken: string,
  signal?: AbortSignal
): Promise<{ photoUrl: string }> {
  const params = sosRequestParamsSchema.parse({ id: requestId });
  const formData = new FormData();
  formData.append(SOS_PHOTO_FIELD_NAME, file);

  const path = apiRoutes.sos.uploadRequestPhoto.url.replace(":id", encodeURIComponent(params.id));
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${accessToken}`
  });

  const response = await fetch(`${apiBasePath()}${path}`, {
    method: "POST",
    headers,
    body: formData,
    credentials: "same-origin",
    signal
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === "object" ? (payload as MultipartErrorPayload) : {};
    throw new ApiError(
      response.status,
      typeof errorPayload.code === "string" ? errorPayload.code : "REQUEST_FAILED",
      typeof errorPayload.message === "string"
        ? errorPayload.message
        : "Photo upload could not be completed.",
      Array.isArray(errorPayload.issues) ? errorPayload.issues : []
    );
  }

  return photoUploadResponseSchema.parse(payload);
}
