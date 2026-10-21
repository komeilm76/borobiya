import { describe, expect, it } from "vitest";
import { allApiRoutes, apiRoutes } from "./index";

describe("shared km-api route descriptors", () => {
  it("exposes method, URL, request/response schemas, and route metadata", () => {
    const route = apiRoutes.auth.login;

    expect(route.method).toBe("POST");
    expect(route.url).toBe("/_auth/login");
    expect(route.pathShape).toBe(route.url);
    expect(route.schema.body).toBe(route.request.body);
    expect(route.schema.responses[200]).toBe(route.response[200]);
    expect(route.meta.operationId).toBe(route.operationId);
    expect(route.tags).toContain("#auth");
    expect(route.auth).toBe("NO");
  });

  it("registers the documented REST surface with unique operation IDs and method/URL pairs", () => {
    expect(allApiRoutes).toHaveLength(59);
    const operationIds = allApiRoutes.map((route) => route.meta.operationId);
    const methodUrls = allApiRoutes.map((route) => `${route.method} ${route.url}`);

    expect(new Set(operationIds).size).toBe(operationIds.length);
    expect(new Set(methodUrls).size).toBe(methodUrls.length);
  });

  it("keeps path placeholders aligned with declared params and OpenAPI paths", () => {
    for (const route of allApiRoutes) {
      const pathParams = [...route.url.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)|\{([A-Za-z_][A-Za-z0-9_]*)\}/g)]
        .map((match) => match[1] ?? match[2]);
      const paramsSchema = "params" in route.schema ? route.schema.params : undefined;
      const schemaParams = paramsSchema ? Object.keys(paramsSchema.shape) : [];
      const openApiPath = route.url.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}");
      const expressParams = [...route.makeExpressPathShape().matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)]
        .map((match) => match[1]);

      expect(route.url.startsWith("/")).toBe(true);
      expect(schemaParams).toEqual(pathParams);
      expect(expressParams).toEqual(pathParams);
      expect(route.makeOpenApiPathShape()).toBe(openApiPath);
      expect(Object.keys(route.response).length).toBeGreaterThan(0);
    }
  });

  it("uses the documented shareId name in the revoke route and parameter schema", () => {
    const route = apiRoutes.location.revokeShare;

    expect(route.url).toBe("/_user/location/share/:shareId");
    expect(Object.keys(route.schema.params?.shape ?? {})).toEqual(["shareId"]);
    expect(route.makeFullPath({ shareId: "00000000-0000-4000-8000-000000000001" }))
      .toBe("/_user/location/share/00000000-0000-4000-8000-000000000001");
    // T2.1.3 revocation returns an empty body and must document the ownership-safe 404.
    expect(Object.keys(route.schema.responses)).toEqual(["200", "400", "401", "403", "404", "409", "429"]);
    expect(route.meta.description).toContain("SHARE_NOT_FOUND");
  });

  it("converts OpenAPI placeholders for Fastify routes with static suffixes", () => {
    const route = apiRoutes.public.mapStyle;

    expect(route.makeFullPath({ theme: "light" })).toBe("/_public/map/styles/light.json");
    expect(route.makeExpressPathShape()).toBe("/_public/map/styles/:theme.json");
    expect(route.makeOpenApiPathShape()).toBe("/_public/map/styles/{theme}.json");
  });

  it("maps access policy and deprecated metadata onto km-api fields", () => {
    expect(apiRoutes.public.health.auth).toBe("NO");
    expect(apiRoutes.user.me.auth).toBe("YES");
    expect(apiRoutes.admin.listUsers.auth).toBe("YES");
    expect(apiRoutes.location.updateLocation.deprecated).toBe("YES");
  });
});
