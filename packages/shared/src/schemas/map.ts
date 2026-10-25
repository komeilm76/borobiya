import { z } from "zod";

export const mapBboxSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
  z.number().min(-90).max(90)
]).superRefine(([west, south, east, north], context) => {
  if (west >= east) {
    context.addIssue({ code: "custom", path: [0], message: "west must be less than east." });
  }
  if (south >= north) {
    context.addIssue({ code: "custom", path: [1], message: "south must be less than north." });
  }
});

export const mapConfigSchema = z.strictObject({
  region: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  bbox: mapBboxSchema,
  dataVersion: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
  minZoom: z.number().int().min(0).max(16),
  maxZoom: z.number().int().min(0).max(20) // camera overzoom, independent of the z0–z16 generated tile pyramid
}).superRefine((config, context) => {
  if (config.minZoom > config.maxZoom) {
    context.addIssue({ code: "custom", path: ["minZoom"], message: "minZoom cannot exceed maxZoom." });
  }
});

export type MapBbox = z.infer<typeof mapBboxSchema>;
export type MapConfig = z.infer<typeof mapConfigSchema>;
