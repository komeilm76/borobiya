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
      const schemaParams = route.schema.params ? Object.keys(route.schema.params.shape) : [];
      const openApiPath = route.url.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}");

      expect(route.url.startsWith("/")).toBe(true);
      expect(schemaParams).toEqual(pathParams);
      expect(route.makeOpenApiPathShape()).toBe(openApiPath);
      expect(Object.keys(route.response).length).toBeGreaterThan(0);
    }
  });

  it("maps access policy and deprecated metadata onto km-api fields", () => {
    expect(apiRoutes.public.health.auth).toBe("NO");
    expect(apiRoutes.user.me.auth).toBe("YES");
    expect(apiRoutes.admin.listUsers.auth).toBe("YES");
    expect(apiRoutes.location.updateLocation.deprecated).toBe("YES");
  });
});
