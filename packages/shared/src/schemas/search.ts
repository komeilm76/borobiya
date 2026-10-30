import { z } from "zod";
import {
  idSchema,
  latitudeSchema,
  longitudeSchema,
  paginatedResponseSchema,
  paginationQuerySchema,
  usernameSchema,
  optionalBooleanQuerySchema
} from "./common";

const emptyQueryValueToUndefined = (value: unknown) => value === "" ? undefined : value;

const optionalLatitudeQuerySchema = z.preprocess(
  emptyQueryValueToUndefined,
  z.coerce.number().pipe(latitudeSchema).optional()
);
const optionalLongitudeQuerySchema = z.preprocess(
  emptyQueryValueToUndefined,
  z.coerce.number().pipe(longitudeSchema).optional()
);
const requiredLatitudeQuerySchema = z.preprocess(
  emptyQueryValueToUndefined,
  z.coerce.number().pipe(latitudeSchema)
);
const requiredLongitudeQuerySchema = z.preprocess(
  emptyQueryValueToUndefined,
  z.coerce.number().pipe(longitudeSchema)
);
const optionalRatingQuerySchema = z.preprocess(
  emptyQueryValueToUndefined,
  z.coerce.number().pipe(z.number().finite().min(1).max(5)).optional()
);

const optionalIdQuerySchema = z.preprocess(emptyQueryValueToUndefined, idSchema.optional());

export const userSearchSchema = z.strictObject({
  q: z.string().trim().max(30).optional(),
  // A cleared picker control arrives as an empty string, which means "no filter" rather than "invalid
  // id" — the same treatment lat/lon/rating already get below.
  category: optionalIdQuerySchema,
  incidentType: optionalIdQuerySchema,
  minRating: optionalRatingQuerySchema,
  online: optionalBooleanQuerySchema,
  sort: z.enum(["distance", "username"]).optional(),
  radiusKm: z.preprocess(emptyQueryValueToUndefined,
    z.coerce.number().finite().min(0.1).max(500).optional()),
  lat: optionalLatitudeQuerySchema,
  lon: optionalLongitudeQuerySchema,
  ...paginationQuerySchema.shape
}).superRefine((query, context) => {
  if ((query.lat === undefined) !== (query.lon === undefined)) {
    context.addIssue({
      code: "custom",
      path: [query.lat === undefined ? "lat" : "lon"],
      message: "Latitude and longitude must be provided together."
    });
  }
});
export type UserSearchQuery = z.output<typeof userSearchSchema>;
export type UserSearchQueryInput = z.input<typeof userSearchSchema>;

export const userSearchResultSchema = z.strictObject({
  id: idSchema,
  username: usernameSchema,
  category: z.string().nullable(),
  avgRating: z.number().finite().min(0).max(5).nullable(),
  isOnline: z.boolean(),
  distance: z.number().finite().nonnegative().nullable()
});
export type UserSearchResult = z.infer<typeof userSearchResultSchema>;
export const userSearchResponseSchema = paginatedResponseSchema(userSearchResultSchema);
export type UserSearchResponse = z.infer<typeof userSearchResponseSchema>;

export const boundingBoxQuerySchema = z.string().trim().superRefine((value, context) => {
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length !== 4 || parts.some((part) => part.length === 0)) {
    context.addIssue({
      code: "custom",
      message: "Bounding box must contain west,south,east,north coordinates."
    });
    return;
  }

  const [west, south, east, north] = parts.map(Number);
  if (![west, south, east, north].every(Number.isFinite)) {
    context.addIssue({ code: "custom", message: "Bounding box coordinates must be finite numbers." });
    return;
  }

  if (west < -180 || east > 180 || west >= east) {
    context.addIssue({ code: "custom", message: "Bounding box longitude bounds are invalid." });
  }
  if (south < -90 || north > 90 || south >= north) {
    context.addIssue({ code: "custom", message: "Bounding box latitude bounds are invalid." });
  }
});
export type BoundingBoxQuery = z.infer<typeof boundingBoxQuerySchema>;

export const geocodeQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(30).default(5),
  bbox: boundingBoxQuerySchema.optional()
});
export type GeocodeQuery = z.output<typeof geocodeQuerySchema>;
export type GeocodeQueryInput = z.input<typeof geocodeQuerySchema>;

export const reverseGeocodeQuerySchema = z.strictObject({
  lat: requiredLatitudeQuerySchema,
  lon: requiredLongitudeQuerySchema
});
export type ReverseGeocodeQuery = z.output<typeof reverseGeocodeQuerySchema>;

export const geocodeResultSchema = z.strictObject({
  placeId: z.string().min(1),
  name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  lat: latitudeSchema,
  lon: longitudeSchema,
  type: z.string().min(1),
  importance: z.number().finite().optional()
});
export type GeocodeResult = z.infer<typeof geocodeResultSchema>;

export const geocodeResponseSchema = z.array(geocodeResultSchema);
export type GeocodeResponse = z.infer<typeof geocodeResponseSchema>;

export const reverseGeocodeResultSchema = z.strictObject({
  formattedAddress: z.string().trim().min(1),
  country: z.string().trim().optional(),
  city: z.string().trim().optional(),
  street: z.string().trim().optional(),
  houseNumber: z.string().trim().optional()
});
export type ReverseGeocodeResult = z.infer<typeof reverseGeocodeResultSchema>;
