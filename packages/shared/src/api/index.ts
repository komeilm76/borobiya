export { defineRoute } from "./define-route";
export type { ApiRoute, ApiRouteAccess, ApiRouteDefinition, ApiRouteMeta, ApiRouteSchema } from "./define-route";
export { apiErrorResponses, locationHistoryQuerySchema, noContentResponseSchema, sharePathParamsSchema, uuidPathParamsSchema } from "./common";
export { authRoutes } from "./auth.routes";
export { publicRoutes } from "./public.routes";
export { userRoutes } from "./user.routes";
export { locationRoutes } from "./location.routes";
export { sosRoutes, nearestResponderSchema, nearestRespondersResponseSchema } from "./sos.routes";
export { adminRoutes } from "./admin.routes";

import { adminRoutes } from "./admin.routes";
import { authRoutes } from "./auth.routes";
import { locationRoutes } from "./location.routes";
import { publicRoutes } from "./public.routes";
import { sosRoutes } from "./sos.routes";
import { userRoutes } from "./user.routes";

export const apiRoutes = {
  auth: authRoutes,
  public: publicRoutes,
  user: userRoutes,
  location: locationRoutes,
  sos: sosRoutes,
  admin: adminRoutes
} as const;

export const allApiRoutes = [
  ...Object.values(authRoutes),
  ...Object.values(publicRoutes),
  ...Object.values(userRoutes),
  ...Object.values(locationRoutes),
  ...Object.values(sosRoutes),
  ...Object.values(adminRoutes)
] as const;

export type AllApiRoute = (typeof allApiRoutes)[number];
