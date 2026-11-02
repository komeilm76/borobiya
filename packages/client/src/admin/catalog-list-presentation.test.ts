import { describe, expect, it } from "vitest";
import { catalogListPresentation } from "./catalog-list-presentation";

describe("admin catalog list presentation", () => {
  it("shows placeholders until the first read settles, even if no rows are known yet", () => {
    expect(catalogListPresentation(true, 0, "")).toBe("loading");
  });

  it("keeps known rows visible with a refresh indicator, rather than replacing them with skeletons", () => {
    expect(catalogListPresentation(true, 2, "")).toBe("refreshing");
    expect(catalogListPresentation(false, 2, "")).toBe("rows");
    expect(catalogListPresentation(false, 2, "دریافت انجام نشد")).toBe("rows");
  });

  it("does not misreport failed reads as an empty catalog, and permits a retry", () => {
    expect(catalogListPresentation(false, 0, "دریافت انجام نشد")).toBe("error");
    expect(catalogListPresentation(false, 0, "نشست مدیر در دسترس نیست")).toBe("error");
    expect(catalogListPresentation(true, 0, "دریافت انجام نشد")).toBe("loading");
  });

  it("reports empty only after a successful read returned no rows", () => {
    expect(catalogListPresentation(false, 0, "")).toBe("empty");
  });

  it("names the network when the network is what failed", () => {
    expect(catalogListPresentation(false, 0, "دریافت انجام نشد", true)).toBe("offline");
    // A known catalog stays on screen; the offline banner belongs to the page, not to the list's state.
    expect(catalogListPresentation(false, 2, "دریافت انجام نشد", true)).toBe("rows");
    // A restored connection must show the server error again, not a stale offline claim.
    expect(catalogListPresentation(false, 0, "دریافت انجام نشد", false)).toBe("error");
    // No failure yet means the browser's opinion about the network cannot invent one.
    expect(catalogListPresentation(false, 0, "", true)).toBe("empty");
    expect(catalogListPresentation(true, 0, "", true)).toBe("loading");
  });
});
